import { test } from "node:test";
import assert from "node:assert/strict";
import { stageOf, compensationOf, mapHumanScorecard, mapCandidate } from "../src/loxo/map.js";
import { toPromptRecord } from "../src/candidate.js";
import { buildReportModel, bucketOf, loadStages, yearsOf } from "../src/client-report/model.js";
import { narrativeRequest, applyNarrative, narrativeSchema } from "../src/client-report/narrative.js";
import { renderReport, money } from "../src/client-report/render.js";
import { AI_AUTHOR } from "../src/loxo/write.js";

const stages = loadStages();

test("Loxo stage names land in the firm's report stages", () => {
  const b = (n) => bucketOf(n, stages);
  assert.equal(b("Submitted to client"), "submitted");
  assert.equal(b("Client declined"), "out");
  assert.equal(b("Second screen - cleared"), "second");
  assert.equal(b("First screen"), "first");
  assert.equal(b("Responded"), "responded");
  assert.equal(b("Sourced"), "outbound");
  assert.equal(b(null), "outbound");
  assert.deepEqual(stageOf({ workflow_stage_id: 4, workflow_stage: { name: "First screen" } }), { id: 4, name: "First screen" });
});

test("pay is read for the report but never reaches the AI", () => {
  assert.deepEqual(compensationOf({ compensation: { base: 225000, bonus: "25%" } }).base, 225000);
  assert.equal(compensationOf({ salary: "$220k" }).base, 220000);
  const c = mapCandidate({ entry: { id: 1, person_id: 9 }, person: { id: 9, name: "Jane Roe", compensation: { base: 225000 }, linkedin_url: "https://x" } });
  assert.equal(c.report.compensation.base, 225000);
  assert.ok(!JSON.stringify(toPromptRecord(c)).includes("225000"));
});

test("team scorecards are mapped; Weaver's own are told apart by author", () => {
  const sc = mapHumanScorecard({ scorecard: { person_id: 9, created_by: { name: "R" }, scorecard_attributes: [{ name: "Industry", score: 5 }, { name: "Cash", score: 3 }, { name: "Other", score: null }] } });
  assert.equal(sc.average, 4);
  assert.equal(mapHumanScorecard({ external_creator_name: AI_AUTHOR, scorecard_attributes: [] }).author, AI_AUTHOR);
});

const candidates = Array.from({ length: 11 }, (_, i) => ({
  id: String(i + 1), name: `Person ${String.fromCharCode(65 + i)} Smith`, current_title: "VP", current_company: `Co ${i}`, location: "DC",
  work_history: [{ title: "VP", company: `Co ${i}`, start: "2021", end: null }], education: [], loxo: { person_id: i + 1 },
  report: { stage: { name: ["Submitted", "Second screen", "First screen", "Responded", "Outbound", "Withdrawn"][i % 6] }, compensation: { base: 200000 + i * 1000, bonus: "20%" } },
}));
const results = candidates.map((c, i) => ({ status: "scored", loxo: { person_id: i + 1 }, average: 2 + (i % 4) * 0.5, recommendation: "yes", industry: "direct",
  strongest_signal: "Signal <b>", watch_item: "Watch", where_they_fit: ["Fit"], where_to_probe: ["Probe"], assessment: "Assessment" }));

test("report model: funnel counts who reached each stage, top ten, pay range", () => {
  const m = buildReportModel({ job: { id: "7", title: "CFO", description: "" }, candidates, results, stages, firm: "F", client: "C" });
  assert.deepEqual(m.funnel.map((f) => f.count), [11, 8, 6, 4, 2]);
  assert.equal(m.top.length, 10); // ten of the eleven still in process
  assert.equal(m.out.length, 1);
  assert.equal(m.pay_range.low, 200000);
  assert.equal(yearsOf({ start: "2019-03", end: "2023" }), "2019–2023");
});

test("the AI writes with references, never names or pay; names are put back after", () => {
  const m = buildReportModel({ job: { id: "7", title: "CFO", description: "" }, candidates, results, stages });
  const req = narrativeRequest(m);
  assert.ok(!req.user.includes("Smith") && !req.user.includes("200000"));
  assert.ok(req.user.includes('"ref": "C10"'));
  const out = applyNarrative(m, { subtitle: "S", read_boxes: [{ title: "T", text: "C1 and C10 lead." }], focus_next: "C2 next." });
  assert.equal(out.narrative.read_boxes[0].text, "Person and Person lead.");
  assert.equal(narrativeSchema().additionalProperties, false);
});

test("report renders, escapes text and keeps the toolbar out of print", () => {
  const m = applyNarrative(buildReportModel({ job: { id: "7", title: "CFO <x>", description: "" }, candidates, results, stages, firm: "F", client: "C" }), { subtitle: "", read_boxes: [], focus_next: "" });
  const html = renderReport(m, stages);
  assert.ok(html.includes("CFO &lt;x&gt;") && html.includes("Signal &lt;b&gt;"));
  assert.ok(html.includes('class="bar no-print"'));
  assert.ok(html.includes("Where the search stands") && html.includes("Top 10 candidates"));
  assert.equal(money(225000), "$225k");
  assert.equal(money(25), "25%");
  assert.equal(money(null), "TBD");
});
