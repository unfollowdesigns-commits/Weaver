// Builds the version of a candidate that is sent to the model.
// Allowlist: only job-related fields go out. Name, contact details, compensation,
// photos and dates of birth never leave this function.

const EMAIL = /[\w.+-]+@[\w-]+(\.[\w-]+)+/g;
const PHONE = /(\+?\d[\d\s().-]{7,}\d)/g;
// Links with or without a scheme (a resume often starts "linkedin.com/in/<name>").
const URL = /\bhttps?:\/\/\S+|\bwww\.\S+|\blinkedin\.com\/\S*/gi;

// Pay must not reach the model (29 Oct 2026: recruiter notes and the job description carried
// base, bonus and salary range). A sentence is about pay when it has a pay word, or a pay
// context with an amount. Business figures (savings, raises, rounds, revenue) are evidence
// and stay (30 Oct 2026 review: "$40M growth equity raise" and "cut costs by $500K" were
// being removed from finance resumes).
const PAY_STRONG = /\b(salary|salaries|compensation(?!\s+committee)|OTE|bonus(es)?|RSUs?|stock options?|pay (range|rate|band)|hourly rate|total package|desired pay|current pay|wages?|total comp|all[- ]in)\b|\bcomp\b(?!\s+committee)|\bTC\b/i;
const TC_UPPER = /\bTC\b/;
const PAY_CONTEXT = /\b(base|earns?|earning|wants|asking|currently at|package)\b|\bmaking\s+(about\s+|around\s+)?\$?\d/i;
const AMOUNT = /\$?\s?\d{2,3}(\.\d)?\s?[kK]\b|\$\s?\d{1,3}(,\d{3})+|\b\d{1,3}(,\d{3}){1,2}\b|\$?\d+(\.\d+)?\s?[mM]\b/;
const BASE_NUMBER = /\bbase\s*[:=]?\s*\$?\s?\d{2,3}\b/i;
const EQUITY = /\bequity\b/i;
const NOT_PAY_EQUITY = /\b(private equity|growth equity|equity[- ]backed|equity firm|equity partners|equity research|equity investment|equity raise|raise|round|funding)\b/i;

export function isAboutPay(sentence) {
  const s = String(sentence ?? "");
  const strong = PAY_STRONG.test(s) && (!/\bTC\b/i.test(s) || TC_UPPER.test(s) || /\b(salary|compensation|bonus|comp)\b/i.test(s));
  return strong || (PAY_CONTEXT.test(s) && AMOUNT.test(s)) || BASE_NUMBER.test(s)
    || (EQUITY.test(s) && !NOT_PAY_EQUITY.test(s) && /\$|%/.test(s));
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

// The team's own scores and recommendations must not reach the model either, or Weaver
// could echo them back (30 Oct 2026 review: a first read matched the team's 4.1 exactly).
const TEAM_SCORE = /\b[1-5](\.\d)?\s?(\/|out of)\s?5\b|\b(screen|scorecard|overall|average)\s+(score|rating)\b|\bscored\s+(a\s+)?[1-5](\.\d)?\b|\brated\s+(a\s+)?[1-5](\.\d)?\b|\brecommend(ation|ed)?\b\s*:?\s*(strong\s+)?(yes|no)\b/i;

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

// The candidate's own name, as written in the resume and notes (almost every resume starts
// with it). Credentials after the name (CPA, MBA) are kept.
const CREDENTIAL = /^(CPA|CFA|CMA|MBA|PMP|CFE|CIA|CISA|PE|PHD|JD|ESQ|SPHR|PHR|CSCP|CPIM|CPM|CPE|CPMM|MCR|MEM|CDCP|AIA|FMP|CSSGB|ARM|CHFP|JR|SR|II|III|IV)$/i;
export function scrubName(text, name) {
  if (typeof text !== "string" || !text || !name) return text ?? "";
  const words = String(name).split(/[\s,.()]+/).filter((w) => w.length > 1 && !CREDENTIAL.test(w));
  let out = text;
  for (const w of words) {
    const esc = w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const title = w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    // Capitalized or upper-case forms only, so ordinary lower-case words survive.
    out = out.replace(new RegExp(`(?<![\\p{L}])(${esc}|${title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}|${w.toUpperCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})(?![\\p{L}])`, "gu"), "[name]");
  }
  return out;
}

// Graduation years are an age proxy: blanked on resume lines about degrees or schools.
const DEGREE_LINE = /\b(MBA|M\.?B\.?A|B\.?A\.?|B\.?S\.?|BSc|MSc|Bachelor|Master|Ph\.?D|Doctorate|University|College|School|Graduated|Class of)\b/i;
export function scrubGradYears(text) {
  if (typeof text !== "string" || !text) return text ?? "";
  return text.split("\n").map((l) => (DEGREE_LINE.test(l) ? l.replace(/\b(19[4-9]\d|20[0-4]\d)\b/g, "[year]") : l)).join("\n");
}

// Weaver's own notes (written back to Loxo when notes are the target) are not evidence.
const OWN_NOTE = /AI first read, awaiting recruiter review|AI assessment, awaiting recruiter review|Candidate scoring \(AI/;

export function toPromptRecord(candidate) {
  const scrubAll = (t) => scrubName(scrubScores(scrubPay(scrubText(t))), candidate.name);
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
    notes: (candidate.notes ?? []).filter((n) => !OWN_NOTE.test(n.text ?? "")).map((n) => ({ date: n.date ?? null, text: scrubAll(n.text ?? "") })),
    resume_text: scrubAll(scrubGradYears(candidate.resume_text ?? "")),
  };
}
