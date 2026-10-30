#!/usr/bin/env node
// The write test, for the call with the client: scores ONE candidate on a test search, writes
// the result into Loxo as a scorecard, reads it back, and proves a second run writes nothing.
// Without --go it only shows what it would write. This is the one script that writes to Loxo on
// its own switch (--go), because it is run deliberately, on the test search, with the client.
//
//   npm run write-test                              dry: what would be written (job 3011811)
//   npm run write-test -- --go                      write one scorecard, read it back, check
//   npm run write-test -- --go --update             also update it in place (the re-score path)
//   npm run write-test -- --loxo-job 123 --person-id 456 --go
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { loadEnv } from "../src/env.js";
import { createLoxoClient, firstArray } from "../src/loxo/client.js";
import { fetchJob, listJobCandidates, loadCandidates, workflowStageNames } from "../src/loxo/read.js";
import { writeResult, updateScorecard, writeConfigFromEnv, buildPayload, isAiCard, AI_AUTHOR } from "../src/loxo/write.js";
import { personIdOf } from "../src/loxo/map.js";
import { loadScorecard, scorecardResolver } from "../src/scorecard.js";
import { scorecardForSearch } from "../src/auto-criteria.js";
import { loadTemplate } from "../src/prompt.js";
import { getProvider } from "../src/providers/index.js";
import { isThin, scoreCandidate } from "../src/score.js";

loadEnv();
const { values: args } = parseArgs({ options: {
  "loxo-job": { type: "string", default: "3011811" }, "person-id": { type: "string" },
  provider: { type: "string", default: process.env.SCORING_PROVIDER || "mock" },
  go: { type: "boolean", default: false }, update: { type: "boolean", default: false },
} });

let fails = 0;
const line = (ok, label, detail = "") => { if (!ok) fails++; console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`); };
const cfg = { ...writeConfigFromEnv(), target: "scorecard" };
for (const k of ["LOXO_SCORECARD_TYPE_ID", "LOXO_RECOMMENDATION_YES_ID", "LOXO_RECOMMENDATION_NO_ID"]) {
  if (!process.env[k]) { console.log(`${k} is not set in .env. Run: npm run loxo:check`); process.exit(1); }
}
const client = createLoxoClient({ domain: process.env.LOXO_DOMAIN, slug: process.env.LOXO_AGENCY_SLUG, apiKey: process.env.LOXO_API_KEY, writeEnabled: args.go, maxPerSecond: Number(process.env.LOXO_MAX_PER_SECOND || 4) });
const provider = await getProvider(args.provider);
if (provider.name === "mock") console.log("Note: provider is mock, so a SAMPLE score (not a real read) would be written. Use --provider claude for a real one.");

const jobId = args["loxo-job"];
const job = await fetchJob(client, jobId);
console.log(`Search ${jobId}: "${job.title}"`);
// Only ever on a test search: the "Accounting - Test" search (3011811) or a search whose title says
// "test". Never on a live search, whatever number is typed (30 Oct 2026 review).
const TEST_SEARCH = "3011811";
if (String(jobId) !== TEST_SEARCH && !/\btest\b/i.test(String(job.title ?? ""))) {
  console.log(`Refused: "${job.title}" is not a test search. The write test only runs on search ${TEST_SEARCH} ("Accounting - Test") or a search with "test" in its title.`);
  process.exit(1);
}
const stageNames = await workflowStageNames(client);
let entries = await listJobCandidates(client, jobId);
if (args["person-id"]) entries = entries.filter((e) => personIdOf(e) === String(args["person-id"]));
let candidate = null;
for (const e of entries.slice(0, 30)) {
  const { candidates } = await loadCandidates(client, [e], { stageNames });
  if (candidates[0] && !isThin(candidates[0])) { candidate = candidates[0]; break; }
}
if (!candidate) { console.log("No candidate with enough in Loxo to score on this search (looked at the first 30)."); process.exit(1); }
const personId = candidate.loxo.person_id;
console.log(`Candidate: Loxo person ${personId} (name not printed)`);

const cardsNow = async () => firstArray(await client.get("/scorecards", { person_id: personId, job_id: jobId })).filter((s) => String(s.person_id ?? s.person?.id ?? personId) === String(personId));
const before = (await cardsNow()).filter(isAiCard);

const standard = loadScorecard(process.env.SCORECARD_FILE || "config/scorecards/standard-executive.v2.json");
const scorecard = await scorecardForSearch({ job, resolver: scorecardResolver({ fallback: standard }), standard, provider, auto: process.env.AUTO_CRITERIA !== "false" });
const result = await scoreCandidate({ candidate, job, scorecard, template: loadTemplate(), provider });
if (result.status !== "scored") { console.log(`Scoring did not produce a result: ${result.error ?? result.reason}`); process.exit(1); }
console.log(`Scored: ${result.average} / 5, ${result.recommendation}, ${result.scored_count} of ${result.criteria.length} criteria with evidence`);

if (!args.go) {
  const { body } = buildPayload(result, cfg);
  console.log(`\nDry run. Would write one scorecard: type ${body.scorecard_type_id}, recommendation ${body.scorecard_recommendation_type_id}, ${body.scorecard_attributes.length} criteria, creator "${body.external_creator_name}".`);
  console.log(before.length ? "This person already has a Weaver scorecard on this search, so --go would write nothing new (use --update)." : "Run again with --go to write it.");
  process.exit(0);
}

if (before.length && !args.update) console.log("This person already has a Weaver scorecard here; checking it and the duplicate guard.");
if (!before.length) {
  const w = await writeResult(client, result, cfg);
  line(w.status === "written", "Loxo accepted the scorecard", `${w.status}${w.id ? `, id ${w.id}` : ""}${w.reason ? `, ${w.reason}` : ""}`);
}
const after = await cardsNow();
const mine = after.filter(isAiCard);
fs.mkdirSync("data/probe", { recursive: true });
const probeFile = path.join("data/probe", `write-test-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
fs.writeFileSync(probeFile, JSON.stringify(after, null, 2));
line(mine.length === 1, "Exactly one Weaver scorecard on this person for this search", `${mine.length} found`);
const card = mine[0] ?? {};
const info = (label, detail) => console.log(`INFO  ${label}  (${detail})`);
info("Creator name kept by Loxo", card.external_creator_name === AI_AUTHOR ? "yes" : `no: ${card.external_creator_name ?? "not returned"}`);
info("Summary kept by Loxo", String(card.summary ?? "").startsWith("AI first read") ? "yes" : card.summary ? "changed" : "not returned");
line(isAiCard(card), "Weaver recognizes its own scorecard (at least one of the two above)");
const attrs = card.scorecard_attributes ?? card.attributes ?? [];
line(attrs.length === result.criteria.length, "All criteria came back", `${attrs.length} of ${result.criteria.length}`);
const scoresMatch = result.criteria.every((c) => c.score === null || attrs.some((a) => (a.name ?? a.label) === c.label && Number(a.score) === c.score));
line(scoresMatch, "The scores came back as written");
const again = await writeResult(client, result, cfg);
line(again.status === "skipped", "A second run writes nothing (no duplicates)", again.reason ?? again.status);

if (args.update && card.id) {
  const u = await updateScorecard(client, card.id, result, cfg).catch((e) => ({ status: "failed", reason: e.message }));
  line(u.status === "updated", "The scorecard can be updated in place (re-score after a criteria change)", u.reason ?? "");
  line((await cardsNow()).filter(isAiCard).length === 1, "Still exactly one Weaver scorecard after the update");
}
console.log(`\nWhat Loxo returned is saved in ${probeFile} (stays on this Mac).`);
console.log(`Open the candidate in Loxo to see it: https://${process.env.LOXO_AGENCY_SLUG}.${(process.env.LOXO_DOMAIN || "app.loxo.co")}/ (search ${jobId}).`);
console.log(fails ? `\n${fails} CHECK(S) FAILED: send this output to Houssem's build chat before switching writes on.` : "\nWRITE TEST PASSED");
process.exitCode = fails ? 1 : 0;
