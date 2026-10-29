import { test } from "node:test";
import assert from "node:assert/strict";
import { createLoxoClient } from "../src/loxo/client.js";
import { AI_AUTHOR, scorecardUsed, outdatedAiScorecards, updateScorecard, summaryText } from "../src/loxo/write.js";

const result = { status: "scored", job_id: "7", loxo: { person_id: 9 }, scorecard: "job-7.v2", provider: "p", model: "m", scored_at: "2026-10-30T00:00:00Z",
  criteria: [{ id: "a", label: "A", score: 4, evidence: "E." }], average: 4, scored_count: 1, recommendation: "yes", assessment: "A.", industry: "direct",
  strongest_signal: "S.", watch_item: "W.", where_they_fit: [], where_to_probe: [], flags: [] };

function fake() {
  const calls = [];
  const cards = [
    { id: 1, person_id: 9, job_id: 7, external_creator_name: AI_AUTHOR, summary: summaryText({ ...result, scorecard: "job-7.v1" }) },
    { id: 2, person_id: 10, job_id: 7, external_creator_name: AI_AUTHOR, summary: summaryText(result) },
    { id: 3, person_id: 11, job_id: 7, external_creator_name: "A recruiter", summary: "Team scorecard" },
    { id: 4, person_id: 12, job_id: 8, external_creator_name: AI_AUTHOR, summary: "Scorecard job-8.v1, 2026-10-29." },
  ];
  const fetchImpl = async (url, init) => {
    calls.push({ method: init.method, path: new URL(url).pathname, body: init.body ? JSON.parse(init.body) : null });
    if (init.method === "PUT") return new Response('{"id":1}', { status: 200 });
    return new Response(JSON.stringify({ scorecards: cards }), { status: 200 });
  };
  return { fetchImpl, calls };
}

test("the scorecard version used is read back from the summary", () => {
  assert.equal(scorecardUsed({ summary: summaryText(result) }), "job-7.v2");
  assert.equal(scorecardUsed({ summary: "no version here" }), null);
});

test("only AI scorecards of this search made with another version are re-scored", async () => {
  const f = fake();
  const c = createLoxoClient({ slug: "a", apiKey: "k", fetchImpl: f.fetchImpl, sleep: async () => {}, maxPerSecond: 0 });
  const out = await outdatedAiScorecards(c, "7", "job-7.v2");
  assert.deepEqual(out, [{ scorecard_id: 1, person_id: "9", used: "job-7.v1" }]);
});

test("the update goes to the existing scorecard and stays blocked without the switches", async () => {
  const f = fake();
  const ro = createLoxoClient({ slug: "a", apiKey: "k", fetchImpl: f.fetchImpl, sleep: async () => {}, maxPerSecond: 0 });
  await assert.rejects(() => updateScorecard(ro, 1, result, { scorecardTypeId: "2", recommendationTypeIds: { yes: "3" } }), /Write blocked/);
  const rw = createLoxoClient({ slug: "a", apiKey: "k", fetchImpl: f.fetchImpl, sleep: async () => {}, maxPerSecond: 0, writeEnabled: true });
  const out = await updateScorecard(rw, 1, result, { scorecardTypeId: "2", recommendationTypeIds: { yes: "3" } });
  assert.deepEqual(out, { status: "updated", id: 1 });
  const put = f.calls.find((x) => x.method === "PUT");
  assert.equal(put.path, "/api/a/scorecards/1");
  assert.ok(put.body.summary.includes("Scorecard job-7.v2"));
  assert.equal(f.calls.filter((x) => x.method === "POST").length, 0);
});
