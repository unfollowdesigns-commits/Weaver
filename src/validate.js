import { INDUSTRY_VALUES } from "./schema.js";

const clean = (list) => list.map((t) => t.trim()).filter(Boolean).slice(0, 5);

// Checks a model answer against the scorecard. Never trusts the model's shape.
export function validateAnswer(answer, scorecard) {
  const errors = [];
  if (!answer || typeof answer !== "object" || Array.isArray(answer)) {
    return { ok: false, errors: ["answer is not a JSON object"] };
  }
  const ids = scorecard.criteria.map((c) => c.id);
  const { min, max } = scorecard.scale;

  if (!Array.isArray(answer.criteria)) {
    errors.push("criteria is missing");
  } else {
    if (answer.criteria.length !== ids.length) {
      errors.push(`expected ${ids.length} criteria, got ${answer.criteria.length}`);
    }
    const got = answer.criteria.map((c) => c?.id);
    for (const id of ids) if (!got.includes(id)) errors.push(`criterion "${id}" is missing`);
    for (const id of got) if (!ids.includes(id)) errors.push(`unknown criterion "${id}"`);
    if (new Set(got).size !== got.length) errors.push("a criterion appears more than once");
    for (const c of answer.criteria) {
      if (c?.score !== null && !(Number.isInteger(c?.score) && c.score >= min && c.score <= max)) {
        errors.push(`criterion "${c?.id}" has score ${JSON.stringify(c?.score)}, outside ${min} to ${max}`);
      }
      if (typeof c?.evidence !== "string" || !c.evidence.trim()) {
        errors.push(`criterion "${c?.id}" has no evidence`);
      }
    }
  }
  if (!scorecard.recommendation.values.includes(answer.recommendation)) {
    errors.push(`recommendation ${JSON.stringify(answer.recommendation)} is not one of ${scorecard.recommendation.values.join(", ")}`);
  }
  if (typeof answer.assessment !== "string" || !answer.assessment.trim()) {
    errors.push("assessment is empty");
  } else if (answer.assessment.length > 1500) {
    errors.push("assessment is too long");
  }
  if (!INDUSTRY_VALUES.includes(answer.industry)) errors.push(`industry ${JSON.stringify(answer.industry)} is not one of ${INDUSTRY_VALUES.join(", ")}`);
  for (const k of ["strongest_signal", "watch_item"]) {
    if (typeof answer[k] !== "string" || !answer[k].trim()) errors.push(`${k} is empty`);
    else if (answer[k].length > 300) errors.push(`${k} is too long`);
  }
  for (const k of ["where_they_fit", "where_to_probe"]) {
    if (!Array.isArray(answer[k]) || answer[k].some((q) => typeof q !== "string")) errors.push(`${k} must be a list of text`);
  }
  return { ok: errors.length === 0, errors };
}

// Adds what the code, not the model, is responsible for.
export function finalize(answer, scorecard) {
  const order = new Map(scorecard.criteria.map((c, i) => [c.id, i]));
  const criteria = [...answer.criteria]
    .sort((a, b) => order.get(a.id) - order.get(b.id))
    .map((c) => ({ ...c, label: scorecard.criteria[order.get(c.id)].label }));
  const scored = criteria.filter((c) => c.score !== null);
  const average = scored.length
    ? Math.round((scored.reduce((s, c) => s + c.score, 0) / scored.length) * 100) / 100
    : null;

  const flags = [];
  const missing = criteria.length - scored.length;
  if (missing >= 3) flags.push(`thin_record: ${missing} of ${criteria.length} criteria had no evidence`);
  else if (missing > 0) flags.push(`partial_record: ${missing} criteria had no evidence`);
  if (average !== null && answer.recommendation === "yes" && average < 3) flags.push("check: recommended yes with an average below 3");
  if (average !== null && answer.recommendation === "no" && average >= 4) flags.push("check: recommended no with an average of 4 or more");

  return {
    criteria,
    average,
    scored_count: scored.length,
    recommendation: answer.recommendation,
    assessment: answer.assessment.trim(),
    industry: answer.industry,
    strongest_signal: answer.strongest_signal.trim(),
    watch_item: answer.watch_item.trim(),
    where_they_fit: clean(answer.where_they_fit),
    where_to_probe: clean(answer.where_to_probe),
    flags,
  };
}
