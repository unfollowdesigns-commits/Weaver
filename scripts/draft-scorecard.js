#!/usr/bin/env node
// Drafts a scorecard for one search from its job description, for the firm to approve.
// Read-only in Loxo. The draft is not used for scoring until approved.
//
//   node scripts/draft-scorecard.js --provider claude --loxo-job 123    draft from Loxo
//   node scripts/draft-scorecard.js --job samples/job.sample.json       draft from a file
//   node scripts/draft-scorecard.js --approve 123                        approve the latest draft
//
// Drafts go to config/scorecards/jobs/job-<id>.draft.json (plus a .txt to send for review).
// Approving saves it as job-<id>.v<N>.json beside any earlier version; nothing is overwritten.
// Edit the draft file first if the partner asked for changes.

import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { loadEnv } from "../src/env.js";
import { loadScorecard, checkScorecard, JOB_SCORECARD_DIR } from "../src/scorecard.js";
import { getProvider } from "../src/providers/index.js";
import { draftRequest, scorecardFromDraft, draftText, nextVersion } from "../src/draft.js";
import { loxoClientFromEnv } from "../src/loxo/index.js";
import { fetchJob } from "../src/loxo/read.js";

loadEnv();
const { values: args } = parseArgs({
  options: {
    provider: { type: "string", default: process.env.SCORING_PROVIDER || "mock" },
    "loxo-job": { type: "string" },
    job: { type: "string" },
    approve: { type: "string" },
    dir: { type: "string", default: process.env.SCORECARD_JOBS_DIR || JOB_SCORECARD_DIR },
    standard: { type: "string", default: process.env.SCORECARD_FILE || "config/scorecards/standard-executive.v2.json" },
  },
});
fs.mkdirSync(args.dir, { recursive: true });

if (args.approve) {
  const id = args.approve.replace(/[^\w-]/g, "");
  const draftFile = path.join(args.dir, `job-${id}.draft.json`);
  if (!fs.existsSync(draftFile)) {
    console.error(`No draft at ${draftFile}. Make one first.`);
    process.exit(1);
  }
  const sc = JSON.parse(fs.readFileSync(draftFile, "utf8"));
  const v = nextVersion(args.dir, id);
  const approved = { ...sc, version: v, status: "approved", approved_at: new Date().toISOString().slice(0, 10) };
  checkScorecard(approved);
  const out = path.join(args.dir, `job-${id}.v${v}.json`);
  fs.writeFileSync(out, JSON.stringify(approved, null, 2) + "\n", { flag: "wx" });
  console.log(`Approved: ${out}. Scoring for this search now uses it.`);
  process.exit(0);
}

let job;
if (args["loxo-job"]) job = await fetchJob(loxoClientFromEnv(), args["loxo-job"]);
else if (args.job) job = JSON.parse(fs.readFileSync(args.job, "utf8"));
else {
  console.error("Name the search: --loxo-job <id> or --job <file>. Or --approve <id>.");
  process.exit(1);
}

const provider = await getProvider(args.provider);
const { answer } = await provider.complete(draftRequest(job));
const sc = scorecardFromDraft(answer, job, loadScorecard(args.standard));
const base = path.join(args.dir, `job-${String(job.id).replace(/[^\w-]/g, "")}.draft`);
if (fs.existsSync(`${base}.json`)) fs.renameSync(`${base}.json`, `${base}.${Date.now()}.old.json`);
fs.writeFileSync(`${base}.json`, JSON.stringify(sc, null, 2) + "\n");
fs.writeFileSync(`${base}.txt`, draftText(sc) + "\n");
console.log(draftText(sc));
console.log(`\nDraft saved: ${base}.json and ${base}.txt (to send for approval).`);
console.log(`Approve with: node scripts/draft-scorecard.js --approve ${job.id}`);
