import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { draftRequest, scorecardFromDraft, draftText } from "./draft.js";
import { loadScorecard, jobScorecardFile, checkScorecard } from "./scorecard.js";

// The first time a search is scored without an approved scorecard, the criteria descriptions
// and industry definitions are drafted from the job (keeping the firm's own criteria names from
// Loxo), saved, and reused for every candidate on that search, so they all face the same
// criteria. It is marked as not yet approved. When Josh approves a version (scorecard:draft
// --approve), that one is used and `npm run rescore` updates people scored on the draft.
// For test runs only: live scoring (server and sweep) waits for an approved scorecard.
export const AUTO_DIR = "data/scorecards/auto";

export function jobSignature(job) {
  const text = [job.title, job.description, JSON.stringify(job.scorecard_template?.criteria ?? [])].join("\n");
  return crypto.createHash("sha256").update(text).digest("hex").slice(0, 8);
}

export async function scorecardForSearch({ job, resolver, standard, provider = null, auto = true, approvedDir, autoDir = AUTO_DIR, log = () => {} }) {
  const approved = jobScorecardFile(job.id, approvedDir);
  if (approved) return loadScorecard(approved);
  if (!auto || !provider) return resolver(job.id, job);
  const id = String(job.id).replace(/[^\w-]/g, "");
  const sig = jobSignature(job);
  const file = path.join(autoDir, `job-${id}.auto-${sig}.json`);
  if (fs.existsSync(file)) {
    const sc = JSON.parse(fs.readFileSync(file, "utf8"));
    checkScorecard(sc);
    return sc;
  }
  log(`  no approved scorecard for this search: drafting the criteria descriptions from the job (not yet approved)`);
  const { answer } = await provider.complete(draftRequest(job));
  const sc = scorecardFromDraft(answer, job, standard);
  Object.assign(sc, { id: `job-${id}-auto-${sig}`, version: 1, status: "drafted automatically, not yet approved", auto: true });
  fs.mkdirSync(autoDir, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(sc, null, 2) + "\n");
  // A plain-text copy to send for approval.
  fs.writeFileSync(file.replace(/\.json$/, ".txt"), draftText(sc) + "\n");
  return sc;
}

// Live scoring (server, sweep): the search's approved scorecard; otherwise the criteria
// drafted from the job the first time the search is seen, stored in `store` (on Render, a
// persistent disk) and used straight away, so every candidate on the search faces the same
// criteria across restarts. With auto off, only approved scorecards are used (else null).
// One draft at a time per search, even if a webhook and the hourly sweep arrive together.
export function liveCriteria({ standard, provider, approvedDir, store = AUTO_DIR, auto = true, resolver, log = () => {} }) {
  const inflight = new Map();
  return async (jobId, job) => {
    if (!auto) {
      const file = jobScorecardFile(jobId, approvedDir);
      return file ? loadScorecard(file) : null;
    }
    const key = String(jobId);
    if (inflight.has(key)) return inflight.get(key);
    const p = scorecardForSearch({ job: { ...job, id: job?.id ?? jobId }, resolver, standard, provider, auto: true, approvedDir, autoDir: store, log })
      .finally(() => inflight.delete(key));
    inflight.set(key, p);
    return p;
  };
}
