#!/usr/bin/env node
// Checks the latest scoring run before anything is shown to the client.
// Prints PASS / FAIL lines with counts only: no names, no candidate data. Safe to share.
//
//   npm run verify            the newest run in data/runs/
//   npm run verify -- data/runs/<folder>

import fs from "node:fs";
import path from "node:path";
import { isAboutPay } from "../src/candidate.js";

const root = "data/runs";
const dir = process.argv[2] ?? (fs.existsSync(root) ? fs.readdirSync(root).filter((d) => !d.endsWith("-jobs") && fs.existsSync(path.join(root, d, "results.json"))).sort().map((d) => path.join(root, d)).pop() : null);
if (!dir) {
  console.log("No run found in data/runs/. Run the scoring first.");
  process.exit(1);
}
const { meta, results } = JSON.parse(fs.readFileSync(path.join(dir, "results.json"), "utf8"));
const html = fs.readFileSync(path.join(dir, "report.html"), "utf8");
const payloadsFile = path.join(dir, "loxo-payloads.json");
const payloads = fs.existsSync(payloadsFile) ? JSON.parse(fs.readFileSync(payloadsFile, "utf8")) : [];

let fails = 0;
const line = (ok, label, detail = "") => {
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`);
};
const scored = results.filter((r) => r.status === "scored");
const skipped = results.filter((r) => r.status === "skipped");
const errors = results.filter((r) => r.status === "error");
const written = (r) => [r.assessment, r.strongest_signal, r.watch_item, ...(r.where_they_fit ?? []), ...(r.where_to_probe ?? []), ...(r.criteria ?? []).map((c) => c.evidence)];

console.log(`Run: ${path.basename(dir)}  ·  scorecard ${meta.scorecard}`);
console.log(`Candidates ${results.length}: ${scored.length} scored, ${skipped.length} not enough in Loxo, ${errors.length} errors\n`);

line(errors.length === 0, "No errors", `${errors.length} errors`);
line(!/scorecard (standard|example)/.test(`scorecard ${meta.scorecard}`), "Used the search's own scorecard, not the generic one", meta.scorecard);
line(!/gpt|openai|claude-|anthropic|\bmock\b/i.test(html.replace(/<style[\s\S]*?<\/style>/, "")), "No AI model or provider name in the report");
line(html.includes("misses a must-have") && html.includes("Partial record"), "Legend explains Yes/No and the flags");

const order = scored.map((r) => r.recommendation);
line(order.indexOf("no") === -1 || order.slice(order.indexOf("no")).every((x) => x === "no"), "Recommended candidates listed before the others");

const payHits = scored.filter((r) => written(r).some((t) => isAboutPay(t))).length;
line(payHits === 0, "Nothing the AI wrote mentions pay", `${payHits} candidates`);

const nameHits = scored.filter((r) => {
  const words = String(r.candidate_name ?? "").split(/[\s,.]+/).filter((w) => w.length > 2 && !/^(CPA|CFA|CMA|MBA|PMP|CFE|JR|SR)$/i.test(w));
  return words.length && written(r).some((t) => words.some((w) => new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(String(t))));
}).length;
line(nameHits === 0, "No candidate's name in what the AI wrote (it never saw names)", `${nameHits} candidates`);

const resumeHits = scored.filter((r) => (r.flags ?? []).some((f) => f.startsWith("no_resume")) && written(r).some((t) => /\bresume\b/i.test(String(t)))).length;
line(resumeHits === 0, "No 'resume' cited for candidates without a resume", `${resumeHits} candidates`);

const guessHits = scored.reduce((n, r) => n + (r.criteria ?? []).filter((c) => /\b(likely|probably|presumably|would require|suggests? (that )?(they|he|she))\b/i.test(c.evidence)).length, 0);
line(guessHits <= Math.max(2, scored.length), "Few evidence lines that guess ('likely'...)", `${guessHits} lines; review them if high`);

const stars = { direct: 0, adjacent: 0, other: 0 };
for (const r of scored) stars[r.industry] = (stars[r.industry] ?? 0) + 1;
console.log(`INFO  Stars: ★ ${stars.direct} direct · ☆ ${stars.adjacent} adjacent · ${stars.other} none  (compare with the client's own report)`);
console.log(`INFO  Yes ${scored.filter((r) => r.recommendation === "yes").length} · No ${scored.filter((r) => r.recommendation === "no").length}`);

if (payloads.length) {
  const bodies = payloads.filter((p) => p.body);
  const errs = payloads.filter((p) => p.error);
  line(errs.length === 0, "Loxo write payloads ready (dry run)", errs[0]?.error ?? `${bodies.length} ready`);
  const summaries = bodies.map((p) => p.body.summary ?? p.body.person_event?.notes ?? "");
  line(!summaries.some((t) => /gpt|openai|claude-|anthropic/i.test(t)), "No model name in what would be written to Loxo");
}

console.log(`\n${fails === 0 ? "ALL CHECKS PASSED" : `${fails} CHECK(S) FAILED: fix before sending anything`}`);
process.exitCode = fails ? 1 : 0;
