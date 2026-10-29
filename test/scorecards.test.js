import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadScorecard, scorecardResolver, jobScorecardFile } from "../src/scorecard.js";
import { validateAnswer, finalize } from "../src/validate.js";
import { scorecardFromDraft, draftSchema, draftRequest, nextVersion } from "../src/draft.js";
import { createMockProvider } from "../src/providers/mock.js";
import { summaryText } from "../src/loxo/write.js";
import { toHtml } from "../src/report.js";

const standard = loadScorecard("config/scorecards/standard-executive.v2.json");
const answer = () => ({
  criteria: standard.criteria.map((c) => ({ id: c.id, score: 4, evidence: "Evidence." })),
  recommendation: "yes", industry: "direct", strongest_signal: "Signal.", watch_item: "Watch.",
  where_they_fit: ["Fit."], where_to_probe: ["Probe."], assessment: "Strong.",
});

test("standard scorecard v2 uses the firm's scale", () => {
  assert.deepEqual(Object.values(standard.scale.labels), ["Does not meet", "Weak", "Meets", "Strong", "Exceptional"]);
  assert.ok(!JSON.stringify(standard).match(/judgement|recognised/));
});

test("validation checks the report fields", () => {
  const a = answer();
  a.industry = "maybe";
  a.strongest_signal = " ";
  a.where_to_probe = "not a list";
  const { ok, errors } = validateAnswer(a, standard);
  assert.equal(ok, false);
  assert.ok(errors.some((e) => e.startsWith("industry")));
  assert.ok(errors.some((e) => e.startsWith("strongest_signal")));
  assert.ok(errors.some((e) => e.startsWith("where_to_probe")));
});

test("a search's approved scorecard wins; drafts are never used", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sc-"));
  const sc = (v) => JSON.stringify({ ...standard, id: "job-7", version: v });
  fs.writeFileSync(path.join(dir, "job-7.v1.json"), sc(1));
  fs.writeFileSync(path.join(dir, "job-7.v2.json"), sc(2));
  fs.writeFileSync(path.join(dir, "job-8.draft.json"), sc(1));
  const forJob = scorecardResolver({ fallback: standard, dir });
  assert.equal(forJob(7).version, 2);
  assert.equal(forJob("8"), standard);
  assert.equal(forJob(9), standard);
  assert.equal(jobScorecardFile("7/../x", dir), null);
  assert.equal(nextVersion(dir, "7"), 3);
});

test("a draft becomes a valid scorecard with the firm's scale and unique ids", async () => {
  const job = { id: 42, title: "Head of Finance", description: "Lead finance." };
  const req = draftRequest(job);
  assert.ok(req.user.includes("<job>") && req.user.includes("Head of Finance"));
  const { answer: draft } = await createMockProvider().complete(req);
  const sc = scorecardFromDraft(draft, job, standard);
  assert.equal(sc.criteria.length, 9);
  assert.equal(new Set(sc.criteria.map((c) => c.id)).size, 9);
  assert.equal(sc.status, "draft");
  assert.deepEqual(sc.scale, standard.scale);
  assert.ok(sc.industry.direct && sc.industry.adjacent);
  assert.throws(() => scorecardFromDraft({ criteria: draft.criteria.slice(0, 3), industry: draft.industry }, job, standard), /expected about nine/);
});

test("draft schema is strict everywhere", () => {
  const walk = (s) => {
    if (s.type === "object") {
      assert.equal(s.additionalProperties, false);
      assert.deepEqual([...s.required].sort(), Object.keys(s.properties).sort());
      Object.values(s.properties).forEach(walk);
    }
    if (s.type === "array") walk(s.items);
  };
  walk(draftSchema());
});

test("Loxo summary and report read like the firm's reports", () => {
  const result = {
    status: "scored", candidate_id: "1", candidate_name: "Sample <A>", job_id: "7", scorecard: "standard-executive.v2", provider: "mock", model: "m",
    scored_at: "2026-10-29T00:00:00Z", loxo: { person_id: 1 }, flags: [], ...finalize(answer(), standard),
  };
  const text = summaryText(result);
  assert.match(text, /^AI first read, awaiting recruiter review/);
  assert.match(text, /4\.0 \/ 5 · Yes/);
  assert.match(text, /Direct industry experience/);
  assert.match(text, /Where to probe:\n- Probe\./);
  const html = toHtml([result], { jobTitle: "VP <Sales>", scorecard: "s", provider: "mock", when: "now" });
  assert.ok(html.includes("VP &lt;Sales&gt;") && html.includes("Sample &lt;A&gt;"));
  assert.ok(html.includes("★") && html.includes("Where they fit"));
});
