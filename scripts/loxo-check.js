#!/usr/bin/env node
// Day-one check against the real Loxo account. Read-only.
//
//   node scripts/loxo-check.js                 connection test + the IDs to put in .env
//   node scripts/loxo-check.js --jobs          also: every job with its ID and status
//   node scripts/loxo-check.js --job 123       also: job title and how many candidates are on it
//   node scripts/loxo-check.js --job 123 --probe
//        also saves the raw Loxo responses for the first candidate to data/probe/
//        so field names can be confirmed. Real personal data: stays in data/, never shared.

import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { loadEnv } from "../src/env.js";
import { loxoClientFromEnv } from "../src/loxo/index.js";
import { firstArray } from "../src/loxo/client.js";
import { personIdOf, jobStatusOf, isOpenStatus } from "../src/loxo/map.js";

loadEnv();
const { values: args } = parseArgs({ options: { job: { type: "string" }, jobs: { type: "boolean", default: false }, all: { type: "boolean", default: false }, probe: { type: "boolean", default: false } } });
const client = loxoClientFromEnv();

const show = (title, items) => {
  console.log(`\n${title}`);
  if (!items.length) console.log("  (none)");
  for (const x of items) console.log(`  ${String(x.id).padEnd(8)} ${x.name ?? x.title ?? x.label ?? JSON.stringify(x).slice(0, 80)}`);
};

try {
  console.log(`Connecting to ${client.base} ...`);
  show("Scorecard types  -> LOXO_SCORECARD_TYPE_ID", firstArray(await client.get("/scorecards/scorecard_types")));
  show("Scorecard recommendation types  -> LOXO_RECOMMENDATION_YES_ID / LOXO_RECOMMENDATION_NO_ID", firstArray(await client.get("/scorecards/scorecard_recommendation_types")));
  show("Activity types  -> LOXO_NOTE_ACTIVITY_TYPE_ID (only if scores go in a note)", firstArray(await client.get("/activity_types")));
  show("Webhooks already set up", firstArray(await client.get("/webhooks")).map((w) => ({ id: w.id, name: `${w.item_type} ${w.action} -> ${w.endpoint_url}` })));

  if (args.jobs) {
    const jobs = await client.list("/jobs");
    const byStatus = new Map();
    for (const j of jobs) byStatus.set(jobStatusOf(j) ?? "no status", (byStatus.get(jobStatusOf(j) ?? "no status") ?? 0) + 1);
    console.log(`\nJobs in Loxo: ${jobs.length}`);
    for (const [st, n] of [...byStatus].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(5)}  ${st}`);
    const shown = args.all ? jobs : jobs.filter((j) => isOpenStatus(jobStatusOf(j)));
    show(`${args.all ? "All jobs" : "Open jobs (status open or active; --all to list every job)"} (${shown.length})  -> for score-jobs --loxo-jobs`,
      shown.map((j) => ({ id: (j.job ?? j).id, name: `[${jobStatusOf(j) ?? "status?"}] ${(j.job ?? j).title ?? ""}` })));
  }

  if (args.job) {
    const job = await client.get(`/jobs/${args.job}`);
    const j = job?.job ?? job;
    const entries = await client.list(`/jobs/${args.job}/candidates`);
    console.log(`\nJob ${args.job}: ${j?.title ?? "(no title field)"}. Candidates on the pipeline: ${entries.length}`);

    if (args.probe && entries[0]) {
      const dir = path.join("data", "probe", `job-${args.job}`);
      fs.mkdirSync(dir, { recursive: true });
      const fields = [];
      const save = (name, data) => {
        fs.writeFileSync(path.join(dir, `${name}.json`), JSON.stringify(data, null, 2));
        fields.push(`# ${name}`, ...fieldList(data));
      };
      const tryGet = async (p, q) => { try { return await client.get(p, q); } catch (e) { return { error: e.status ?? e.message } } };
      save("job", job);
      save("candidate-entry", entries[0]);
      save("workflow-stages", await tryGet("/workflow_stages"));
      save("scorecard-templates", await tryGet("/scorecards/scorecard_templates", { job_id: args.job }));
      const pid = personIdOf(entries[0]);
      if (pid) {
        save("person", await client.get(`/people/${pid}`));
        save("person-row", await tryGet("/people", { include_ids: [pid], serialization_set: "api_row_person_with_job_and_edu_profiles", per_page: 1 }));
        const jps = await client.get(`/people/${pid}/job_profiles`);
        save("job-profiles", jps);
        const jp0 = firstArray(jps)[0];
        if (jp0?.id) save("job-profile-detail", await tryGet(`/people/${pid}/job_profiles/${jp0.id}`));
        save("education-profiles", await tryGet(`/people/${pid}/education_profiles`));
        save("person-events", await client.get("/person_events", { person_id: pid, notes_format: "plain", per_page: 10 }));
        save("scorecards", await client.get("/scorecards", { person_id: pid }));
      }

      // What the scorer will actually get, over the first 10 candidates. Counts only.
      const { loadCandidates, workflowStageNames } = await import("../src/loxo/read.js");
      const stageNames = await workflowStageNames(client);
      const sample = entries.slice(0, 10);
      const { candidates, failures } = await loadCandidates(client, sample, { stageNames });
      let withResume = false;
      for (const c of candidates) {
        if (!withResume && c.resume_text) {
          const r = await client.get(`/people/${c.loxo.person_id}/resumes`);
          const r0 = firstArray(r)[0];
          save("resumes", r);
          if (r0?.id) save("resume-text", await client.get(`/people/${c.loxo.person_id}/resumes/${r0.id}`));
          withResume = true;
        }
      }
      const n = (f) => candidates.filter(f).length;
      console.log(`\nWhat Weaver gets, first ${sample.length} candidates on this search (counts only):`);
      console.log(`  read fine           ${candidates.length} of ${sample.length}${failures.length ? `  (${failures.length} failed: ${failures[0].error.slice(0, 90)})` : ""}`);
      console.log(`  current title       ${n((c) => c.current_title)}`);
      console.log(`  current company     ${n((c) => c.current_company)}`);
      console.log(`  location            ${n((c) => c.location)}`);
      console.log(`  work history        ${n((c) => c.work_history.some((w) => w.title || w.company))}`);
      console.log(`  education           ${n((c) => c.education.length)}`);
      console.log(`  resume text         ${n((c) => c.resume_text)}`);
      console.log(`  notes               ${n((c) => c.notes.length)}`);
      console.log(`  stage name known    ${n((c) => c.report.stage.name)}`);
      console.log(`  pay on file         ${n((c) => c.report.compensation.base)}`);
      console.log(`  stage names in Loxo ${stageNames.size ? [...stageNames.values()].join(", ") : "none returned"}`);
      const { mapJob } = await import("../src/loxo/map.js");
      const tpl = mapJob(job).scorecard_template;
      console.log(`  scorecard template  ${tpl ? `"${tpl.name}": ${tpl.criteria.join(" | ")}` : "none on this search"}`);

      fs.writeFileSync(path.join(dir, "fields.txt"), fields.join("\n") + "\n");
      console.log(`\nRaw responses saved to ${dir}/ (real data: keep them there).`);
      console.log(`Field names only, no values, safe to share: ${path.join(dir, "fields.txt")}`);
    }
  }
  console.log("\nConnection OK. Nothing was written to Loxo.");
} catch (err) {
  console.error(`\n${err.message}`);
  process.exitCode = 1;
}

// Every field path with its type and no value, e.g. "person.job_profiles[].company.name: string".
function fieldList(data, prefix = "", out = new Set()) {
  if (Array.isArray(data)) {
    if (!data.length) out.add(`${prefix}[]: empty list`);
    for (const item of data.slice(0, 3)) fieldList(item, `${prefix}[]`, out);
  } else if (data && typeof data === "object") {
    for (const [k, v] of Object.entries(data)) fieldList(v, prefix ? `${prefix}.${k}` : k, out);
  } else {
    out.add(`${prefix}: ${data === null ? "null" : typeof data}`);
  }
  return [...out];
}
