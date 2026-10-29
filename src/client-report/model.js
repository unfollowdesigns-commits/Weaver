import fs from "node:fs";

// Builds the content of a client pipeline report from Loxo and Weaver's first reads.
// Everything here is a draft for the firm's team: they edit it before a client sees it.
// Client-facing numbers (screen scores) come only from the team's own scorecards,
// never from Weaver's first read.

export function loadStages(file = "config/report/stages.v1.json") {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export function bucketOf(stageName, stages) {
  const name = String(stageName ?? "").toLowerCase();
  if (name) for (const b of stages.buckets) if (b.patterns.some((p) => name.includes(p))) return b.id;
  return stages.unknown;
}

const initials = (name) => String(name ?? "?").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");
const firstName = (name) => String(name ?? "").split(/\s+/)[0] || "Candidate";

export function yearsOf(w) {
  const y = (v) => (v ? String(v).slice(0, 4) : null);
  const a = y(w.start);
  const b = w.end ? y(w.end) : "present";
  return a && b && a !== b ? `${a}–${b}` : a ?? "";
}

export function buildReportModel({ job, candidates, results = [], teamCards = new Map(), stages, firm, client, date = new Date() }) {
  const byPerson = new Map(results.filter((r) => r.status === "scored").map((r) => [String(r.loxo?.person_id ?? r.candidate_id), r]));
  const order = stages.funnel;
  // First names in the written parts, unless two people share one (then the full name).
  const firstCount = new Map();
  for (const c of candidates) firstCount.set(firstName(c.name), (firstCount.get(firstName(c.name)) ?? 0) + 1);
  const people = candidates.map((c, i) => {
    const pid = String(c.loxo?.person_id ?? c.id);
    const read = byPerson.get(pid) ?? null;
    const team = teamCards.get(pid) ?? null;
    const bucket = bucketOf(c.report?.stage?.name, stages);
    return {
      ref: `C${i + 1}`,
      person_id: pid,
      name: c.name ?? `Candidate ${i + 1}`,
      first_name: firstCount.get(firstName(c.name)) > 1 ? (c.name ?? `Candidate ${i + 1}`) : firstName(c.name),
      initials: initials(c.name),
      title: c.current_title ?? "",
      company: c.current_company ?? "",
      location: c.location ?? "",
      linkedin: c.report?.linkedin ?? null,
      stage: bucket,
      stage_rank: bucket === "out" ? -1 : order.indexOf(bucket),
      pay: c.report?.compensation ?? {},
      industry: read?.industry ?? null,
      signal: read?.strongest_signal ?? "",
      watch: read?.watch_item ?? "",
      fit: read?.where_they_fit ?? [],
      probe: read?.where_to_probe ?? [],
      assessment: read?.assessment ?? "",
      first_read: read ? { average: read.average, recommendation: read.recommendation } : null,
      team,
      career: (c.work_history ?? []).slice(0, 6).map((w) => ({ years: yearsOf(w), title: w.title ?? "", company: w.company ?? "" })),
      education: (c.education ?? []).map((e) => [e.institution, e.degree].filter(Boolean).join(", ")).filter(Boolean),
    };
  });

  // Draft ranking: team score first, then Weaver's first read, then how far along they are.
  const score = (p) => p.team?.average ?? p.first_read?.average ?? 0;
  const active = people.filter((p) => p.stage !== "out");
  const ranked = [...active].sort((a, b) => score(b) - score(a) || b.stage_rank - a.stage_rank);

  const funnel = order.map((id) => {
    const b = stages.buckets.find((x) => x.id === id);
    const reached = people.filter((p) => p.stage !== "out" && p.stage_rank >= order.indexOf(id)).length;
    return { id, label: b.label, count: id === order[0] ? people.length : reached };
  });

  const bases = people.map((p) => p.pay.base).filter((v) => typeof v === "number");
  return {
    job: { id: job.id, title: job.title, description: job.description ?? "" },
    firm: firm || "[Firm name]",
    client: client || job.company_summary || "[Client name]",
    date: date.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
    funnel,
    people,
    top: ranked.slice(0, 10),
    stands: ranked.filter((p) => order.indexOf(p.stage) >= order.indexOf("first")),
    profiles: ranked.filter((p) => p.stage === "second" || p.stage === "submitted"),
    firstScreen: ranked.filter((p) => p.stage === "first"),
    responded: people.filter((p) => p.stage === "responded").sort((a, b) => (b.industry === "direct") - (a.industry === "direct") || (b.industry === "adjacent") - (a.industry === "adjacent")),
    outbound: people.filter((p) => p.stage === "outbound").sort((a, b) => a.name.localeCompare(b.name)),
    out: people.filter((p) => p.stage === "out"),
    pay_range: bases.length ? { low: Math.min(...bases), high: Math.max(...bases), count: bases.length } : null,
    narrative: null,
  };
}
