#!/usr/bin/env node
// Drafts the firm's client pipeline report for one search, from Loxo and Weaver's first reads.
// Read-only in Loxo. The report opens in a browser as an editable draft; the team checks
// and edits every line, then prints or saves it as PDF.
//
//   node scripts/client-report.js --loxo-job 123 --results data/runs/<run>/job-123.json
//   node scripts/client-report.js --loxo-job 123 --provider claude --go     (scores first)
//   options: --firm "Firm name" --client "Client name" (default from .env and the Loxo job)
//            --narrative file.json  use prepared short text instead of asking the AI
//
// Output: data/reports/<date>-job-<id>/report.html (real candidates: stays on this computer).

import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { loadEnv } from "../src/env.js";
import { loadScorecard, scorecardResolver, JOB_SCORECARD_DIR } from "../src/scorecard.js";
import { loadTemplate } from "../src/prompt.js";
import { getProvider } from "../src/providers/index.js";
import { scoreJob } from "../src/score.js";
import { loxoClientFromEnv } from "../src/loxo/index.js";
import { fetchJob, listJobCandidates, loadCandidates, teamScorecards } from "../src/loxo/read.js";
import { buildReportModel, loadStages } from "../src/client-report/model.js";
import { narrativeRequest, applyNarrative } from "../src/client-report/narrative.js";
import { renderReport } from "../src/client-report/render.js";

loadEnv();
const { values: args } = parseArgs({
  options: {
    "loxo-job": { type: "string" },
    results: { type: "string" },
    narrative: { type: "string" },
    provider: { type: "string", default: process.env.SCORING_PROVIDER || "mock" },
    firm: { type: "string", default: process.env.REPORT_FIRM_NAME || "" },
    client: { type: "string", default: "" },
    stages: { type: "string", default: "config/report/stages.v1.json" },
    "scorecards-dir": { type: "string", default: process.env.SCORECARD_JOBS_DIR || JOB_SCORECARD_DIR },
    go: { type: "boolean", default: false },
  },
});
const jobId = args["loxo-job"];
if (!jobId) {
  console.error("Name the search: --loxo-job <id>");
  process.exit(1);
}

const client = loxoClientFromEnv(); // read-only
const job = await fetchJob(client, jobId);
const entries = await listJobCandidates(client, jobId);
console.log(`${job.title}: ${entries.length} candidates on the pipeline`);

let results = [];
if (args.results) {
  results = JSON.parse(fs.readFileSync(args.results, "utf8")).results ?? [];
  console.log(`  using ${results.length} first reads from ${args.results}`);
}
const provider = await getProvider(args.provider);
if (!args.results && provider.name !== "mock" && !args.go) {
  console.log(`No --results given, so every candidate would be scored first (${entries.length} AI readings). Run again with --go, or pass --results from the full test.`);
  process.exit(0);
}

const { candidates, failures } = await loadCandidates(client, entries);
for (const f of failures) console.log(`  could not read entry ${f.entry_id}: ${f.error}`);
if (!args.results) {
  const scorecard = scorecardResolver({ fallback: loadScorecard(process.env.SCORECARD_FILE || "config/scorecards/standard-executive.v2.json"), dir: args["scorecards-dir"] })(job.id);
  results = await scoreJob({ candidates, job, scorecard, template: loadTemplate(), provider });
  console.log(`  scored ${results.filter((r) => r.status === "scored").length} with ${provider.name}`);
}

const stages = loadStages(args.stages);
const teamCards = await teamScorecards(client, jobId);
let model = buildReportModel({ job, candidates, results, teamCards, stages, firm: args.firm, client: args.client });

try {
  const { answer } = args.narrative ? { answer: JSON.parse(fs.readFileSync(args.narrative, "utf8")) } : await provider.complete(narrativeRequest(model));
  model = applyNarrative(model, answer);
} catch (err) {
  console.log(`  written parts not drafted (${err.message}); placeholders left for the team`);
}

const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
const dir = path.join("data", "reports", `${stamp}-job-${String(job.id).replace(/[^\w-]/g, "")}`);
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, "report.html"), renderReport(model, stages));
const unmatched = [...new Set(candidates.map((c) => c.report?.stage?.name).filter(Boolean))];
console.log(`  stages seen in Loxo: ${unmatched.join(", ") || "none"} (mapping: ${args.stages})`);
console.log(`  team scorecards found: ${teamCards.size}`);
console.log(`\nDraft report: ${path.join(dir, "report.html")}\nOpen it in a browser, edit, then print or save as PDF. Nothing was written to Loxo.`);
