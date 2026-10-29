#!/usr/bin/env node
// Re-scores a search after its criteria change: only the people whose AI scorecard in Loxo
// was made with another scorecard version. Shows the count and the cost first; nothing is
// scored without --go, and nothing is written without --write plus the two .env switches.
// Each person's existing AI scorecard is updated in place, never duplicated.
//
//   node scripts/rescore-job.js --provider claude --loxo-job 123            count and cost
//   node scripts/rescore-job.js --provider claude --loxo-job 123 --go       dry run: report
//   node scripts/rescore-job.js --provider claude --loxo-job 123 --go --write   update Loxo

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
import { fetchJob, listJobCandidates, loadCandidates, workflowStageNames } from "../src/loxo/read.js";
import { personIdOf } from "../src/loxo/map.js";
import { outdatedAiScorecards, updateScorecard, buildScorecardPayload, writeConfigFromEnv, writesAllowed } from "../src/loxo/write.js";

loadEnv();
const { values: args } = parseArgs({
  options: {
    provider: { type: "string", default: process.env.SCORING_PROVIDER || "mock" },
    "loxo-job": { type: "string" },
    scorecard: { type: "string", default: process.env.SCORECARD_FILE || "config/scorecards/standard-executive.v2.json" },
    "scorecards-dir": { type: "string", default: process.env.SCORECARD_JOBS_DIR || JOB_SCORECARD_DIR },
    go: { type: "boolean", default: false },
    write: { type: "boolean", default: false },
  },
});
const COST_PER_CANDIDATE = { claude: [0.05, 0.14], openai: [0.02, 0.06], mock: [0, 0] };
if (!args["loxo-job"]) {
  console.error("Name the search: --loxo-job <id>");
  process.exit(1);
}
const cfg = writeConfigFromEnv();
if (cfg.target === "note") {
  console.error("Re-scoring updates AI scorecards in place; with LOXO_WRITE_TARGET=note it is not available yet.");
  process.exit(1);
}

const client = loxoClientFromEnv(process.env, { allowWrites: args.write });
const job = await fetchJob(client, args["loxo-job"]);
const scorecard = scorecardResolver({ fallback: loadScorecard(args.scorecard), dir: args["scorecards-dir"] })(job.id, job);
const current = `${scorecard.id}.v${scorecard.version}`;
const outdated = await outdatedAiScorecards(client, job.id, current);
console.log(`${job.title}: current scorecard ${current}. ${outdated.length} AI scorecards made with another version.`);
const versions = {};
for (const o of outdated) versions[o.used ?? "unknown"] = (versions[o.used ?? "unknown"] ?? 0) + 1;
for (const [v, n] of Object.entries(versions)) console.log(`  ${String(n).padStart(4)} on ${v}`);
if (!outdated.length) process.exit(0);
const [lo, hi] = COST_PER_CANDIDATE[args.provider] ?? [null, null];
console.log(`Estimated AI cost with ${args.provider}: ${lo === null ? "depends on the model" : `about $${(lo * outdated.length).toFixed(0)} to $${(hi * outdated.length).toFixed(0)}`}.`);
if (!args.go) {
  console.log("Nothing re-scored yet. Run again with --go.");
  process.exit(0);
}

const byPerson = new Map(outdated.map((o) => [o.person_id, o.scorecard_id]));
const entries = (await listJobCandidates(client, job.id)).filter((e) => byPerson.has(String(personIdOf(e))));
const { candidates, failures } = await loadCandidates(client, entries, { stageNames: await workflowStageNames(client) });
for (const f of failures) console.log(`  could not read entry ${f.entry_id}: ${f.error}`);
const provider = await getProvider(args.provider);
let done = 0;
const results = await scoreJob({ candidates, job, scorecard, template: loadTemplate(), provider,
  onResult: (r) => console.log(`  ${String(++done).padStart(4)}/${candidates.length} ${r.status === "scored" ? `scored   ${r.average?.toFixed(1)} ${r.recommendation}` : r.status === "skipped" ? "skipped  not enough in Loxo" : `ERROR    ${r.error}`}`) });

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const dir = path.join("data", "runs", `${stamp}-${provider.name}-rescore`);
fs.mkdirSync(dir, { recursive: true });
const meta = { jobTitle: job.title, scorecard: current, provider: `${provider.name} (${provider.model})`, when: new Date().toLocaleString() };
fs.writeFileSync(path.join(dir, "results.json"), JSON.stringify({ meta, results }, null, 2));
fs.writeFileSync(path.join(dir, "report.md"), toMarkdown(results, meta));
fs.writeFileSync(path.join(dir, "report.html"), toHtml(results, meta));

const scored = results.filter((r) => r.status === "scored");
if (args.write && writesAllowed()) {
  console.log(`\nUpdating ${scored.length} AI scorecards in Loxo ...`);
  for (const r of scored) {
    try {
      const out = await updateScorecard(client, byPerson.get(String(r.loxo.person_id)), r, cfg);
      console.log(`  ${out.status}  person ${r.loxo.person_id}`);
    } catch (err) {
      console.log(`  FAILED  person ${r.loxo.person_id}: ${err.message}`);
      process.exitCode = 1;
    }
  }
} else {
  const payloads = scored.map((r) => {
    try { return { scorecard_id: byPerson.get(String(r.loxo.person_id)), method: "PUT", body: buildScorecardPayload(r, cfg) }; } catch (err) { return { error: err.message }; }
  });
  fs.writeFileSync(path.join(dir, "loxo-payloads.json"), JSON.stringify(payloads, null, 2));
  console.log(`\nDry run: nothing written to Loxo. What would be updated: ${path.join(dir, "loxo-payloads.json")}`);
}
console.log(`Report: ${path.join(dir, "report.html")}`);
