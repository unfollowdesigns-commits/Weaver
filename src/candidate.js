// Builds the version of a candidate that is sent to the model.
// Allowlist: only job-related fields go out. Name, contact details, compensation,
// photos and dates of birth never leave this function.

const EMAIL = /[\w.+-]+@[\w-]+(\.[\w-]+)+/g;
const PHONE = /(\+?\d[\d\s().-]{7,}\d)/g;
// Links with or without a scheme (a resume often starts "linkedin.com/in/<name>").
const URL = /\bhttps?:\/\/\S+|\bwww\.\S+|\b(?:linkedin|github)\b\S*|(?<=^|\s)\/in\/\S+/gi;

// Pay must not reach the model (29 Oct 2026: recruiter notes and the job description carried
// base, bonus and salary range). Two independent reviews (30 Oct 2026) set the rules:
// - a pay word (salary, bonus, OTE, comp, target cash...) always means pay;
// - a pay-sized figure ("250K+", "$180-200K", "low 200s", "1.5MM", "is at 275k") means pay
//   unless the sentence is about the business (revenue, savings, budget, raise, ARR...);
// - a full amount ("250,000", "$1.2M") means pay only next to a pay verb (earns, base, wants).
// Business figures stay: they are the evidence a finance leader is judged on.
const PAY_STRONG = /\b(salary|salaries|compensation(?!\s+committee)|OTE|bonus(es)?|RSUs?|stock options?|pay (range|rate|band)|hourly rate|total package|desired pay|current pay|wages?|total comp|all[- ]in|target cash)\b|\bcomp\b(?!\s+committee)/i;
const TC = /\bTC\b\s*(of\s*)?[:=]?\s*\$?\d/;
const BUSINESS = /\b(budgets?|revenues?|ARR|MRR|savings|saved|saving|costs?|raised?|raises|rounds?|funding|sales|deals?|contracts?|valuations?|EBITDA|portfolios?|loans?|facility|acquisitions?|AUM|spend|capex|opex|P&L|profits?|margins?|bookings|pipeline|invoices|transactions|users|customers|clients|employees|records|units|accounts|orders|entries|SKUs|items|members|subscribers|patients|square feet|sq ft|hours|headcount|run[- ]rate|GMV|AR|AP)\b/i;
const PAY_SIZED = /\$?\d{2,3}(\.\d)?\s?[kK]\b\+?|\$?\d{2,3}\s?-\s?\$?\d{2,3}\s?[kK]\b|\d+(\.\d+)?\s?MM\b|\b(low|mid|high)[- ]\d{3}s\b|\b(one|two|three|four|five|six|seven|eight|nine) hundred( and \w+)? thousand\b|\b(sits|is|currently|now) at\s+\$?\d{2,3}\b|\b(looking for|targeting|asking( for)?|wants|wanting|needs)\s+\$?\d{2,3}\b|\bbase\s*(of|is|at|[:=])?\s*\$?\s?\d{2,3}\b/i;
const PAY_VERB = /\b(base|earns?|earning|making|wants|asking|currently at|package|paid|pays)\b/i;
const FULL_AMOUNT = /\$\s?\d{1,3}(,\d{3})+|\b\d{1,3}(,\d{3}){1,2}\b|\$?\d+(\.\d+)?\s?[mM]\b/;
const EQUITY = /\bequity\b/i;
const NOT_PAY_EQUITY = /\b(private equity|growth equity|equity[- ]backed|equity firm|equity partners|equity research|equity investment|equity raise|raise|round|funding)\b/i;

export function isAboutPay(sentence) {
  const s = String(sentence ?? "");
  if (PAY_STRONG.test(s) || TC.test(s)) return true;
  const business = BUSINESS.test(s);
  if (PAY_SIZED.test(s) && !business) return true;
  if (PAY_VERB.test(s) && FULL_AMOUNT.test(s) && !business) return true;
  return EQUITY.test(s) && !NOT_PAY_EQUITY.test(s) && /\$|%/.test(s) && !business;
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
const TEAM_SCORE = /\b[1-5](\.\d)?\s?(\/|out of)\s?5\b|\b[1-5](\.\d)?\s+of\s+5\b(?!\s*[A-Za-z])|\b(screen|scorecard|overall|average)\s+(score|rating)\b|\bscored\s+(a\s+)?[1-5](\.\d)?\b|\brated\s+(a\s+)?[1-5](\.\d)?\b|\brecommend(ation|ed)?\b\s*:?\s*(strong\s+)?(yes|no)\b/i;

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
// with it). Rules from two reviews (30 Oct 2026):
// - compared with accents, apostrophes and case folded, so "jane mcdonald" in Loxo still
//   catches "McDonald", and "José García" catches "Jose Garcia";
// - hyphenated and apostrophe names are matched whole and in parts ("Roe-Smith", "Roe", "Smith");
// - only capitalized words are replaced, so ordinary words stay;
// - name parts that are also everyday words (Young, Grant, Mark, Chase...) are replaced only
//   next to another part of the name, so "Ernst & Young" or "Mark the date" stay;
// - particles (de, la, van) and titles (Dr, Ms) are never replaced on their own.
const CREDENTIAL = /^(CPA|CFA|CMA|MBA|PMP|CFE|CIA|CISA|PE|PHD|JD|ESQ|SPHR|PHR|CSCP|CPIM|CPM|CPE|CPMM|MCR|MEM|CDCP|AIA|FMP|CSSGB|ARM|CHFP|JR|SR|II|III|IV)$/i;
const PARTICLE = /^(de|la|le|del|della|der|den|van|von|da|di|du|dos|das|st|mr|mrs|ms|dr|prof|mx)$/i;
const COMMON = new Set(("young grant mark price will chase rose may june april august hope faith grace joy dean case bell king page hill wood field rich lane long short brown white black green gray grey little small strong wise moore more hall ward cook baker carter turner walker hunter fisher mason miller taylor banks bank rivers ford bush stone lake marsh forest frank ernest earnest sterling golden silver major bishop pope knight guy bill bob pat sue ray art gene don rod rob rocky sandy summer winter spring autumn dawn eve star sky storm reed bond cash gold power powers best good love hart heart swift quick bright fair noble wolf fox bird crane drake hawk lamb lion bear max early late new west east north south street price chase sharp hardy major story park parks rich ross jordan austin lincoln washington charles house church cross field glass hope").split(" "));
const fold = (t) => String(t ?? "").normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[’‘`]/g, "'").toLowerCase();
const isCap = (w) => /^\p{Lu}/u.test(w);

export function scrubName(text, name) {
  if (typeof text !== "string" || !text || !name) return text ?? "";
  const raw = String(name).split(/[\s,.()]+/).filter((w) => w && !CREDENTIAL.test(w) && !PARTICLE.test(fold(w)));
  const parts = new Set();
  for (const w of raw) {
    const f = fold(w);
    if (f.replace(/[^a-z]/g, "").length > 1) parts.add(f.replace(/[^a-z]/g, ""));
    for (const p of f.split(/[-']/)) if (p.length > 1 && !PARTICLE.test(p)) parts.add(p);
  }
  if (!parts.size) return text;
  const key = (tok) => fold(tok).replace(/[^a-z]/g, "");
  const isPart = (tok) => {
    if (parts.has(key(tok))) return true;
    const sub = fold(tok).split(/[-']/).filter(Boolean);
    // Every piece is a name part or a particle, and at least one is a real name part.
    return sub.some((p) => parts.has(p)) && sub.every((p) => parts.has(p) || PARTICLE.test(p));
  };
  const tokens = [...text.matchAll(/[\p{L}][\p{L}'’\-]*/gu)];
  const hits = new Set();
  tokens.forEach((m, i) => {
    const tok = m[0];
    if (!isCap(tok) || !isPart(tok)) return;
    const neighbor = (j) => tokens[j] && isCap(tokens[j][0]) && isPart(tokens[j][0]) && text.slice(tokens[Math.min(i, j)].index + tokens[Math.min(i, j)][0].length, tokens[Math.max(i, j)].index).trim().length <= 1;
    const everyday = fold(tok).split(/[-']/).every((p) => COMMON.has(p));
    if (!everyday || neighbor(i - 1) || neighbor(i + 1)) hits.add(i);
  });
  let out = "";
  let last = 0;
  tokens.forEach((m, i) => {
    if (!hits.has(i)) return;
    out += text.slice(last, m.index) + "[name]";
    last = m.index + m[0].length;
  });
  return out + text.slice(last);
}

// Graduation years are an age proxy: blanked on resume lines about degrees or schools.
const DEGREE_LINE = /\b(MBA|M\.?B\.?A|B\.?A\.?|B\.?S\.?|BSc|MSc|Bachelor|Master|Ph\.?D|Doctorate|University|College|School|Graduated|Class of)\b/i;
export function scrubGradYears(text) {
  if (typeof text !== "string" || !text) return text ?? "";
  const lines = text.split("\n");
  const blank = (l) => l.replace(/\b(19[4-9]\d|20[0-4]\d)\b/g, "[year]");
  // The degree line, and the line right after it when the year sits on its own line.
  return lines.map((l, i) => (DEGREE_LINE.test(l) || (i > 0 && DEGREE_LINE.test(lines[i - 1]) && l.trim().length <= 25) ? blank(l) : l)).join("\n");
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
