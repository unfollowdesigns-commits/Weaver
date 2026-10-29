// Builds the version of a candidate that is sent to the model.
// Allowlist: only job-related fields go out. Name, contact details, compensation,
// photos and dates of birth never leave this function.

const EMAIL = /[\w.+-]+@[\w-]+(\.[\w-]+)+/g;
const PHONE = /(\+?\d[\d\s().-]{7,}\d)/g;
const URL = /https?:\/\/\S+/g;

// Pay must not reach the model (29 Oct 2026: recruiter notes and the job description
// carried base, bonus and salary range). Any sentence about pay is replaced as a whole.
const PAY_WORDS = /\b(salary|salaries|compensation|comp|OTE|bonus(es)?|RSUs?|stock options?|pay (range|rate|band)|hourly rate|total package|desired pay|current pay|wage|wages)\b/i;
const K_AMOUNT = /\$?\s?\d{2,3}(\.\d)?\s?[kK]\b/;
const BASE_WITH_MONEY = /\bbase\b[^.\n]{0,40}(\$|\d{2,3}\s?[kK]\b)|(\$|\d{2,3}\s?[kK]\b)[^.\n]{0,40}\bbase\b/i;
const EQUITY_PAY = /\bequity\b/i;
const NOT_PAY_EQUITY = /\b(private equity|equity[- ]backed|equity firm|equity partners|equity research|equity investment)/i;

export function isAboutPay(sentence) {
  return PAY_WORDS.test(sentence) || K_AMOUNT.test(sentence) || BASE_WITH_MONEY.test(sentence)
    || (EQUITY_PAY.test(sentence) && !NOT_PAY_EQUITY.test(sentence) && /\$|%|\d/.test(sentence));
}

export function scrubPay(text) {
  if (typeof text !== "string" || !text) return "";
  return text
    .split(/(?<=[.!?;])\s+|\n/)
    .map((s) => (isAboutPay(s) ? "[pay detail removed]" : s))
    .join(" ")
    .replace(/(\[pay detail removed\]\s*)+/g, "[pay detail removed] ")
    .trim();
}

// The team's own scores must not reach the model either, or Weaver could echo them back
// (30 Oct 2026 review: a first read matched the team's screen score exactly). Sentences
// with a score out of five, or about a screen or scorecard score, are removed.
const TEAM_SCORE = /\b[1-5](\.\d)?\s?(\/|out of)\s?5\b|\b(screen|scorecard|overall|average)\s+(score|rating)\b|\bscored\s+(a\s+)?[1-5](\.\d)?\b|\brated\s+(a\s+)?[1-5](\.\d)?\b/i;

export function scrubScores(text) {
  if (typeof text !== "string" || !text) return "";
  return text
    .split(/(?<=[.!?;])\s+|\n/)
    .map((s) => (TEAM_SCORE.test(s) ? "[score removed]" : s))
    .join(" ")
    .replace(/(\[score removed\]\s*)+/g, "[score removed] ")
    .trim();
}

export function scrubText(text) {
  if (typeof text !== "string") return "";
  return text
    .replace(EMAIL, "[email removed]")
    .replace(URL, "[link removed]")
    // 9+ digits so date ranges like "2019 - 2023" are left alone.
    .replace(PHONE, (m) => (m.replace(/\D/g, "").length >= 9 ? "[phone removed]" : m));
}

const scrubAll = (t) => scrubScores(scrubPay(scrubText(t)));

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
      summary: scrubAll(r.summary ?? ""),
    })),
    // Degrees without dates: graduation years are a proxy for age.
    education: (candidate.education ?? []).map((e) => ({
      degree: e.degree ?? null,
      field: e.field ?? null,
      institution: e.institution ?? null,
    })),
    skills: candidate.skills ?? [],
    notes: (candidate.notes ?? []).map((n) => ({ date: n.date ?? null, text: scrubAll(n.text ?? "") })),
    resume_text: scrubAll(candidate.resume_text ?? ""),
  };
}
