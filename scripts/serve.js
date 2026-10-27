#!/usr/bin/env node
// Automatic scoring: receives Loxo's "candidate created" webhook and scores that candidate.
//
//   node scripts/serve.js            listens on PORT (default 8787)
//
// Loxo calls:  POST /loxo/webhook?token=<WEBHOOK_SECRET>
// Only jobs listed in LOXO_AUTO_SCORE_JOB_IDS are scored, so a webhook for the whole
// agency does not run up model costs on searches nobody asked to score.
// Writes to Loxo follow the same switches as everything else; otherwise the payload
// is saved under data/runs/webhook/ for review.
//
// Loxo does not publish the webhook body format. Every delivery is saved to
// data/webhooks/ so the field names can be confirmed on day one.

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { loadEnv } from "../src/env.js";
import { loadScorecard } from "../src/scorecard.js";
import { loadTemplate } from "../src/prompt.js";
import { getProvider } from "../src/providers/index.js";
import { scoreCandidate } from "../src/score.js";
import { loxoClientFromEnv } from "../src/loxo/index.js";
import { firstArray } from "../src/loxo/client.js";
import { fetchJob, loadCandidate } from "../src/loxo/read.js";
import { buildPayload, writeResult, writeConfigFromEnv, writesAllowed } from "../src/loxo/write.js";

loadEnv();

const secret = process.env.WEBHOOK_SECRET ?? "";
if (secret.length < 16) {
  console.error("WEBHOOK_SECRET must be set in .env (at least 16 characters).");
  process.exit(1);
}
const allowedJobs = new Set((process.env.LOXO_AUTO_SCORE_JOB_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean));
const scorecard = loadScorecard(process.env.SCORECARD_FILE || "config/scorecards/example.v1.json");
const template = loadTemplate();
const provider = await getProvider(process.env.SCORING_PROVIDER || "mock");
const client = loxoClientFromEnv(process.env, { allowWrites: true });
const cfg = writeConfigFromEnv();

const pick = (body, key) =>
  body?.[key] ?? body?.item?.[key] ?? body?.data?.[key] ?? body?.candidate?.[key] ?? body?.payload?.[key] ?? null;

function idsFromWebhook(body) {
  return {
    jobId: pick(body, "job_id") ?? body?.candidate?.job?.id ?? null,
    personId: pick(body, "person_id") ?? body?.candidate?.person?.id ?? null,
  };
}

// One at a time: keeps model and Loxo usage steady when many candidates arrive at once.
let queue = Promise.resolve();
const jobCache = new Map();

async function handle(body) {
  const { jobId, personId } = idsFromWebhook(body);
  if (!jobId || !personId) return log("delivery without job_id/person_id; check the saved body for the real field names");
  if (!allowedJobs.has(String(jobId))) return log(`job ${jobId} is not in LOXO_AUTO_SCORE_JOB_IDS, skipped`);

  if (!jobCache.has(jobId) || Date.now() - jobCache.get(jobId).at > 10 * 60_000) {
    jobCache.set(jobId, { at: Date.now(), job: await fetchJob(client, jobId) });
  }
  const job = jobCache.get(jobId).job;
  const entry = firstArray(await client.get(`/jobs/${jobId}/candidates`, { person_id: personId }))[0] ?? { person_id: personId };
  const candidate = await loadCandidate(client, entry);
  const result = await scoreCandidate({ candidate, job, scorecard, template, provider });
  log(`job ${jobId}, person ${personId}: ${result.status}${result.status === "scored" ? ` ${result.average} ${result.recommendation}` : ` ${result.error}`}`);

  if (result.status !== "scored") return;
  if (writesAllowed()) {
    const out = await writeResult(client, result, cfg);
    log(`  Loxo: ${out.status}${out.reason ? ` (${out.reason})` : ""}`);
  } else {
    const dir = path.join("data", "runs", "webhook");
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${Date.now()}-${personId}.json`);
    fs.writeFileSync(file, JSON.stringify({ result, would_write: buildPayload(result, cfg) }, null, 2));
    log(`  dry run, saved ${file}`);
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
    const dir = path.join("data", "webhooks");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${Date.now()}.json`), raw);
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
  log(`Listening on :${port}. Provider ${provider.name}. Auto-scoring jobs: ${[...allowedJobs].join(", ") || "none"}. Writes ${writesAllowed() ? "ON" : "off (dry run)"}.`);
});
