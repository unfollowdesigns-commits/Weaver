import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadScorecard, scorecardResolver, liveScorecardResolver } from "../src/scorecard.js";
import { scorecardForSearch, jobSignature } from "../src/auto-criteria.js";
import { scorecardFromDraft } from "../src/draft.js";
import { createMockProvider } from "../src/providers/mock.js";
import { toHtml } from "../src/report.js";
import { runSweep } from "../src/sweep.js";
import { loadTemplate } from "../src/prompt.js";

const standard = loadScorecard("config/scorecards/standard-executive.v2.json");
const labels = ["Industry insight", "Accounting depth", "Relocation", "FP&A", "Scaling", "Cash", "Systems", "C-suite", "Face in market"];
const job = { id: "555", title: "Controller", description: "Controller for a Dallas IT services firm.", scorecard_template: { id: 9, name: "T", criteria: labels } };

test("a draft keeps the firm's own criteria names, in order, and refuses a different count", () => {
  const answer = { criteria: labels.map((l, i) => ({ label: `Reworded ${i}`, description: "3: meets. 5: exceptional." })), industry: { direct: "IT services", adjacent: "Software" } };
  const sc = scorecardFromDraft(answer, job, standard);
  assert.deepEqual(sc.criteria.map((c) => c.label), labels);
  assert.throws(() => scorecardFromDraft({ ...answer, criteria: answer.criteria.slice(0, 5) }, job, standard), /template on this search has 9/);
});

test("first score on a search without an approved scorecard drafts its criteria once and reuses them", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "auto-"));
  let calls = 0;
  const mock = createMockProvider();
  const provider = { ...mock, complete: async (x) => { calls++; return mock.complete(x); } };
  const resolver = scorecardResolver({ fallback: standard, dir: "/nonexistent" });
  const a = await scorecardForSearch({ job, resolver, standard, provider, approvedDir: "/nonexistent", autoDir: dir });
  const b = await scorecardForSearch({ job, resolver, standard, provider, approvedDir: "/nonexistent", autoDir: dir });
  assert.equal(calls, 1);
  assert.equal(a.auto, true);
  assert.equal(a.id, b.id);
  assert.deepEqual(a.criteria.map((c) => c.label), labels);
  assert.ok(a.industry.direct);
  // A changed job description gives a new draft (and a new id, so rescore picks it up).
  const c = await scorecardForSearch({ job: { ...job, description: "Changed." }, resolver, standard, provider, approvedDir: "/nonexistent", autoDir: dir });
  assert.notEqual(c.id, a.id);
  assert.notEqual(jobSignature(job), jobSignature({ ...job, description: "Changed." }));
  // The report says it is not approved.
  assert.ok(toHtml([], { jobTitle: "x", scorecard: a.id, provider: "p", when: "now", criteria_auto: true }).includes("not yet approved"));
});

test("an approved scorecard always wins and nothing is drafted", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "appr-"));
  fs.writeFileSync(path.join(dir, "job-555.v1.json"), JSON.stringify({ ...standard, id: "job-555", version: 1 }));
  let calls = 0;
  const provider = { ...createMockProvider(), complete: async () => { calls++; throw new Error("should not be called"); } };
  const sc = await scorecardForSearch({ job, resolver: scorecardResolver({ fallback: standard, dir }), standard, provider, approvedDir: dir, autoDir: dir });
  assert.equal(sc.id, "job-555");
  assert.equal(calls, 0);
});

test("live scoring waits for an approved scorecard", async () => {
  const live = liveScorecardResolver({ fallback: standard, dir: "/nonexistent" });
  assert.equal(live("555", job), null);
  assert.ok(liveScorecardResolver({ fallback: standard, dir: "/nonexistent", requireApproved: false })("555", job));
  // The sweep skips the search, reads nothing more and spends nothing.
  const fetchImpl = async (url) => {
    const p = new URL(url).pathname;
    if (p.endsWith("/jobs/555")) return new Response(JSON.stringify({ id: 555, title: "Controller" }), { status: 200 });
    if (p.endsWith("/jobs/555/candidates")) return new Response(JSON.stringify({ candidates: [{ id: 1, person: { id: 9, name: "A B" } }] }), { status: 200 });
    if (p.endsWith("/scorecards")) return new Response(JSON.stringify({ scorecards: [] }), { status: 200 });
    if (p.endsWith("/workflow_stages")) return new Response(JSON.stringify({ workflow_stages: [] }), { status: 200 });
    return new Response(JSON.stringify({}), { status: 200 });
  };
  const { createLoxoClient } = await import("../src/loxo/client.js");
  const client = createLoxoClient({ slug: "a", apiKey: "k", fetchImpl, sleep: async () => {}, maxPerSecond: 0 });
  let calls = 0;
  const provider = { ...createMockProvider(), complete: async () => { calls++; throw new Error("no"); }, batch: null };
  const out = await runSweep({ client, provider, jobIds: ["555"], scorecard: live, template: loadTemplate(), cfg: { target: "scorecard" }, writes: false, useBatch: false });
  assert.deepEqual(out.no_approved_scorecard, ["555"]);
  assert.equal(calls, 0);
});

test("live: drafted once even when the webhook and the sweep arrive together, then reused", async () => {
  const { liveCriteria } = await import("../src/auto-criteria.js");
  const store = fs.mkdtempSync(path.join(os.tmpdir(), "live-"));
  let calls = 0;
  const mock = createMockProvider();
  const provider = { ...mock, complete: async (x) => { calls++; await new Promise((r) => setTimeout(r, 20)); return mock.complete(x); } };
  const forJob = liveCriteria({ standard, provider, approvedDir: "/nonexistent", store, resolver: scorecardResolver({ fallback: standard, dir: "/nonexistent" }) });
  const [a, b] = await Promise.all([forJob("555", job), forJob("555", job)]);
  const c = await forJob("555", job);
  assert.equal(calls, 1);
  assert.equal(a.id, b.id);
  assert.equal(a.id, c.id);
  assert.deepEqual(a.criteria.map((x) => x.label), labels);
  // A fresh process (restart) finds the stored criteria and does not draft again.
  const again = liveCriteria({ standard, provider, approvedDir: "/nonexistent", store, resolver: scorecardResolver({ fallback: standard, dir: "/nonexistent" }) });
  assert.equal((await again("555", job)).id, a.id);
  assert.equal(calls, 1);
  // Automatic drafting off: approved scorecards only.
  const off = liveCriteria({ standard, provider, approvedDir: "/nonexistent", store, auto: false });
  assert.equal(await off("555", job), null);
});
