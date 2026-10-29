#!/usr/bin/env node
// Automatic scoring: receives Loxo's "candidate created" webhook and scores that candidate.
//
//   node scripts/serve.js            listens on PORT (default 8787)
//
// Loxo calls:  POST /loxo/webhook?token=<WEBHOOK_SECRET>
// Cost guards, in order: only jobs in LOXO_AUTO_SCORE_JOB_IDS; the same candidate within
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
import { loadTemplate } from "../src/prompt.js";
import { getProvider } from "../src/providers/index.js";
import { scoreCandidate } from "../src/score.js";
import { loxoClientFromEnv } from "../src/loxo/index.js";
import { firstArray } from "../src/loxo/client.js";
import { fetchJob, loadCandidate } from "../src/loxo/read.js";
import { buildPayload, writeResult, writeConfigFromEnv, writesAllowed, hasAiAssessment } from "../src/loxo/write.js";
import { createDailyCap, createDeduper } from "../src/limits.js";

loadEnv();

const secret = process.env.WEBHOOK_SECRET ?? "";
if (secret.length < 16) {
  console.error("WEBHOOK_SECRET must be set (at least 16 characters).");
  process.exit(1);
}
const allowedJobs = new Set((process.env.LOXO_AUTO_SCORE_JOB_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean));
const scorecardFor = scorecardResolver({ fallback: loadScorecard(process.env.SCORECARD_FILE || "config/scorecards/standard-executive.v2.json"), dir: process.env.SCORECARD_JOBS_DIR || JOB_SCORECARD_DIR });
const template = loadTemplate();
const provider = await getProvider(process.env.SCORING_PROVIDER || "mock");
const client = loxoClientFromEnv(process.env, { allowWrites: true });
const cfg = writeConfigFromEnv();
const saveDebug = process.env.SAVE_DEBUG_FILES === "true";
const dailyCap = createDailyCap(Number(process.env.DAILY_SCORE_CAP || 200));
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

async function handle(body) {
  const { jobId, personId } = idsFromWebhook(body);
  if (!jobId || !personId) return log("delivery without job_id/person_id; field names to confirm (set SAVE_DEBUG_FILES=true locally to keep the body)");
  const tag = `job ${jobId} person ${personId}`;
  if (!allowedJobs.has(String(jobId))) return log(`${tag}: job not switched on, skipped`);
  if (deduper.seenRecently(`${jobId}:${personId}`)) return log(`${tag}: duplicate within 15 minutes, skipped`);
  if (await hasAiAssessment(client, jobId, personId, cfg)) return log(`${tag}: already assessed, skipped`);
  if (!dailyCap.take()) return log(`${tag}: daily cap reached, left for the sweep tomorrow`);

  if (!jobCache.has(jobId) || Date.now() - jobCache.get(jobId).at > 10 * 60_000) {
    jobCache.set(jobId, { at: Date.now(), job: await fetchJob(client, jobId) });
  }
  const job = jobCache.get(jobId).job;
  const entry = firstArray(await client.get(`/jobs/${jobId}/candidates`, { person_id: personId }))[0] ?? { person_id: personId };
  const candidate = await loadCandidate(client, entry);
  const result = await scoreCandidate({ candidate, job, scorecard: scorecardFor(jobId), template, provider });
  const tokens = result.usage ? ` tokens in ${result.usage.input_tokens ?? result.usage.prompt_tokens} out ${result.usage.output_tokens ?? result.usage.completion_tokens}` : "";
  log(`${tag}: ${result.status}${result.status === "scored" ? ` ${result.average} ${result.recommendation}${tokens}` : ` ${result.error}`}`);
  if (result.status !== "scored") return;

  if (writesAllowed()) {
    const out = await writeResult(client, result, cfg);
    log(`${tag}: Loxo ${out.status}${out.reason ? ` (${out.reason})` : ""}`);
  } else {
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

const port = Number(process.env.PORT || 8787);
server.listen(port, () => {
  log(`Listening on :${port}. Provider ${provider.name}. Jobs: ${[...allowedJobs].join(", ") || "none"}. Writes ${writesAllowed() ? "ON" : "off (dry run)"}. Daily cap ${process.env.DAILY_SCORE_CAP || 200}.`);
});
