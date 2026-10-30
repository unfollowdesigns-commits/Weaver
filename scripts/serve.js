#!/usr/bin/env node
// Automatic scoring: receives Loxo's "candidate created" webhook and scores that candidate.
//
//   node scripts/serve.js            listens on PORT (default 8787)
//
// Loxo calls:  POST /loxo/webhook?token=<WEBHOOK_SECRET>
// Cost guards, in order: only open searches (or those in LOXO_AUTO_SCORE_JOB_IDS); the same candidate within
// 15 minutes is ignored; anyone who already has an AI assessment is skipped before the AI
// is called; at most DAILY_SCORE_CAP candidates a day.
// Nothing is written to disk unless SAVE_DEBUG_FILES=true (local testing only). Logs carry
// IDs and outcomes, never candidate text. The hourly sweep catches anything missed here.

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { loadEnv } from "../src/env.js";
import { loadScorecard, scorecardResolver, JOB_SCORECARD_DIR } from "../src/scorecard.js";
import { liveCriteria, AUTO_DIR } from "../src/auto-criteria.js";
import { runSweep } from "../src/sweep.js";
import { loadTemplate } from "../src/prompt.js";
import { getProvider } from "../src/providers/index.js";
import { scoreCandidate, isThin } from "../src/score.js";
import { loxoClientFromEnv } from "../src/loxo/index.js";
import { firstArray } from "../src/loxo/client.js";
import { personIdOf } from "../src/loxo/map.js";
import { fetchJob, loadCandidate } from "../src/loxo/read.js";
import { buildPayload, writeResult, writeConfigFromEnv, writesAllowed, hasAiAssessment } from "../src/loxo/write.js";
import { createDailyCap, createDeduper, capProvider } from "../src/limits.js";
import { createSearchList } from "../src/searches.js";

loadEnv();

const secret = process.env.WEBHOOK_SECRET ?? "";
if (secret.length < 16) {
  console.error("WEBHOOK_SECRET must be set (at least 16 characters).");
  process.exit(1);
}
const template = loadTemplate();
// Every AI call made by this server (scoring, retries, batches, drafting criteria) counts against
// the daily cap, kept on the persistent disk so a restart does not reset it.
const capFile = process.env.DAILY_CAP_FILE || (process.env.CRITERIA_DIR ? path.join(path.dirname(process.env.CRITERIA_DIR), "usage.json") : "data/usage.json");
const dailyCap = createDailyCap(Number(process.env.DAILY_SCORE_CAP || 200), undefined, capFile);
const provider = capProvider(await getProvider(process.env.SCORING_PROVIDER || "mock"), dailyCap);
// SCORING_PAUSED=true stops all AI scoring (webhook and hourly catch-up): the full stop.
// LOXO_WRITE_ENABLED=false only stops writing into Loxo.
const paused = () => process.env.SCORING_PAUSED === "true";
// Each search: its approved scorecard, else criteria drafted from the job the first time it is
// seen (the firm's own criteria names kept), stored on the persistent disk (CRITERIA_DIR) and
// used straight away. AUTO_CRITERIA=false scores only searches with an approved scorecard.
const standard = loadScorecard(process.env.SCORECARD_FILE || "config/scorecards/standard-executive.v2.json");
const approvedDir = process.env.SCORECARD_JOBS_DIR || JOB_SCORECARD_DIR;
const scorecardFor = liveCriteria({ standard, provider, approvedDir, store: process.env.CRITERIA_DIR || AUTO_DIR, auto: process.env.AUTO_CRITERIA !== "false", resolver: scorecardResolver({ fallback: standard, dir: approvedDir }), log });
const client = loxoClientFromEnv(process.env, { allowWrites: true });
const cfg = writeConfigFromEnv();
// Every open search by default; a list of numbers in LOXO_AUTO_SCORE_JOB_IDS limits it.
const searches = createSearchList({ client, setting: process.env.LOXO_AUTO_SCORE_JOB_IDS, skip: process.env.LOXO_SKIP_JOB_IDS });
const saveDebug = process.env.SAVE_DEBUG_FILES === "true";
const deduper = createDeduper();

const pick = (body, key) =>
  body?.[key] ?? body?.item?.[key] ?? body?.data?.[key] ?? body?.candidate?.[key] ?? body?.payload?.[key] ?? null;

function idsFromWebhook(body) {
  return {
    jobId: pick(body, "job_id") ?? body?.candidate?.job?.id ?? null,
    personId: pick(body, "person_id") ?? body?.candidate?.person?.id ?? null,
  };
}

function saveLocal(sub, name, data) {
  if (!saveDebug) return null;
  const dir = path.join("data", sub);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, name);
  fs.writeFileSync(file, typeof data === "string" ? data : JSON.stringify(data, null, 2));
  return file;
}

// One at a time: keeps model and Loxo usage steady when many candidates arrive at once.
let queue = Promise.resolve();
const jobCache = new Map();
// Who has been read in dry run since the server started ("jobId:personId"), so neither the
// webhook nor the hourly catch-up reads them again while nothing is written to Loxo.
const handledInDryRun = new Set();

async function handle(body) {
  const { jobId, personId } = idsFromWebhook(body);
  if (!jobId || !personId) return log("delivery without job_id/person_id; field names to confirm (set SAVE_DEBUG_FILES=true locally to keep the body)");
  const tag = `job ${jobId} person ${personId}`;
  if (paused()) return log(`${tag}: scoring paused (SCORING_PAUSED=true), skipped`);
  if (!(await searches.has(jobId))) return log(`${tag}: search not open or not switched on, skipped`);
  if (deduper.seenRecently(`${jobId}:${personId}`)) return log(`${tag}: duplicate within 15 minutes, skipped`);
  if (await hasAiAssessment(client, jobId, personId, cfg)) return log(`${tag}: already assessed, skipped`);
  if (!writesAllowed() && handledInDryRun.has(`${jobId}:${personId}`)) return log(`${tag}: already read in this dry run, skipped`);

  if (!jobCache.has(jobId) || Date.now() - jobCache.get(jobId).at > 10 * 60_000) {
    jobCache.set(jobId, { at: Date.now(), job: await fetchJob(client, jobId) });
  }
  const job = jobCache.get(jobId).job;
  // Match the person exactly: if Loxo ever ignores the filter, never score (and write to)
  // whoever happens to be first on the pipeline.
  const entry = firstArray(await client.get(`/jobs/${jobId}/candidates`, { person_id: personId })).find((e) => String(personIdOf(e)) === String(personId)) ?? { person_id: personId };
  const candidate = await loadCandidate(client, entry);
  if (isThin(candidate)) return log(`${tag}: not enough in Loxo to score yet (no resume, work history or notes), skipped`);
  // The daily cap counts AI readings only, so it is taken here, after the empty-record check.
  if (dailyCap.remaining() <= 0) return log(`${tag}: daily cap reached, left for the catch-up tomorrow`);
  const scorecard = await scorecardFor(jobId, job);
  if (!scorecard) return log(`${tag}: no approved scorecard for this search yet (AUTO_CRITERIA=false); approve its criteria, then it is scored`);
  const result = await scoreCandidate({ candidate, job, scorecard, template, provider });
  const tokens = result.usage ? ` tokens in ${result.usage.input_tokens ?? result.usage.prompt_tokens} out ${result.usage.output_tokens ?? result.usage.completion_tokens}` : "";
  log(`${tag}: ${result.status}${result.status === "scored" ? ` ${result.average} ${result.recommendation}${tokens}` : ` ${result.error}`}`);
  if (result.status !== "scored") return;

  if (writesAllowed()) {
    const out = await writeResult(client, result, cfg);
    log(`${tag}: Loxo ${out.status}${out.reason ? ` (${out.reason})` : ""}`);
  } else {
    handledInDryRun.add(`${jobId}:${personId}`);
    const file = saveLocal("runs/webhook", `${Date.now()}-${personId}.json`, { result, would_write: buildPayload(result, cfg) });
    log(`${tag}: dry run, nothing written${file ? ` (saved ${file})` : ""}`);
  }
}

function log(msg) {
  console.log(`${new Date().toISOString()} ${msg}`);
}

function tokenOk(given) {
  const a = Buffer.from(String(given ?? ""));
  const b = Buffer.from(secret);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (req.method === "GET" && url.pathname === "/health") return res.writeHead(200).end("ok");
  if (req.method !== "POST" || url.pathname !== "/loxo/webhook") return res.writeHead(404).end();
  if (!tokenOk(url.searchParams.get("token"))) return res.writeHead(401).end();

  let raw = "";
  req.on("data", (chunk) => {
    raw += chunk;
    if (raw.length > 1_000_000) req.destroy();
  });
  req.on("end", () => {
    res.writeHead(202).end();
    saveLocal("webhooks", `${Date.now()}.json`, raw);
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      body = Object.fromEntries(new URLSearchParams(raw));
    }
    queue = queue.then(() => handle(body)).catch((err) => log(`error: ${err.message}`));
  });
});

// The hourly catch-up runs inside this service (one Render service with the disk; Render's cron
// jobs cannot use a disk). SWEEP_EVERY_MINUTES=0 turns it off, e.g. when a separate cron is used.
const sweepEvery = Number(process.env.SWEEP_EVERY_MINUTES ?? 60);
if (sweepEvery > 0) {
  let running = false;
  const sweepOnce = () => {
    if (running) return;
    if (paused()) return log("sweep skipped: scoring paused (SCORING_PAUSED=true)");
    running = true;
    const writes = writesAllowed();
    // The same daily cap as the webhook: the catch-up never reads more than what is left today.
    const room = Math.min(Number(process.env.SWEEP_MAX_PER_RUN || 50), dailyCap.remaining());
    if (room <= 0) {
      running = false;
      return log("sweep skipped: daily cap reached, continues tomorrow");
    }
    queue = queue.then(async () => runSweep({ client, provider, jobIds: await searches.ids(), scorecard: scorecardFor, template, cfg, writes,
      maxPerRun: room, useBatch: process.env.USE_BATCH !== "false", log, handled: writes ? null : handledInDryRun }))
      .then((s) => { const { dry_run, ...counts } = s; log(`sweep ${JSON.stringify(counts)}`); })
      .catch((err) => log(`sweep failed: ${err.message}`))
      .finally(() => { running = false; });
  };
  setInterval(sweepOnce, sweepEvery * 60_000).unref();
  setTimeout(sweepOnce, 60_000).unref();
}

const port = Number(process.env.PORT || 8787);
server.listen(port, () => {
  log(`Listening on :${port}. Provider ${provider.name}. Searches: ${searches.describe() || "none"}. Writes ${writesAllowed() ? "ON" : "off (dry run)"}. Daily cap ${process.env.DAILY_SCORE_CAP || 200} AI calls (${dailyCap.remaining()} left today, kept in ${capFile}).${paused() ? " SCORING PAUSED." : ""}`);
});
