import { isAboutPay } from "./candidate.js";

// Pay, for the recruiter only. The firm wants pay in front of the team, as in its own
// reports, but the AI never sees it and it never enters the score. Everything here is
// plain fact taken from Loxo: the pay fields when filled, otherwise the pay sentences the
// team wrote in its notes (where it lived on the real account, 29 Oct 2026).

const toNumber = (v) => {
  if (typeof v === "number" && isFinite(v) && v > 0) return v;
  if (typeof v !== "string") return null;
  const m = /\$?\s?(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s?([kK])?/.exec(v);
  if (!m) return null;
  let n = Number(m[1].replace(/,/g, ""));
  if (m[2] || n < 1000) n *= 1000;
  return n >= 20000 && n <= 5000000 ? n : null;
};

// The search's salary range, from the Loxo job.
export function jobPayRange(rawJob) {
  const j = rawJob?.job ?? rawJob ?? {};
  const min = toNumber(j.salary_min);
  const max = toNumber(j.salary_max);
  const text = typeof j.salary === "string" && j.salary.trim() ? j.salary.trim() : null;
  return min || max || text ? { min, max, text } : null;
}

// Sentences about pay from the notes, newest first, as written by the team.
export function payNotesOf(texts, limit = 4) {
  const out = [];
  for (const t of texts) {
    for (const s of String(t ?? "").split(/(?<=[.!?;])\s+|\n/)) {
      const line = s.trim();
      if (line && isAboutPay(line) && !out.includes(line)) out.push(line.length > 220 ? `${line.slice(0, 217)}...` : line);
      if (out.length >= limit) return out;
    }
  }
  return out;
}

// A base salary written in a note, e.g. "$225k base" or "base of 225,000".
export function baseFromNotes(lines) {
  for (const l of lines) {
    const m = /(\$?\s?\d{2,3}(?:,\d{3})?\s?[kK]?)\s*(?:base|salary)/i.exec(l) ?? /(?:base|salary)[^.\d$]{0,20}(\$?\s?\d{2,3}(?:,\d{3})?\s?[kK]?)/i.exec(l);
    const n = m ? toNumber(m[1]) : null;
    if (n) return n;
  }
  return null;
}

const k = (n) => `$${Math.round(n / 1000)}k`;

// Above, within or below the search's range, from the base on file or in the notes.
export function payCheck(base, range) {
  if (!base) return { kind: "unknown", label: "Pay not on file" };
  if (!range || (!range.min && !range.max)) return { kind: "norange", label: `Base ${k(base)}; no range on the search` };
  if (range.max && base > range.max) return { kind: "above", label: `Above range by about ${k(base - range.max)}` };
  if (range.min && base < range.min) return { kind: "below", label: `Below range by about ${k(range.min - base)}` };
  return { kind: "within", label: "Within range" };
}

export function payFor(candidate, range) {
  const comp = candidate?.report?.compensation ?? {};
  const notes = candidate?.report?.pay_notes ?? [];
  const fromNotes = comp.base ? null : baseFromNotes(notes);
  const base = comp.base ?? fromNotes;
  return {
    base,
    base_source: comp.base ? "Loxo" : fromNotes ? "notes" : null,
    bonus: comp.bonus ?? null,
    equity: comp.equity ?? null,
    notes,
    range,
    check: payCheck(base, range),
  };
}

export const formatK = k;
