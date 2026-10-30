#!/usr/bin/env node
// Go-live check: every account, key, ID and setting, in one run. Read-only and free (the Claude
// key is checked with a model lookup, which is not billed). Prints PASS / FAIL / INFO with no
// keys and no candidate data, so the output is safe to share.
//
//   npm run preflight
//   npm run preflight -- --estimate        also counts everyone on those searches and shows the
//                                           one-time cost to score them (reads Loxo only, free)
//   npm run preflight -- --server https://<service>.onrender.com     also checks the live server
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { loadEnv } from "../src/env.js";
import { loxoClientFromEnv } from "../src/loxo/index.js";
import { firstArray } from "../src/loxo/client.js";
import { mapJob, jobStatusOf, isOpenStatus } from "../src/loxo/map.js";
import { createSearchList } from "../src/searches.js";
import { parseBacklogSetting } from "../src/baseline.js";
import { listJobCandidates } from "../src/loxo/read.js";

loadEnv();
const { values: args } = parseArgs({ options: { server: { type: "string" }, estimate: { type: "boolean", default: false } } });
const env = process.env;
let fails = 0;
const line = (ok, label, detail = "") => { if (!ok) fails++; console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`); };
const info = (label, detail = "") => console.log(`INFO  ${label}${detail ? `  (${detail})` : ""}`);
const set = (k) => Boolean(env[k] && env[k].trim());

console.log("Weaver go-live check\n");
const [maj, min] = process.versions.node.split(".").map(Number);
line(maj > 20 || (maj === 20 && min >= 9), "Node version", process.versions.node);
line(fs.existsSync(".env") || set("LOXO_API_KEY"), "Settings found (.env or environment)");

// AI provider
const provider = env.SCORING_PROVIDER || "mock";
line(provider === "claude", "Scoring runs on Claude", provider === "claude" ? "claude" : `${provider}: set SCORING_PROVIDER=claude for production`);
if (provider === "claude" || set("ANTHROPIC_API_KEY")) {
  if (!set("ANTHROPIC_API_KEY")) line(false, "Claude key", "ANTHROPIC_API_KEY is empty");
  else {
    const model = env.CLAUDE_MODEL || "claude-opus-5-5";
    try {
      const { default: Anthropic } = await import("@anthropic-ai/sdk");
      const m = await new Anthropic({ apiKey: env.ANTHROPIC_API_KEY }).models.retrieve(model);
      line(true, "Claude key works and has the model", m.id);
    } catch (err) {
      line(false, "Claude key works and has the model", `${model}: ${err.status ?? ""} ${err.message.split("\n")[0]}`);
    }
  }
  info("Claude effort", env.CLAUDE_EFFORT || "high (default)");
}

// Loxo
for (const k of ["LOXO_API_KEY", "LOXO_AGENCY_SLUG", "LOXO_DOMAIN"]) line(set(k), `${k} is set`);
let client = null;
try {
  client = loxoClientFromEnv(env);
  const jobs = firstArray(await client.get("/jobs", { per_page: 1 }));
  line(true, "Loxo connection works", `${env.LOXO_DOMAIN}/${env.LOXO_AGENCY_SLUG}`);
  void jobs;
} catch (err) {
  line(false, "Loxo connection works", err.message.split("\n")[0]);
  client = null;
}
if (client) {
  const types = firstArray(await client.get("/scorecards/scorecard_types").catch(() => []));
  const recs = firstArray(await client.get("/scorecards/scorecard_recommendation_types").catch(() => []));
  const nameOf = (list, id) => list.find((x) => String(x.id) === String(id))?.name;
  line(Boolean(nameOf(types, env.LOXO_SCORECARD_TYPE_ID)), "Scorecard type ID exists in Loxo", `${env.LOXO_SCORECARD_TYPE_ID || "not set"} = ${nameOf(types, env.LOXO_SCORECARD_TYPE_ID) ?? "?"}`);
  line(/^yes$/i.test(nameOf(recs, env.LOXO_RECOMMENDATION_YES_ID) ?? ""), "Yes recommendation ID", `${env.LOXO_RECOMMENDATION_YES_ID || "not set"} = ${nameOf(recs, env.LOXO_RECOMMENDATION_YES_ID) ?? "?"}`);
  line(/^no$/i.test(nameOf(recs, env.LOXO_RECOMMENDATION_NO_ID) ?? ""), "No recommendation ID", `${env.LOXO_RECOMMENDATION_NO_ID || "not set"} = ${nameOf(recs, env.LOXO_RECOMMENDATION_NO_ID) ?? "?"}`);
  const searches = createSearchList({ client, setting: env.LOXO_AUTO_SCORE_JOB_IDS, skip: env.LOXO_SKIP_JOB_IDS });
  const ids = await searches.ids();
  line(ids.length > 0, "Searches Weaver will score", `${searches.describe()}: ${ids.length} found`);
  if (searches.all) info("Open searches found in Loxo", ids.length > 15 ? `${ids.slice(0, 15).join(", ")} and ${ids.length - 15} more` : ids.join(", ") || "none");
  for (const id of searches.all ? [] : ids) {
    try {
      const raw = await client.get(`/jobs/${id}`);
      const job = mapJob(raw);
      const status = jobStatusOf(raw) ?? "unknown";
      line(isOpenStatus(status), `Search ${id} is open`, `"${job.title}", ${status}`);
    } catch (err) {
      line(false, `Search ${id} can be read`, err.message.split("\n")[0]);
    }
  }
  // The one-time backlog. Since 30 Oct 2026 the people already on a search are scored only where
  // LOXO_BACKLOG_JOB_IDS lists the search ("all": every search); elsewhere only new candidates.
  // Counting reads Loxo only (free). Per read: about 2.5 to 5 cents in the half-price batch.
  if (args.estimate) {
    const backlog = parseBacklogSetting(env.LOXO_BACKLOG_JOB_IDS);
    const sizes = new Map();
    for (const id of ids) sizes.set(id, (await listJobCandidates(client, id).catch(() => [])).length);
    const people = [...sizes.values()].reduce((a, b) => a + b, 0);
    const cap = Number(env.DAILY_SCORE_CAP) || 200;
    const chosen = backlog.all ? ids : [...backlog.ids];
    const already = chosen.reduce((a, id) => a + (sizes.get(id) ?? 0), 0);
    const reads = Math.round(already * 0.92); // about 8% are name-only records, skipped for free (seen on the real account)
    info("People on these searches", `${people} on ${ids.length} searches`);
    if (!chosen.length) info("People already on them", "not scored: new candidates only (LOXO_BACKLOG_JOB_IDS lists searches whose existing people are scored too)");
    else info("One-time cost for the people already on the chosen searches", `${already} people on ${chosen.length} searches: about $${Math.round(reads * 0.025)} to $${Math.round(reads * 0.05)}, over about ${Math.max(1, Math.ceil(reads / cap))} days at ${cap} a day`);
    info("New candidates", "a few cents each, at most " + cap + " a day");
  }
  const hooks = firstArray(await client.get("/webhooks").catch(() => [])).filter((w) => w.item_type === "candidate" && w.action === "create");
  info("Loxo calls Weaver when a candidate is added", hooks.length ? `registered (${hooks.length})` : "not registered yet; the hourly catch-up still scores everyone");
}

// Server settings
// Needed by the server and by step 11 (registering with Loxo); not needed for the Mac runs before.
if (args.server || env.RENDER) line((env.WEBHOOK_SECRET || "").length >= 32, "WEBHOOK_SECRET is long enough", `${(env.WEBHOOK_SECRET || "").length} characters, 32+ needed`);
else info("WEBHOOK_SECRET", (env.WEBHOOK_SECRET || "").length >= 32 ? "set" : "not set yet: comes from Render at step 9");
if (env.AUTO_CRITERIA !== "false") {
  const dir = env.CRITERIA_DIR || "data/scorecards/auto";
  try {
    fs.mkdirSync(dir, { recursive: true });
    const probe = path.join(dir, `.write-check-${process.pid}`);
    fs.writeFileSync(probe, "ok");
    fs.unlinkSync(probe);
    line(true, "Criteria folder can be written", dir);
  } catch (err) {
    line(false, "Criteria folder can be written", `${dir}: ${err.message}`);
  }
  info("On Render, CRITERIA_DIR must be on the persistent disk", env.CRITERIA_DIR || "not set (local default)");
}
line(Number(env.DAILY_SCORE_CAP) > 0, "Daily cost cap is set", `${env.DAILY_SCORE_CAP || "not set"} AI calls a day, kept on the disk across restarts; the monthly limit on the Claude account is the hard stop`);
info("Scoring", env.SCORING_PAUSED === "true" ? "PAUSED (SCORING_PAUSED=true): no AI calls at all" : "running (SCORING_PAUSED=true stops all AI calls)");
info("Hourly catch-up", `${env.SWEEP_EVERY_MINUTES || "60"} minutes, up to ${env.SWEEP_MAX_PER_RUN || "50"} per run, batch ${env.USE_BATCH === "false" ? "off" : "on (half price)"}`);
const writes = env.LOXO_WRITE_ENABLED === "true" && env.DRY_RUN === "false";
info("Writing into Loxo", writes ? "ON: scores are written to Loxo" : "OFF: dry run, nothing is written (switch on only after the client approves)");
line(env.SAVE_DEBUG_FILES !== "true" || !env.RENDER, "No debug files on the server", env.SAVE_DEBUG_FILES === "true" ? "SAVE_DEBUG_FILES=true" : "off");

if (args.server) {
  try {
    const r = await fetch(new URL("/health", args.server));
    line(r.ok && (await r.text()).trim() === "ok", "Live server answers", args.server);
  } catch (err) {
    line(false, "Live server answers", `${args.server}: ${err.message}`);
  }
}

console.log(`\n${fails ? `${fails} CHECK(S) FAILED: fix these before going live` : "ALL CHECKS PASSED"}`);
process.exitCode = fails ? 1 : 0;
