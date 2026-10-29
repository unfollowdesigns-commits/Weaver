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
const { values: args } = parseArgs({ options: { job: { type: "string" }, jobs: { type: "boolean", default: false }, all: { type: "boolean", default: false }, probe: { type: "boolean", default: false }, sample: { type: "string", default: "10" } } });
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

      // What the scorer will get. Full reads for the first 10 (field names and detail counts),
      // then a fast count over the --sample: 3 light requests per person, progress shown.
      const { loadCandidates, workflowStageNames } = await import("../src/loxo/read.js");
      const stageNames = await workflowStageNames(client);
      const { candidates, failures } = await loadCandidates(client, entries.slice(0, 10), { stageNames });
      const richest = candidates.find((c) => c.resume_text || c.work_history.some((w) => w.title));
      if (richest) {
        const rp = richest.loxo.person_id;
        save("rich-person", await client.get(`/people/${rp}`));
        const rj = firstArray(await client.get(`/people/${rp}/job_profiles`));
        if (rj[0]?.id) save("rich-job-profile-detail", await tryGet(`/people/${rp}/job_profiles/${rj[0].id}`));
        const rr = firstArray(await client.get(`/people/${rp}/resumes`));
        if (rr[0]?.id) save("rich-resume-text", await tryGet(`/people/${rp}/resumes/${rr[0].id}`));
      }
      const n = (f) => candidates.filter(f).length;
      console.log(`\nWhat Weaver gets, full read of the first ${candidates.length} candidates (counts only):`);
      console.log(`  read fine           ${candidates.length} of ${Math.min(10, entries.length)}${failures.length ? `  (${failures.length} failed: ${failures[0].error.slice(0, 90)})` : ""}`);
      console.log(`  current title       ${n((c) => c.current_title)}`);
      console.log(`  work history        ${n((c) => c.work_history.some((w) => w.title || w.company))}`);
      console.log(`  education           ${n((c) => c.education.length)}`);
      console.log(`  resume text         ${n((c) => c.resume_text)}`);
      console.log(`  notes               ${n((c) => c.notes.length)}`);
      console.log(`  pay on file         ${n((c) => c.report.compensation.base)}`);

      const { bucketOf, loadStages } = await import("../src/client-report/model.js");
      const { stageOf } = await import("../src/loxo/map.js");
      const stages = loadStages("config/report/stages.v2.json");
      const sample = entries.slice(0, Math.max(1, Number(args.sample) || 10));
      const rows = [];
      let next = 0;
      async function worker() {
        while (next < sample.length) {
          const e = sample[next++];
          const pid = personIdOf(e);
          const [res, jps, evs] = await Promise.all([
            tryGet(`/people/${pid}/resumes`), tryGet(`/people/${pid}/job_profiles`), tryGet("/person_events", { person_id: pid, notes_format: "plain", per_page: 50 }),
          ]);
          const notesChars = firstArray(evs).reduce((t, x) => t + String(x?.notes ?? "").length, 0);
          // The list can hold empty shells (seen 29 Oct 2026): open the first entry to check.
          let jp = firstArray(jps)[0];
          if (jp?.id && !jp.title && !jp.company) {
            const d = await tryGet(`/people/${pid}/job_profiles/${jp.id}`);
            jp = d?.job_profile ?? d;
          }
          const history = Boolean(jp && (jp.title || jp.company?.name || jp.company_name));
          rows.push({ bucket: bucketOf(stageOf(e, stageNames).name, stages), resume: firstArray(res).length > 0, history, notes: notesChars > 200 });
          if (rows.length % 20 === 0 || rows.length === sample.length) process.stdout.write(`\r  counting ${rows.length} of ${sample.length} ...`);
        }
      }
      console.log("");
      await Promise.all(Array.from({ length: 4 }, worker));
      console.log(`\n\n  By stage: people / with resume / with work history / with notes / enough to score`);
      const line = (label, rs) => console.log(`    ${label.padEnd(34)} ${[rs.length, rs.filter((r) => r.resume).length, rs.filter((r) => r.history).length, rs.filter((r) => r.notes).length, rs.filter((r) => r.resume || r.history || r.notes).length].map((x) => String(x).padStart(4)).join("  ")}`);
      for (const b of stages.buckets) {
        const rs = rows.filter((r) => r.bucket === b.id);
        if (rs.length) line(b.label, rs);
      }
      line("Total", rows);
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
