#!/usr/bin/env node
// Scores every candidate on a job and writes a dry-run report to data/runs/.
//
// From sample files (no Loxo needed):
//   node scripts/score-job.js --provider mock|openai|claude [--limit 3]
//     [--job samples/job.sample.json] [--candidates samples/candidates.sample.json]
//
// From a real Loxo job (read-only unless --write):
//   node scripts/score-job.js --provider claude --loxo-job 123 [--limit 3] [--write]
//     [--stages "Screened,Submitted to Client"]   only candidates at these Loxo stages
//     [--names-file data/names.txt]   only these people, one name per line (keep the file in data/:
//                                     real names, never committed)
//
// --write only writes when .env has LOXO_WRITE_ENABLED=true and DRY_RUN=false.
// Otherwise the exact payloads that would be written are saved next to the report.

import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { loadEnv } from "../src/env.js";
import { loadScorecard, scorecardResolver, JOB_SCORECARD_DIR } from "../src/scorecard.js";
import { loadTemplate } from "../src/prompt.js";
import { getProvider } from "../src/providers/index.js";
import { scoreJob } from "../src/score.js";
import { toMarkdown, toHtml } from "../src/report.js";
import { loxoClientFromEnv } from "../src/loxo/index.js";
import { fetchJobForScoring } from "../src/loxo/read.js";
import { buildPayload, writeResult, writeConfigFromEnv, writesAllowed, aiScoredPersonIds } from "../src/loxo/write.js";

loadEnv();

const { values: args } = parseArgs({
  options: {
    provider: { type: "string", default: process.env.SCORING_PROVIDER || "mock" },
    job: { type: "string", default: "samples/job.sample.json" },
    candidates: { type: "string", default: "samples/candidates.sample.json" },
    "loxo-job": { type: "string" },
    scorecard: { type: "string", default: "config/scorecards/standard-executive.v2.json" },
    "scorecards-dir": { type: "string", default: process.env.SCORECARD_JOBS_DIR || JOB_SCORECARD_DIR },
    limit: { type: "string" },
    stages: { type: "string" },
    "names-file": { type: "string" },
    concurrency: { type: "string", default: "3" },
    write: { type: "boolean", default: false },
  },
});

const limit = args.limit ? Number(args.limit) : undefined;
const scorecardFor = scorecardResolver({ fallback: loadScorecard(args.scorecard), dir: args["scorecards-dir"] });
const template = loadTemplate();
const provider = await getProvider(args.provider);

let job, candidates, client;
if (args["loxo-job"]) {
  client = loxoClientFromEnv(process.env, { allowWrites: args.write });
  console.log(`Reading job ${args["loxo-job"]} from Loxo ...`);
  const stages = args.stages ? args.stages.split(",").filter((s) => s.trim()) : null;
  const names = args["names-file"] ? fs.readFileSync(args["names-file"], "utf8").split("\n").map((l) => l.trim()).filter(Boolean) : null;
  let read = 0;
  const loaded = await fetchJobForScoring(client, args["loxo-job"], { limit, stages, names, onProgress: () => { if (++read % 10 === 0) process.stdout.write(`\r  read ${read} candidates from Loxo ...`); } });
  if (read >= 10) process.stdout.write("\n");
  if (stages) console.log(`  only stages: ${stages.join(", ")}`);
  if (names) console.log(`  only the ${names.length} people in ${args["names-file"]}: ${loaded.candidates.length} found${loaded.unmatched.length ? `, ${loaded.unmatched.length} not on this search: ${loaded.unmatched.join(", ")}` : ""}`);
  ({ job, candidates } = loaded);
  console.log(`  ${loaded.pipelineCount} on the pipeline, ${candidates.length} loaded${loaded.failures.length ? `, ${loaded.failures.length} could not be read` : ""}`);
  for (const f of loaded.failures) console.log(`  could not read entry ${f.entry_id}: ${f.error}`);
} else {
  job = JSON.parse(fs.readFileSync(args.job, "utf8"));
  candidates = JSON.parse(fs.readFileSync(args.candidates, "utf8"));
  if (limit) candidates = candidates.slice(0, limit);
}

// When writing, skip anyone who already has an AI assessment before paying for the AI.
if (args["loxo-job"] && args.write && writesAllowed()) {
  const done = await aiScoredPersonIds(client, args["loxo-job"], writeConfigFromEnv());
  const before = candidates.length;
  candidates = candidates.filter((c) => !done.has(String(c.loxo?.person_id)));
  if (before !== candidates.length) console.log(`  ${before - candidates.length} already assessed, skipped`);
}

// A search's own approved scorecard wins over the standard one.
const scorecard = scorecardFor(job.id, job);
console.log(`Scoring ${candidates.length} candidates for "${job.title}" with ${provider.name} (${provider.model})`);
let done = 0;
const results = await scoreJob({
  candidates, job, scorecard, template, provider,
  concurrency: Number(args.concurrency),
  onResult: (r, i) => console.log(`  ${String(++done).padStart(4)}/${candidates.length} ${r.status === "scored" ? `scored   ${r.average?.toFixed(1)} ${r.recommendation}` : r.status === "skipped" ? "skipped  not enough in Loxo" : `ERROR    ${r.error}`}`),
});

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const dir = path.join("data", "runs", `${stamp}-${provider.name}`);
fs.mkdirSync(dir, { recursive: true });
const meta = { jobTitle: job.title, scorecard: `${scorecard.id}.v${scorecard.version}`, provider: `${provider.name} (${provider.model})`, when: new Date().toLocaleString() };
fs.writeFileSync(path.join(dir, "results.json"), JSON.stringify({ meta, results }, null, 2));
fs.writeFileSync(path.join(dir, "report.md"), toMarkdown(results, meta));
fs.writeFileSync(path.join(dir, "report.html"), toHtml(results, meta));

if (args["loxo-job"]) {
  const cfg = writeConfigFromEnv();
  const scored = results.filter((r) => r.status === "scored");
  if (args.write && writesAllowed()) {
    console.log(`\nWriting ${scored.length} results to Loxo as ${cfg.target}s ...`);
    for (const r of scored) {
      try {
        const out = await writeResult(client, r, cfg);
        console.log(`  ${out.status.padEnd(7)} ${r.candidate_name ?? r.candidate_id}${out.reason ? ` (${out.reason})` : ""}`);
      } catch (err) {
        console.log(`  FAILED  ${r.candidate_name ?? r.candidate_id}: ${err.message}`);
        process.exitCode = 1;
      }
    }
  } else {
    const payloads = scored.map((r) => {
      try { return { candidate: r.candidate_name, ...buildPayload(r, cfg) }; } catch (err) { return { candidate: r.candidate_name, error: err.message }; }
    });
    fs.writeFileSync(path.join(dir, "loxo-payloads.json"), JSON.stringify(payloads, null, 2));
    console.log(`\nDry run: nothing written to Loxo. What would be written: ${path.join(dir, "loxo-payloads.json")}`);
  }
}

const errors = results.filter((r) => r.status === "error").length;
const skippedCount = results.filter((r) => r.status === "skipped").length;
console.log(`\nDone. ${results.length - errors - skippedCount} scored, ${skippedCount} not enough in Loxo, ${errors} errors. Report: ${path.join(dir, "report.html")}`);
if (errors) process.exitCode = 1;
