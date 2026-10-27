import { firstArray } from "./client.js";
import { mapJob, mapCandidate, personIdOf, resumeTextOf } from "./map.js";

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
  if (resumes[0]?.id) resumeText = resumeTextOf(await client.get(`/people/${personId}/resumes/${resumes[0].id}`));

  return mapCandidate({ entry, person, jobProfiles: profiles, resumeText, events });
}

export async function fetchJobForScoring(client, jobId, { limit, concurrency = 3, onProgress } = {}) {
  const job = await fetchJob(client, jobId);
  let entries = await listJobCandidates(client, jobId);
  if (limit) entries = entries.slice(0, limit);

  const candidates = [];
  const failures = [];
  let next = 0;
  async function worker() {
    while (next < entries.length) {
      const entry = entries[next++];
      try {
        const c = await loadCandidate(client, entry);
        candidates.push(c);
        onProgress?.(c);
      } catch (err) {
        failures.push({ entry_id: entry?.id ?? null, error: err.message });
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, entries.length || 1) }, worker));
  return { job, candidates, failures, pipelineCount: entries.length };
}
