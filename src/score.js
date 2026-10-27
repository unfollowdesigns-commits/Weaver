import { buildPrompt } from "./prompt.js";
import { outputSchema } from "./schema.js";
import { validateAnswer, finalize } from "./validate.js";

// Scores one candidate. Never throws: a failure comes back as status "error"
// so one bad record does not stop a 100-candidate run.
export async function scoreCandidate({ candidate, job, scorecard, template, provider, attempts = 2 }) {
  const { system, user } = buildPrompt({ template, scorecard, job, candidate });
  const schema = outputSchema(scorecard);
  const base = {
    candidate_id: String(candidate.id),
    candidate_name: candidate.name ?? null,
    job_id: String(job.id),
    scorecard: `${scorecard.id}.v${scorecard.version}`,
    prompt: template.file,
    provider: provider.name,
    scored_at: new Date().toISOString(),
    review_status: "awaiting_review",
    loxo: candidate.loxo ?? null,
  };

  let lastError = "";
  for (let i = 1; i <= attempts; i++) {
    try {
      const { answer, model, usage } = await provider.complete({ system, user, schema });
      const check = validateAnswer(answer, scorecard);
      if (!check.ok) {
        lastError = `invalid answer: ${check.errors.join("; ")}`;
        continue;
      }
      return { ...base, status: "scored", model, usage: usage ?? null, ...finalize(answer, scorecard) };
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

// Scored candidates by average, highest first; errors at the end.
export function rankResults(results) {
  return [...results].sort((a, b) => {
    if (a.status !== b.status) return a.status === "scored" ? -1 : 1;
    return (b.average ?? -1) - (a.average ?? -1);
  });
}
