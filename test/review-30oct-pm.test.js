// Review findings, 30 Oct 2026 (independent review before the email to the client):
// the write test could write to a live search; the daily cap lived in memory and did not count
// every AI call; "stop" only stopped writing, not the AI.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { createDailyCap, capProvider, DailyCapReached } from "../src/limits.js";

const day = () => Date.parse("2026-10-30T12:00:00Z");

test("the daily cap survives a restart (kept in a file)", () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "cap-")), "usage.json");
  const a = createDailyCap(200, day, file);
  a.use(150);
  const b = createDailyCap(200, day, file); // the server restarted
  assert.equal(b.remaining(), 50);
  const nextDay = createDailyCap(200, () => Date.parse("2026-10-31T01:00:00Z"), file);
  assert.equal(nextDay.remaining(), 200, "a new day starts from zero");
});

test("every AI call counts, retries and batches included, and none is made past the cap", async () => {
  const cap = createDailyCap(3, day);
  let calls = 0;
  const p = capProvider({ name: "x", async complete() { calls++; return { answer: {} }; }, batch: { async submit(items) { calls += items.length; return "b"; } } }, cap);
  await p.complete({});
  await p.batch.submit([1, 2]);
  assert.equal(cap.remaining(), 0);
  await assert.rejects(() => p.complete({}), DailyCapReached);
  await assert.rejects(() => p.batch.submit([1]), DailyCapReached);
  assert.equal(calls, 3, "nothing reached the AI after the cap");
});

test("the write test refuses a live search, whatever number is typed", async () => {
  const { startRealShapeLoxo } = await import("./support/real-shape-loxo.js");
  const fake = await startRealShapeLoxo({ rateLimit: 0, writable: true });
  try {
    const env = { ...process.env, LOXO_DOMAIN: fake.url, LOXO_AGENCY_SLUG: "demo", LOXO_API_KEY: "k", LOXO_SCORECARD_TYPE_ID: "2", LOXO_RECOMMENDATION_YES_ID: "3", LOXO_RECOMMENDATION_NO_ID: "2", SCORING_PROVIDER: "mock", CRITERIA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), "crit-")) };
    const run = (args) => new Promise((resolve) => {
      const c = spawn(process.execPath, ["scripts/loxo-write-check.js", ...args], { env });
      let out = "";
      c.stdout.on("data", (d) => (out += d));
      c.on("close", (code) => resolve({ code, out }));
    });
    const live = await run(["--loxo-job", "900", "--go"]);
    assert.equal(live.code, 1);
    assert.match(live.out, /Refused/);
    assert.equal(fake.stats.writes, 0, "nothing written to the live search");
    const ok = await run(["--loxo-job", "3011811", "--go"]);
    assert.match(ok.out, /WRITE TEST PASSED/);
  } finally {
    fake.server.close();
  }
});
