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
  if (sc.pay_range != null && !(Number.isFinite(sc.pay_range.min ?? 0) && Number.isFinite(sc.pay_range.max ?? 0))) fail("pay_range needs numeric min and/or max");
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

const slug = (t) => t.toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/[\s-]+/g, "_").slice(0, 40) || "criterion";

// A scorecard from the firm's own template on the job in Loxo: their criteria, in their
// order, on their 1 to 5 scale. Descriptions are generic until a drafted version is approved.
export function scorecardFromTemplate(job, standard) {
  const t = job?.scorecard_template;
  if (!t?.criteria?.length || t.criteria.length < 3) return null;
  const seen = new Set();
  const criteria = t.criteria.map((label) => {
    let id = slug(label);
    while (seen.has(id)) id += "_2";
    seen.add(id);
    return { id, label, description: `${label}, as this search needs it. Judge only from the record against the job description. 3: meets the bar for this role. 5: clearly exceptional for this role.` };
  });
  const sc = { id: `loxo-template-${t.id ?? job.id}`, version: 1, name: t.name ?? `${job.title} scorecard`, source: "loxo", scale: standard.scale, criteria, recommendation: standard.recommendation, industry: null };
  checkScorecard(sc);
  return sc;
}

// Live scoring (server and sweep): only a search's approved scorecard, else null, so nothing
// is scored automatically on criteria Josh has not approved. REQUIRE_APPROVED_SCORECARD=false
// falls back to the usual order.
export function liveScorecardResolver({ fallback, dir = JOB_SCORECARD_DIR, requireApproved = true }) {
  const any = scorecardResolver({ fallback, dir });
  return (jobId, job = null) => {
    const file = jobId === undefined || jobId === null ? null : jobScorecardFile(jobId, dir);
    if (file) return loadScorecard(file);
    return requireApproved ? null : any(jobId, job);
  };
}

// Returns (jobId, job) => scorecard. Order: the search's approved file, then the firm's own
// template on the job in Loxo, then the standard scorecard. Reads the folder on each call,
// so a newly approved scorecard is used without a restart.
export function scorecardResolver({ fallback, dir = JOB_SCORECARD_DIR }) {
  return (jobId, job = null) => {
    const file = jobId === undefined || jobId === null ? null : jobScorecardFile(jobId, dir);
    if (file) return loadScorecard(file);
    return scorecardFromTemplate(job, fallback) ?? fallback;
  };
}
