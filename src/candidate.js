// Builds the version of a candidate that is sent to the model.
// Allowlist: only job-related fields go out. Name, contact details, compensation,
// photos and dates of birth never leave this function.

const EMAIL = /[\w.+-]+@[\w-]+(\.[\w-]+)+/g;
const PHONE = /(\+?\d[\d\s().-]{7,}\d)/g;
const URL = /https?:\/\/\S+/g;

export function scrubText(text) {
  if (typeof text !== "string") return "";
  return text
    .replace(EMAIL, "[email removed]")
    .replace(URL, "[link removed]")
    // 9+ digits so date ranges like "2019 - 2023" are left alone.
    .replace(PHONE, (m) => (m.replace(/\D/g, "").length >= 9 ? "[phone removed]" : m));
}

export function toPromptRecord(candidate) {
  return {
    candidate_ref: String(candidate.id),
    current_title: candidate.current_title ?? null,
    current_company: candidate.current_company ?? null,
    location: candidate.location ?? null,
    work_history: (candidate.work_history ?? []).map((r) => ({
      title: r.title ?? null,
      company: r.company ?? null,
      start: r.start ?? null,
      end: r.end ?? null,
      summary: scrubText(r.summary ?? ""),
    })),
    // Degrees without dates: graduation years are a proxy for age.
    education: (candidate.education ?? []).map((e) => ({
      degree: e.degree ?? null,
      field: e.field ?? null,
      institution: e.institution ?? null,
    })),
    skills: candidate.skills ?? [],
    notes: (candidate.notes ?? []).map((n) => ({ date: n.date ?? null, text: scrubText(n.text ?? "") })),
    resume_text: scrubText(candidate.resume_text ?? ""),
  };
}
