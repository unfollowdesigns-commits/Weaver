import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { loadScorecard, checkScorecard } from "../src/scorecard.js";
import { toPromptRecord, scrubText } from "../src/candidate.js";
import { buildPrompt, loadTemplate } from "../src/prompt.js";
import { outputSchema } from "../src/schema.js";
import { validateAnswer, finalize } from "../src/validate.js";
import { createMockProvider } from "../src/providers/mock.js";
import { scoreCandidate, scoreJob } from "../src/score.js";

const scorecard = loadScorecard("config/scorecards/example.v1.json");
const job = JSON.parse(fs.readFileSync("samples/job.sample.json", "utf8"));
const candidates = JSON.parse(fs.readFileSync("samples/candidates.sample.json", "utf8"));
const template = loadTemplate();

const goodAnswer = () => ({
  criteria: scorecard.criteria.map((c) => ({ id: c.id, score: 4, evidence: "Evidence." })),
  recommendation: "yes",
  assessment: "Strong fit.",
  open_questions: [],
});

test("scorecard checks catch broken scorecards", () => {
  const dup = structuredClone(scorecard);
  dup.criteria.push({ ...dup.criteria[0] });
  assert.throws(() => checkScorecard(dup), /used twice/);
  const noLabel = structuredClone(scorecard);
  delete noLabel.scale.labels["3"];
  assert.throws(() => checkScorecard(noLabel), /no label for 3/);
});

test("prompt record leaves out name, contact details, pay and graduation years", () => {
  const rec = toPromptRecord(candidates[0]);
  const text = JSON.stringify(rec);
  assert.ok(!text.includes("Candidate A"));
  assert.ok(!text.includes("candidate.a@example.com"));
  assert.ok(!text.includes("555"));
  assert.ok(!text.includes("250000"));
  assert.ok(!text.includes("2008"));
  assert.equal(rec.candidate_ref, "sample-a");
});

test("scrubbing keeps date ranges and figures", () => {
  assert.equal(scrubText("2019 - 2023, $14M to $41M"), "2019 - 2023, $14M to $41M");
  assert.equal(scrubText("call 202-555-0101"), "call [phone removed]");
});

test("prompt fills the template and fences the candidate record", () => {
  const { system, user } = buildPrompt({ template, scorecard, job, candidate: candidates[6] });
  assert.ok(!system.includes("{{"));
  assert.ok(system.includes("sector, stage, scope"));
  assert.ok(user.includes("<candidate_record>") && user.includes("</candidate_record>"));
  assert.ok(user.indexOf("ignore your instructions") > user.indexOf("<candidate_record>"));
});

test("schema lists every criterion and the scale", () => {
  const s = outputSchema(scorecard);
  assert.deepEqual(s.properties.criteria.items.properties.id.enum, scorecard.criteria.map((c) => c.id));
  assert.deepEqual(s.properties.criteria.items.properties.score.anyOf[0].enum, [1, 2, 3, 4, 5]);
});

test("validation accepts a complete answer", () => {
  assert.deepEqual(validateAnswer(goodAnswer(), scorecard), { ok: true, errors: [] });
});

test("validation rejects missing, unknown and out-of-range criteria", () => {
  const a = goodAnswer();
  a.criteria.pop();
  a.criteria.push({ id: "made_up", score: 9, evidence: "x" });
  a.recommendation = "maybe";
  const { ok, errors } = validateAnswer(a, scorecard);
  assert.equal(ok, false);
  assert.ok(errors.some((e) => e.includes('"logistics" is missing')));
  assert.ok(errors.some((e) => e.includes('unknown criterion "made_up"')));
  assert.ok(errors.some((e) => e.includes("outside 1 to 5")));
  assert.ok(errors.some((e) => e.includes("recommendation")));
});

test("average is computed by the code and skips criteria with no evidence", () => {
  const a = goodAnswer();
  a.criteria[0].score = null;
  a.criteria[1].score = 2;
  const r = finalize(a, scorecard);
  assert.equal(r.scored_count, 8);
  assert.equal(r.average, (2 + 4 * 7) / 8);
  assert.ok(r.flags.some((f) => f.startsWith("partial_record")));
});

test("flags a recommendation that disagrees with the scores", () => {
  const a = goodAnswer();
  a.criteria.forEach((c) => (c.score = 2));
  assert.ok(finalize(a, scorecard).flags.some((f) => f.includes("below 3")));
});

test("a broken model answer becomes an error result, not a crash", async () => {
  const r = await scoreCandidate({ candidate: candidates[0], job, scorecard, template, provider: createMockProvider({ broken: true }) });
  assert.equal(r.status, "error");
  assert.match(r.error, /invalid answer/);
});

test("a whole job scores end to end, ranked, all awaiting review", async () => {
  const results = await scoreJob({ candidates, job, scorecard, template, provider: createMockProvider() });
  assert.equal(results.length, candidates.length);
  assert.ok(results.every((r) => r.status === "scored" && r.review_status === "awaiting_review"));
  for (let i = 1; i < results.length; i++) assert.ok(results[i - 1].average >= results[i].average);
});

test("flags a candidate whose resume could not be read", async () => {
  const noResume = candidates.find((c) => !c.resume_text);
  const r = await scoreCandidate({ candidate: noResume, job, scorecard, template, provider: createMockProvider() });
  assert.ok(r.flags.some((f) => f.startsWith("no_resume_text")));
  const withResume = await scoreCandidate({ candidate: candidates[0], job, scorecard, template, provider: createMockProvider() });
  assert.ok(!withResume.flags.some((f) => f.startsWith("no_resume_text")));
});
