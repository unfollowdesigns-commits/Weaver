import { firstArray } from "./client.js";

// Writes a scored result into Loxo, as a scorecard (preferred) or a note on the person.
// Every write is marked as AI-generated and awaiting recruiter review.

export const AI_AUTHOR = "Candidate scoring (AI, awaiting review)";

const esc = (t) => String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

export function summaryText(result) {
  const lines = [
    `AI assessment, awaiting recruiter review. Not a decision.`,
    `Average ${result.average ?? "n/a"} of 5 (${result.scored_count} of ${result.criteria.length} criteria had evidence). Recommendation: ${result.recommendation}.`,
    "",
    result.assessment,
  ];
  if (result.open_questions.length) lines.push("", "Open questions:", ...result.open_questions.map((q) => `- ${q}`));
  if (result.flags.length) lines.push("", "Flags:", ...result.flags.map((f) => `- ${f}`));
  lines.push("", `Scorecard ${result.scorecard}, ${result.provider} ${result.model ?? ""}, ${result.scored_at.slice(0, 10)}.`);
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

const NOTE_MARKER = "AI assessment, awaiting recruiter review";

// Person IDs on a job that already have an AI assessment, in one pass per job.
// Checked before calling the AI, so nobody is paid for twice.
export async function aiScoredPersonIds(client, jobId, cfg) {
  const ids = new Set();
  if (cfg.target === "note") {
    const events = await client.list("/person_events", { job_ids: [jobId], notes_format: "plain", query: `"${NOTE_MARKER}"` });
    for (const e of events) if (String(e.notes ?? "").includes(NOTE_MARKER)) ids.add(String(e.person_id ?? e.person?.id));
  } else {
    const cards = await client.list("/scorecards", { job_id: jobId });
    for (const s of cards) if (s.external_creator_name === AI_AUTHOR) ids.add(String(s.person_id ?? s.person?.id));
  }
  ids.delete("undefined");
  return ids;
}

export async function hasAiAssessment(client, jobId, personId, cfg) {
  if (cfg.target === "note") return (await aiScoredPersonIds(client, jobId, cfg)).has(String(personId));
  const cards = firstArray(await client.get("/scorecards", { person_id: personId, job_id: jobId }));
  return cards.some((s) => s.external_creator_name === AI_AUTHOR);
}

// Skips a candidate that already has an AI scorecard for this job, so re-runs do not pile up duplicates.
export async function writeResult(client, result, cfg) {
  if (result.status !== "scored") return { status: "skipped", reason: "not scored" };
  if (!result.loxo?.person_id) return { status: "skipped", reason: "no Loxo person id" };
  const { path, body } = buildPayload(result, cfg);
  if (cfg.target !== "note") {
    const existing = firstArray(await client.get("/scorecards", { person_id: result.loxo.person_id, job_id: result.job_id }));
    if (existing.some((s) => s.external_creator_name === AI_AUTHOR)) return { status: "skipped", reason: "already has an AI scorecard for this job" };
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
