// Dry-run report: what the recruiter would see, before anything is written to Loxo.

const esc = (t) => String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const avg = (r) => (r.average === null || r.average === undefined ? "–" : r.average.toFixed(2));

export function toMarkdown(results, meta) {
  const lines = [
    `# Dry run: ${meta.jobTitle}`,
    "",
    `Scorecard ${meta.scorecard} · provider ${meta.provider} · ${meta.when}`,
    "Nothing has been written to Loxo. Every result is waiting for recruiter review.",
    "",
    "| # | Candidate | Average | Recommendation | Flags |",
    "|---|---|---|---|---|",
  ];
  results.forEach((r, i) => {
    const who = r.candidate_name ?? r.candidate_id;
    if (r.status !== "scored") lines.push(`| ${i + 1} | ${who} | – | error | ${r.error} |`);
    else lines.push(`| ${i + 1} | ${who} | ${avg(r)} | ${r.recommendation} | ${r.flags.join("; ")} |`);
  });
  for (const r of results.filter((x) => x.status === "scored")) {
    lines.push("", `## ${r.candidate_name ?? r.candidate_id}`, "", r.assessment, "");
    for (const c of r.criteria) lines.push(`- ${c.label}: ${c.score ?? "no evidence"}. ${c.evidence}`);
    if (r.open_questions.length) lines.push("", "Open questions:", ...r.open_questions.map((q) => `- ${q}`));
  }
  return lines.join("\n") + "\n";
}

// Summary page for a run across several jobs, linking to each job's report.
export function toIndexHtml(rows, meta) {
  const body = rows.map((r) => `<tr><td><a href="${esc(r.file)}">${esc(r.title)}</a></td><td class="n">${r.candidates}</td><td class="n">${r.scored}</td><td class="n">${r.yes}</td><td class="n">${r.errors}</td></tr>`).join("\n");
  const total = rows.reduce((t, r) => ({ c: t.c + r.candidates, s: t.s + r.scored, y: t.y + r.yes, e: t.e + r.errors }), { c: 0, s: 0, y: 0, e: 0 });
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Dry run: ${rows.length} searches</title>
<style>
body{font:15px/1.55 -apple-system,"Segoe UI",Helvetica,Arial,sans-serif;color:#17201d;background:#f5f6f3;margin:0;padding:32px 16px}
main{max-width:980px;margin:0 auto}h1{font:300 30px/1.2 Georgia,serif;margin:0 0 6px}.m{color:#4d5753;margin:0 0 20px}
table{width:100%;border-collapse:collapse;background:#fff;border:1px solid #d6dbd6}th,td{padding:10px 12px;border-top:1px solid #d6dbd6;text-align:left}
th{font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:#4d5753}.n{text-align:right;font-variant-numeric:tabular-nums}a{color:#1e4a3d}
tfoot td{font-weight:600}
</style></head><body><main>
<h1>Dry run across ${rows.length} searches</h1>
<p class="m">Scorecard ${esc(meta.scorecard)} · ${esc(meta.provider)} · ${esc(meta.when)}<br>Nothing has been written to Loxo. Open a search to see every candidate's scores and assessment.</p>
<table><thead><tr><th>Search</th><th class="n">Candidates</th><th class="n">Scored</th><th class="n">Recommended</th><th class="n">Errors</th></tr></thead>
<tbody>${body}</tbody>
<tfoot><tr><td>Total</td><td class="n">${total.c}</td><td class="n">${total.s}</td><td class="n">${total.y}</td><td class="n">${total.e}</td></tr></tfoot></table>
</main></body></html>
`;
}

export function toHtml(results, meta) {
  const rows = results.map((r, i) => {
    const who = esc(r.candidate_name ?? r.candidate_id);
    if (r.status !== "scored") {
      return `<tr><td>${i + 1}</td><td>${who}</td><td class="n">–</td><td class="err">Error</td><td>${esc(r.error)}</td></tr>`;
    }
    const crit = r.criteria.map((c) => `<li><b>${esc(c.label)}</b> <span class="n">${c.score ?? "–"}</span> ${esc(c.evidence)}</li>`).join("");
    const qs = r.open_questions.map((q) => `<li>${esc(q)}</li>`).join("");
    return `<tr><td>${i + 1}</td><td>${who}</td><td class="n">${avg(r)}</td><td class="${r.recommendation}">${esc(r.recommendation)}</td><td>${esc(r.flags.join("; "))}</td></tr>
<tr class="d"><td></td><td colspan="4"><p>${esc(r.assessment)}</p><ul>${crit}</ul>${qs ? `<p><b>Open questions</b></p><ul>${qs}</ul>` : ""}</td></tr>`;
  }).join("\n");

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Dry run: ${esc(meta.jobTitle)}</title>
<style>
body{font:15px/1.55 -apple-system,"Segoe UI",Helvetica,Arial,sans-serif;color:#17201d;background:#f5f6f3;margin:0;padding:32px 16px}
main{max-width:980px;margin:0 auto}h1{font:300 30px/1.2 Georgia,serif;margin:0 0 6px}.m{color:#4d5753;margin:0 0 20px}
table{width:100%;border-collapse:collapse;background:#fff;border:1px solid #d6dbd6}td{padding:10px 12px;border-top:1px solid #d6dbd6;vertical-align:top}
.n{font-variant-numeric:tabular-nums;text-align:right;white-space:nowrap}.yes{color:#1e6b4a;font-weight:600}.no{color:#6b6f6c;font-weight:600}.err{color:#9a3a1a;font-weight:600}
tr.d td{border-top:0;padding-top:0;color:#38413d;font-size:14px}tr.d ul{margin:6px 0 10px;padding-left:18px}tr.d .n{display:inline-block;min-width:1.5em}
</style></head><body><main>
<h1>Dry run: ${esc(meta.jobTitle)}</h1>
<p class="m">Scorecard ${esc(meta.scorecard)} · ${esc(meta.provider)} · ${esc(meta.when)}<br>Nothing has been written to Loxo. Every result is waiting for recruiter review.</p>
<table>${rows}</table>
</main></body></html>
`;
}
