#!/usr/bin/env node
// Everything before the email to the client, in one command (free: no AI calls, Loxo read only).
//   1. the tests
//   2. the current Yes rule applied to the first full real run saved on this Mac (no AI)
//   3. how many people are on the open searches and the one-time cost to score them
// Prints only counts, safe to share.
//
//   npm run ready
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { rebar } from "../src/rebar.js";
import { toHtml, toMarkdown } from "../src/report.js";

const say = (t = "") => console.log(t);
say("Weaver ready check\n");

// 1. Tests
const t = spawnSync(process.execPath, ["--test"], { encoding: "utf8" });
const out = `${t.stdout}\n${t.stderr}`;
const num = (re) => Number((out.match(re) ?? [])[1] ?? NaN);
const pass = num(/(?:#|ℹ) pass (\d+)/);
const fail = num(/(?:#|ℹ) fail (\d+)/);
say(`1. Tests: ${pass} passed, ${fail} failed${fail === 0 ? "" : "  <- STOP: send this to the build chat"}`);

// 2. The Yes rule on the first full real run
const root = "data/runs";
const runs = fs.existsSync(root) ? fs.readdirSync(root).filter((d) => !d.includes("rebar") && !d.endsWith("-jobs") && !d.endsWith("-mock")).sort() : [];
let full = null;
for (const d of runs) {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(root, d, "results.json"), "utf8"));
    if (data.results.length >= 100) { full = { dir: path.join(root, d), ...data }; break; }
  } catch { /* not a run folder */ }
}
if (!full) {
  say("2. Yes rule: no full run found in data/runs (needs a run with 100+ candidates). Skipped.");
} else {
  const res = rebar(full.results);
  const dir = `${full.dir}-rebar-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  fs.mkdirSync(dir, { recursive: true });
  const meta = { ...full.meta, when: `${full.meta.when} (current Yes rule applied ${new Date().toLocaleString()})` };
  fs.writeFileSync(path.join(dir, "results.json"), JSON.stringify({ meta, results: res }, null, 2));
  fs.writeFileSync(path.join(dir, "report.html"), toHtml(res, meta));
  fs.writeFileSync(path.join(dir, "report.md"), toMarkdown(res, meta));
  const scored = res.filter((r) => r.status === "scored");
  const yes = scored.filter((r) => r.recommendation === "yes").length;
  say(`2. Yes rule on the real run of ${path.basename(full.dir).slice(0, 10)}: Yes ${yes} of ${scored.length} (${Math.round((yes / scored.length) * 100)}%)`);
  say(`   Report opened in your browser. Find the team's #1 candidate from their PDF and note the rank (number only).`);
  spawnSync("open", [path.join(dir, "report.html")]);
}

// 3. People on the open searches and the one-time cost
const p = spawnSync(process.execPath, ["scripts/preflight.js", "--estimate"], { encoding: "utf8" });
const lines = `${p.stdout}`.split("\n").filter((l) => /INFO\s+(People on|One-time cost|After that)|Loxo connection|Searches Weaver/.test(l));
say("3. Searches and cost:");
for (const l of lines) say(`   ${l.trim()}`);
if (!lines.some((l) => l.includes("One-time cost"))) say("   (could not count: check the Loxo key in .env)");

say("\nSend these lines to the build chat, plus the #1 rank. No names in them.");
