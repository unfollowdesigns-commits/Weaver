import { test } from "node:test";
import assert from "node:assert/strict";
import { createLoxoClient } from "../src/loxo/client.js";
import { loadScorecard } from "../src/scorecard.js";
import { loadTemplate } from "../src/prompt.js";
import { createMockProvider } from "../src/providers/mock.js";
import { runSweep, batchId, parseBatchId } from "../src/sweep.js";
import { AI_AUTHOR } from "../src/loxo/write.js";
import { createDailyCap, createDeduper } from "../src/limits.js";
import { mapCandidate, LIMITS } from "../src/loxo/map.js";
import { inputFlagCodes } from "../src/score.js";

const scorecard = loadScorecard("config/scorecards/example.v1.json");
const template = loadTemplate();
const cfg = { target: "scorecard", scorecardTypeId: "3", recommendationTypeIds: { yes: "11", no: "12" } };

// Fake Loxo with job 7: person 9 not yet assessed, person 10 already has an AI scorecard.
function fakeLoxo() {
  const posts = [];
  const cards = [{ id: 1, person_id: 10, job_id: 7, external_creator_name: AI_AUTHOR }];
  const fetchImpl = async (url, init) => {
    const u = new URL(url);
    const path = u.pathname.replace("/api/acme", "");
    const json = (x) => new Response(JSON.stringify(x), { status: 200 });
    if (init.method === "POST" && path === "/scorecards") {
      const body = JSON.parse(init.body);
      posts.push(body);
      cards.push({ id: cards.length + 1, person_id: body.person_id, job_id: body.job_id, external_creator_name: body.external_creator_name });
      return json({ id: cards.length });
    }
    if (path === "/scorecards") {
      const pid = u.searchParams.get("person_id");
      return json({ scorecards: cards.filter((c) => !pid || String(c.person_id) === pid) });
    }
    if (path === "/jobs/7") return json({ job: { id: 7, title: "VP Sales" } });
    if (path === "/jobs/7/candidates") return json({ candidates: [{ id: 55, person_id: 9 }, { id: 56, person_id: 10 }] });
    if (path === "/people/9") return json({ person: { id: 9, name: "Jane Roe" } });
    if (path === "/people/9/job_profiles") return json({ job_profiles: [] });
    if (path === "/people/9/resumes") return json({ resumes: [] });
    if (path === "/person_events") return json({ person_events: [] });
    return new Response("not found", { status: 404 });
  };
  const client = createLoxoClient({ slug: "acme", apiKey: "k", fetchImpl, writeEnabled: true, sleep: async () => {} });
  return { client, posts };
}

const sweep = (client, provider, extra = {}) =>
  runSweep({ client, provider, jobIds: ["7"], scorecard, template, cfg, writes: true, ...extra });

test("batch mode: first run submits only the unassessed candidate, next run writes it", async () => {
  const { client, posts } = fakeLoxo();
  const provider = createMockProvider();
  const s1 = await sweep(client, provider);
  assert.equal(s1.submitted, 1);
  assert.equal(posts.length, 0);
  const sent = [...provider.batches.values()][0].items[0];
  assert.equal(parseBatchId(sent.custom_id).personId, "9");

  const s2 = await sweep(client, provider);
  assert.equal(s2.written, 1);
  assert.equal(s2.submitted, 0);
  assert.equal(posts[0].person_id, 9);
  assert.ok(posts[0].summary.includes("no_resume_text"));

  const s3 = await sweep(client, provider);
  assert.equal(s3.written + s3.submitted, 0);
  assert.equal(posts.length, 1);
});

test("waits while a batch is still running instead of paying twice", async () => {
  const { client } = fakeLoxo();
  const provider = createMockProvider({ batchPending: true });
  await sweep(client, provider);
  const s2 = await sweep(client, provider);
  assert.equal(s2.waiting, true);
  assert.equal(provider.batches.size, 1);
});

test("a candidate whose answers keep failing is left for review after two tries", async () => {
  const { client, posts } = fakeLoxo();
  const provider = createMockProvider({ broken: true });
  await sweep(client, provider);
  await sweep(client, provider);
  const s3 = await sweep(client, provider);
  assert.deepEqual(s3.left_for_review, [{ job: "7", person: "9" }]);
  assert.equal(provider.batches.size, 2);
  assert.equal(posts.length, 0);
});

test("dry run writes nothing and does not resubmit the same candidate", async () => {
  const { client, posts } = fakeLoxo();
  const provider = createMockProvider();
  await sweep(client, provider, { writes: false });
  const s2 = await sweep(client, provider, { writes: false });
  assert.equal(s2.dry_run.length, 1);
  const s3 = await sweep(client, provider, { writes: false });
  assert.equal(s3.submitted, 0);
  assert.equal(posts.length, 0);
  assert.equal(provider.batches.size, 1);
});

test("without batches it scores and writes directly", async () => {
  const { client, posts } = fakeLoxo();
  const s = await sweep(client, createMockProvider(), { useBatch: false });
  assert.equal(s.scored_direct, 1);
  assert.equal(posts.length, 1);
});

test("respects the per-run cap", async () => {
  const { client } = fakeLoxo();
  const s = await sweep(client, createMockProvider(), { maxPerRun: 0 });
  assert.equal(s.submitted, 0);
});

test("batch ids carry job, person and input flags", () => {
  const id = batchId({ jobId: 7, personId: 9, flagCodes: ["no_resume", "notes_trimmed"] });
  assert.ok(id.length <= 64);
  assert.deepEqual(parseBatchId(id), { jobId: "7", personId: "9", flagCodes: ["no_resume", "notes_trimmed"] });
  assert.equal(parseBatchId("someone-else-123"), null);
});

test("daily cap and duplicate filter", () => {
  let t = Date.parse("2026-10-28T10:00:00Z");
  const cap = createDailyCap(2, () => t);
  assert.deepEqual([cap.take(), cap.take(), cap.take()], [true, true, false]);
  t += 24 * 3600_000;
  assert.equal(cap.take(), true);
  const d = createDeduper(1000, () => t);
  assert.equal(d.seenRecently("7:9"), false);
  assert.equal(d.seenRecently("7:9"), true);
  t += 2000;
  assert.equal(d.seenRecently("7:9"), false);
});

test("long inputs are trimmed and flagged, never silently cut", () => {
  const events = Array.from({ length: LIMITS.notes + 5 }, (_, i) => ({ notes: `Note ${i}` }));
  const c = mapCandidate({ entry: { person_id: 1 }, person: { id: 1 }, events, resumeText: "x".repeat(LIMITS.resumeChars + 10), resumeTruncated: true });
  assert.equal(c.notes.length, LIMITS.notes);
  assert.equal(c.resume_text.length, LIMITS.resumeChars);
  assert.deepEqual(inputFlagCodes(c), ["notes_trimmed", "resume_trimmed", "resume_truncated"]);
});
