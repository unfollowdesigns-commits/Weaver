// Fixes after the first full-search run (30 Oct 2026, 180 read): too many "yes", he/she guessed,
// whole write-ups wiped for one pay sentence, an empty read scored, scorecard rules quoted back.
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadScorecard } from "../src/scorecard.js";
import { finalize, neutralPronouns, YES_MIN_AVERAGE } from "../src/validate.js";
import { resultFromAnswer, rankResults } from "../src/score.js";
import { loadTemplate } from "../src/prompt.js";
import { toHtml } from "../src/report.js";

const sc = loadScorecard("config/scorecards/jobs/job-3688816.v2.json");
const answer = (scores, extra = {}) => ({
  criteria: sc.criteria.map((c, i) => ({ id: c.id, score: scores[i] ?? null, evidence: scores[i] == null ? "No evidence in the record" : "Owned the close at Sample Co." })),
  recommendation: "yes", industry: "adjacent", strongest_signal: "Owned the close.", watch_item: "Location.",
  where_they_fit: ["Owned the close."], where_to_probe: ["Travel to Tampa."], assessment: "Worth a call. Main risk is location.", ...extra,
});
const base = { candidate_id: "1", scorecard: "s", provider: "p", scored_at: "2026-10-30T00:00:00Z" };

test("1. a yes stands only at the bar or above; under it the result is No, flagged, ranked above other Nos", () => {
  assert.equal(YES_MIN_AVERAGE, 3.5);
  const at = finalize(answer([4, 4, 3, 4, 3, 3, 4, 3, 3]), sc); // 3.44
  assert.equal(at.recommendation, "no");
  assert.ok(at.flags.some((f) => f.startsWith("below_bar:") && f.includes("3.5")));
  const above = finalize(answer([4, 4, 3, 4, 4, 3, 4, 3, 3]), sc); // 3.56
  assert.equal(above.recommendation, "yes");
  assert.ok(!above.flags.some((f) => f.startsWith("below_bar")));
  const thin = finalize(answer([4, 4, 4, 4, 4, 4, null, null, null]), sc);
  assert.equal(thin.recommendation, "no");
  assert.ok(thin.flags.some((f) => f.includes("3 criteria had no evidence")));
  const own = finalize(answer([4, 4, 3, 4, 3, 3, 4, 3, 3]), { ...sc, recommendation: { ...sc.recommendation, yes_min_average: 3.2 } });
  assert.equal(own.recommendation, "yes", "a scorecard can set its own bar");
  const ranked = rankResults([
    { status: "scored", candidate_id: "no-miss", recommendation: "no", ai_recommendation: "no", average: 3.9 },
    { status: "scored", candidate_id: "near", recommendation: "no", ai_recommendation: "yes", average: 3.4 },
    { status: "scored", candidate_id: "yes", recommendation: "yes", ai_recommendation: "yes", average: 3.6 },
  ]);
  assert.deepEqual(ranked.map((r) => r.candidate_id), ["yes", "near", "no-miss"]);
});

test("2. he/she never reaches the reader; the prompt asks for 'they'", () => {
  assert.equal(neutralPronouns("She lacks direct IT solutions experience."), "The candidate lacks direct IT solutions experience.");
  assert.equal(neutralPronouns("Ask about her travel and her willingness to relocate."), "Ask about the candidate's travel and the candidate's willingness to relocate.");
  assert.equal(neutralPronouns("Confirm with her if travel works; speak to her."), "Confirm with the candidate if travel works; speak to the candidate.");
  assert.equal(neutralPronouns("His CFO role; he led it himself."), "The candidate's CFO role; the candidate led it themselves.");
  assert.equal(neutralPronouns("Shelly Theme hesitated; the heart of the Hershey deal."), "Shelly Theme hesitated; the heart of the Hershey deal.");
  const r = finalize(answer([4, 4, 4, 4, 4, 4, 4, 4, 4], { assessment: "She is strong. Her main risk is location.", where_to_probe: ["Ask him about travel."] }), sc);
  assert.equal(r.assessment, "The candidate is strong. The candidate's main risk is location.");
  assert.deepEqual(r.where_to_probe, ["Ask the candidate about travel."]);
  assert.match(loadTemplate().text, /Never use he, she/);
});

test("3. the pay guard removes the pay sentence only, not the whole write-up", () => {
  const r = finalize(answer([4, 4, 4, 4, 4, 4, 4, 4, 4], {
    assessment: "Strong accounting leader at two SaaS firms. Current base is $250k, above the range. Main risk is Tampa travel.",
    watch_item: "Asking $220k base.",
  }), sc);
  assert.equal(r.assessment, "Strong accounting leader at two SaaS firms. Main risk is Tampa travel.");
  assert.equal(r.watch_item, "[removed: mentioned pay]");
  assert.ok(r.flags.some((f) => f.startsWith("pay_removed: 2")));
});

test("4. a read with no evidence on any criterion is not scored, ranked or written", () => {
  const r = resultFromAnswer({ base, answer: answer([]), model: "m", scorecard: sc });
  assert.equal(r.status, "skipped");
  assert.equal(r.reason, "no_evidence");
  const html = toHtml([r], { jobTitle: "Sample", when: "today" });
  assert.ok(html.includes("nothing in the record speaks to any criterion"));
});

test("5. the prompt forbids quoting the scorecard back and guessing", () => {
  const t = loadTemplate().text;
  assert.match(t, /never quote the scale or the scorecard's rules/);
  assert.match(t, /Do not write "likely"/);
  assert.match(t, /short list/);
});

test("the report explains the bar and the below-bar flag", () => {
  const r = { ...base, status: "scored", ...finalize(answer([4, 4, 3, 4, 3, 3, 4, 3, 3]), sc) };
  const html = toHtml([r], { jobTitle: "Sample", when: "today" });
  assert.ok(html.includes("an average under 3.5") && html.includes("Below bar") && html.includes("misses a must-have"));
});
