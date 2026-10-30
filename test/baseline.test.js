import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createLoxoClient } from "../src/loxo/client.js";
import { loadScorecard } from "../src/scorecard.js";
import { loadTemplate } from "../src/prompt.js";
import { createMockProvider } from "../src/providers/mock.js";
import { runSweep } from "../src/sweep.js";
import { createBaseline, parseBacklogSetting } from "../src/baseline.js";

// 30 Oct 2026: new candidates on every search; the people already on a search only where
// LOXO_BACKLOG_JOB_IDS lists it.
const scorecard = loadScorecard("config/scorecards/example.v1.json");
const template = loadTemplate();
const cfg = { target: "scorecard", scorecardTypeId: "3", recommendationTypeIds: { yes: "11", no: "12" } };
const NOTES = "Intro call. VP Sales at Acme for four years, grew the team from 9 to 31 and revenue from $14M to $41M. Sells to finance leaders. Open to a move this year, based in Arlington. Strong on forecasting and hiring; built the account management team from scratch.";

function fakeLoxo(pipelines) {
  const fetchImpl = async (url) => {
    const u = new URL(url);
    const p = u.pathname.replace("/api/acme", "");
    const json = (x) => new Response(JSON.stringify(x), { status: 200 });
    if (p === "/scorecards") return json({ scorecards: [] });
    let m = /^\/jobs\/(\d+)$/.exec(p);
    if (m) return json({ job: { id: Number(m[1]), title: "VP Sales" } });
    m = /^\/jobs\/(\d+)\/candidates$/.exec(p);
    if (m) return json({ candidates: (pipelines[m[1]] ?? []).map((pid) => ({ id: pid * 10, person_id: pid })) });
    m = /^\/people\/(\d+)$/.exec(p);
    if (m) return json({ person: { id: Number(m[1]), name: "Pat Doe" } });
    if (/^\/people\/\d+\/(job_profiles|resumes)$/.test(p)) return json([]);
    if (p === "/person_events") return json({ person_events: [{ notes: NOTES }] });
    if (p === "/workflow_stages") return json([]);
    return new Response("not found", { status: 404 });
  };
  return createLoxoClient({ slug: "acme", apiKey: "k", fetchImpl, sleep: async () => {} });
}

const run = (client, jobIds, baseline) =>
  runSweep({ client, provider: createMockProvider(), jobIds, scorecard, template, cfg, writes: false, useBatch: false, baseline, handled: new Set() });

test("people already on a search are not scored; people added later are", async () => {
  const pipelines = { 7: [1, 2, 3] };
  const client = fakeLoxo(pipelines);
  const baseline = createBaseline();
  const s1 = await run(client, ["7"], baseline);
  assert.equal(s1.scored_direct, 0);
  pipelines[7].push(4);
  const s2 = await run(client, ["7"], baseline);
  assert.equal(s2.scored_direct, 1);
  assert.equal(String(s2.dry_run[0].candidate), "4");
});

test("a search listed in LOXO_BACKLOG_JOB_IDS gets its existing people scored; others do not", async () => {
  const client = fakeLoxo({ 7: [1, 2], 8: [5, 6, 7] });
  const s = await run(client, ["7", "8"], createBaseline({ backlog: "8" }));
  assert.equal(s.scored_direct, 3);
  assert.deepEqual(s.dry_run.map((r) => String(r.job)), ["8", "8", "8"]);
});

test("adding a search to the list later scores the people already on it", async () => {
  const client = fakeLoxo({ 7: [1, 2] });
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "bl-")), "baseline.json");
  assert.equal((await run(client, ["7"], createBaseline({ file }))).scored_direct, 0);
  assert.equal((await run(client, ["7"], createBaseline({ file, backlog: "7" }))).scored_direct, 2);
});

test("the record survives a restart, so existing people never turn into new ones", async () => {
  const pipelines = { 7: [1, 2] };
  const client = fakeLoxo(pipelines);
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "bl-")), "baseline.json");
  await run(client, ["7"], createBaseline({ file }));
  pipelines[7].push(3);
  const s = await run(client, ["7"], createBaseline({ file }));
  assert.equal(s.scored_direct, 1);
  assert.equal(String(s.dry_run[0].candidate), "3");
});

test("backlog setting: empty is none, a list, or all", () => {
  assert.equal(parseBacklogSetting("").all, false);
  assert.equal(parseBacklogSetting("").ids.size, 0);
  assert.deepEqual([...parseBacklogSetting(" 1, 2 ").ids], ["1", "2"]);
  assert.equal(parseBacklogSetting("all").all, true);
  assert.equal(createBaseline({ backlog: "all" }).isExisting("7", "1"), false);
});
