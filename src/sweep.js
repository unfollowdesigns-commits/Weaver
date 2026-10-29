import { fetchJob, listJobCandidates, loadCandidates, workflowStageNames } from "./loxo/read.js";
import { personIdOf } from "./loxo/map.js";
import { aiScoredPersonIds, writeResult, buildPayload } from "./loxo/write.js";
import { prepareRequest, resultBase, resultFromAnswer, inputFlagCodes, scoreCandidate, isThin } from "./score.js";

// The hourly safety net. For each chosen job it finds candidates without an AI
// assessment and scores them. Catches missed webhooks, restarts and deploys, and
// does the first pass on candidates already on a job when the job is switched on.
//
// With a batch-capable provider (Claude) the work goes through the Batch API at
// half price: one run submits, a later run collects and writes. The batches
// themselves are the only state, so nothing is stored on the server.

const LOOKBACK_MS = 48 * 3600_000;
const MAX_FAILURES = 2; // after two failed answers a candidate is left for a person to look at

const FLAG_BITS = { no_resume: 1, resume_truncated: 2, resume_trimmed: 4, notes_trimmed: 8 };

export function batchId({ jobId, personId, flagCodes }) {
  const bits = flagCodes.reduce((b, c) => b | (FLAG_BITS[c] ?? 0), 0);
  return `loxo-j${jobId}-p${personId}-f${bits}`;
}

export function parseBatchId(id) {
  const m = /^loxo-j(\d+)-p(\d+)-f(\d+)$/.exec(String(id));
  if (!m) return null;
  const bits = Number(m[3]);
  return { jobId: m[1], personId: m[2], flagCodes: Object.keys(FLAG_BITS).filter((c) => bits & FLAG_BITS[c]) };
}

// maxLoad: most candidates read from Loxo per run. Name-only records are read, found empty and
// skipped without paying the AI; the window rotates every hour so they cannot crowd out the
// rest of a search (30 Oct 2026 review: 146 name-only people on one real search).
export async function runSweep({ client, provider, jobIds, scorecard, template, cfg, writes, maxPerRun = 50, maxLoad = 200, useBatch = true, now = Date.now(), log = () => {} }) {
  // `scorecard` is one scorecard, or (jobId) => scorecard for per-search scorecards.
  const scorecardFor = typeof scorecard === "function" ? scorecard : () => scorecard;
  const summary = { written: 0, already_done: 0, submitted: 0, scored_direct: 0, failed: 0, not_enough_in_loxo: 0, waiting: false, left_for_review: [], dry_run: [] };
  const allowed = new Set(jobIds.map(String));
  const jobs = new Map();
  const getJob = async (id) => {
    if (!jobs.has(id)) jobs.set(id, await fetchJob(client, id));
    return jobs.get(id);
  };
  const done = new Map(); // jobId -> Set of person ids already assessed or handled
  for (const id of allowed) done.set(id, await aiScoredPersonIds(client, id, cfg));
  const failures = new Map();

  async function deliver(result) {
    if (writes) {
      const out = await writeResult(client, result, cfg);
      if (out.status === "written") summary.written++;
      else summary.already_done++;
    } else {
      summary.dry_run.push({ candidate: result.candidate_id, job: result.job_id, ...buildPayload(result, cfg) });
    }
    done.get(result.job_id)?.add(String(result.loxo.person_id));
  }

  const batchMode = useBatch && provider.batch;

  // 1. Collect finished batches from the last 48 hours.
  if (batchMode) {
    const recent = await provider.batch.recent({ sinceMs: now - LOOKBACK_MS });
    for (const b of recent.filter((x) => x.status === "ended")) {
      for (const r of await provider.batch.results(b.id)) {
        const ref = parseBatchId(r.custom_id);
        if (!ref || !allowed.has(ref.jobId)) continue;
        if (done.get(ref.jobId).has(ref.personId)) continue;
        const job = await getJob(ref.jobId);
        const sc = scorecardFor(ref.jobId, job);
        const base = resultBase({ candidateId: ref.personId, loxo: { person_id: Number(ref.personId) }, job, scorecard: sc, template, provider });
        const result = r.error
          ? { ...base, status: "error", error: r.error }
          : resultFromAnswer({ base, answer: r.answer, model: r.model, usage: r.usage, scorecard: sc, flagCodes: ref.flagCodes });
        if (result.status !== "scored") {
          const key = `${ref.jobId}:${ref.personId}`;
          failures.set(key, (failures.get(key) ?? 0) + 1);
          continue;
        }
        await deliver(result);
        log(`job ${ref.jobId} person ${ref.personId}: ${writes ? "written" : "dry run"} (${result.average} ${result.recommendation})`);
      }
    }
    // One batch at a time: wait for the open one before sending more.
    if (recent.some((x) => x.status !== "ended")) {
      summary.waiting = true;
      log("a batch is still running; new candidates wait for the next run");
      return summary;
    }
  }

  // 2. Find candidates on the chosen jobs with no assessment yet.
  const todo = [];
  for (const jobId of allowed) {
    for (const entry of await listJobCandidates(client, jobId)) {
      const pid = String(personIdOf(entry) ?? "");
      if (!pid || done.get(jobId).has(pid)) continue;
      if ((failures.get(`${jobId}:${pid}`) ?? 0) >= MAX_FAILURES) {
        summary.left_for_review.push({ job: jobId, person: pid });
        continue;
      }
      todo.push({ jobId, entry });
    }
  }
  if (!todo.length) return summary;
  // This run's window: up to maxLoad people, starting at a point that moves every hour.
  const start = todo.length > maxLoad ? (Math.floor(now / 3600_000) * maxLoad) % todo.length : 0;
  const window = [...todo.slice(start), ...todo.slice(0, start)].slice(0, maxLoad);

  const stageNames = await workflowStageNames(client);

  // 3. Score them: in one batch (half price), or directly for providers without batches.
  const items = [];
  let picked = 0;
  for (const jobId of new Set(window.map((t) => t.jobId))) {
    if (picked >= maxPerRun) break;
    const job = await getJob(jobId);
    const sc = scorecardFor(jobId, job);
    const { candidates, failures: loadFailures } = await loadCandidates(client, window.filter((t) => t.jobId === jobId).map((t) => t.entry), { stageNames });
    summary.failed += loadFailures.length;
    for (const candidate of candidates) {
      // Nothing to read yet: not sent to the AI, nothing written to Loxo.
      if (isThin(candidate)) {
        summary.not_enough_in_loxo++;
        continue;
      }
      if (picked >= maxPerRun) break;
      picked++;
      if (batchMode) {
        const flagCodes = inputFlagCodes(candidate);
        items.push({ custom_id: batchId({ jobId, personId: candidate.loxo.person_id, flagCodes }), ...prepareRequest({ candidate, job, scorecard: sc, template }) });
      } else {
        const result = await scoreCandidate({ candidate, job, scorecard: sc, template, provider });
        if (result.status !== "scored") {
          summary.failed++;
          continue;
        }
        summary.scored_direct++;
        await deliver(result);
      }
    }
  }
  if (batchMode && items.length) {
    const id = await provider.batch.submit(items);
    summary.submitted = items.length;
    log(`submitted ${items.length} candidates in batch ${id}`);
  }
  return summary;
}
