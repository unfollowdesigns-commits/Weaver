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
  industry: "direct",
  strongest_signal: "Ten years in the sector.",
  watch_item: "Based outside the region.",
  where_they_fit: ["Ran a comparable team."],
  where_to_probe: [],
  assessment: "Strong fit.",
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

test("pay never reaches the model: sentences about pay are removed, achievements stay", async () => {
  const { scrubPay, isAboutPay } = await import("../src/candidate.js");
  const t = scrubPay("Led $800M in partner funding. Currently at $225k base with a 25% bonus. Wants 220k plus 20%. Grew a private equity backed firm to $28M.");
  assert.ok(t.includes("$800M in partner funding") && t.includes("private equity backed firm to $28M"));
  assert.ok(!/225|bonus|220k/.test(t));
  assert.ok(t.includes("[pay detail removed]"));
  assert.equal(isAboutPay("Owns the monthly close and GAAP reporting."), false);
  assert.equal(isAboutPay("Salary range is $180,000 to $200,000."), true);
  const rec = toPromptRecord({ ...candidates[0], notes: [{ text: "Great call. Current comp is 250k all in." }] });
  assert.ok(!JSON.stringify(rec).includes("250k"));
  const { system, user } = buildPrompt({ template, scorecard, job: { ...job, description: "Lead finance. Salary: $180k to $200k plus bonus." }, candidate: candidates[0] });
  assert.ok(!user.includes("180k") && system.includes("never mention pay"));
});

test("anything the model writes about pay is removed and flagged", () => {
  const a = goodAnswer();
  a.where_to_probe = ["Relocation to Tampa.", "Willingness to accept the salary range given current comp."];
  a.watch_item = "Asking $220k base.";
  const out = finalize(a, scorecard);
  assert.deepEqual(out.where_to_probe, ["Relocation to Tampa."]);
  assert.equal(out.watch_item, "[removed: mentioned pay]");
  assert.ok(out.flags.some((f) => f.startsWith("pay_removed: 2")));
});

test("ranking puts recommended candidates first, then by average", async () => {
  const { rankResults } = await import("../src/score.js");
  const r = rankResults([
    { status: "scored", candidate_id: "no-high", average: 3.9, recommendation: "no" },
    { status: "error", candidate_id: "err" },
    { status: "scored", candidate_id: "yes-low", average: 3.1, recommendation: "yes" },
    { status: "scored", candidate_id: "yes-high", average: 3.9, recommendation: "yes" },
  ]);
  assert.deepEqual(r.map((x) => x.candidate_id), ["yes-high", "yes-low", "no-high", "err"]);
});
