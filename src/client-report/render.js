// Renders the client pipeline report as print-ready HTML (US Letter).
// Opens in a browser as an editable draft: the team corrects any line, reorders the
// top ten, then prints to PDF. The toolbar never prints.

const esc = (t) => String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const STAR = { direct: '<span class="star" title="Direct industry experience">★</span>', adjacent: '<span class="star" title="Adjacent industry">☆</span>' };
const star = (p) => STAR[p.industry] ?? "";

export function money(v) {
  if (v === null || v === undefined || v === "") return "TBD";
  if (typeof v === "string") return esc(v);
  if (v <= 100) return `${v}%`;
  return v >= 1000 ? `$${Math.round(v / 1000)}k` : `$${v}`;
}

const chip = (p, stages) => {
  const b = stages.buckets.find((x) => x.id === p.stage);
  return `<span class="chip ${p.stage}">${esc(b?.short ?? p.stage)}</span>`;
};
const avatar = (p) => `<span class="av">${esc(p.initials)}</span>`;
const li = (p) => (p.linkedin ? ` · <a href="${esc(p.linkedin)}">LinkedIn</a>` : "");
const ed = (t, tag = "span") => `<${tag} class="ed" contenteditable="true">${esc(t)}</${tag}>`;

function page(label, n, model, body, cls = "") {
  return `<section class="page ${cls}"><header class="ph"><span>${esc(label)}</span><span>Page ${n}</span></header>
<div class="pb">${body}</div>
<footer class="pf"><span>${esc(model.firm)} · ${esc(model.client)} · ${esc(model.job.title)}</span><span class="draft-tag">Draft</span></footer></section>`;
}

export function renderReport(model, stages) {
  const pages = [];
  let n = 1;
  const nar = model.narrative ?? { subtitle: "", read_boxes: [], focus_next: "" };

  // 1. Cover
  const max = Math.max(1, ...model.funnel.map((f) => f.count));
  pages.push(`<section class="page cover"><div class="cv">
  <div class="logos"><span class="logo">${esc(model.firm)}</span><span class="sep"></span><span class="logo client">${esc(model.client)}</span></div>
  <div class="cv-mid"><span class="eyebrow">Search pipeline report</span><h1>${ed(model.job.title)}</h1>
  <p class="sub">${ed(nar.subtitle || `Where the search stands today, drawn from ${model.people.length} leaders.`)}</p>
  <dl class="meta"><div><dt>Prepared for</dt><dd>${ed(model.client)}</dd></div><div><dt>Prepared by</dt><dd>${ed(model.firm)}</dd></div><div><dt>Report date</dt><dd>${ed(model.date)}</dd></div></dl></div>
  <ol class="funnel">${model.funnel.map((f) => `<li><span class="fbar"><i style="width:${Math.max(4, Math.round((f.count / max) * 100))}%"></i></span><b>${f.count}</b><span>${esc(f.label)}</span></li>`).join("")}</ol>
</div></section>`);

  // 2. Top ten
  n++;
  const topRows = model.top.map((p, i) => `<tr><td class="rk">${i + 1}</td><td><div class="who">${avatar(p)}<div><b>${esc(p.name)}</b>${star(p)}<small>${li(p).replace(/^ · /, "")}</small></div></div></td>
<td><b class="co">${esc(p.company)}</b><small>${esc(p.location)}</small></td><td>${ed(p.assessment || p.signal)}</td><td>${chip(p, stages)}<span class="mv no-print"><button data-mv="-1" title="Move up">↑</button><button data-mv="1" title="Move down">↓</button></span></td></tr>`).join("");
  pages.push(page("Top 10 candidates", n, model, `<h2>Top ${model.top.length} candidates, ranked</h2>
<p class="lede">${ed("Our current ranking across every stage of the search, from first conversation through submission.")}</p>
<table class="t rank"><thead><tr><th>#</th><th>Candidate</th><th>Company &amp; location</th><th>Assessment</th><th>Stage</th></tr></thead><tbody id="top">${topRows}</tbody></table>
${legend()}
<div class="callout"><b>Where we're focusing next</b>${ed(nar.focus_next, "p")}</div>`));

  // 3. Where the search stands
  n++;
  const counts = Object.fromEntries(model.funnel.map((f) => [f.id, f.count]));
  const standsRows = model.stands.map((p) => `<tr><td><div class="who">${avatar(p)}<div><b>${esc(p.name)}</b>${star(p)}<small>${esc(p.company)}</small></div></div></td><td>${chip(p, stages)}</td>
<td class="n">${money(p.pay.base)}</td><td class="n">${money(p.pay.bonus)}</td><td>${ed(p.signal)}</td><td>${ed(p.watch)}</td></tr>`).join("");
  const payBox = model.pay_range
    ? `Current base across the ${model.pay_range.count} candidates with figures runs ${money(model.pay_range.low)} to ${money(model.pay_range.high)}. [Add targets, bonus, equity and what candidates have told us.]`
    : "[Add the compensation picture: the range, targets, and what candidates have told us.]";
  const boxes = [...nar.read_boxes, { title: "The compensation picture", text: payBox }];
  pages.push(page("Pipeline at a glance", n, model, `<h2>Where the search stands</h2>
<p class="lede">${ed(`Of ${counts.outbound} leaders worked, ${counts.responded} responded and had an initial conversation, ${counts.first} went through a first layer screen, ${counts.second} cleared our second layer screen, and ${counts.submitted} ${counts.submitted === 1 ? "is" : "are"} submitted to you.`)}</p>
${model.stands.length ? `<table class="t"><thead><tr><th>Candidate</th><th>Status</th><th class="n">Base</th><th class="n">Bonus</th><th>Strongest signal</th><th>Watch item</th></tr></thead><tbody>${standsRows}</tbody></table>${legend()}` : ""}
<h3 class="kick">How to read the pipeline</h3>
<div class="boxes">${boxes.map((b) => `<div class="box"><b>${ed(b.title)}</b>${ed(b.text, "p")}</div>`).join("")}</div>`));

  // 4. Profiles: cleared and submitted
  for (const p of model.profiles) {
    n++;
    const stageLabel = stages.buckets.find((b) => b.id === p.stage)?.label ?? p.stage;
    const pay = [["Current base", money(p.pay.base)], ["Bonus", money(p.pay.bonus)], ["Equity", money(p.pay.equity)]];
    if (p.team?.average !== null && p.team?.average !== undefined) pay.push(["Our screen", `${p.team.average.toFixed(1)} / 5${p.team.recommendation ? ` · ${esc(p.team.recommendation)}` : ""}`]);
    pages.push(page(stageLabel, n, model, `<div class="prof-head">${avatar(p)}<div><h2>${esc(p.name)}${star(p)}</h2><p class="role">${esc(p.title)} · <b>${esc(p.company)}</b></p><p class="loc">${esc(p.location)}${li(p)}</p></div>${chip(p, stages)}</div>
<div class="strip">${pay.map(([k, v]) => `<div><span>${k}</span><b>${ed(v)}</b></div>`).join("")}</div>
<div class="cols"><div><h4>Where they fit</h4><ul>${p.fit.map((t) => `<li>${ed(t)}</li>`).join("")}</ul></div><div class="probe"><h4>Where to probe</h4><ul>${p.probe.map((t) => `<li>${ed(t)}</li>`).join("")}</ul></div></div>
${p.career.length ? `<h4 class="sec">Career</h4><table class="career">${p.career.map((c) => `<tr><td class="yr">${esc(c.years)}</td><td><b>${esc(c.title)}</b></td><td class="r">${esc(c.company)}</td></tr>`).join("")}</table>` : ""}
${p.education.length ? `<h4 class="sec">Education &amp; credentials</h4><p class="edu">${ed(p.education.join(" · "))}</p>` : ""}`));

    // The team's own scorecard, only when they wrote one in Loxo.
    if (p.team) {
      n++;
      const rows = p.team.criteria.map((c) => `<div class="crit"><div><b>${esc(c.label)}</b>${ed(c.notes, "p")}</div><span class="sq">${[1, 2, 3, 4, 5].map((v) => `<i class="${c.score !== null && v <= c.score ? "on" : ""}">${v}</i>`).join("")}</span></div>`).join("");
      pages.push(page(`${stageLabel} · ${p.name}`, n, model, `<h2>Screening scorecard</h2>
<p class="lede">${ed("Scored by our team after the second layer screen. We score critically: a 3 means meets, a 4 is strong, and a 5 is reserved for areas where a candidate is exceptional.")}</p>
<div class="scorecard">${rows}</div>
<div class="total"><div><span>Average across ${p.team.criteria.filter((c) => c.score !== null).length} criteria</span><b>${p.team.average?.toFixed(1) ?? "–"} / 5</b></div><div><span>Overall recommendation</span><b>${ed(p.team.recommendation ?? "")}</b></div></div>
<p class="scale">1 Does not meet · 2 Weak · 3 Meets · 4 Strong · 5 Exceptional</p>`));
    }
  }

  // 5. First layer screen
  if (model.firstScreen.length) {
    n++;
    pages.push(page("First layer screen", n, model, `<h2>First layer screen</h2>
<p class="lede">${ed(`${model.firstScreen.length} candidate${model.firstScreen.length === 1 ? " has" : "s have"} been through our first layer screen. We score candidates once they clear the second layer, so these profiles show what stood out and what we still need to confirm.`)}</p>
<div class="list">${model.firstScreen.map((p) => `<div class="item">${avatar(p)}<div><p class="nm"><b>${esc(p.name)}</b>${star(p)} <span>${esc(p.title)} · ${esc(p.company)}</span></p><p class="loc">${esc(p.location)}${li(p)}</p>
<p><b>Signal.</b> ${ed(p.signal)}</p><p><b>Watch.</b> ${ed(p.watch)}</p></div></div>`).join("")}</div>${legend()}`));
  }

  // 6. Responded
  if (model.responded.length) {
    n++;
    pages.push(page("Responded & initial conversation", n, model, `<h2>Responded and initial conversation</h2>
<p class="lede">${ed(`${model.responded.length} leaders have responded and had an initial conversation with our team. Starred candidates have direct or adjacent industry experience and are listed first.`)}</p>
<table class="t"><thead><tr><th>Name</th><th>Company &amp; title</th><th>Industry</th><th>Profile</th></tr></thead><tbody>${model.responded.map((p) => `<tr><td><div class="who">${avatar(p)}<div><b>${esc(p.name)}</b>${star(p)}<small>${esc(p.location)}</small></div></div></td><td><b class="co">${esc(p.company)}</b><small>${esc(p.title)}</small></td><td>${p.industry === "direct" ? '<span class="ind">Direct</span>' : p.industry === "adjacent" ? '<span class="ind adj">Adjacent</span>' : ""}</td><td>${p.linkedin ? `<a href="${esc(p.linkedin)}">LinkedIn</a>` : ""}</td></tr>`).join("")}</tbody></table>${legend()}`));
  }

  // 7. Outbound (flows over as many pages as needed)
  if (model.outbound.length) {
    n++;
    pages.push(page("Outbound", n, model, `<h2>Outbound</h2>
<p class="lede">${ed(`${model.outbound.length} leaders in the pipeline to connect with.`)}</p>
<table class="t compact"><thead><tr><th>Name</th><th>Company</th><th>Title</th><th>Location</th></tr></thead><tbody>${model.outbound.map((p) => `<tr><td><b>${esc(p.name)}</b>${star(p)}</td><td>${esc(p.company)}</td><td>${esc(p.title)}</td><td class="mut">${esc(p.location)}</td></tr>`).join("")}</tbody></table>${legend()}`, "flow"));
  }

  // 8. No longer in process
  if (model.out.length) {
    n++;
    pages.push(page("No longer in process", n, model, `<h2>No longer in process</h2>
<p class="lede">${ed("[Why each candidate left the process, and what it tells us about the market.]")}</p>
<div class="list">${model.out.map((p) => `<div class="item">${avatar(p)}<div><p class="nm"><b>${esc(p.name)}</b> <span>${esc(p.title)} · ${esc(p.company)}</span></p><p>${ed("[Reason]")}</p></div></div>`).join("")}</div>`));
  }

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(model.job.title)} · pipeline report (draft)</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@500;600;700&family=Public+Sans:wght@300;400;500;600&display=swap">
<style>${STYLE}</style></head><body>
<div class="bar no-print"><b>Draft for your team.</b> Click any text to change it, move the top ten with the arrows, then print or save as PDF. Check every line before it goes to a client.
<span><button id="print">Print or save as PDF</button><button id="save">Download edited copy</button></span></div>
${pages.join("\n")}
<script>${SCRIPT}</script></body></html>
`;
}

const legend = () => '<p class="legend">★ Direct industry experience <span>☆ Adjacent industry</span></p>';

const SCRIPT = `
document.getElementById("print").onclick = function () { window.print(); };
document.getElementById("save").onclick = function () {
  var html = "<!doctype html>" + document.documentElement.outerHTML;
  var a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([html], { type: "text/html" }));
  a.download = (document.title || "report").replace(/[^\\w ]+/g, "").trim().replace(/ +/g, "-") + ".html";
  a.click();
};
var top = document.getElementById("top");
if (top) top.addEventListener("click", function (e) {
  var b = e.target.closest("button[data-mv]"); if (!b) return;
  var row = b.closest("tr"), dir = Number(b.getAttribute("data-mv"));
  var other = dir < 0 ? row.previousElementSibling : row.nextElementSibling; if (!other) return;
  dir < 0 ? top.insertBefore(row, other) : top.insertBefore(other, row);
  Array.prototype.forEach.call(top.rows, function (r, i) { r.cells[0].textContent = i + 1; });
});
`;

const STYLE = `
:root{--navy:#0d1526;--ink:#121a2b;--mut:#5b6578;--line:#dfe3ea;--soft:#f3f6fb;--blue:#2f6fcf;--blue-soft:#e8f0fb;--warn:#9a5b12}
*{box-sizing:border-box}
html{background:#e7eaf0}
body{margin:0;color:var(--ink);font:400 10pt/1.5 "Public Sans",-apple-system,"Segoe UI",Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased}
h1,h2,h3,h4{font-family:Archivo,"Public Sans",sans-serif;margin:0;letter-spacing:-.01em}
a{color:var(--blue);text-decoration:none}
.page{width:8.5in;min-height:11in;margin:24px auto;background:#fff;box-shadow:0 2px 16px rgba(13,21,38,.12);padding:.6in .7in .5in;display:flex;flex-direction:column}
.pb{flex:1}
.ph{display:flex;justify-content:space-between;font:600 7.5pt/1 "Public Sans",sans-serif;letter-spacing:.16em;text-transform:uppercase;padding-bottom:10px;border-bottom:1.5px solid var(--ink);margin-bottom:22px}
.ph span:last-child{color:var(--mut)}
.pf{display:flex;justify-content:space-between;align-items:center;border-top:1px solid var(--line);padding-top:10px;margin-top:22px;font-size:7pt;letter-spacing:.08em;text-transform:uppercase;color:var(--mut)}
.draft-tag{border:1px solid var(--warn);color:var(--warn);padding:2px 6px;letter-spacing:.12em}
h2{font-size:22pt;line-height:1.1;margin-bottom:8px}
.lede{color:var(--mut);font-size:10.5pt;max-width:6in;margin:0 0 18px}
.kick{font-size:8pt;letter-spacing:.16em;text-transform:uppercase;margin:26px 0 10px;color:var(--mut)}
/* cover */
.cover{background:var(--navy);color:#fff;padding:.7in}
.cv{flex:1;display:flex;flex-direction:column}
.logos{display:flex;align-items:center;justify-content:center;gap:22px;background:#fff;color:var(--navy);border-radius:10px;padding:22px 30px;align-self:center;min-width:5in}
.logo{font:700 15pt/1 Archivo,sans-serif;letter-spacing:.06em;text-transform:uppercase}
.logo.client{font-weight:600;letter-spacing:.02em;text-transform:none;color:#2c3a55}
.sep{width:1px;height:42px;background:var(--line)}
.cv-mid{text-align:center;margin:auto 0;padding:40px 0}
.eyebrow{font:600 8pt/1 "Public Sans",sans-serif;letter-spacing:.24em;text-transform:uppercase;color:#8fb4ea}
.cover h1{font-size:38pt;line-height:1.05;margin:16px auto 14px;max-width:6in}
.sub{color:#b8c3d6;font-size:11pt;max-width:5.2in;margin:0 auto 26px}
.meta{display:flex;justify-content:center;gap:0;border-top:1px solid #2a3652;padding-top:14px;margin:0 auto;max-width:5.8in}
.meta div{flex:1}.meta dt{font-size:7.5pt;color:#8a97ad;margin-bottom:3px}.meta dd{margin:0;font-weight:600}
.funnel{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(5,1fr);gap:14px}
.funnel li{display:grid;gap:6px;align-content:start}
.fbar{height:4px;background:#24304a;display:block}.fbar i{display:block;height:100%;background:var(--blue)}
.funnel b{font:700 24pt/1 Archivo,sans-serif}
.funnel span:last-child{font-size:6.8pt;letter-spacing:.12em;text-transform:uppercase;color:#aab6cb;line-height:1.35}
/* tables */
.t{width:100%;border-collapse:collapse;font-size:9pt}
.t th{text-align:left;font:600 7pt/1.2 "Public Sans",sans-serif;letter-spacing:.14em;text-transform:uppercase;color:var(--mut);padding:8px 8px;border-bottom:1.5px solid var(--ink)}
.t td{padding:9px 8px;border-bottom:1px solid var(--line);vertical-align:top}
.t tbody tr:nth-child(odd) td{background:#fafbfd}
.t.compact td{padding:5px 8px;font-size:8.5pt}
.t .n{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
.t small,.who small{display:block;color:var(--mut);font-size:8pt}
.co{font-weight:600}
.rk{color:var(--blue);font:700 12pt/1 Archivo,sans-serif;width:28px}
.rank td:nth-child(3){width:1.35in}.rank td:nth-child(5){width:1.05in}
.who{display:flex;gap:9px;align-items:flex-start;min-width:1.45in}
.who b{white-space:nowrap}
.av{flex:none;width:28px;height:28px;border-radius:50%;background:var(--navy);color:#fff;font:600 8pt/28px "Public Sans",sans-serif;text-align:center}
.star{color:var(--blue);margin-left:4px}
.chip{display:inline-block;font-size:7.5pt;font-weight:600;padding:3px 7px;border-radius:3px;white-space:nowrap;border:1px solid var(--line);color:var(--mut)}
.chip.second{background:var(--blue);border-color:var(--blue);color:#fff}
.chip.submitted{background:var(--navy);border-color:var(--navy);color:#fff}
.chip.first{border-color:#9db5da;color:#2c4a7a}
.chip.responded{border-style:dashed}
.mut{color:var(--mut)}
.legend{font-size:7.5pt;color:var(--mut);margin:8px 0 0}.legend span{margin-left:14px}
.callout{background:var(--soft);border-left:3px solid var(--blue);padding:14px 18px;margin-top:22px}
.callout b{display:block;font-family:Archivo,sans-serif;font-size:11pt;margin-bottom:4px}.callout p{margin:0}
.boxes{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.box{background:var(--soft);border-left:3px solid var(--blue);padding:12px 16px}
.box b{display:block;font-family:Archivo,sans-serif;font-size:10.5pt;margin-bottom:4px}.box p{margin:0;font-size:9pt}
/* profile */
.prof-head{display:flex;gap:16px;align-items:flex-start}
.prof-head .av{width:58px;height:58px;font-size:15pt;line-height:58px}
.prof-head>div{flex:1}.prof-head h2{font-size:24pt;margin:0}
.role{margin:4px 0 0;font-size:11pt}.loc{margin:2px 0 0;color:var(--mut);font-size:9pt}
.strip{display:flex;gap:34px;background:var(--soft);border-left:3px solid var(--navy);padding:14px 20px;margin:20px 0}
.strip span{display:block;font-size:7pt;letter-spacing:.14em;text-transform:uppercase;color:var(--mut)}.strip b{font:700 15pt/1.3 Archivo,sans-serif}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:28px}
h4{font:600 8pt/1 "Public Sans",sans-serif;letter-spacing:.16em;text-transform:uppercase;padding-bottom:8px;border-bottom:1.5px solid var(--ink);margin-bottom:8px}
.probe h4{color:var(--blue);border-color:var(--blue)}
.cols ul{list-style:none;margin:0;padding:0}.cols li{position:relative;padding:4px 0 4px 16px;font-size:9.5pt}
.cols li:before{content:"";position:absolute;left:0;top:12px;width:8px;height:1.5px;background:var(--ink)}.probe li:before{background:var(--blue)}
h4.sec{margin-top:22px}
.career{width:100%;border-collapse:collapse;font-size:9.5pt}.career td{padding:7px 0;border-bottom:1px solid var(--line)}
.career .yr{color:var(--mut);width:1.1in}.career .r{text-align:right}
.edu{margin:0}
/* scorecard */
.scorecard{border-top:1.5px solid var(--ink)}
.crit{display:flex;justify-content:space-between;gap:18px;padding:10px 0;border-bottom:1px solid var(--line)}
.crit b{font-size:10pt}.crit p{margin:2px 0 0;color:var(--mut);font-size:9pt}
.sq{display:flex;gap:3px;align-self:center}.sq i{width:22px;height:22px;border:1px solid var(--line);font:600 8pt/20px "Public Sans";text-align:center;font-style:normal;color:var(--mut)}
.sq i.on{background:var(--blue);border-color:var(--blue);color:#fff}
.total{display:flex;gap:60px;background:var(--navy);color:#fff;padding:16px 22px;margin-top:18px}
.total span{display:block;font-size:7pt;letter-spacing:.14em;text-transform:uppercase;color:#aab6cb}.total b{font:700 18pt/1.3 Archivo,sans-serif}
.scale{font-size:7.5pt;color:var(--mut)}
/* lists */
.list .item{display:flex;gap:12px;padding:12px 14px;border-bottom:1px solid var(--line);background:#fafbfd}
.list .item p{margin:2px 0;font-size:9pt}.list .nm b{font-size:10.5pt}.list .nm span{color:var(--mut);font-size:9pt}
.ind{display:inline-block;background:var(--blue);color:#fff;font-size:7pt;font-weight:600;padding:2px 6px}.ind.adj{background:none;color:var(--ink);border:1px solid var(--ink)}
/* editing */
.ed{outline:none;border-radius:2px}.ed:hover{background:#fff6dc}.ed:focus{background:#fff1c2}
.bar{position:sticky;top:0;z-index:5;background:#fff8e6;border-bottom:1px solid #f0d58a;padding:10px 16px;font-size:10pt;display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap}
.bar button,.mv button{font:inherit;font-size:9pt;border:1px solid var(--ink);background:#fff;padding:5px 10px;cursor:pointer;margin-left:6px}
.mv{display:inline-flex;margin-left:4px}.mv button{padding:1px 6px;margin-left:3px}
@page{size:Letter;margin:0}
@media print{
  html,body{background:#fff}.no-print{display:none!important}
  .page{margin:0;box-shadow:none;break-after:page;min-height:11in}
  .t tr,.item,.crit,.box{break-inside:avoid}
  .ed:hover,.ed:focus{background:none}
}
@media screen and (max-width:8.6in){.page{width:auto;margin:12px 8px;padding:24px 18px;min-height:0}.cols,.boxes,.funnel{grid-template-columns:1fr}.strip{flex-wrap:wrap;gap:16px}.t{display:block;overflow-x:auto}}
`;
