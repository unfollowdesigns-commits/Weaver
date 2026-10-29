import { INDUSTRY_VALUES } from "./schema.js";
import { isAboutPay } from "./candidate.js";

const clean = (list) => list.map((t) => t.trim()).filter(Boolean).slice(0, 5);

// The lowest average that can stand as "yes" when the scorecard sets no bar of its own
// (recommendation.yes_min_average). 30 Oct 2026, first full search: with no bar, 129 of 180
// came out "yes", down to averages of 3.0, which is a pass mark, not a short list.
export const YES_MIN_AVERAGE = 3.5;
const PAY_REMOVED = "[removed: mentioned pay]";

// Drops only the sentences about pay, so one bad sentence does not wipe a whole write-up.
// Returns null when nothing is left.
function withoutPay(text) {
  const parts = String(text ?? "").split(/(?<=[.!?;])\s+/);
  const kept = parts.filter((p) => !isAboutPay(p));
  if (kept.length === parts.length) return { text, dropped: false };
  return { text: kept.join(" ").trim() || null, dropped: true };
}

// The candidate's gender is unknown and must not be guessed. The prompt says "they"; this
// catches the slips. "she lacks" -> "the candidate lacks", "her role" -> "the candidate's role".
const OBJECT_AFTER_HER = /^(?:[.,;:!?)]|$|\s+(?:to|for|with|as|in|on|at|about|and|or|but|if|that|than|from|into|over|up|out|back|again)\b)/i;
export function neutralPronouns(text) {
  const out = String(text ?? "").replace(/\b(he|she|him|his|hers|himself|herself|her)\b/gi, (word, _w, offset, whole) => {
    const w = word.toLowerCase();
    let rep;
    if (w === "his" || w === "hers") rep = "the candidate's";
    else if (w === "himself" || w === "herself") rep = "themselves";
    else if (w === "her") rep = OBJECT_AFTER_HER.test(whole.slice(offset + word.length)) ? "the candidate" : "the candidate's";
    else rep = "the candidate";
    return word[0] === word[0].toUpperCase() ? rep[0].toUpperCase() + rep.slice(1) : rep;
  });
  return out;
}

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
  // Last guard: nothing the recruiter reads may talk about pay. Only the sentences about pay
  // go; a line that is all pay is dropped (lists) or replaced by a marker (single fields).
  let payDropped = 0;
  const strip = (t) => {
    const r = withoutPay(t);
    if (r.dropped) payDropped++;
    return r.text;
  };
  const noPay = (list) => list.map(strip).filter((t) => t);
  answer = { ...answer, where_they_fit: noPay(answer.where_they_fit), where_to_probe: noPay(answer.where_to_probe) };
  for (const k of ["strongest_signal", "watch_item", "assessment"]) answer[k] = strip(answer[k]) ?? PAY_REMOVED;
  for (let i = 0; i < criteria.length; i++) {
    const evidence = strip(criteria[i].evidence);
    if (evidence !== criteria[i].evidence) criteria[i] = { ...criteria[i], evidence: evidence ?? PAY_REMOVED };
  }
  const missing = criteria.length - scored.length;
  if (missing >= 3) flags.push(`thin_record: ${missing} of ${criteria.length} criteria had no evidence`);
  else if (missing > 0) flags.push(`partial_record: ${missing} criteria had no evidence`);

  // "yes" is the short list. The model's "yes" stands only above the bar and with evidence on
  // most criteria; below it the result is listed as "no", flagged, for the recruiter to judge.
  const bar = scorecard.recommendation?.yes_min_average ?? YES_MIN_AVERAGE;
  let recommendation = answer.recommendation;
  if (recommendation === "yes" && (average === null || average < bar || missing >= 3)) {
    recommendation = "no";
    flags.push(missing >= 3
      ? `below_bar: the AI said yes, but ${missing} criteria had no evidence; listed as No for the recruiter to judge`
      : `below_bar: the AI said yes, but the average is under ${bar}; listed as No for the recruiter to judge`);
  }
  if (average !== null && recommendation === "no" && average >= 4) flags.push("check: recommended no with an average of 4 or more");
  if (payDropped) flags.push(`pay_removed: ${payDropped} line(s) mentioned pay and were removed`);

  const words = (t) => neutralPronouns(String(t).trim());
  for (let i = 0; i < criteria.length; i++) criteria[i] = { ...criteria[i], evidence: words(criteria[i].evidence) };

  return {
    criteria,
    average,
    scored_count: scored.length,
    recommendation,
    ai_recommendation: answer.recommendation,
    yes_bar: bar,
    assessment: words(answer.assessment),
    industry: answer.industry,
    strongest_signal: words(answer.strongest_signal),
    watch_item: words(answer.watch_item),
    where_they_fit: clean(answer.where_they_fit).map(words),
    where_to_probe: clean(answer.where_to_probe).map(words),
    flags,
  };
}
