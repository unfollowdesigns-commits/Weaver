import { firstArray } from "./client.js";
import { mapJob, mapCandidate, personIdOf, resumeTextOf, resumeTruncatedOf, mapHumanScorecard, stageOf } from "./map.js";
import { isAiCard } from "./write.js";

// Read-only. Collects one job and everything needed to score its candidates.

export async function fetchJob(client, jobId) {
  return mapJob(await client.get(`/jobs/${jobId}`));
}

export async function listJobCandidates(client, jobId) {
  return client.list(`/jobs/${jobId}/candidates`);
}

// Stage names of the job pipeline, as a Map of id -> name. Empty if Loxo refuses.
export async function workflowStageNames(client) {
  try {
    const stages = firstArray(await client.get("/workflow_stages"));
    return new Map(stages.filter((s) => s?.id != null && s?.name).map((s) => [String(s.id), s.name]));
  } catch {
    return new Map();
  }
}

// Loxo's list endpoints for job and education profiles can return ids only (job profiles
// did, 29 Oct 2026); then each one is fetched on its own, up to a limit.
async function detailed(client, base, items, key, limit) {
  const thin = items.length && items.every((x) => Object.keys(x ?? {}).length <= 2);
  if (!thin) return items;
  const out = [];
  for (const it of items.slice(0, limit)) {
    try {
      const raw = await client.get(`${base}/${it.id}`);
      out.push(raw?.[key] ?? raw);
    } catch { /* skip one unreadable entry */ }
  }
  return out;
}

export async function loadCandidate(client, entry, { stageNames = null } = {}) {
  const personId = personIdOf(entry);
  if (!personId) throw new Error(`pipeline entry ${entry?.id} has no person id`);

  const [person, row, profileList, eduList, resumes, events] = await Promise.all([
    client.get(`/people/${personId}`),
    // The person record alone came back without title, company or location (29 Oct 2026).
    // The people list with this serialization carries the profile fields.
    client.get("/people", { include_ids: [personId], serialization_set: "api_row_person_with_job_and_edu_profiles", per_page: 1 })
      .then((d) => firstArray(d).find((x) => String(x?.id) === String(personId)) ?? null).catch(() => null),
    client.get(`/people/${personId}/job_profiles`).then(firstArray),
    client.get(`/people/${personId}/education_profiles`).then(firstArray).catch(() => []),
    client.get(`/people/${personId}/resumes`).then(firstArray),
    client.get("/person_events", { person_id: personId, notes_format: "plain", created_at_sort: "desc", per_page: 50 }).then(firstArray),
  ]);
  const p = person?.person ?? person ?? {};
  const merged = { ...(row ?? {}), ...Object.fromEntries(Object.entries(p).filter(([, v]) => v !== null && v !== undefined)) };
  const profiles = row?.job_profiles?.length && Object.keys(row.job_profiles[0]).length > 2
    ? row.job_profiles
    : await detailed(client, `/people/${personId}/job_profiles`, profileList, "job_profile", 10);
  const education = row?.education_profiles?.length && Object.keys(row.education_profiles[0]).length > 2
    ? row.education_profiles
    : await detailed(client, `/people/${personId}/education_profiles`, eduList, "education_profile", 5);

  // Resumes come newest first; read the extracted text of the latest one.
  let resumeText = "";
  let resumeTruncated = false;
  if (resumes[0]?.id) {
    const raw = await client.get(`/people/${personId}/resumes/${resumes[0].id}`);
    resumeText = resumeTextOf(raw);
    resumeTruncated = resumeTruncatedOf(raw);
  }

  return mapCandidate({ entry, person: merged, jobProfiles: profiles, educationProfiles: education, resumeText, resumeTruncated, events, stageNames });
}

// Loads candidates with a few requests at a time, so Loxo is not flooded.
export async function loadCandidates(client, entries, { concurrency = 3, onProgress, stageNames = null } = {}) {
  // Kept in pipeline order, whatever order the requests finish in.
  const slots = new Array(entries.length);
  const failures = [];
  let next = 0;
  async function worker() {
    while (next < entries.length) {
      const i = next++;
      const entry = entries[i];
      try {
        const c = await loadCandidate(client, entry, { stageNames });
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

// Accents are dropped before comparing, so "Jose Garcia" matches "José García".
const norm = (t) => String(t ?? "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();
// A listed name matches when every word of it appears in the Loxo name (so "Jane Roe" matches
// "Jane A. Roe, CPA").
export function nameMatches(listed, loxoName) {
  const words = norm(listed).split(" ").filter((w) => w.length > 1);
  const have = new Set(norm(loxoName).split(" "));
  return words.length > 0 && words.every((w) => have.has(w));
}

// stages: optional list of Loxo stage names to keep (case-insensitive), e.g. ["Screened"].
// names: optional list of people to keep, matched by name (for comparing with a firm's report).
export async function fetchJobForScoring(client, jobId, { limit, concurrency = 3, onProgress, stages = null, names = null } = {}) {
  const job = await fetchJob(client, jobId);
  let entries = await listJobCandidates(client, jobId);
  const stageNames = await workflowStageNames(client);
  if (stages?.length) {
    const want = stages.map((s) => s.trim().toLowerCase());
    entries = entries.filter((e) => want.includes(String(stageOf(e, stageNames).name ?? "").toLowerCase()));
  }
  let unmatched = [];
  if (names?.length) {
    unmatched = names.filter((n) => !entries.some((e) => nameMatches(n, e.person?.name ?? e.name)));
    entries = entries.filter((e) => names.some((n) => nameMatches(n, e.person?.name ?? e.name)));
  }
  if (limit) entries = entries.slice(0, limit);
  const { candidates, failures } = await loadCandidates(client, entries, { concurrency, onProgress, stageNames });
  return { job, candidates, failures, pipelineCount: entries.length, unmatched };
}

// Scorecards the firm's own team wrote on this job (Weaver's are left out), by person id.
export async function teamScorecards(client, jobId) {
  const out = new Map();
  for (const raw of await client.list("/scorecards", { job_id: jobId })) {
    if (isAiCard(raw?.scorecard ?? raw)) continue;
    const sc = mapHumanScorecard(raw);
    if (!sc.person_id || !sc.criteria.length) continue;
    out.set(sc.person_id, sc);
  }
  return out;
}
