#!/usr/bin/env node
// Day-one check against the real Loxo account. Read-only.
//
//   node scripts/loxo-check.js                 connection test + the IDs to put in .env
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
import { personIdOf } from "../src/loxo/map.js";

loadEnv();
const { values: args } = parseArgs({ options: { job: { type: "string" }, probe: { type: "boolean", default: false } } });
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

  if (args.job) {
    const job = await client.get(`/jobs/${args.job}`);
    const j = job?.job ?? job;
    const entries = await client.list(`/jobs/${args.job}/candidates`);
    console.log(`\nJob ${args.job}: ${j?.title ?? "(no title field)"}. Candidates on the pipeline: ${entries.length}`);

    if (args.probe && entries[0]) {
      const pid = personIdOf(entries[0]);
      const dir = path.join("data", "probe", `job-${args.job}`);
      fs.mkdirSync(dir, { recursive: true });
      const save = (name, data) => fs.writeFileSync(path.join(dir, `${name}.json`), JSON.stringify(data, null, 2));
      save("job", job);
      save("candidate-entry", entries[0]);
      if (pid) {
        save("person", await client.get(`/people/${pid}`));
        save("job-profiles", await client.get(`/people/${pid}/job_profiles`));
        const resumes = await client.get(`/people/${pid}/resumes`);
        save("resumes", resumes);
        const r0 = firstArray(resumes)[0];
        if (r0?.id) save("resume-text", await client.get(`/people/${pid}/resumes/${r0.id}`));
        save("person-events", await client.get("/person_events", { person_id: pid, notes_format: "plain", per_page: 10 }));
        save("scorecards", await client.get("/scorecards", { person_id: pid }));
      }
      console.log(`Raw responses saved to ${dir}/ for checking field names.`);
    }
  }
  console.log("\nConnection OK. Nothing was written to Loxo.");
} catch (err) {
  console.error(`\n${err.message}`);
  process.exitCode = 1;
}
