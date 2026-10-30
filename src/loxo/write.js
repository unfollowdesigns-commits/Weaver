import { firstArray } from "./client.js";

// Writes a scored result into Loxo, as a scorecard (preferred) or a note on the person.
// Every write is marked as AI-generated and awaiting recruiter review.

export const AI_AUTHOR = "Candidate scoring (AI, awaiting review)";

const esc = (t) => String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

const INDUSTRY_TAG = { direct: "Direct industry experience", adjacent: "Adjacent industry", other: null };

export function summaryText(result) {
  const avg = result.average === null || result.average === undefined ? "n/a" : result.average.toFixed(1);
  const lines = [
    "AI first read, awaiting recruiter review. Not a decision.",
    `${avg} / 5 · ${result.recommendation === "yes" ? "Yes" : "No"} (${result.scored_count} of ${result.criteria.length} criteria had evidence)`,
  ];
  if (INDUSTRY_TAG[result.industry]) lines.push(INDUSTRY_TAG[result.industry]);
  lines.push("", `Strongest signal: ${result.strongest_signal}`, `Watch item: ${result.watch_item}`, "", result.assessment);
  if (result.where_they_fit?.length) lines.push("", "Where they fit:", ...result.where_they_fit.map((q) => `- ${q}`));
  if (result.where_to_probe?.length) lines.push("", "Where to probe:", ...result.where_to_probe.map((q) => `- ${q}`));
  if (result.flags.length) lines.push("", "Flags:", ...result.flags.map((f) => `- ${f}`));
  // No AI provider or model name: the firm sees this in Loxo (30 Oct 2026 review).
  lines.push("", `Scorecard ${result.scorecard}, ${result.scored_at.slice(0, 10)}.`);
  return lines.join("\n");
}

export function buildScorecardPayload(result, cfg) {
  if (!cfg.scorecardTypeId) throw new Error("LOXO_SCORECARD_TYPE_ID is not set. Run scripts/loxo-check.js to list the IDs.");
  return {
    person_id: Number(result.loxo.person_id),
    job_id: Number(result.job_id),
    scorecard_type_id: Number(cfg.scorecardTypeId),
    scorecard_recommendation_type_id: cfg.recommendationTypeIds?.[result.recommendation]
      ? Number(cfg.recommendationTypeIds[result.recommendation])
      : undefined,
    external_creator_name: AI_AUTHOR,
    summary: summaryText(result),
    scorecard_attributes: result.criteria.map((c, i) => ({
      name: c.label,
      position: i + 1,
      ...(c.score !== null ? { score: c.score } : {}),
      notes: c.score === null ? "No evidence in the record." : c.evidence,
    })),
  };
}

export function buildNotePayload(result, cfg) {
  if (!cfg.noteActivityTypeId) throw new Error("LOXO_NOTE_ACTIVITY_TYPE_ID is not set. Run scripts/loxo-check.js to list the IDs.");
  const rows = result.criteria.map((c) => `<li>${esc(c.label)}: ${c.score ?? "no evidence"}. ${esc(c.evidence)}</li>`).join("");
  const html = summaryText(result).split("\n\n").map((p) => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`).join("") + `<ul>${rows}</ul>`;
  return {
    person_event: {
      activity_type_id: Number(cfg.noteActivityTypeId),
      person_id: Number(result.loxo.person_id),
      job_id: Number(result.job_id),
      notes: html,
    },
  };
}

export function buildPayload(result, cfg) {
  return cfg.target === "note" ? { path: "/person_events", body: buildNotePayload(result, cfg) } : { path: "/scorecards", body: buildScorecardPayload(result, cfg) };
}

// Both wordings, so notes written before 29 Oct 2026 are still recognized.
const NOTE_MARKERS = ["AI first read, awaiting recruiter review", "AI assessment, awaiting recruiter review"];

// Person IDs on a job that already have an AI assessment, in one pass per job.
// Checked before calling the AI, so nobody is paid for twice.
// Loxo's filters are trusted no further than the page: every record is checked on our side
// too, so an ignored filter can never mark the wrong person as done (30 Oct 2026 review).
const pidOf = (x) => String(x?.person_id ?? x?.person?.id ?? "");
// Weaver's own scorecards, recognized two ways: the creator name it sets, or the first line of
// its summary. Either alone is enough, so a duplicate can never be written if Loxo does not
// keep one of the two (not yet confirmed on the account; the write test checks both).
const SUMMARY_MARKER = "AI first read, awaiting recruiter review";
export const isAiCard = (s) => s?.external_creator_name === AI_AUTHOR || String(s?.summary ?? "").startsWith(SUMMARY_MARKER);
const jobOf = (x) => (x?.job_id ?? x?.job?.id ?? null);
const sameJob = (x, jobId) => jobOf(x) === null || String(jobOf(x)) === String(jobId);
// A record without a person id is trusted to the filter we sent (the safe side: never write a
// duplicate). A record with one must match.
const samePerson = (x, personId) => pidOf(x) === "" || pidOf(x) === String(personId);

export async function aiScoredPersonIds(client, jobId, cfg) {
  const ids = new Set();
  if (cfg.target === "note") {
    for (const marker of NOTE_MARKERS) {
      const events = await client.list("/person_events", { job_ids: [jobId], notes_format: "plain", query: `"${marker}"` });
      for (const e of events) if (String(e.notes ?? "").includes(marker) && sameJob(e, jobId)) ids.add(pidOf(e));
    }
  } else {
    const cards = await client.list("/scorecards", { job_id: jobId });
    for (const s of cards) if (isAiCard(s) && sameJob(s, jobId)) ids.add(pidOf(s));
  }
  ids.delete("undefined");
  ids.delete("");
  return ids;
}

export async function hasAiAssessment(client, jobId, personId, cfg) {
  if (cfg.target === "note") return (await aiScoredPersonIds(client, jobId, cfg)).has(String(personId));
  const cards = firstArray(await client.get("/scorecards", { person_id: personId, job_id: jobId }));
  return cards.some((s) => isAiCard(s) && samePerson(s, personId) && sameJob(s, jobId));
}

// Skips a candidate that already has an AI scorecard for this job, so re-runs do not pile up duplicates.
export async function writeResult(client, result, cfg) {
  if (result.status !== "scored") return { status: "skipped", reason: "not scored" };
  if (!result.loxo?.person_id) return { status: "skipped", reason: "no Loxo person id" };
  const { path, body } = buildPayload(result, cfg);
  if (cfg.target !== "note") {
    const existing = firstArray(await client.get("/scorecards", { person_id: result.loxo.person_id, job_id: result.job_id }));
    const mine = existing.filter((s) => isAiCard(s) && samePerson(s, result.loxo.person_id) && sameJob(s, result.job_id));
    if (mine.length) {
      // Say when the match rests on Loxo's filter alone (the record carried no person id).
      const unproven = mine.every((s) => pidOf(s) === "");
      return { status: "skipped", reason: unproven ? "Loxo lists an AI scorecard for this job (no person id on it to confirm)" : "already has an AI scorecard for this job" };
    }
  }
  const response = await client.post(path, body);
  return { status: "written", id: response?.id ?? response?.scorecard?.id ?? response?.person_event?.id ?? null };
}

export function writeConfigFromEnv(env = process.env) {
  return {
    target: env.LOXO_WRITE_TARGET === "note" ? "note" : "scorecard",
    scorecardTypeId: env.LOXO_SCORECARD_TYPE_ID,
    recommendationTypeIds: { yes: env.LOXO_RECOMMENDATION_YES_ID, no: env.LOXO_RECOMMENDATION_NO_ID },
    noteActivityTypeId: env.LOXO_NOTE_ACTIVITY_TYPE_ID,
  };
}

export function writesAllowed(env = process.env) {
  return env.LOXO_WRITE_ENABLED === "true" && env.DRY_RUN === "false";
}

// Re-scoring after a search's criteria change. Every AI scorecard's summary records the
// scorecard it used ("Scorecard job-3688816.v1, <date>."); one on another version is out of
// date. Updated in place (PUT /scorecards/{id}, documented by Loxo, to confirm on the account)
// so a person never ends up with two AI scorecards on the same search.
export function scorecardUsed(card) {
  return /Scorecard ([\w.-]+?\.v\d+),/.exec(String(card?.summary ?? ""))?.[1] ?? null;
}

export async function outdatedAiScorecards(client, jobId, currentScorecard) {
  const cards = await client.list("/scorecards", { job_id: jobId });
  return cards
    .filter((s) => isAiCard(s) && sameJob(s, jobId) && pidOf(s) !== "")
    .map((s) => ({ scorecard_id: s.id, person_id: pidOf(s), used: scorecardUsed(s) }))
    .filter((x) => x.used !== currentScorecard);
}

export async function updateScorecard(client, scorecardId, result, cfg) {
  if (result.status !== "scored") return { status: "skipped", reason: "not scored" };
  const body = buildScorecardPayload(result, cfg);
  await client.put(`/scorecards/${scorecardId}`, body);
  return { status: "updated", id: scorecardId };
}
