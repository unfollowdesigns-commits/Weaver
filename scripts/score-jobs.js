#!/usr/bin/env node
// Full test: scores several Loxo jobs in one run, read-only. Nothing is written to Loxo.
// One report per job plus a summary page, in data/runs/<date>-<provider>-jobs/.
//
//   node scripts/score-jobs.js --provider claude --open-jobs          every open job
//   node scripts/score-jobs.js --provider claude --loxo-jobs 12,34,56 chosen jobs
//   options: --limit-per-job 20   --go (start without asking; otherwise it shows the
//            count and the estimated cost, and stops)

import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { loadEnv } from "../src/env.js";
import { loadScorecard } from "../src/scorecard.js";
import { loadTemplate } from "../src/prompt.js";
import { getProvider } from "../src/providers/index.js";
import { scoreJob } from "../src/score.js";
import { toMarkdown, toHtml, toIndexHtml } from "../src/report.js";
import { loxoClientFromEnv } from "../src/loxo/index.js";
import { fetchJob, listJobCandidates, loadCandidates } from "../src/loxo/read.js";
import { jobStatusOf, isOpenStatus } from "../src/loxo/map.js";
import { buildPayload, writeConfigFromEnv } from "../src/loxo/write.js";

loadEnv();
const { values: args } = parseArgs({
  options: {
    provider: { type: "string", default: process.env.SCORING_PROVIDER || "mock" },
    "loxo-jobs": { type: "string" },
    "open-jobs": { type: "boolean", default: false },
    "limit-per-job": { type: "string" },
    scorecard: { type: "string", default: process.env.SCORECARD_FILE || "config/scorecards/standard-executive.v1.json" },
    concurrency: { type: "string", default: "3" },
    go: { type: "boolean", default: false },
  },
});

// Rough cost per candidate, for the estimate only. Measure the real figure on the first run.
const COST_PER_CANDIDATE = { claude: [0.05, 0.14], mock: [0, 0] };

const client = loxoClientFromEnv(); // read-only: writes are blocked in this client
const limit = args["limit-per-job"] ? Number(args["limit-per-job"]) : undefined;

let jobIds = (args["loxo-jobs"] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
if (args["open-jobs"]) {
  const all = await client.list("/jobs");
  const open = all.filter((j) => isOpenStatus(jobStatusOf(j)));
  console.log(`Loxo has ${all.length} jobs; ${open.length} look open (status open or active).`);
  if (!open.length && all.length) {
    console.log("No status matched. Statuses seen:", [...new Set(all.map(jobStatusOf))].join(", ") || "none");
    console.log("Use --loxo-jobs with the IDs instead (npm run loxo:check -- --jobs lists them).");
    process.exit(1);
  }
  jobIds = open.map((j) => String((j.job ?? j).id));
}
if (!jobIds.length) {
  console.log("Name the jobs: --loxo-jobs 12,34 or --open-jobs");
  process.exit(1);
}

// 1. Count first, so the cost is known before anything is paid for.
const plan = [];
for (const id of jobIds) {
  const job = await fetchJob(client, id);
  let entries = await listJobCandidates(client, id);
  if (limit) entries = entries.slice(0, limit);
  plan.push({ job, entries });
  console.log(`  ${String(id).padEnd(8)} ${job.title}: ${entries.length} candidates`);
}
const total = plan.reduce((n, p) => n + p.entries.length, 0);
const [lo, hi] = COST_PER_CANDIDATE[args.provider] ?? [null, null];
const estimate = lo === null ? "depends on the model" : `about $${(lo * total).toFixed(0)} to $${(hi * total).toFixed(0)}`;
console.log(`\n${plan.length} jobs, ${total} candidates. Estimated AI cost with ${args.provider}: ${estimate}.`);
if (!args.go) {
  console.log("Nothing scored yet. Run again with --go to start.");
  process.exit(0);
}

// 2. Score job by job; one report each.
const provider = await getProvider(args.provider);
const scorecard = loadScorecard(args.scorecard);
const template = loadTemplate();
const cfg = writeConfigFromEnv();
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const dir = path.join("data", "runs", `${stamp}-${provider.name}-jobs`);
fs.mkdirSync(dir, { recursive: true });
const meta = { scorecard: `${scorecard.id}.v${scorecard.version}`, provider: `${provider.name} (${provider.model})`, when: new Date().toLocaleString() };
const rows = [];

for (const { job, entries } of plan) {
  console.log(`\n${job.title}`);
  const { candidates, failures } = await loadCandidates(client, entries);
  for (const f of failures) console.log(`  could not read entry ${f.entry_id}: ${f.error}`);
  const results = await scoreJob({
    candidates, job, scorecard, template, provider,
    concurrency: Number(args.concurrency),
    onResult: (r) => console.log(`  ${r.status === "scored" ? "scored" : "ERROR "} ${r.candidate_name ?? r.candidate_id}${r.status === "scored" ? `  ${r.average?.toFixed(2)}  ${r.recommendation}` : `  ${r.error}`}`),
  });
  const file = `job-${job.id}.html`;
  const jobMeta = { ...meta, jobTitle: job.title };
  fs.writeFileSync(path.join(dir, file), toHtml(results, jobMeta));
  fs.writeFileSync(path.join(dir, `job-${job.id}.md`), toMarkdown(results, jobMeta));
  fs.writeFileSync(path.join(dir, `job-${job.id}.json`), JSON.stringify({ meta: jobMeta, results }, null, 2));
  const scored = results.filter((r) => r.status === "scored");
  fs.writeFileSync(path.join(dir, `job-${job.id}-loxo-payloads.json`), JSON.stringify(scored.map((r) => {
    try { return { candidate: r.candidate_name, ...buildPayload(r, cfg) }; } catch (err) { return { candidate: r.candidate_name, error: err.message }; }
  }), null, 2));
  rows.push({ title: job.title, file, candidates: entries.length, scored: scored.length, yes: scored.filter((r) => r.recommendation === "yes").length, errors: results.length - scored.length + failures.length });
}

fs.writeFileSync(path.join(dir, "index.html"), toIndexHtml(rows, meta));
console.log(`\nDone. Nothing written to Loxo. Summary: ${path.join(dir, "index.html")}`);
