// Turns Loxo records into the shapes the scorer uses.
// Loxo does not publish response schemas, so field names here are best guesses with
// fallbacks. Check them against a real response (scripts/loxo-check.js --probe) and
// record the confirmed names in CLAUDE.md under Findings.

export function stripHtml(html) {
  if (typeof html !== "string") return "";
  return html
    .replace(/<\s*(br|\/p|\/div|\/li|\/h\d)\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const unwrap = (raw, key) => (raw && typeof raw === "object" && raw[key] && typeof raw[key] === "object" ? raw[key] : raw) ?? {};
const first = (...vals) => vals.find((v) => v !== undefined && v !== null && v !== "") ?? null;

export function mapJob(raw) {
  const j = unwrap(raw, "job");
  return {
    id: String(j.id),
    title: first(j.title, j.name) ?? "Untitled job",
    company_summary: first(j.company?.name, j.raw_company_name, j.company_name),
    description: stripHtml(first(j.description, j.public_description, j.internal_description) ?? ""),
  };
}

export function personIdOf(entry) {
  return first(entry?.person_id, entry?.person?.id);
}

function yearMonth(y, m) {
  if (!y) return null;
  return m ? `${y}-${String(m).padStart(2, "0")}` : String(y);
}

export function mapCandidate({ entry, person, jobProfiles = [], resumeText = "", events = [] }) {
  const p = unwrap(person, "person");
  const name = first(p.name, [p.first_name, p.last_name].filter(Boolean).join(" "));
  const location = first(p.location, [p.city, p.state, p.country].filter(Boolean).join(", "));

  const notes = [];
  const intake = stripHtml(p.description ?? "");
  if (intake) notes.push({ date: null, text: `Intake notes: ${intake}` });
  for (const e of events) {
    const text = stripHtml(e.notes ?? "");
    if (text) notes.push({ date: first(e.created_at), text });
  }

  return {
    id: String(first(p.id, personIdOf(entry))),
    name,
    current_title: first(p.current_title, p.title),
    current_company: first(p.current_company, typeof p.company === "string" ? p.company : p.company?.name, p.company_name),
    location,
    // Field names cross-checked against tbensonwest/loxo-mcp-server (community code built on the same API):
    // job profiles use month/year and end_month/end_year; the person record may embed job_profiles.
    work_history: (jobProfiles.length ? jobProfiles : p.job_profiles ?? []).map((jp) => ({
      title: first(jp.title),
      company: first(jp.company_name, jp.company?.name),
      start: first(jp.start_date, yearMonth(jp.start_year ?? jp.year, jp.start_month ?? jp.month)),
      end: first(jp.end_date, yearMonth(jp.end_year, jp.end_month)),
      summary: stripHtml(jp.description ?? ""),
    })),
    // Degree and school only: graduation years are left out (age proxy).
    education: (p.education_profiles ?? []).map((e) => ({ degree: first(e.degree), field: null, institution: first(e.school, e.institution) })),
    skills: skillList(p.skillsets),
    notes,
    resume_text: resumeText,
    loxo: {
      person_id: first(p.id, personIdOf(entry)),
      job_candidate_id: first(entry?.id),
    },
  };
}

function skillList(s) {
  if (Array.isArray(s)) return s.map((x) => x?.name ?? x).filter(Boolean);
  if (typeof s === "string") return s.split(",").map((x) => x.trim()).filter(Boolean);
  return [];
}

// Pulls the extracted text out of a resumes_show response.
export function resumeTextOf(raw) {
  const r = unwrap(raw, "resume");
  const known = first(r.text, r.extracted_text, r.resume_text, r.content, r.body);
  if (typeof known === "string") return known;
  // Fallback: the longest string field is almost certainly the text.
  return Object.values(r).filter((v) => typeof v === "string").sort((a, b) => b.length - a.length)[0] ?? "";
}
