import { firstArray } from "./client.js";
import { mapJob, mapCandidate, personIdOf, resumeTextOf, resumeTruncatedOf, mapHumanScorecard } from "./map.js";
import { AI_AUTHOR } from "./write.js";

// Read-only. Collects one job and everything needed to score its candidates.

export async function fetchJob(client, jobId) {
  return mapJob(await client.get(`/jobs/${jobId}`));
}

export async function listJobCandidates(client, jobId) {
  return client.list(`/jobs/${jobId}/candidates`);
}

export async function loadCandidate(client, entry) {
  const personId = personIdOf(entry);
  if (!personId) throw new Error(`pipeline entry ${entry?.id} has no person id`);

  const [person, profiles, resumes, events] = await Promise.all([
    client.get(`/people/${personId}`),
    client.get(`/people/${personId}/job_profiles`).then(firstArray),
    client.get(`/people/${personId}/resumes`).then(firstArray),
    client.get("/person_events", { person_id: personId, notes_format: "plain", created_at_sort: "desc", per_page: 50 }).then(firstArray),
  ]);

  // Resumes come newest first; read the extracted text of the latest one.
  let resumeText = "";
  let resumeTruncated = false;
  if (resumes[0]?.id) {
    const raw = await client.get(`/people/${personId}/resumes/${resumes[0].id}`);
    resumeText = resumeTextOf(raw);
    resumeTruncated = resumeTruncatedOf(raw);
  }

  return mapCandidate({ entry, person, jobProfiles: profiles, resumeText, resumeTruncated, events });
}

// Loads candidates with a few requests at a time, so Loxo is not flooded.
export async function loadCandidates(client, entries, { concurrency = 3, onProgress } = {}) {
  // Kept in pipeline order, whatever order the requests finish in.
  const slots = new Array(entries.length);
  const failures = [];
  let next = 0;
  async function worker() {
    while (next < entries.length) {
      const i = next++;
      const entry = entries[i];
      try {
        const c = await loadCandidate(client, entry);
        slots[i] = c;
        onProgress?.(c);
      } catch (err) {
        failures.push({ entry_id: entry?.id ?? null, error: err.message });
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, entries.length || 1) }, worker));
  return { candidates: slots.filter(Boolean), failures };
}

export async function fetchJobForScoring(client, jobId, { limit, concurrency = 3, onProgress } = {}) {
  const job = await fetchJob(client, jobId);
  let entries = await listJobCandidates(client, jobId);
  if (limit) entries = entries.slice(0, limit);
  const { candidates, failures } = await loadCandidates(client, entries, { concurrency, onProgress });
  return { job, candidates, failures, pipelineCount: entries.length };
}

// Scorecards the firm's own team wrote on this job (Weaver's are left out), by person id.
export async function teamScorecards(client, jobId) {
  const out = new Map();
  for (const raw of await client.list("/scorecards", { job_id: jobId })) {
    const sc = mapHumanScorecard(raw);
    if (!sc.person_id || sc.author === AI_AUTHOR || !sc.criteria.length) continue;
    out.set(sc.person_id, sc);
  }
  return out;
}
