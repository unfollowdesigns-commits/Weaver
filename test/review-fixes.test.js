// One test per finding of the independent review (30 Oct 2026), using its own examples.
import { test } from "node:test";
import assert from "node:assert/strict";
import { toPromptRecord, isAboutPay, scrubPay, scrubScores, scrubName } from "../src/candidate.js";

const base = { id: "x", name: "Jane Roe, CPA", work_history: [], education: [], skills: [], notes: [] };

test("1. the candidate's name and LinkedIn handle never reach the AI", () => {
  const rec = toPromptRecord({ ...base, resume_text: "JANE ROE, CPA\nlinkedin.com/in/janeroe\nController at Acme. Jane led the close.", notes: [{ text: "Spoke with Jane Roe today." }], work_history: [{ title: "Controller", company: "Acme", summary: "Roe built the team." }] });
  const all = JSON.stringify(rec);
  assert.ok(!/Jane|JANE|Roe|ROE|janeroe/.test(all), all);
  assert.ok(all.includes("CPA") && all.includes("Controller at Acme"));
  assert.equal(scrubName("A rose garden and a roe deer.", "Rose Roe"), "A rose garden and a roe deer.");
});

test("3. pay written in other ways is caught", () => {
  for (const s of ["Currently at $310,000 all-in, wants 350.", "Earns 250,000 a year.", "Base: 225.", "Making 1.2M total.", "TC 400 plus carry.", "Currently $225k base with a 25% bonus.", "Comp is $165K to $200K depending on experience."]) {
    assert.equal(isAboutPay(s), true, s);
  }
});

test("4. business figures stay as evidence", () => {
  for (const s of ["Cut costs by $500K across the org.", "Led a $40M growth equity raise.", "Presented to the board's Compensation Committee.", "Grew a private equity backed firm to $28M.", "Owned decision making for a $200M budget.", "Owns the monthly close and GAAP reporting.", "Hit a target of $50M in revenue."]) {
    assert.equal(isAboutPay(s), false, s);
  }
  assert.ok(scrubPay("Led a $40M growth equity raise. Wants 220k plus 20%.").includes("$40M growth equity raise"));
});

test("5. graduation years in the resume are blanked, other years stay", () => {
  const rec = toPromptRecord({ ...base, resume_text: "Controller, Acme, 2015 - 2021\nMBA, Wharton, 2004\nBS Accounting, State University 1999" });
  assert.ok(rec.resume_text.includes("2015 - 2021"));
  assert.ok(!rec.resume_text.includes("2004") && !rec.resume_text.includes("1999"));
});

test("14. the team's recommendation and Weaver's own notes do not reach the AI", () => {
  assert.ok(scrubScores("Recommendation: Strong Yes after screen. Great on FP&A.").includes("[score removed]"));
  const rec = toPromptRecord({ ...base, notes: [{ text: "AI first read, awaiting recruiter review. Not a decision.\n3.9 / 5 · Yes" }, { text: "Good call on Monday." }] });
  assert.equal(rec.notes.length, 1);
});

test("6. pay fields with ranges, k and M are read as the first amount", async () => {
  const { money } = await import("../src/loxo/map.js");
  assert.equal(money("$150,000 - $200,000"), 150000);
  assert.equal(money("150k-200k"), 150000);
  assert.equal(money("1.2M"), 1200000);
  assert.equal(money("225"), 225000);
  assert.equal(money("225000.0"), 225000);
  assert.equal(money(null), null);
});

test("7. a scroll cursor that never changes still reads every page", async () => {
  const { createLoxoClient } = await import("../src/loxo/client.js");
  const all = [1, 2, 3, 4, 5, 6].map((id) => ({ id }));
  let call = 0;
  const fetchImpl = async () => new Response(JSON.stringify({ candidates: all.slice(call * 2, ++call * 2), scroll_id: "same" }), { status: 200 });
  const c = createLoxoClient({ slug: "a", apiKey: "k", fetchImpl, sleep: async () => {}, maxPerSecond: 0 });
  assert.equal((await c.list("/jobs/1/candidates", {}, { perPage: 2 })).length, 6);
});

test("8. a write that fails with a server error is not sent twice", async () => {
  const { createLoxoClient } = await import("../src/loxo/client.js");
  let posts = 0;
  const fetchImpl = async (u, init) => { if (init.method === "POST") posts++; return new Response("", { status: 502 }); };
  const c = createLoxoClient({ slug: "a", apiKey: "k", fetchImpl, sleep: async () => {}, maxPerSecond: 0, writeEnabled: true });
  await assert.rejects(() => c.post("/scorecards", {}));
  assert.equal(posts, 1);
  let gets = 0;
  const g = createLoxoClient({ slug: "a", apiKey: "k", fetchImpl: async () => (++gets < 3 ? new Response("", { status: 502 }) : new Response("{}", { status: 200 })), sleep: async () => {}, maxPerSecond: 0 });
  await g.get("/jobs/1");
  assert.equal(gets, 3);
});

test("11. Loxo filters are double-checked: another person's AI scorecard never blocks this one", async () => {
  const { writeResult, AI_AUTHOR } = await import("../src/loxo/write.js");
  const { createLoxoClient } = await import("../src/loxo/client.js");
  const posts = [];
  const fetchImpl = async (u, init) => {
    if (init.method === "POST") { posts.push(1); return new Response('{"id":5}', { status: 200 }); }
    // Loxo ignores the filters and returns someone else's AI scorecard.
    return new Response(JSON.stringify({ scorecards: [{ id: 1, person_id: 999, job_id: 7, external_creator_name: AI_AUTHOR }] }), { status: 200 });
  };
  const c = createLoxoClient({ slug: "a", apiKey: "k", fetchImpl, sleep: async () => {}, maxPerSecond: 0, writeEnabled: true });
  const result = { status: "scored", job_id: "7", loxo: { person_id: 9 }, scorecard: "s", provider: "p", model: "m", scored_at: "2026-10-30T00:00:00Z",
    criteria: [{ id: "a", label: "A", score: 4, evidence: "E." }], average: 4, scored_count: 1, recommendation: "yes", assessment: "A.", industry: "direct",
    strongest_signal: "S.", watch_item: "W.", where_they_fit: [], where_to_probe: [], flags: [] };
  const out = await writeResult(c, result, { target: "scorecard", scorecardTypeId: "2", recommendationTypeIds: { yes: "3" } });
  assert.equal(out.status, "written");
  assert.equal(posts.length, 1);
});

test("13, 15, 17. pay removed from evidence, no 'resume' anywhere without one, no model name in Loxo", async () => {
  const { finalize } = await import("../src/validate.js");
  const { resultFromAnswer } = await import("../src/score.js");
  const { summaryText } = await import("../src/loxo/write.js");
  const { loadScorecard } = await import("../src/scorecard.js");
  const sc = loadScorecard("config/scorecards/example.v1.json");
  const answer = { criteria: sc.criteria.map((c, i) => ({ id: c.id, score: 4, evidence: i === 0 ? "Current base is $250k, above range." : "Per the resume, led the close." })),
    recommendation: "yes", industry: "direct", strongest_signal: "Resume shows a strong close.", watch_item: "Resume is thin on cash.", where_they_fit: ["Resume: owned audits."], where_to_probe: ["Gaps in the resume."], assessment: "Good." };
  const f = finalize(structuredClone(answer), sc);
  assert.equal(f.criteria[0].evidence, "[removed: mentioned pay]");
  assert.ok(f.flags.some((x) => x.startsWith("pay_removed")));
  const r = resultFromAnswer({ base: { candidate_id: "x", scorecard: "s", provider: "openai", scored_at: "2026-10-30T00:00:00Z" }, answer: structuredClone(answer), model: "gpt-4.1", scorecard: sc, flagCodes: ["no_resume"] });
  assert.ok(!/resume/i.test(JSON.stringify([r.strongest_signal, r.watch_item, r.where_they_fit, r.where_to_probe, r.criteria.map((c) => c.evidence)])));
  const text = summaryText(r);
  assert.ok(!text.includes("gpt-4.1") && !text.includes("openai"));
});

test("12, 16, 18, 20: accents, safe links, blank team scores, money escaped once", async () => {
  const { nameMatches } = await import("../src/loxo/read.js");
  assert.equal(nameMatches("Jose Garcia", "José García"), true);
  assert.equal(nameMatches("José García", "Jose Garcia, CPA"), true);
  const { mapHumanScorecard } = await import("../src/loxo/map.js");
  assert.equal(mapHumanScorecard({ person_id: 1, scorecard_attributes: [{ name: "A", score: 4 }, { name: "B", score: "" }] }).average, 4);
  const { renderReport, money } = await import("../src/client-report/render.js");
  assert.equal(money("$200k & bonus"), "$200k & bonus");
  const { buildReportModel, loadStages } = await import("../src/client-report/model.js");
  const stages = loadStages();
  const cand = { id: "1", name: "Sample A", current_title: "VP", current_company: "Co", location: "DC", work_history: [], education: [], loxo: { person_id: 1 },
    report: { stage: { name: "Submitted to Client" }, compensation: { base: null, bonus: "25% & equity" }, linkedin: "javascript:alert(1)" } };
  const res = { status: "scored", loxo: { person_id: 1 }, average: 4, recommendation: "yes", industry: "direct", strongest_signal: "S", watch_item: "W", where_they_fit: [], where_to_probe: [], assessment: "A" };
  const html = renderReport(buildReportModel({ job: { id: "7", title: "CFO", description: "" }, candidates: [cand], results: [res], stages }), stages);
  assert.ok(!html.includes("javascript:"));
  assert.ok(html.includes("25% &amp; equity") && !html.includes("&amp;amp;"));
});

test("10. the job description is scrubbed of pay before drafting and report writing", async () => {
  const { draftRequest } = await import("../src/draft.js");
  const { narrativeRequest } = await import("../src/client-report/narrative.js");
  const job = { id: 7, title: "CFO", description: "Lead finance. Salary range $180,000 to $200,000 plus bonus." };
  assert.ok(!draftRequest(job).user.includes("180,000"));
  const model = { job, people: [], top: [] };
  assert.ok(!narrativeRequest(model).user.includes("180,000"));
});

test("second review, names: hyphens, lowercase in Loxo, apostrophes, accents, handles; everyday words kept", () => {
  const leak = (name, text) => scrubName(text, name);
  assert.equal(leak("Jane Roe-Smith", "Ms. Roe joined. Smith led. Roe-Smith signed."), "Ms. [name] joined. [name] led. [name] signed.");
  assert.equal(leak("jane mcdonald", "MCDONALD, JANE\nJane McDonald, controller."), "[name], [name]\n[name] [name], controller.");
  assert.equal(leak("Patrick O'Brien", "Patrick O’Brien led audits. O'Brien again."), "[name] [name] led audits. [name] again.");
  assert.equal(leak("José García", "Jose Garcia, CPA. García built it."), "[name] [name], CPA. [name] built it.");
  assert.equal(leak("Mark Young", "Ernst & Young audit. Mark the date. Mark Young led it."), "Ernst & Young audit. Mark the date. [name] [name] led it.");
  assert.equal(leak("Dr. Anne de la Cruz", "Worked de facto as la team lead. Anne de la Cruz, Dr. Cruz."), "Worked de facto as la team lead. [name] de la [name], Dr. [name].");
  const rec = toPromptRecord({ ...base, name: "Jane Roe", resume_text: "linkedin: /in/janeroe12 · github.com/janeroe\nController." });
  assert.ok(!/janeroe/i.test(rec.resume_text), rec.resume_text);
});

test("second review, pay: pay-sized figures caught, business figures and counts kept", () => {
  for (const s of ["Looking for 250K+.", "He is at 275k today.", "$180-200K range.", "Targeting low 200s.", "Earning in the mid 200s.", "Currently $1.5MM.", "Sits at 240 plus 30%.", "Target cash 300.", "Base of two hundred thousand.", "TC 400 plus carry.", "Wants 220k plus 20%."]) {
    assert.equal(isAboutPay(s), true, s);
  }
  for (const s of ["Rebuilt the TC team.", "The company wants 30M ARR by 2027.", "Cut costs by $500K across the org.", "Saved $250K annually.", "Managed a $500K budget.", "Processed 50k invoices a month.", "Led $800M in partner funding.", "Grew revenue from $14M to $41M."]) {
    assert.equal(isAboutPay(s), false, s);
  }
});

test("second review: graduation year on the line after the degree, and '4 of 5' screen scores", () => {
  const rec = toPromptRecord({ ...base, resume_text: "MBA\n2004\nController, Acme, 2015 - 2021" });
  assert.ok(!rec.resume_text.includes("2004") && rec.resume_text.includes("2015 - 2021"));
  assert.ok(scrubScores("Screen: 4 of 5.").includes("[score removed]"));
  assert.equal(scrubScores("Managed 3 of 5 regional teams."), "Managed 3 of 5 regional teams.");
});

test("money: small numbers are not read as salaries", async () => {
  const { money } = await import("../src/loxo/map.js");
  assert.equal(money("2.5"), null);
  assert.equal(money("$90"), 90000);
  assert.equal(money("12"), null);
});

test("third review, pay: recruiter shorthand is caught", () => {
  for (const s of ["Wants 250k but the client budget tops out at 230k.", "Currently 240 base.", "Making 275 plus 20%.", "Earning north of 300.", "Last role paid 260.", "He'd move for 280.", "Expectation 250-275.", "Floor is 240.", "250 base / 50 variable.", "tc 400.",
    "$220k-$250k target", "OTE 350", "comp expectations high 200s", "At 245k with a 30% bonus target", "Needs 260 to move", "Would take 250K"]) {
    assert.equal(isAboutPay(s), true, s);
  }
});

test("third review, pay: counts, retirement plans, debt and pay-as-a-topic stay as evidence", () => {
  for (const s of ["Built a 100k+ followers community.", "Ran a 10K race fundraiser.", "Migrated 500K lines of code.", "Processed 200k claims a year.", "Grew from 50k to 400k monthly visits.", "The team is at 120 people across 3 sites.", "Needs 200 engineers by Q3.", "Is at 95 percent retention.",
    "Rolled out a new 401k plan for 800 staff.", "Paid down $1.2M of debt.", "Repaid 1.5MM in notes.", "Raised base salaries by 5% across the firm.", "Designed the bonus plan for 40 sales reps.", "Led compensation benchmarking for the C-suite.",
    "$250K of AP per month", "120k sq ft facility", "payroll for 2,000 staff", "Cut DSO from 60 to 45 days", "Rebuilt the TC team."]) {
    assert.equal(isAboutPay(s), false, s);
  }
});

test("third review, team scores: overall, team and 'our read' are removed", () => {
  for (const s of ["Overall 4.2.", "Our read: strong yes.", "Team: 4.1."]) assert.ok(scrubScores(s).includes("[score removed]"), s);
});

test("third review, names: possessives, titles, self-named firms; employers, schools and places kept", () => {
  assert.equal(scrubName("Roe's team grew. ROE'S plan. Roe’s budget.", "Jane Roe"), "[name] team grew. [name] plan. [name] budget.");
  assert.equal(scrubName("Ms. Lee's team.", "Mary Ann Lee"), "Ms. [name] team.");
  assert.equal(scrubName("Mr. Lake led.", "Jordan Lake"), "Mr. [name] led.");
  const rec = (name, extra) => toPromptRecord({ ...base, name, ...extra });
  const self = rec("Jane Roe", { current_company: "Jane Roe Consulting", work_history: [{ title: "Owner", company: "Jane Roe Consulting", summary: "Ran Jane Roe Consulting." }] });
  assert.ok(!/Roe/.test(JSON.stringify(self)), JSON.stringify(self));
  const wells = rec("Morgan Wells", { current_company: "Wells Fargo", work_history: [{ title: "VP", company: "Wells Fargo", summary: "Joined Wells Fargo from Morgan Stanley." }, { title: "Analyst", company: "Morgan Stanley", summary: "" }], resume_text: "Morgan Wells\nVP, Wells Fargo" });
  const w = JSON.stringify(wells);
  assert.ok(w.includes("Wells Fargo") && w.includes("Morgan Stanley"), w);
  assert.ok(wells.resume_text.startsWith("[name] [name]"), wells.resume_text);
  const uva = rec("Virginia Hale", { education: [{ degree: "BS", institution: "University of Virginia" }], location: "Northern Virginia", resume_text: "Virginia Hale. University of Virginia. Lives in Northern Virginia. Hale led audits." });
  assert.equal(uva.resume_text, "[name] [name]. University of Virginia. Lives in Northern Virginia. [name] led audits.");
});

test("third review: hourly pay fields are not read as a salary", async () => {
  const { money } = await import("../src/loxo/map.js");
  assert.equal(money("$25/hr"), null);
  assert.equal(money("90 per hour"), null);
  assert.equal(money("$225,000"), 225000);
});

test("final review 1: a firm named after the candidate is scrubbed; everyday-word employers kept", () => {
  const r = toPromptRecord({ ...base, name: "Jane Roe", current_company: "Roe Advisory LLC", work_history: [{ title: "Founder", company: "Roe Advisory LLC", summary: "" }], education: [{ institution: "Roe College" }], resume_text: "Jane Roe\nFounder, Roe Advisory LLC" });
  assert.ok(!/Roe/.test(JSON.stringify(r)), JSON.stringify(r));
});

test("final review 2: team scores written loosely are removed", () => {
  for (const s of ["Scorecard avg 4.1.", "Gave him a 4 on the screen.", "Strong yes from Josh.", "4.1 avg.", "Josh: strong yes.", "Rated him a 4."]) {
    assert.ok(scrubScores(s).includes("[score removed]"), s);
  }
});

test("final review 3: more recruiter pay shorthand is caught", () => {
  for (const s of ["He's at 240.", "At 260 now.", "Current: 250 + 30%.", "Current 240/40.", "$240 + 20%", "Range: 220-260.", "W2 was 410 last year.", "Doing 275 today.", "She's in the 250 range.", "240 + 40 + equity."]) {
    assert.equal(isAboutPay(s), true, s);
  }
});

test("final review 4: finance evidence stays", () => {
  for (const s of ["Currently at 120% of plan.", "Is at 95% retention.", "Currently manages 120 FTEs across 3 countries.", "Targeting 500K in annual savings.", "Base business grew 12% to $80M.", "Wants a CFO seat at a $100M+ PE-backed company.", "Looking for a 200-500 person company.", "Paid $2.1M settlement on time."]) {
    assert.equal(isAboutPay(s), false, s);
  }
});

test("final review 6: a name match never runs across a full stop or comma", () => {
  assert.equal(scrubName("Ernst & Young. Mark the date.", "Mark Young"), "Ernst & Young. Mark the date.");
  assert.equal(scrubName("Mark Young led it. Mark-Young too.", "Mark Young"), "[name] [name] led it. [name] too.");
});

test("final review 5: long unbroken text does not stall the email scrub", () => {
  const t = Date.now();
  toPromptRecord({ ...base, resume_text: "a".repeat(40000) + "@" });
  assert.ok(Date.now() - t < 500, `${Date.now() - t} ms`);
});
