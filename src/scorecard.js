import fs from "node:fs";
import path from "node:path";

export function loadScorecard(file) {
  const scorecard = JSON.parse(fs.readFileSync(file, "utf8"));
  checkScorecard(scorecard);
  return scorecard;
}

// Throws with a plain message if the scorecard cannot be used for scoring.
export function checkScorecard(sc) {
  const fail = (msg) => { throw new Error(`Scorecard "${sc?.id ?? "?"}": ${msg}`); };
  if (!sc || typeof sc !== "object") fail("not an object");
  if (!sc.id || typeof sc.id !== "string") fail("missing id");
  if (!Number.isInteger(sc.version)) fail("version must be a whole number");
  const { min, max, labels } = sc.scale ?? {};
  if (!Number.isInteger(min) || !Number.isInteger(max) || min >= max) fail("scale needs whole-number min and max, min below max");
  for (let v = min; v <= max; v++) if (!labels?.[v]) fail(`scale has no label for ${v}`);
  if (!Array.isArray(sc.criteria) || sc.criteria.length === 0) fail("no criteria");
  const seen = new Set();
  for (const c of sc.criteria) {
    if (!c.id || !c.label) fail("every criterion needs an id and a label");
    if (seen.has(c.id)) fail(`criterion id "${c.id}" is used twice`);
    seen.add(c.id);
  }
  const values = sc.recommendation?.values;
  if (!Array.isArray(values) || values.length < 2) fail("recommendation needs at least two values");
  if (sc.industry != null && (typeof sc.industry.direct !== "string" || typeof sc.industry.adjacent !== "string")) {
    fail("industry needs a direct and an adjacent description, or null");
  }
}

export function scaleValues(sc) {
  const out = [];
  for (let v = sc.scale.min; v <= sc.scale.max; v++) out.push(v);
  return out;
}

// Per-search scorecards: config/scorecards/jobs/job-<loxo job id>.v<N>.json, approved
// by the firm. The highest version wins; a search without one uses the fallback.
// Drafts (job-<id>.draft*.json) are never used for scoring.
export const JOB_SCORECARD_DIR = "config/scorecards/jobs";

export function jobScorecardFile(jobId, dir = JOB_SCORECARD_DIR) {
  if (!fs.existsSync(dir)) return null;
  const re = new RegExp(`^job-${String(jobId).replace(/[^\w-]/g, "")}\\.v(\\d+)\\.json$`);
  let best = null;
  for (const f of fs.readdirSync(dir)) {
    const m = re.exec(f);
    if (m && (!best || Number(m[1]) > best.v)) best = { v: Number(m[1]), f };
  }
  return best ? path.join(dir, best.f) : null;
}

// Returns (jobId) => scorecard. Reads the folder on each call, so a newly approved
// scorecard is used without a restart.
export function scorecardResolver({ fallback, dir = JOB_SCORECARD_DIR }) {
  return (jobId) => {
    const file = jobId === undefined || jobId === null ? null : jobScorecardFile(jobId, dir);
    return file ? loadScorecard(file) : fallback;
  };
}
