// End to end against a fake Loxo shaped like the firm's real account (test/support/real-shape-loxo.js):
// read, filter by name, build exactly what the AI would receive, score, rank, report, and
// prepare the Loxo write, checking privacy and safety at each step.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startRealShapeLoxo } from "./support/real-shape-loxo.js";
import { createLoxoClient } from "../src/loxo/client.js";
import { fetchJobForScoring, fetchJob, listJobCandidates, loadCandidates, workflowStageNames } from "../src/loxo/read.js";
import { loadScorecard, scorecardResolver } from "../src/scorecard.js";
import { loadTemplate } from "../src/prompt.js";
import { prepareRequest, scoreJob } from "../src/score.js";
import { createMockProvider } from "../src/providers/mock.js";
import { toHtml, toMarkdown } from "../src/report.js";
import { buildScorecardPayload, writeConfigFromEnv } from "../src/loxo/write.js";
import { buildReportModel, loadStages } from "../src/client-report/model.js";
import { narrativeRequest, applyNarrative } from "../src/client-report/narrative.js";
import { renderReport } from "../src/client-report/render.js";

let fake, client;
before(async () => {
  fake = await startRealShapeLoxo({ rateLimit: 0 });
  client = createLoxoClient({ domain: fake.url, slug: "demo", apiKey: "k", maxPerSecond: 0 });
});
after(() => fake.server.close());

const standard = loadScorecard("config/scorecards/standard-executive.v2.json");
const template = loadTemplate();

test("reads every page of jobs and the whole pipeline", async () => {
  assert.equal((await client.list("/jobs")).length, 250);
  assert.equal((await listJobCandidates(client, 900)).length, 9);
});

test("name list picks exactly the listed people and reports the ones not on the search", async () => {
  const { candidates, unmatched } = await fetchJobForScoring(client, 900, { names: ["Avery Quill", "blake norton", "Casey Moreau", "Dana Okafor", "Frankie Vale", "Nobody Here"] });
  assert.deepEqual(candidates.map((c) => c.name).sort(), ["Avery Quill, CPA", "Blake Norton", "Casey Moreau", "Dana Okafor", "Frankie Vale"]);
  assert.deepEqual(unmatched, ["Nobody Here"]);
});

test("profiles come through despite thin records: title, company, history, education, stage names", async () => {
  const { candidates } = await fetchJobForScoring(client, 900, { names: ["Avery Quill"] });
  const c = candidates[0];
  assert.equal(c.current_title, "VP Finance");
  assert.equal(c.current_company, "Sample Solutions Provider");
  assert.equal(c.work_history.length, 2);
  assert.equal(c.education[0].institution, "Sample State University");
  assert.equal(c.report.stage.name, "Submitted to Client");
  assert.ok(c.resume_text.includes("Owns accounting"));
});

test("what the AI receives: no names, pay, team scores, outreach pitch, salary range or graduation years", async () => {
  const { job, candidates } = await fetchJobForScoring(client, 900);
  const scorecard = scorecardResolver({ fallback: standard, dir: "/nonexistent" })(job.id, job);
  assert.equal(scorecard.source, "loxo");
  for (const c of candidates) {
    const { system, user } = prepareRequest({ candidate: c, job, scorecard, template });
    const all = system + user;
    for (const bad of [c.name, "225k", "25% bonus", "4.1/5", "165K", "200K", "160,000", "220,000", "2008", "Comp not the number"]) {
      assert.ok(!all.includes(bad), `"${bad}" reached the AI for ${c.name}`);
    }
  }
});

test("scoring: bare records skipped, ranking Yes first, pay only from Loxo fields, report clean", async () => {
  const { job, candidates } = await fetchJobForScoring(client, 900);
  const scorecard = scorecardResolver({ fallback: standard, dir: "/nonexistent" })(job.id, job);
  const results = await scoreJob({ candidates, job, scorecard, template, provider: createMockProvider() });
  const skipped = results.filter((r) => r.status === "skipped").map((r) => r.candidate_name);
  assert.deepEqual(skipped.sort(), ["Frankie Vale", "Gray Holloway"]);
  const scored = results.filter((r) => r.status === "scored");
  const firstNo = scored.findIndex((r) => r.recommendation === "no");
  if (firstNo >= 0) assert.ok(scored.slice(firstNo).every((r) => r.recommendation === "no"));
  assert.ok(results.every((r) => !r.pay?.base));
  const html = toHtml(results, { jobTitle: job.title, scorecard: `${scorecard.id}.v1`, provider: "openai (gpt-4.1)", when: "today" });
  assert.ok(!html.includes("gpt-4.1") && !html.includes("openai") && !html.includes("<th>Pay</th>"));
  assert.ok(html.includes("misses a must-have") && html.includes("Partial record"));
  assert.ok(!html.includes("225k") && !html.includes("165K"));
  assert.ok(!toMarkdown(results, { jobTitle: job.title, scorecard: "s", provider: "openai", when: "today" }).includes("openai"));
});

test("the Loxo write is prepared on the firm's template labels and stays blocked", async () => {
  const { job, candidates } = await fetchJobForScoring(client, 900, { names: ["Avery Quill"] });
  const scorecard = scorecardResolver({ fallback: standard, dir: "/nonexistent" })(job.id, job);
  const [r] = await scoreJob({ candidates, job, scorecard, template, provider: createMockProvider() });
  const payload = buildScorecardPayload(r, { ...writeConfigFromEnv({}), scorecardTypeId: "2", recommendationTypeIds: { yes: "3", no: "2" } });
  assert.deepEqual(payload.scorecard_attributes.map((a) => a.name), job.scorecard_template.criteria);
  assert.ok(!JSON.stringify(payload).includes("225k"));
  await assert.rejects(() => client.post("/scorecards", payload), /Write blocked/);
  assert.equal(fake.stats.writes, 0);
});

test("client report: their stages, top list from reads only, AI narrative without names", async () => {
  const job = await fetchJob(client, 900);
  const stageNames = await workflowStageNames(client);
  const { candidates } = await loadCandidates(client, await listJobCandidates(client, 900), { stageNames });
  const scorecard = scorecardResolver({ fallback: standard, dir: "/nonexistent" })(job.id, job);
  const results = await scoreJob({ candidates, job, scorecard, template, provider: createMockProvider() });
  const stages = loadStages();
  let model = buildReportModel({ job, candidates, results, stages, firm: "Sample Firm" });
  assert.deepEqual(model.funnel.map((f) => f.count), [9, 5, 4, 2, 1]);
  assert.ok(model.top.every((p) => p.first_read));
  const req = narrativeRequest(model);
  assert.ok(!req.user.includes("Avery Quill") && !req.user.includes("225k"));
  const { answer } = await createMockProvider().complete(req);
  model = applyNarrative(model, answer);
  const html = renderReport(model, stages);
  assert.ok(html.includes("Head of Finance (sample)") && html.includes("Draft"));
  assert.ok(!html.includes("C1 ") && !html.includes("165K"));
});

test("pacing stays under Loxo's rate limit, so nothing is refused", async () => {
  const limited = await startRealShapeLoxo({ rateLimit: 12 });
  try {
    const paced = createLoxoClient({ domain: limited.url, slug: "demo", apiKey: "k", maxPerSecond: 4 });
    const { candidates, failures } = await fetchJobForScoring(paced, 900, { names: ["Avery Quill"] });
    assert.equal(candidates.length, 1);
    assert.equal(failures.length, 0);
    assert.equal(limited.stats.limited, 0);
  } finally {
    limited.server.close();
  }
});
