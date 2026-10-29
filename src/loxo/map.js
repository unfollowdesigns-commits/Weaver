import { payNotesOf, jobPayRange } from "../pay.js";
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
    description: first(j.description_text?.trim(), stripHtml(first(j.description, j.public_description, j.internal_description) ?? "")) ?? "",
    // The firm's own scorecard template on this job in Loxo, when there is one.
    scorecard_template: scorecardTemplateOf(j),
    // Salary range, for the recruiter-facing pay check only. Never sent to the AI.
    pay_range: jobPayRange(j),
  };
}

export function scorecardTemplateOf(j) {
  const t = j?.scorecard_template ?? (j?.scorecard_templates ?? []).find((x) => x?.default) ?? j?.scorecard_templates?.[0];
  const attrs = (t?.scorecard_template_attributes ?? []).filter((a) => a?.name?.trim());
  if (!t || !attrs.length) return null;
  return { id: t.id ?? null, name: t.name ?? null, criteria: [...attrs].sort((a, b) => (a.position ?? 0) - (b.position ?? 0)).map((a) => a.name.trim()) };
}

// Status name of a job from Loxo's job list. Field name unconfirmed; fallbacks.
export function jobStatusOf(raw) {
  const j = unwrap(raw, "job");
  const s = first(j.status?.name, j.job_status?.name, j.status_name, typeof j.status === "string" ? j.status : null);
  return s ? String(s) : null;
}

export function isOpenStatus(status) {
  return /\b(open|active)\b/i.test(String(status ?? ""));
}

export function personIdOf(entry) {
  return first(entry?.person_id, entry?.person?.id);
}

function yearMonth(y, m) {
  if (!y) return null;
  return m ? `${y}-${String(m).padStart(2, "0")}` : String(y);
}

// Input limits: enough for a full reading, small enough to keep the bill steady.
// Anything left out is recorded in `trimmed` and shown to the recruiter as a flag.
export const LIMITS = { notes: 30, notesChars: 15000, resumeChars: 40000 };

export function mapCandidate({ entry, person, jobProfiles = [], educationProfiles = [], resumeText = "", resumeTruncated = false, events = [], stageNames = null }) {
  const p = unwrap(person, "person");
  const name = first(p.name, [p.first_name, p.last_name].filter(Boolean).join(" "));
  const location = first(p.location, [p.city, p.state, p.country].filter(Boolean).join(", "));
  const trimmed = [];

  const notes = [];
  const intake = stripHtml(p.description ?? "");
  if (intake) notes.push({ date: null, text: `Intake notes: ${intake}` });
  let chars = intake.length;
  for (const e of events) {
    const text = stripHtml(e.notes ?? "");
    if (!text) continue;
    if (notes.length >= LIMITS.notes || chars + text.length > LIMITS.notesChars) {
      trimmed.push("notes_trimmed");
      break;
    }
    notes.push({ date: first(e.created_at), text });
    chars += text.length;
  }

  let resume = typeof resumeText === "string" ? resumeText : "";
  if (resume.length > LIMITS.resumeChars) {
    resume = resume.slice(0, LIMITS.resumeChars);
    trimmed.push("resume_trimmed");
  }
  if (resumeTruncated) trimmed.push("resume_truncated");

  const history = (jobProfiles.length ? jobProfiles : p.job_profiles ?? []).map((jp) => ({
    title: first(jp.title),
    company: first(jp.company_name, jp.company?.name),
    start: first(jp.start_date, yearMonth(jp.start_year ?? jp.year, jp.start_month ?? jp.month)),
    end: first(jp.end_date, yearMonth(jp.end_year, jp.end_month)),
    summary: stripHtml(jp.description ?? ""),
  }));
  // Loxo keeps no title on the person record (29 Oct 2026): the current role is the
  // work history entry with no end date, else the most recent one.
  const current = history.find((w) => !w.end && (w.title || w.company)) ?? [...history].filter((w) => w.title || w.company).sort((a, b) => String(b.start ?? "").localeCompare(String(a.start ?? "")))[0];
  return {
    id: String(first(p.id, personIdOf(entry))),
    name,
    current_title: first(p.current_title, p.title, current?.title),
    current_company: first(p.current_company, typeof p.company === "string" ? p.company : p.company?.name, p.company_name, current?.company),
    location,
    // Field names cross-checked against tbensonwest/loxo-mcp-server (community code built on the same API):
    // job profiles use month/year and end_month/end_year; the person record may embed job_profiles.
    work_history: history,
    // Degree and school only: graduation years are left out (age proxy).
    education: (educationProfiles.length ? educationProfiles : p.education_profiles ?? []).map((e) => ({ degree: first(e.degree, e.education_type?.name), field: first(e.field_of_study, e.major), institution: first(e.school, e.school_name, e.institution) })).filter((e) => e.degree || e.institution),
    skills: skillList(p.skillsets),
    notes,
    resume_text: resume,
    trimmed,
    loxo: {
      person_id: first(p.id, personIdOf(entry)),
      job_candidate_id: first(entry?.id),
    },
    // For the client report only. Never sent to the AI: toPromptRecord is an allowlist.
    report: {
      stage: stageOf(entry, stageNames),
      compensation: compensationOf(p),
      // Pay sentences from the team's notes, for the recruiter only (src/pay.js).
      pay_notes: payNotesOf([stripHtml(p.description ?? ""), ...events.map((e) => stripHtml(e.notes ?? ""))]),
      linkedin: first(p.linkedin_url, p.linkedin, p.linkedin_profile_url),
    },
  };
}

// Pipeline stage of a candidate on a job. Field names unconfirmed; fallbacks.
// Loxo gives only workflow_stage_id on a pipeline entry (confirmed 29 Oct 2026); the names
// come from GET /workflow_stages, passed in as a Map of id -> name.
export function stageOf(entry, stageNames = null) {
  const st = entry?.workflow_stage ?? entry?.stage ?? null;
  const id = first(entry?.workflow_stage_id, st?.id);
  return {
    id,
    name: first(st?.name, entry?.workflow_stage_name, entry?.stage_name, typeof st === "string" ? st : null, id != null ? stageNames?.get(String(id)) : null),
  };
}

const money = (v) => {
  if (typeof v === "number" && isFinite(v)) return v;
  if (typeof v === "string" && /\d/.test(v)) {
    const n = Number(v.replace(/[^\d.]/g, ""));
    return isFinite(n) && n > 0 ? (/k\b/i.test(v) && n < 10000 ? n * 1000 : n) : null;
  }
  return null;
};

// Base, bonus and equity from the person record. Loxo may hold a number, text or an object.
export function compensationOf(p) {
  const c = p?.compensation && typeof p.compensation === "object" ? p.compensation : {};
  return {
    base: first(money(c.base), money(c.salary), money(p?.salary), typeof p?.compensation !== "object" ? money(p?.compensation) : null),
    bonus: first(c.bonus, p?.bonus),
    equity: first(c.equity, p?.equity),
    target_base: first(money(c.target_base), money(p?.desired_salary), money(p?.target_salary)),
  };
}

// A scorecard written by a person in Loxo (not by Weaver). Field names unconfirmed; fallbacks.
export function mapHumanScorecard(raw) {
  const s = unwrap(raw, "scorecard");
  const attrs = s.scorecard_attributes ?? s.attributes ?? s.scorecard_items ?? [];
  const criteria = attrs.map((a) => ({ label: first(a.name, a.label, a.title), score: Number.isFinite(Number(a.score)) && a.score !== null ? Number(a.score) : null, notes: stripHtml(first(a.notes, a.comment, a.description) ?? "") }))
    .filter((c) => c.label);
  const scored = criteria.filter((c) => c.score !== null);
  return {
    person_id: String(first(s.person_id, s.person?.id) ?? ""),
    author: first(s.external_creator_name, s.created_by?.name, s.user?.name),
    recommendation: first(s.scorecard_recommendation_type?.name, s.recommendation?.name, s.recommendation_name),
    summary: stripHtml(first(s.summary, s.notes) ?? ""),
    criteria,
    average: scored.length ? Math.round((scored.reduce((t, c) => t + c.score, 0) / scored.length) * 10) / 10 : null,
  };
}

function skillList(s) {
  if (Array.isArray(s)) return s.map((x) => x?.name ?? x).filter(Boolean);
  if (typeof s === "string") return s.split(",").map((x) => x.trim()).filter(Boolean);
  return [];
}

// Loxo says whether the extracted resume text was cut short.
export function resumeTruncatedOf(raw) {
  const r = unwrap(raw, "resume");
  return Boolean(r.truncated ?? r.text_truncated ?? r.is_truncated ?? false);
}

// Pulls the extracted text out of a resumes_show response.
export function resumeTextOf(raw) {
  const r = unwrap(raw, "resume");
  const known = first(r.text, r.extracted_text, r.resume_text, r.content, r.body);
  if (typeof known === "string") return known;
  // Fallback: the longest string field is almost certainly the text.
  return Object.values(r).filter((v) => typeof v === "string").sort((a, b) => b.length - a.length)[0] ?? "";
}
