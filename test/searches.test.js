// Which searches Weaver scores: every open search by default, nobody types numbers (30 Oct 2026).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createSearchList, parseSearchSetting, openSearchIds } from "../src/searches.js";
import { startRealShapeLoxo } from "./support/real-shape-loxo.js";
import { createLoxoClient } from "../src/loxo/client.js";

const fakeClient = (jobs) => ({ calls: 0, async list() { this.calls++; return jobs(); } });

test("empty or 'all' means every open search; a list limits it; a skip list always wins", () => {
  assert.equal(parseSearchSetting("").all, true);
  assert.equal(parseSearchSetting(undefined).all, true);
  assert.equal(parseSearchSetting("ALL").all, true);
  assert.deepEqual(parseSearchSetting("12, 34").ids, ["12", "34"]);
  assert.ok(parseSearchSetting("", "3011811").skip.has("3011811"));
});

test("only open searches are picked, from every page of the real account's job list", async () => {
  const fake = await startRealShapeLoxo({ rateLimit: 0 });
  try {
    const client = createLoxoClient({ domain: fake.url, slug: "demo", apiKey: "k", maxPerSecond: 0 });
    assert.deepEqual(await openSearchIds(client), ["900"], "249 closed or placed searches left out");
  } finally {
    fake.server.close();
  }
});

test("a search opened later is picked up without anyone changing a setting", async () => {
  let open = [{ id: 1, status: { name: "Active" } }, { id: 2, status: { name: "Opportunity Closed - Lost" } }];
  let t = 0;
  const client = fakeClient(() => open);
  const s = createSearchList({ client, setting: "", skip: "9", now: () => t });
  assert.deepEqual(await s.ids(), ["1"]);
  open = [...open, { id: 3, status: { name: "Active" } }, { id: 9, status: { name: "Active" } }];
  t = 2 * 60_000; // two minutes later Loxo has a new search; the webhook asks about it
  assert.equal(await s.has(3), true);
  assert.equal(await s.has(9), false, "skipped search never scored");
  assert.equal(await s.has(2), false, "closed search never scored");
  t = 20 * 60_000;
  assert.deepEqual(await s.ids(), ["1", "3"]);
});

test("a list of numbers still works for a limited start", async () => {
  const client = fakeClient(() => { throw new Error("should not read Loxo"); });
  const s = createSearchList({ client, setting: "5,6", skip: "6" });
  assert.deepEqual(await s.ids(), ["5"]);
  assert.equal(await s.has(5), true);
  assert.equal(await s.has(7), false);
});
