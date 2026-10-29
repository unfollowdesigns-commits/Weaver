import { buildPrompt } from "./prompt.js";
import { outputSchema } from "./schema.js";
import { validateAnswer, finalize } from "./validate.js";

// Flags about the input, shown to the recruiter next to the score.
export const INPUT_FLAGS = {
  no_resume: "no_resume_text: resume missing or not readable as text; scored on profile and notes only",
  resume_truncated: "resume_truncated: Loxo returned only part of the resume text",
  resume_trimmed: "resume_trimmed: very long resume, only the first part was read",
  notes_trimmed: "notes_trimmed: only the most recent notes were read",
};

export function inputFlagCodes(candidate) {
  const codes = [...(candidate.trimmed ?? [])];
  if (!candidate.resume_text?.trim()) codes.unshift("no_resume");
  return codes;
}

export function prepareRequest({ candidate, job, scorecard, template }) {
  return { ...buildPrompt({ template, scorecard, job, candidate }), schema: outputSchema(scorecard) };
}

export function resultBase({ candidateId, candidateName = null, loxo = null, job, scorecard, template, provider }) {
  return {
    candidate_id: String(candidateId),
    candidate_name: candidateName,
    job_id: String(job.id),
    scorecard: `${scorecard.id}.v${scorecard.version}`,
    prompt: template.file,
    provider: provider.name,
    scored_at: new Date().toISOString(),
    review_status: "awaiting_review",
    loxo,
  };
}

// Turns a model answer into a result, or an error if the answer does not pass the checks.
export function resultFromAnswer({ base, answer, model, usage, scorecard, flagCodes = [] }) {
  const check = validateAnswer(answer, scorecard);
  if (!check.ok) return { ...base, status: "error", error: `invalid answer: ${check.errors.join("; ")}` };
  const result = { ...base, status: "scored", model, usage: usage ?? null, ...finalize(answer, scorecard) };
  for (const code of flagCodes) if (INPUT_FLAGS[code]) result.flags.push(INPUT_FLAGS[code]);
  return result;
}

// Scores one candidate. Never throws: a failure comes back as status "error"
// so one bad record does not stop a 100-candidate run.
export async function scoreCandidate({ candidate, job, scorecard, template, provider, attempts = 2 }) {
  const { system, user, schema } = prepareRequest({ candidate, job, scorecard, template });
  const base = resultBase({ candidateId: candidate.id, candidateName: candidate.name ?? null, loxo: candidate.loxo ?? null, job, scorecard, template, provider });
  const flagCodes = inputFlagCodes(candidate);

  let lastError = "";
  for (let i = 1; i <= attempts; i++) {
    try {
      const { answer, model, usage } = await provider.complete({ system, user, schema });
      const result = resultFromAnswer({ base, answer, model, usage, scorecard, flagCodes });
      if (result.status === "scored") return result;
      lastError = result.error;
    } catch (err) {
      lastError = err.message;
    }
  }
  return { ...base, status: "error", error: lastError };
}

export async function scoreJob({ candidates, concurrency = 3, onResult, ...rest }) {
  const results = new Array(candidates.length);
  let next = 0;
  async function worker() {
    while (next < candidates.length) {
      const i = next++;
      results[i] = await scoreCandidate({ candidate: candidates[i], ...rest });
      onResult?.(results[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, candidates.length) }, worker));
  return rankResults(results);
}

// Who to call first: recommended candidates before the rest, then by average, highest
// first; errors at the end. (29 Oct 2026: by average alone, a "no" at 3.9 outranked a "yes"
// at 3.9 that the firm's own team ranked first.)
export function rankResults(results) {
  return [...results].sort((a, b) => {
    if (a.status !== b.status) return a.status === "scored" ? -1 : 1;
    const ya = a.recommendation === "yes" ? 1 : 0;
    const yb = b.recommendation === "yes" ? 1 : 0;
    if (ya !== yb) return yb - ya;
    return (b.average ?? -1) - (a.average ?? -1);
  });
}
