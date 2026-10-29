// Dry-run report: what the recruiter would see, before anything is written to Loxo.
// Written in the firm's report language, in its navy and blue.

const esc = (t) => String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const avg = (r) => (r.average === null || r.average === undefined ? "–" : r.average.toFixed(1));
const rec = (r) => (r.recommendation === "yes" ? "Yes" : "No");
const STAR = { direct: "★", adjacent: "☆", other: "" };
const who = (r) => r.candidate_name ?? r.candidate_id;
const k = (n) => `$${Math.round(n / 1000)}k`;
// Pay from Loxo's own pay fields only. Notes are not quoted: on the real account they mixed
// candidate pay with the firm's outreach pitch and were cut mid-sentence (30 Oct 2026 review).
const fieldPay = (r) => (r.pay && r.pay.base_source === "Loxo" ? r.pay : null);
const payShort = (r) => {
  const p = fieldPay(r);
  if (!p) return "";
  const check = p.check?.kind && !["unknown", "norange"].includes(p.check.kind) ? p.check.label : "";
  return [k(p.base), check].filter(Boolean).join(" · ");
};
const rangeText = (p) => (p?.range ? (p.range.min || p.range.max ? `${p.range.min ? k(p.range.min) : "?"} to ${p.range.max ? k(p.range.max) : "?"}` : p.range.text) : "Not set on the search");

export function toMarkdown(results, meta) {
  const lines = [
    `# First read: ${meta.jobTitle}`,
    "",
    `${meta.when}`,
    "Nothing has been written to Loxo. Every result is waiting for recruiter review.",
    "★ direct industry experience · ☆ adjacent industry",
    "",
    "| # | Candidate | Score | Pay | Strongest signal | Watch item | Flags |",
    "|---|---|---|---|---|---|---|",
  ];
  results.forEach((r, i) => {
    if (r.status === "skipped") lines.push(`| ${i + 1} | ${who(r)} | not scored | | | | ${r.reason} |`);
    else if (r.status !== "scored") lines.push(`| ${i + 1} | ${who(r)} | error | | | | ${r.error} |`);
    else lines.push(`| ${i + 1} | ${who(r)} ${STAR[r.industry] ?? ""} | ${avg(r)} / 5 · ${rec(r)} | ${payShort(r)} | ${r.strongest_signal} | ${r.watch_item} | ${r.flags.join("; ")} |`);
  });
  for (const r of results.filter((x) => x.status === "scored")) {
    lines.push("", `## ${who(r)} · ${avg(r)} / 5 · ${rec(r)}`, "", r.assessment);
    if (fieldPay(r)) lines.push("", `Pay (not used in the score): ${payShort(r)}. Range: ${rangeText(r.pay)}.`);
    if (r.where_they_fit.length) lines.push("", "Where they fit:", ...r.where_they_fit.map((q) => `- ${q}`));
    if (r.where_to_probe.length) lines.push("", "Where to probe:", ...r.where_to_probe.map((q) => `- ${q}`));
    lines.push("", "Scorecard:");
    for (const c of r.criteria) lines.push(`- ${c.label}: ${c.score ?? "no evidence"}. ${c.evidence}`);
  }
  return lines.join("\n") + "\n";
}

const STYLE = `
:root{--navy:#0d1526;--ink:#141b2b;--muted:#5b6578;--line:#dfe3ea;--soft:#f3f5f9;--blue:#3b7fd9;--blue-soft:#e8f0fb;--paper:#fff}
*{box-sizing:border-box}
body{margin:0;background:var(--soft);color:var(--ink);font:15px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased}
header{background:var(--navy);color:#fff;padding:40px 16px 34px}
.wrap{max-width:1040px;margin:0 auto}
.eyebrow{font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#8fb4ea;font-weight:600}
h1{font-size:clamp(26px,4vw,38px);line-height:1.15;margin:10px 0 8px;letter-spacing:-.01em}
.meta{color:#aeb8c9;font-size:13px;margin:0}
.stats{display:flex;gap:28px;flex-wrap:wrap;margin-top:26px}
.stats div{min-width:110px}.stats b{display:block;font-size:28px;font-variant-numeric:tabular-nums}.stats span{font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#aeb8c9}
main{padding:28px 16px 60px}
.note{background:var(--paper);border-left:3px solid var(--blue);padding:12px 16px;margin:0 0 22px;color:var(--muted);font-size:14px}
h2{font-size:12px;letter-spacing:.16em;text-transform:uppercase;margin:34px 0 12px;color:var(--ink)}
.table{background:var(--paper);border:1px solid var(--line);border-radius:10px;overflow-x:auto}
table{width:100%;border-collapse:collapse;min-width:720px}
th{font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);text-align:left;padding:12px 14px;border-bottom:1px solid var(--line);font-weight:600}
td{padding:13px 14px;border-top:1px solid var(--line);vertical-align:top}
tr:first-child td{border-top:0}
.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.rank{color:var(--blue);font-weight:700;width:36px}
.name{font-weight:650}.star{color:var(--blue);margin-left:4px}
.score{font-weight:700;white-space:nowrap}.score em{font-style:normal;font-weight:600;margin-left:6px;padding:2px 8px;border-radius:4px;font-size:12px}
.yes em{background:var(--blue);color:#fff}.no em{background:var(--soft);color:var(--muted);border:1px solid var(--line)}
.flag{display:block;color:#9a5b12;font-size:12px;margin-top:4px}
.err{color:#a3361b;font-weight:600}
.card{background:var(--paper);border:1px solid var(--line);border-radius:10px;padding:24px;margin:0 0 16px}
.card-head{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;align-items:baseline;border-bottom:1px solid var(--line);padding-bottom:14px}
.card-head h3{margin:0;font-size:21px}.card-head .score{font-size:18px}
.sum{margin:14px 0 0;color:var(--ink)}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:18px}
.cols h4{font-size:11px;letter-spacing:.14em;text-transform:uppercase;margin:0 0 8px;padding-bottom:6px;border-bottom:1px solid var(--ink)}
.cols .probe h4{color:var(--blue);border-color:var(--blue)}
.cols ul{margin:0;padding:0;list-style:none}.cols li{padding:5px 0 5px 16px;position:relative;font-size:14px}
.cols li:before{content:"";position:absolute;left:0;top:14px;width:8px;height:2px;background:var(--ink)}.cols .probe li:before{background:var(--blue)}
.crit{margin-top:20px;border-top:1px solid var(--line)}
.crit div{display:grid;grid-template-columns:1fr auto;gap:6px 18px;padding:10px 0;border-bottom:1px solid var(--line)}
.crit b{font-size:14px}.crit p{grid-column:1;margin:0;color:var(--muted);font-size:13px}
.dots{grid-row:1 / span 2;grid-column:2;display:flex;gap:4px;align-self:center}
.dots i{width:22px;height:22px;border-radius:4px;border:1px solid var(--line);font:600 11px/20px inherit;text-align:center;font-style:normal;color:var(--muted)}
.dots i.on{background:var(--blue);border-color:var(--blue);color:#fff}
.dots .none{font-size:12px;color:var(--muted);align-self:center}
.legend{color:var(--muted);font-size:12px;margin-top:10px}.legend p{margin:0 0 6px;max-width:900px}
a{color:var(--blue)}
tr.skip td{color:var(--muted)}
.note.warn{border-left-color:#c58a1a;color:var(--ink)}
td.pay{font-size:13px;white-space:nowrap}td.pay.above{color:#9a5b12;font-weight:600}td.pay.within{color:var(--blue)}
.paybox{margin-top:16px;background:var(--soft);border-left:3px solid var(--muted);padding:10px 14px;font-size:14px}
.paybox .k{display:block;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);margin-bottom:4px}
.paybox p{margin:0}.paybox ul{margin:6px 0 0;padding-left:18px;color:var(--muted)}
tfoot td{font-weight:700;border-top:1px solid var(--ink)}
@media (max-width:700px){.cols{grid-template-columns:1fr}.crit div{grid-template-columns:1fr}.dots{grid-row:auto;grid-column:1}}
@media print{body{background:#fff}.card{break-inside:avoid}}
`;

const page = (title, header, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title><style>${STYLE}</style></head><body>
<header><div class="wrap">${header}</div></header>
<main><div class="wrap">${body}</div></main>
</body></html>
`;

const dots = (score, max = 5) =>
  score === null ? '<span class="dots"><span class="none">No evidence</span></span>'
    : `<span class="dots">${Array.from({ length: max }, (_, i) => `<i class="${i < score ? "on" : ""}">${i + 1}</i>`).join("")}</span>`;

const scoreCell = (r) => `<span class="score ${r.recommendation}">${avg(r)} / 5<em>${rec(r)}</em></span>`;

// Summary page for a run across several jobs, linking to each job's report.
export function toIndexHtml(rows, meta) {
  const body = rows.map((r) => `<tr><td><a href="${esc(r.file)}">${esc(r.title)}</a></td><td class="n">${r.candidates}</td><td class="n">${r.scored}</td><td class="n">${r.yes}</td><td class="n">${r.errors}</td></tr>`).join("\n");
  const total = rows.reduce((t, r) => ({ c: t.c + r.candidates, s: t.s + r.scored, y: t.y + r.yes, e: t.e + r.errors }), { c: 0, s: 0, y: 0, e: 0 });
  const header = `<span class="eyebrow">First read · dry run</span><h1>${rows.length} searches</h1><p class="meta">${esc(meta.when)}</p>
<div class="stats"><div><b>${total.c}</b><span>Candidates</span></div><div><b>${total.s}</b><span>Read</span></div><div><b>${total.y}</b><span>Worth a call</span></div></div>`;
  return page(`Dry run: ${rows.length} searches`, header, `<p class="note">Nothing has been written to Loxo. Open a search to see every candidate's first read.</p>
<div class="table"><table><thead><tr><th>Search</th><th class="n">Candidates</th><th class="n">Scored</th><th class="n">Recommended</th><th class="n">Errors</th></tr></thead>
<tbody>${body}</tbody>
<tfoot><tr><td>Total</td><td class="n">${total.c}</td><td class="n">${total.s}</td><td class="n">${total.y}</td><td class="n">${total.e}</td></tr></tfoot></table></div>`);
}

export function toHtml(results, meta) {
  const scored = results.filter((r) => r.status === "scored");
  const showPay = results.some((r) => fieldPay(r));
  const rows = results.map((r, i) => {
    if (r.status === "skipped") return `<tr class="skip"><td class="rank">–</td><td class="name">${esc(who(r))}</td><td>Not scored</td><td colspan="${showPay ? 3 : 2}">${r.reason === "no_evidence" ? "Read, but nothing in the record speaks to any criterion yet." : "Not enough in Loxo to score: no resume, work history or notes yet."}</td></tr>`;
    if (r.status !== "scored") return `<tr><td class="rank">${i + 1}</td><td class="name">${esc(who(r))}</td><td class="err">Error</td><td colspan="${showPay ? 3 : 2}">${esc(r.error)}</td></tr>`;
    const flags = r.flags.map((f) => `<span class="flag">${esc(f.split(":")[0].replaceAll("_", " "))}</span>`).join("");
    return `<tr><td class="rank">${i + 1}</td><td><span class="name">${esc(who(r))}</span>${STAR[r.industry] ? `<span class="star" title="${r.industry} industry">${STAR[r.industry]}</span>` : ""}${flags}</td><td>${scoreCell(r)}</td>${showPay ? `<td class="pay ${esc(fieldPay(r)?.check?.kind ?? "")}">${esc(payShort(r))}</td>` : ""}<td>${esc(r.strongest_signal)}</td><td>${esc(r.watch_item)}</td></tr>`;
  }).join("\n");

  const cards = scored.map((r) => {
    const list = (items) => items.map((t) => `<li>${esc(t)}</li>`).join("");
    const crit = r.criteria.map((c) => `<div><b>${esc(c.label)}</b>${dots(c.score)}<p>${esc(c.evidence)}</p></div>`).join("");
    return `<section class="card"><div class="card-head"><h3>${esc(who(r))}${STAR[r.industry] ? `<span class="star">${STAR[r.industry]}</span>` : ""}</h3>${scoreCell(r)}</div>
<p class="sum">${esc(r.assessment)}</p>
${fieldPay(r) ? `<div class="paybox"><span class="k">Pay · from Loxo, not used in the score</span><p><b>${esc(payShort(r))}</b> · Range on the search: ${esc(rangeText(r.pay))}${r.pay.bonus ? ` · Bonus: ${esc(r.pay.bonus)}` : ""}${r.pay.equity ? ` · Equity: ${esc(r.pay.equity)}` : ""}</p></div>` : ""}
<div class="cols"><div><h4>Where they fit</h4><ul>${list(r.where_they_fit)}</ul></div><div class="probe"><h4>Where to probe</h4><ul>${list(r.where_to_probe)}</ul></div></div>
<div class="crit">${crit}</div></section>`;
  }).join("\n");

  const yes = scored.filter((r) => r.recommendation === "yes").length;
  const skipped = results.filter((r) => r.status === "skipped").length;
  const header = `<span class="eyebrow">First read · dry run</span><h1>${esc(meta.jobTitle)}</h1><p class="meta">${esc(meta.when)}</p>
<div class="stats"><div><b>${results.length}</b><span>Candidates</span></div><div><b>${scored.length}</b><span>Scored</span></div><div><b>${yes}</b><span>Worth a call</span></div>${skipped ? `<div><b>${skipped}</b><span>Not enough in Loxo</span></div>` : ""}</div>`;
  return page(`Dry run: ${meta.jobTitle}`, header, `<p class="note">Nothing has been written to Loxo. Every result is a first read from the record, waiting for recruiter review.</p>
${meta.criteria_auto ? '<p class="note warn"><b>Criteria drafted automatically from the job, not yet approved.</b> The criteria names come from your scorecard in Loxo; what a 3 and a 5 look like was drafted from the job description. Approve or adjust them, and the search is re-scored on the approved version.</p>' : ""}
<h2>Ranked</h2>
<div class="table"><table><thead><tr><th>#</th><th>Candidate</th><th>Score</th>${showPay ? "<th>Pay</th>" : ""}<th>Strongest signal</th><th>Watch item</th></tr></thead><tbody>${rows}</tbody></table></div>
<div class="legend"><p>★ Direct industry experience · ☆ Adjacent industry · 1 Does not meet · 2 Weak · 3 Meets · 4 Strong · 5 Exceptional</p>
<p><b>Yes / No.</b> Recommended candidates are listed first. "Yes" is the short list: every must-have met and strong on most criteria. "No" means the record misses a must-have for this search, such as industry experience, whatever the average, or the read is below the bar for a call: an average under ${esc(scored.find((r) => r.yes_bar)?.yes_bar ?? 3.5)}, or three or more criteria with no evidence.</p>
<p><b>Flags.</b> Partial record: one or two criteria had no evidence. Thin record: three or more had none. No resume: no resume file in Loxo; read from the profile, work history and notes. Notes trimmed: only the most recent notes were read. Resume trimmed: a very long resume, only the first part was read. Below bar: the AI said yes, but the average or the evidence is under the bar, so it is listed as No; worth a look if the reasons fit. Check: a No with an average of 4 or more; read the reasons.</p></div>
<h2>Candidates</h2>
${cards}`);
}
