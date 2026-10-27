import { test } from "node:test";
import assert from "node:assert/strict";
import { createLoxoClient, firstArray } from "../src/loxo/client.js";
import { mapCandidate, mapJob, stripHtml, resumeTextOf } from "../src/loxo/map.js";
import { fetchJobForScoring } from "../src/loxo/read.js";
import { buildScorecardPayload, buildNotePayload, writeResult, AI_AUTHOR, writesAllowed } from "../src/loxo/write.js";

// Fake Loxo: routes by path, records every call.
function fakeLoxo(routes) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const u = new URL(url);
    calls.push({ method: init.method, path: u.pathname, query: Object.fromEntries(u.searchParams), headers: init.headers, body: init.body ? JSON.parse(init.body) : null });
    const key = `${init.method} ${u.pathname.replace("/api/acme", "")}`;
    const handler = routes[key];
    if (!handler) return new Response("not found", { status: 404 });
    const out = typeof handler === "function" ? handler(u, calls.length) : handler;
    if (out instanceof Response) return out;
    return new Response(JSON.stringify(out), { status: 200, headers: { "content-type": "application/json" } });
  };
  return { fetchImpl, calls };
}
const client = (routes, opts = {}) => {
  const f = fakeLoxo(routes);
  return { c: createLoxoClient({ slug: "acme", apiKey: "k", fetchImpl: f.fetchImpl, sleep: async () => {}, ...opts }), calls: f.calls };
};

test("builds the documented URL and sends the bearer token", async () => {
  const { c, calls } = client({ "GET /jobs/7": { id: 7, title: "VP Sales" } });
  await c.get("/jobs/7");
  assert.equal(calls[0].path, "/api/acme/jobs/7");
  assert.equal(calls[0].headers.authorization, "Bearer k");
});

test("writes are blocked unless enabled", async () => {
  const { c, calls } = client({ "POST /scorecards": { id: 1 } });
  await assert.rejects(() => c.post("/scorecards", {}), /Write blocked/);
  assert.equal(calls.length, 0);
});

test("writes need both switches in .env", () => {
  assert.equal(writesAllowed({ LOXO_WRITE_ENABLED: "true", DRY_RUN: "true" }), false);
  assert.equal(writesAllowed({ LOXO_WRITE_ENABLED: "false", DRY_RUN: "false" }), false);
  assert.equal(writesAllowed({ LOXO_WRITE_ENABLED: "true", DRY_RUN: "false" }), true);
});

test("follows scroll_id until the list ends", async () => {
  const pages = { undefined: { candidates: [{ id: 1 }, { id: 2 }], scroll_id: "a" }, a: { candidates: [{ id: 3 }], scroll_id: "b" }, b: { candidates: [], scroll_id: "c" } };
  const { c } = client({ "GET /jobs/7/candidates": (u) => pages[u.searchParams.get("scroll_id") ?? "undefined"] });
  const all = await c.list("/jobs/7/candidates");
  assert.deepEqual(all.map((x) => x.id), [1, 2, 3]);
});

test("retries when Loxo rate-limits, then explains a 403 without leaking the key", async () => {
  let n = 0;
  const { c } = client({ "GET /jobs/1": () => (++n === 1 ? new Response("", { status: 429 }) : { id: 1 }) });
  assert.deepEqual(await c.get("/jobs/1"), { id: 1 });
  const { c: c2 } = client({ "GET /jobs/2": new Response("nope", { status: 403 }) });
  await assert.rejects(() => c2.get("/jobs/2"), (e) => e.status === 403 && /AGENCY_SLUG/.test(e.message) && !e.message.includes("Bearer"));
});

test("maps a Loxo person into the scorer's shape, with notes and resume text", () => {
  const c = mapCandidate({
    entry: { id: 55, person_id: 9 },
    person: { person: { id: 9, name: "Jane Roe", current_title: "VP Sales", current_company: "Acme", city: "Arlington", state: "VA", description: "<p>Open to move.</p>" } },
    jobProfiles: [{ title: "VP Sales", company_name: "Acme", start_year: 2021, start_month: 3, description: "<b>Grew</b> team" }],
    resumeText: "Resume text",
    events: [{ created_at: "2026-10-01", notes: "Call went well" }, { notes: "" }],
  });
  assert.equal(c.id, "9");
  assert.equal(c.location, "Arlington, VA");
  assert.equal(c.work_history[0].start, "2021-03");
  assert.equal(c.work_history[0].summary, "Grew team");
  assert.deepEqual(c.notes.map((n) => n.text), ["Intake notes: Open to move.", "Call went well"]);
  assert.deepEqual(c.loxo, { person_id: 9, job_candidate_id: 55 });
});

test("job mapping, html stripping and resume text fallback", () => {
  assert.equal(mapJob({ job: { id: 7, title: "VP Sales", description: "<p>Lead</p><p>Grow</p>" } }).description, "Lead\nGrow");
  assert.equal(stripHtml("A &amp; B<br>C"), "A & B\nC");
  assert.equal(resumeTextOf({ resume: { id: 1, name: "cv.pdf", whatever: "a much longer extracted resume body" } }), "a much longer extracted resume body");
});

test("reads a whole job: pipeline, person, work history, latest resume, notes", async () => {
  const { c, calls } = client({
    "GET /jobs/7": { job: { id: 7, title: "VP Sales" } },
    "GET /jobs/7/candidates": { candidates: [{ id: 55, person_id: 9 }] },
    "GET /people/9": { person: { id: 9, name: "Jane Roe" } },
    "GET /people/9/job_profiles": { job_profiles: [{ title: "VP", company_name: "Acme" }] },
    "GET /people/9/resumes": { resumes: [{ id: 2 }, { id: 1 }] },
    "GET /people/9/resumes/2": { resume: { text: "latest resume" } },
    "GET /person_events": { person_events: [{ notes: "Note" }] },
  });
  const { job, candidates, failures } = await fetchJobForScoring(c, 7);
  assert.equal(job.title, "VP Sales");
  assert.equal(failures.length, 0);
  assert.equal(candidates[0].resume_text, "latest resume");
  assert.ok(calls.every((x) => x.method === "GET"));
  assert.equal(calls.find((x) => x.path.endsWith("/person_events")).query.person_id, "9");
});

const result = {
  status: "scored", job_id: "7", loxo: { person_id: 9 }, scorecard: "example.v1", provider: "claude", model: "m", scored_at: "2026-10-27T00:00:00Z",
  criteria: [{ id: "a", label: "Sector", score: 4, evidence: "Ten years in sector." }, { id: "b", label: "Stage", score: null, evidence: "No evidence in the record" }],
  average: 4, scored_count: 1, recommendation: "yes", assessment: "Strong.", open_questions: ["Relocation?"], flags: ["partial_record: 1 criteria had no evidence"],
};
const cfg = { target: "scorecard", scorecardTypeId: "3", recommendationTypeIds: { yes: "11", no: "12" }, noteActivityTypeId: "20" };

test("scorecard payload matches Loxo's documented fields and marks it as AI", () => {
  const p = buildScorecardPayload(result, cfg);
  assert.equal(p.person_id, 9);
  assert.equal(p.job_id, 7);
  assert.equal(p.scorecard_type_id, 3);
  assert.equal(p.scorecard_recommendation_type_id, 11);
  assert.equal(p.external_creator_name, AI_AUTHOR);
  assert.match(p.summary, /awaiting recruiter review/);
  assert.deepEqual(p.scorecard_attributes[0], { name: "Sector", position: 1, score: 4, notes: "Ten years in sector." });
  assert.ok(!("score" in p.scorecard_attributes[1]));
});

test("note payload escapes text", () => {
  const p = buildNotePayload({ ...result, assessment: "<script>x</script>" }, cfg);
  assert.equal(p.person_event.activity_type_id, 20);
  assert.ok(!p.person_event.notes.includes("<script>"));
});

test("does not write a second AI scorecard for the same person and job", async () => {
  const { c, calls } = client({ "GET /scorecards": { scorecards: [{ id: 1, external_creator_name: AI_AUTHOR }] }, "POST /scorecards": { id: 2 } }, { writeEnabled: true });
  const out = await writeResult(c, result, cfg);
  assert.equal(out.status, "skipped");
  assert.ok(!calls.some((x) => x.method === "POST"));
});

test("writes a new scorecard when none exists", async () => {
  const { c, calls } = client({ "GET /scorecards": { scorecards: [] }, "POST /scorecards": { id: 2 } }, { writeEnabled: true });
  const out = await writeResult(c, result, cfg);
  assert.deepEqual(out, { status: "written", id: 2 });
  assert.equal(calls.at(-1).body.person_id, 9);
});

test("firstArray finds the list in common response shapes", () => {
  assert.deepEqual(firstArray([1]), [1]);
  assert.deepEqual(firstArray({ people: [{ id: 1 }], total: 1 }), [{ id: 1 }]);
  assert.deepEqual(firstArray({ other: [{ id: 2 }] }), [{ id: 2 }]);
  assert.deepEqual(firstArray(null), []);
});
