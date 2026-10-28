#!/usr/bin/env node
// Hourly safety net (runs as a scheduled job on the host). See src/sweep.js.
//
//   node scripts/sweep.js                 production: needs writes switched on
//   node scripts/sweep.js --dry-run-once  local test: scores, writes nothing, saves what it would write
//
// In production it refuses to run with writes off: a dry run every hour would pay
// for the same candidates again and again.

import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { loadEnv } from "../src/env.js";
import { loadScorecard } from "../src/scorecard.js";
import { loadTemplate } from "../src/prompt.js";
import { getProvider } from "../src/providers/index.js";
import { loxoClientFromEnv } from "../src/loxo/index.js";
import { writeConfigFromEnv, writesAllowed } from "../src/loxo/write.js";
import { runSweep } from "../src/sweep.js";

loadEnv();
const { values: args } = parseArgs({ options: { "dry-run-once": { type: "boolean", default: false } } });
const log = (m) => console.log(`${new Date().toISOString()} ${m}`);

const writes = writesAllowed();
if (!writes && !args["dry-run-once"]) {
  log("Writes are off (DRY_RUN / LOXO_WRITE_ENABLED). Sweep not run. Use --dry-run-once for a local test.");
  process.exit(0);
}
const jobIds = (process.env.LOXO_AUTO_SCORE_JOB_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
if (!jobIds.length) {
  log("No jobs in LOXO_AUTO_SCORE_JOB_IDS. Nothing to do.");
  process.exit(0);
}

try {
  const summary = await runSweep({
    client: loxoClientFromEnv(process.env, { allowWrites: writes }),
    provider: await getProvider(process.env.SCORING_PROVIDER || "mock"),
    jobIds,
    scorecard: loadScorecard(process.env.SCORECARD_FILE || "config/scorecards/example.v1.json"),
    template: loadTemplate(),
    cfg: writeConfigFromEnv(),
    writes,
    maxPerRun: Number(process.env.SWEEP_MAX_PER_RUN || 50),
    useBatch: process.env.USE_BATCH !== "false",
    log,
  });
  const { dry_run, ...counts } = summary;
  log(`done ${JSON.stringify(counts)}`);
  if (dry_run.length) {
    const dir = path.join("data", "runs");
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `sweep-dry-run-${Date.now()}.json`);
    fs.writeFileSync(file, JSON.stringify(dry_run, null, 2));
    log(`dry run: what would be written is in ${file}`);
  }
} catch (err) {
  log(`sweep failed: ${err.message}`);
  process.exitCode = 1;
}
