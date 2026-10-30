// Who was already on a search when Weaver first saw it. 30 Oct 2026 (Houssem: "something steady
// and good cost"): DP's open searches held 27,283 people; scoring them all would take months at
// the daily cap and hold back new candidates. So the hourly catch-up scores only people added
// after Weaver first saw a search, plus everyone on the searches listed in LOXO_BACKLOG_JOB_IDS
// ("all" restores scoring the whole existing pipeline). The webhook is not affected: a candidate
// Loxo reports as just added is new by definition.
//
// Kept in a small JSON file on the persistent disk, so a restart or deploy does not turn the
// existing pipeline into "new" people.
import fs from "node:fs";
import path from "node:path";

const list = (v) => String(v ?? "").split(",").map((s) => s.trim()).filter(Boolean);

export function parseBacklogSetting(value) {
  const ids = list(value);
  return { all: ids.length === 1 && ids[0].toLowerCase() === "all", ids: new Set(ids) };
}

export function createBaseline({ file = null, backlog = "", now = () => Date.now() } = {}) {
  const setting = parseBacklogSetting(backlog);
  let data = { jobs: {} };
  if (file && fs.existsSync(file)) {
    try {
      data = JSON.parse(fs.readFileSync(file, "utf8"));
      data.jobs ??= {};
    } catch {
      data = { jobs: {} };
    }
  }
  const sets = new Map(Object.entries(data.jobs).map(([id, j]) => [id, new Set((j.people ?? []).map(String))]));
  const save = () => {
    if (!file) return;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(`${file}.tmp`, JSON.stringify(data));
    fs.renameSync(`${file}.tmp`, file);
  };
  return {
    describe: () => (setting.all ? "existing candidates on every search" : setting.ids.size ? `existing candidates on ${[...setting.ids].join(", ")}; elsewhere new candidates only` : "new candidates only"),
    scoresBacklog: (jobId) => setting.all || setting.ids.has(String(jobId)),
    known: (jobId) => sets.has(String(jobId)),
    // The first time a search is seen, everyone on it is recorded as already there.
    record(jobId, personIds) {
      jobId = String(jobId);
      if (sets.has(jobId)) return;
      const people = [...new Set(personIds.map(String).filter(Boolean))];
      sets.set(jobId, new Set(people));
      data.jobs[jobId] = { first_seen: new Date(now()).toISOString(), people };
      save();
    },
    // true: this person was on the search before Weaver saw it, and its backlog is not scored.
    isExisting(jobId, personId) {
      jobId = String(jobId);
      if (setting.all || setting.ids.has(jobId)) return false;
      return sets.get(jobId)?.has(String(personId)) ?? false;
    },
  };
}
