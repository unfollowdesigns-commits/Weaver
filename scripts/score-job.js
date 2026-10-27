#!/usr/bin/env node
// Scores every candidate in a job file and writes a dry-run report to data/runs/.
// Reads local files only. Nothing is written to Loxo.
//
//   node scripts/score-job.js --provider mock|openai|claude
//     [--job samples/job.sample.json] [--candidates samples/candidates.sample.json]
//     [--scorecard config/scorecards/example.v1.json] [--limit 3] [--concurrency 3]

import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { loadEnv } from "../src/env.js";
import { loadScorecard } from "../src/scorecard.js";
import { loadTemplate } from "../src/prompt.js";
import { getProvider } from "../src/providers/index.js";
import { scoreJob } from "../src/score.js";
import { toMarkdown, toHtml } from "../src/report.js";

loadEnv();

const { values: args } = parseArgs({
  options: {
    provider: { type: "string", default: process.env.SCORING_PROVIDER || "mock" },
    job: { type: "string", default: "samples/job.sample.json" },
    candidates: { type: "string", default: "samples/candidates.sample.json" },
    scorecard: { type: "string", default: "config/scorecards/example.v1.json" },
    limit: { type: "string" },
    concurrency: { type: "string", default: "3" },
  },
});

const job = JSON.parse(fs.readFileSync(args.job, "utf8"));
let candidates = JSON.parse(fs.readFileSync(args.candidates, "utf8"));
if (args.limit) candidates = candidates.slice(0, Number(args.limit));
const scorecard = loadScorecard(args.scorecard);
const template = loadTemplate();
const provider = await getProvider(args.provider);

console.log(`Scoring ${candidates.length} candidates for "${job.title}" with ${provider.name} (${provider.model})`);
const results = await scoreJob({
  candidates, job, scorecard, template, provider,
  concurrency: Number(args.concurrency),
  onResult: (r) => console.log(`  ${r.status === "scored" ? "scored" : "ERROR "} ${r.candidate_name ?? r.candidate_id}${r.status === "scored" ? `  ${r.average?.toFixed(2)}  ${r.recommendation}` : `  ${r.error}`}`),
});

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const dir = path.join("data", "runs", `${stamp}-${provider.name}`);
fs.mkdirSync(dir, { recursive: true });
const meta = { jobTitle: job.title, scorecard: `${scorecard.id}.v${scorecard.version}`, provider: `${provider.name} (${provider.model})`, when: new Date().toLocaleString() };
fs.writeFileSync(path.join(dir, "results.json"), JSON.stringify({ meta, results }, null, 2));
fs.writeFileSync(path.join(dir, "report.md"), toMarkdown(results, meta));
fs.writeFileSync(path.join(dir, "report.html"), toHtml(results, meta));

const errors = results.filter((r) => r.status !== "scored").length;
console.log(`\nDone. ${results.length - errors} scored, ${errors} errors. Report: ${path.join(dir, "report.html")}`);
if (errors) process.exitCode = 1;
