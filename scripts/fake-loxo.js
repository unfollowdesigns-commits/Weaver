#!/usr/bin/env node
// A fake Loxo on your own computer, with made-up searches and candidates, so the whole
// flow can be run before the real key arrives. Read-only, no real data.
//
//   node scripts/fake-loxo.js            listens on http://localhost:8790
//   then, in another Terminal window:
//   LOXO_DOMAIN=http://localhost:8790 LOXO_AGENCY_SLUG=demo LOXO_API_KEY=demo \
//     node scripts/score-jobs.js --provider mock --open-jobs --go

import http from "node:http";
import fs from "node:fs";

const jobs = JSON.parse(fs.readFileSync("samples/jobs.sample.json", "utf8"));
const people = JSON.parse(fs.readFileSync("samples/candidates.sample.json", "utf8"));
const byId = new Map(people.map((p, i) => [String(i + 1), p]));
const idOf = (sampleId) => String(people.findIndex((p) => p.id === sampleId) + 1);

function route(path, query) {
  let m;
  if (path === "/jobs") return { jobs: jobs.map(({ candidate_person_ids, ...j }) => j) };
  if ((m = /^\/jobs\/(\d+)$/.exec(path))) {
    const j = jobs.find((x) => String(x.id) === m[1]);
    return j ? { job: j } : null;
  }
  if ((m = /^\/jobs\/(\d+)\/candidates$/.exec(path))) {
    const j = jobs.find((x) => String(x.id) === m[1]);
    if (!j) return null;
    let list = j.candidate_person_ids.map((sid, i) => ({ id: Number(m[1]) * 100 + i, person_id: Number(idOf(sid)) }));
    if (query.get("person_id")) list = list.filter((c) => String(c.person_id) === query.get("person_id"));
    return { candidates: list, total_count: list.length };
  }
  if ((m = /^\/people\/(\d+)$/.exec(path))) {
    const p = byId.get(m[1]);
    if (!p) return null;
    return { person: { id: Number(m[1]), name: p.name, title: p.current_title, company: p.current_company, location: p.location, description: "" } };
  }
  if ((m = /^\/people\/(\d+)\/job_profiles$/.exec(path))) {
    const p = byId.get(m[1]);
    return { job_profiles: (p?.work_history ?? []).map((w, i) => ({ id: i + 1, title: w.title, company: { name: w.company }, year: Number(w.start) || null, description: w.summary })) };
  }
  if ((m = /^\/people\/(\d+)\/resumes$/.exec(path))) {
    const p = byId.get(m[1]);
    return { resumes: p?.resume_text ? [{ id: 1, name: "resume.pdf" }] : [] };
  }
  if ((m = /^\/people\/(\d+)\/resumes\/\d+$/.exec(path))) return { resume: { id: 1, text: byId.get(m[1])?.resume_text ?? "", truncated: false } };
  if (path === "/person_events") {
    const p = byId.get(query.get("person_id") ?? "");
    return { person_events: (p?.notes ?? []).map((n, i) => ({ id: i + 1, notes: n.text, created_at: n.date })) };
  }
  if (path === "/scorecards") return { scorecards: [] };
  if (path === "/scorecards/scorecard_types") return { scorecard_types: [{ id: 1, name: "Interview" }] };
  if (path === "/scorecards/scorecard_recommendation_types") return { scorecard_recommendation_types: [{ id: 1, name: "Hire" }, { id: 2, name: "No hire" }] };
  if (path === "/activity_types") return { activity_types: [{ id: 1, name: "Note" }] };
  if (path === "/webhooks") return { webhooks: [] };
  return null;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (req.method !== "GET") return res.writeHead(405).end("fake Loxo is read-only");
  const path = url.pathname.replace(/^\/api\/[^/]+/, "");
  const body = route(path, url.searchParams);
  if (!body) return res.writeHead(404).end("not found");
  res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(body));
});

const port = Number(process.env.FAKE_LOXO_PORT || 8790);
server.listen(port, () => console.log(`Fake Loxo (sample data) on http://localhost:${port}`));
