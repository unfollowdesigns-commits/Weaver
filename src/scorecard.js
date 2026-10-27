import fs from "node:fs";

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
}

export function scaleValues(sc) {
  const out = [];
  for (let v = sc.scale.min; v <= sc.scale.max; v++) out.push(v);
  return out;
}
