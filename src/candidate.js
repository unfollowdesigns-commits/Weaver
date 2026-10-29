// Builds the version of a candidate that is sent to the model.
// Allowlist: only job-related fields go out. Name, contact details, compensation,
// photos and dates of birth never leave this function.

const EMAIL = /[\w.+-]{1,64}@[\w-]{1,63}(\.[\w-]{1,63})+/g;
const PHONE = /(\+?\d[\d\s().-]{7,}\d)/g;
// Links with or without a scheme (a resume often starts "linkedin.com/in/<name>").
const URL = /\bhttps?:\/\/\S+|\bwww\.\S+|\b(?:linkedin|github)\b\s*:?\s*\S*|(?<=^|\s)\/?in\/\S+|(?<=^|\s)@\w{3,}/gi;

// Pay must not reach the model (29 Oct 2026: recruiter notes and the job description carried
// base, bonus and salary range). Rules set by three independent reviews (30 Oct 2026):
// 1. A pay word (salary, bonus, OTE, comp, target cash, TC + number) means pay, unless it is
//    pay as a work topic ("bonus plan", "compensation benchmarking", "raised salaries by 5%")
//    with no pay figure in the sentence.
// 2. A pay figure ("250K+", "$180-200K", "low 200s", "1.5MM", "240" after "currently", "base",
//    "wants", "floor is", "north of"...) means pay. A figure directly followed by a noun is a
//    count ("100k followers", "120 people", "500K lines"), not pay; when a sentence has one,
//    its other figures need a pay cue too ("from 50k to 400k visits").
// 3. Without a cue, a pay figure in a sentence about the business (revenue, savings, budget,
//    debt, ARR...) is evidence and stays. A cue wins over business words ("wants 250k but the
//    client budget tops out at 230k" is pay).
// 4. A full amount ("250,000", "$1.2M") is pay only next to a pay verb and not about the business.
const PAY_WORD = /\b(salary|salaries|compensation|OTE|bonus(es)?|RSUs?|stock options?|pay (range|rate|band)|hourly rate|total package|desired pay|current pay|wages?|total comp|all[- ]in|target cash|comp)\b/i;
const PAY_TOPIC = /\b(salary|salaries|compensation|bonus(es)?|comp|pay|wages?|incentive)\s+(plans?|programs?|structures?|benchmarking|philosoph(y|ies)|polic(y|ies)|strateg(y|ies)|committee|design|bands|reviews?|administration|surveys?|accruals?|expense)\b|\b(raised|cut|froze|frozen|reduced|increased|benchmarked|redesigned)\s+(base\s+)?(salaries|wages|pay|bonuses|compensation)\b|\b(salaries|wages|pay|bonuses)\s+by\s+\d+(\.\d+)?\s?%/i;
const TC_NUMBER = /\bTC\b\s*(of\s*)?[:=]?\s*\$?\d/i;
const BUSINESS = /\b(business|company|companies|firm|settlement|org|organization|budgets?|revenues?|ARR|MRR|savings|saved|saving|costs?|raised?|raises|rounds?|funding|sales|deals?|contracts?|valuations?|EBITDA|portfolios?|loans?|facility|acquisitions?|AUM|spend|capex|opex|P&L|profits?|margins?|bookings|pipeline|invoices|transactions|run[- ]rate|GMV|AR|AP|debt|notes|interest|taxes|dividends|paid down|repaid|sq ft|square feet)\b/i;
// Person cues are about the candidate's own pay: they win over business words.
const CUE_PERSON = /(\b(wants|wanting|currently|current|making|earning|earns|paid|pays|move for|move at|north of|south of|floor( is)?|would take|will take|needs|need|asking( for)?|sits at|is at|now at|base( of| is| at)?|at least|doing|w-?2( was| of)?|in the)|'s at|^\s*at)\s*:?\s*(\w+\s+){0,2}$/i;
// Soft cues ("targeting 500K in savings") count only when the sentence is not about the business.
const CUE_SOFT = /\b(expect\w*|looking for|targeting|range)\s*:?\s*(\w+\s+){0,2}$/i;
const CUE_AFTER = /^\s*([kK]?\s*(base|variable|all[- ]in|ote|bonus|plus|total|to move|guaranteed|range)\b|\+|\/\s*\d{2,3}\b)/i;
// Words that may follow a pay figure without making it a count.
const AFTER_OK = /^(base|salary|plus|with|and|or|total|all|target|bonus|range|to|per|a|an|the|today|now|currently|including|incl|guaranteed|variable|ote|cash|depending|but|if|max|min|minimum|maximum|floor|ceiling|year|yr|annually|annual|on|in|at|for|before|after|last|this|next|prior|previous|k)$/i;
const FIGURE = /\$?\d{2,3}\s?-\s?\$?\d{2,3}\s?[kK]\b\+?|\$?\d{2,3}(\.\d)?\s?[kK]\b\+?|\$?\d+(\.\d+)?\s?MM\b|\b(low|mid|high)[- ]\d{3}s\b|\b(one|two|three|four|five|six|seven|eight|nine) hundred( and \w+)? thousand\b|\$?\b\d{2,3}\b(?![,.]\d)/gi;
const PAY_VERB = /\b(earns?|earning|making|wants|asking|currently at|package|paid|pays|base salary)\b|\bbase\s*(of|is|at|[:=])?\s*\$?\d/i;
const FULL_AMOUNT = /\$\s?\d{1,3}(,\d{3})+|\b\d{1,3}(,\d{3}){1,2}\b|\$?\d+(\.\d+)?\s?[mM]\b/;
const EQUITY = /\bequity\b/i;
const NOT_PAY_EQUITY = /\b(private equity|growth equity|equity[- ]backed|equity firm|equity partners|equity research|equity investment|equity raise|raise|round|funding)\b/i;

function payFigures(s) {
  const out = [];
  for (const m of s.matchAll(FIGURE)) {
    const before = s.slice(Math.max(0, m.index - 40), m.index);
    // Look past the second half of a range ("200-500 person") before reading the next word.
    const after = s.slice(m.index + m[0].length).replace(/^\s?-\s?\$?\d+(\.\d+)?[kKmM]?\b/, "");
    if (/^\s*(%|percent\b|pct\b)/i.test(after)) continue; // a percentage, not an amount
    const next = /^\+?\s+([A-Za-z][\w-]*)/.exec(after)?.[1] ?? null;
    const count = next !== null && next.length >= 2 && !AFTER_OK.test(next);
    const bare = /^\$?\d{2,3}$/.test(m[0].trim());
    const person = CUE_PERSON.test(before) || CUE_AFTER.test(after);
    const soft = !person && CUE_SOFT.test(before);
    if (bare && !person && !soft) continue; // a plain 2-3 digit number is only pay with a cue
    out.push({ count, person, soft });
  }
  return out;
}

export function isAboutPay(sentence) {
  const s = String(sentence ?? "").replace(/\b40[13]\s?\(?[kKbB]\)?/g, "");
  const figures = payFigures(s);
  const anyCount = figures.some((f) => f.count);
  const business = BUSINESS.test(s);
  const pay = figures.filter((f) => !f.count && (f.person || f.soft || !anyCount));
  if (PAY_WORD.test(s) && !(PAY_TOPIC.test(s) && !pay.length)) return true;
  if (TC_NUMBER.test(s)) return true;
  if (pay.some((f) => f.person)) return true;
  if (pay.some((f) => f.soft) && !business) return true;
  if (pay.length && !business) return true;
  if (PAY_VERB.test(s) && FULL_AMOUNT.test(s) && !business && !anyCount) return true;
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
const TEAM_SCORE = /\b[1-5](\.\d)?\s?(\/|out of)\s?5\b|\b[1-5](\.\d)?\s+of\s+5\b(?!\s*[A-Za-z])|\b(screen|scorecard|overall|average)\s+(score|rating)\b|\bscored\s+(a\s+)?[1-5](\.\d)?\b|\brated\s+(a\s+)?[1-5](\.\d)?\b|\brecommend(ation|ed)?\b\s*:?\s*(strong\s+)?(yes|no)\b|\b(overall|team|screen|our read|panel)\b\s*:?\s*([1-5]\.\d\b|strong\s+(yes|no)\b)|\b(avg|average)\b\s*:?\s*[1-5]\.\d\b|\b[1-5]\.\d\s*(avg|average)\b|\bstrong\s+(yes|no)\b|\b(rated|gave|scored)\s+(him|her|them)\s+(a\s+)?[1-5]\b/i;

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
const COMMON = new Set(("young grant mark price will chase rose may june april august hope faith grace joy dean case bell king page hill wood field rich lane long short brown white black green gray grey little small strong wise moore more hall ward cook baker carter turner walker hunter fisher mason miller taylor banks bank rivers ford bush stone lake marsh forest frank ernest earnest sterling golden silver major bishop pope knight guy bill bob pat sue ray art gene don rod rob rocky sandy summer winter spring autumn dawn eve star sky storm reed bond cash gold power powers best good love hart heart swift quick bright fair noble wolf fox bird crane drake hawk lamb lion bear max early late new west east north south street price chase sharp hardy major story park parks rich ross jordan austin lincoln washington charles house church cross field glass hope virginia morgan wells madison stanley marshall bain carolina georgia dallas houston phoenix denver jackson kennedy").split(" "));
const TITLE = /^(mr|mrs|ms|dr|prof|mx)$/;
const fold = (t) => String(t ?? "").normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[’‘`]/g, "'").toLowerCase();
const isCap = (w) => /^\p{Lu}/u.test(w);

// protect: the candidate's own employers, schools and location ("Wells Fargo" for someone named
// Wells, "University of Virginia" for Virginia Hale). Kept whole, unless the phrase holds two
// or more parts of the name: then it is their own firm ("Jane Roe Consulting") and is scrubbed.
export function scrubName(text, name, protect = []) {
  if (typeof text !== "string" || !text || !name) return text ?? "";
  const raw = String(name).split(/[\s,.()]+/).filter((w) => w && !CREDENTIAL.test(w) && !PARTICLE.test(fold(w)));
  const parts = new Set();
  for (const w of raw) {
    const f = fold(w);
    if (f.replace(/[^a-z]/g, "").length > 1) parts.add(f.replace(/[^a-z]/g, ""));
    for (const p of f.split(/[-']/)) if (p.length > 1 && !PARTICLE.test(p)) parts.add(p);
  }
  if (!parts.size) return text;
  // Possessives count as the name: "Roe's", "Roe’s", "Roes'".
  const bare = (tok) => fold(tok).replace(/'s$|'$/, "");
  const key = (tok) => bare(tok).replace(/[^a-z]/g, "");
  const isPart = (tok) => {
    if (parts.has(key(tok))) return true;
    const sub = bare(tok).split(/[-']/).filter(Boolean);
    // Every piece is a name part or a particle, and at least one is a real name part.
    return sub.some((p) => parts.has(p)) && sub.every((p) => parts.has(p) || PARTICLE.test(p));
  };
  // Mask the protected phrases (only those holding at most one part of the name).
  const masks = [];
  let work = text;
  for (const phrase of [...new Set(protect.filter((x) => typeof x === "string" && x.trim().length > 2))].sort((a, b) => b.length - a.length)) {
    // Protected only when every name part in it is an everyday word ("Wells Fargo" for
    // Morgan Wells): a firm named after the candidate ("Roe Advisory") is scrubbed.
    const inPhrase = String(phrase).split(/[^\p{L}'’-]+/u).map(key).filter((k) => parts.has(k));
    if (new Set(inPhrase).size > 1 || inPhrase.some((k) => !COMMON.has(k))) continue;
    const re = new RegExp(phrase.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+"), "gi");
    work = work.replace(re, (m) => { masks.push(m); return `\u0001${masks.length - 1}\u0002`; });
  }
  text = work;
  const tokens = [...text.matchAll(/[\p{L}][\p{L}'’\-]*/gu)];
  const hits = new Set();
  tokens.forEach((m, i) => {
    const tok = m[0];
    if (!isCap(tok) || !isPart(tok)) return;
    const neighbor = (j) => tokens[j] && isCap(tokens[j][0]) && isPart(tokens[j][0]) && /^\s*-?\s*$/.test(text.slice(tokens[Math.min(i, j)].index + tokens[Math.min(i, j)][0].length, tokens[Math.max(i, j)].index));
    const pieces = bare(tok).split(/[-']/).filter(Boolean);
    // Two name parts joined in one word ("Mark-Young") is the name, even if both are everyday words.
    const joined = new Set(pieces.filter((p) => parts.has(p))).size >= 2;
    const everyday = !joined && pieces.every((p) => COMMON.has(p));
    // "Mr. Lake" or "Dr. Wells": a title right before counts as another part of the name.
    const titled = i > 0 && TITLE.test(fold(tokens[i - 1][0])) && text.slice(tokens[i - 1].index + tokens[i - 1][0].length, m.index).trim().length <= 1;
    if (!everyday || titled || neighbor(i - 1) || neighbor(i + 1)) hits.add(i);
  });
  let out = "";
  let last = 0;
  tokens.forEach((m, i) => {
    if (!hits.has(i)) return;
    out += text.slice(last, m.index) + "[name]";
    last = m.index + m[0].length;
  });
  return (out + text.slice(last)).replace(/\u0001(\d+)\u0002/g, (_, i) => masks[Number(i)]);
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
  // The candidate's own employers, schools and location, kept whole when they hold a name part.
  const protect = [candidate.current_company, candidate.location, ...(candidate.work_history ?? []).map((w) => w.company), ...(candidate.education ?? []).map((e) => e.institution)];
  const nameOnly = (t) => (t == null ? null : scrubName(String(t), candidate.name, protect));
  const scrubAll = (t) => scrubName(scrubScores(scrubPay(scrubText(t))), candidate.name, protect);
  return {
    candidate_ref: String(candidate.id),
    current_title: nameOnly(candidate.current_title),
    current_company: nameOnly(candidate.current_company),
    location: candidate.location ?? null,
    work_history: (candidate.work_history ?? []).map((r) => ({
      title: nameOnly(r.title),
      company: nameOnly(r.company),
      start: r.start ?? null,
      end: r.end ?? null,
      summary: scrubAll(r.summary ?? ""),
    })),
    // Degrees without dates: graduation years are a proxy for age.
    education: (candidate.education ?? []).map((e) => ({
      degree: e.degree ?? null,
      field: e.field ?? null,
      institution: nameOnly(e.institution),
    })),
    skills: candidate.skills ?? [],
    notes: (candidate.notes ?? []).filter((n) => !OWN_NOTE.test(n.text ?? "")).map((n) => ({ date: n.date ?? null, text: scrubAll(n.text ?? "") })),
    resume_text: scrubAll(scrubGradYears(candidate.resume_text ?? "")),
  };
}
