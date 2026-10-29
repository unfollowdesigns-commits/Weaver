#!/usr/bin/env node
// Re-applies the current "Yes" bar and wording fixes to a saved run. No AI calls, no cost,
// nothing sent anywhere. Writes a new folder beside the old run; the old run is left as it was.
//
//   npm run rebar -- data/runs/<folder>
import fs from "node:fs";
import path from "node:path";
import { rebar } from "../src/rebar.js";
import { toHtml, toMarkdown } from "../src/report.js";

const src = process.argv[2];
if (!src || !fs.existsSync(path.join(src, "results.json"))) {
  console.log("Give the run folder, for example: npm run rebar -- data/runs/2026-10-29T21-58-38-700Z-openai");
  process.exit(1);
}
const { meta, results } = JSON.parse(fs.readFileSync(path.join(src, "results.json"), "utf8"));
const out = rebar(results);
const dir = `${src.replace(/\/$/, "")}-rebar-${new Date().toISOString().replace(/[:.]/g, "-")}`;
fs.mkdirSync(dir, { recursive: true });
const m = { ...meta, when: `${meta.when} (bar re-applied ${new Date().toLocaleString()})` };
fs.writeFileSync(path.join(dir, "results.json"), JSON.stringify({ meta: m, results: out }, null, 2));
fs.writeFileSync(path.join(dir, "report.html"), toHtml(out, m));
fs.writeFileSync(path.join(dir, "report.md"), toMarkdown(out, m));
const scored = out.filter((r) => r.status === "scored");
const yes = scored.filter((r) => r.recommendation === "yes").length;
console.log(`Bar re-applied, no AI calls. Yes ${yes} of ${scored.length} (${Math.round((yes / scored.length) * 100)}%).`);
console.log(`Report: ${path.join(dir, "report.html")}`);
console.log(`Check it: npm run verify -- "${dir}"`);
