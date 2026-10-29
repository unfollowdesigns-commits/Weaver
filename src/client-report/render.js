// Renders the client pipeline report as print-ready HTML (US Letter).
// Opens in a browser as an editable draft: the team corrects any line, reorders the
// top ten, then prints to PDF. The toolbar never prints.
//
// Design: the firm's navy and blue, set as an editorial brief rather than a dashboard.
// Serif headlines, a stage progress line instead of status pills, one sidebar per
// profile for the facts a client scans (stage, pay, screen score, education).

const esc = (t) => String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const STAR = { direct: '<span class="star" title="Direct industry experience">★</span>', adjacent: '<span class="star" title="Adjacent industry">☆</span>' };
const star = (p) => STAR[p.industry] ?? "";

export function money(v) {
  if (v === null || v === undefined || v === "") return "TBD";
  if (typeof v === "string") return esc(v);
  if (v <= 100) return `${v}%`;
  return v >= 1000 ? `$${Math.round(v / 1000)}k` : `$${v}`;
}

const ed = (t, tag = "span") => `<${tag} class="ed" contenteditable="true">${esc(t)}</${tag}>`;
const li = (p) => (p.linkedin ? `<a href="${esc(p.linkedin)}">LinkedIn</a>` : "");

// Stage as a short progress line: five steps, filled up to where the candidate is.
function progress(p, stages) {
  const b = stages.buckets.find((x) => x.id === p.stage);
  if (p.stage === "out") return `<span class="prog out"><span class="pl">${esc(b?.short ?? "Out")}</span></span>`;
  const steps = stages.funnel.map((id, i) => `<i class="${i <= p.stage_rank ? "on" : ""}${id === p.stage ? " now" : ""}"></i>`).join("");
  return `<span class="prog"><span class="dots">${steps}</span><span class="pl">${esc(b?.short ?? p.stage)}</span></span>`;
}

function page(section, title, n, model, body, cls = "") {
  return `<section class="page ${cls}">
<header class="ph"><span class="sec">${esc(section)}</span><span class="job">${esc(model.job.title)}</span></header>
<div class="pb">${title ? `<h2>${title}</h2>` : ""}${body}</div>
<footer class="pf"><span>${esc(model.firm)} for ${esc(model.client)} · ${esc(model.date)}</span><span><span class="draft-tag">Draft</span><b>${n}</b></span></footer></section>`;
}

export function renderReport(model, stages) {
  const pages = [];
  let n = 1;
  const nar = model.narrative ?? { subtitle: "", read_boxes: [], focus_next: "" };
  const counts = Object.fromEntries(model.funnel.map((f) => [f.id, f.count]));

  // 1. Cover: title, then the search as a funnel to scale.
  const max = Math.max(1, ...model.funnel.map((f) => f.count));
  pages.push(`<section class="page cover">
  <div class="lock"><span class="firm">${ed(model.firm)}</span><span class="for">for</span><span class="client">${ed(model.client)}</span></div>
  <div class="cv-mid"><span class="eyebrow">Search pipeline report</span><h1>${ed(model.job.title)}</h1>
  <p class="sub">${ed(nar.subtitle || `Where the search stands today, drawn from ${model.people.length} leaders.`)}</p>
  <p class="date">${ed(model.date)}</p></div>
  <div class="fun">${model.funnel.map((f) => `<div class="row"><span class="fl">${esc(f.label)}</span><span class="ft"><i style="width:${Math.max(1.5, (f.count / max) * 100).toFixed(1)}%"></i></span><b>${f.count}</b></div>`).join("")}</div>
</section>`);

  // 2. Ranked shortlist
  n++;
  const topRows = model.top.map((p, i) => `<tr><td class="rk">${i + 1}</td>
<td><b class="nm">${esc(p.name)}</b>${star(p)}<small>${esc(p.title)}</small></td>
<td><span class="co">${esc(p.company)}</span><small>${esc(p.location)}</small></td>
<td class="as">${ed(p.assessment || p.signal)}</td>
<td>${progress(p, stages)}<span class="mv no-print"><button data-mv="-1" title="Move up">↑</button><button data-mv="1" title="Move down">↓</button></span></td></tr>`).join("");
  pages.push(page("01 · Shortlist", `Top ${model.top.length} candidates, ranked`, n, model, `
<p class="lede">${ed("Our current ranking across every stage of the search, from first conversation through submission.")}</p>
<table class="t rank"><thead><tr><th></th><th>Candidate</th><th>Company</th><th>Our read</th><th>Stage</th></tr></thead><tbody id="top">${topRows}</tbody></table>
${legend()}
<aside class="pull"><span class="k">Where we're focusing next</span>${ed(nar.focus_next || "[Who we are focusing on next, and why.]", "p")}</aside>`));

  // 3. Where the search stands
  n++;
  const standsRows = model.stands.map((p) => `<tr><td><b class="nm">${esc(p.name)}</b>${star(p)}<small>${esc(p.company)}</small></td><td>${progress(p, stages)}</td>
<td class="n">${money(p.pay.base)}</td><td class="n">${money(p.pay.bonus)}</td><td>${ed(p.signal)}</td><td class="watch">${ed(p.watch)}</td></tr>`).join("");
  const payText = model.pay_range
    ? (model.pay_range.count === 1
      ? `One candidate has a current base on file: ${money(model.pay_range.low)}.`
      : `Current base across the ${model.pay_range.count} candidates with figures runs ${money(model.pay_range.low)} to ${money(model.pay_range.high)}.`) + " [Add targets, bonus, equity and what candidates have told us.]"
    : "[Add the compensation picture: the range, targets, and what candidates have told us.]";
  const boxes = [...nar.read_boxes, { title: "The compensation picture", text: payText }];
  pages.push(page("02 · Pipeline", "Where the search stands", n, model, `
<div class="stats">${model.funnel.map((f) => `<div><b>${f.count}</b><span>${esc(f.label)}</span></div>`).join("")}</div>
<p class="lede">${ed(`Of ${counts.outbound} leaders worked, ${counts.responded} responded and had an initial conversation, ${counts.first} went through a first layer screen, ${counts.second} cleared our second layer screen, and ${counts.submitted} ${counts.submitted === 1 ? "is" : "are"} submitted to you.`)}</p>
${model.stands.length ? `<table class="t"><thead><tr><th>Candidate</th><th>Stage</th><th class="n">Base</th><th class="n">Bonus</th><th>Strongest signal</th><th>Watch item</th></tr></thead><tbody>${standsRows}</tbody></table>${legend()}` : ""}
<h3 class="kick">How to read the pipeline</h3>
<div class="notes">${boxes.map((b, i) => `<div class="note"><span class="num">${String(i + 1).padStart(2, "0")}</span><div><b>${ed(b.title)}</b>${ed(b.text, "p")}</div></div>`).join("")}</div>`));

  // 4. Profiles: cleared and submitted, each with the team's scorecard when there is one
  let sec = 3;
  for (const p of model.profiles) {
    n++;
    const facts = [["Stage", progress(p, stages)], ["Current base", ed(money(p.pay.base))], ["Bonus", ed(money(p.pay.bonus))], ["Equity", ed(money(p.pay.equity))]];
    if (p.team?.average != null) facts.push(["Our screen", `<span class="big">${p.team.average.toFixed(1)}<small> / 5</small></span>${p.team.recommendation ? `<span class="rec">${esc(p.team.recommendation)}</span>` : ""}`]);
    if (p.education.length) facts.push(["Education", ed(p.education.join(" · "))]);
    if (p.linkedin) facts.push(["Profile", li(p)]);
    pages.push(page(`${String(sec++).padStart(2, "0")} · Profile`, "", n, model, `
<div class="prof"><div class="main">
<span class="eyebrow dark">${esc(stages.buckets.find((b) => b.id === p.stage)?.label ?? "")}</span>
<h2 class="pn">${esc(p.name)}${star(p)}</h2>
<p class="role">${esc(p.title)}, <b>${esc(p.company)}</b> · ${esc(p.location)}</p>
<h4>Where they fit</h4><ul class="fit">${p.fit.map((t) => `<li>${ed(t)}</li>`).join("")}</ul>
<h4 class="blue">Where to probe</h4><ul class="probe">${p.probe.map((t) => `<li>${ed(t)}</li>`).join("")}</ul>
${p.career.length ? `<h4>Career</h4><ol class="tl">${p.career.map((c) => `<li><span class="yr">${esc(c.years)}</span><div><b>${esc(c.title)}</b><span>${esc(c.company)}</span></div></li>`).join("")}</ol>` : ""}
</div>
<aside class="side">${facts.map(([k, v]) => `<div><span class="k">${k}</span><div class="v">${v}</div></div>`).join("")}</aside></div>`));

    if (p.team) {
      n++;
      const scored = p.team.criteria.filter((c) => c.score !== null).length;
      const rows = p.team.criteria.map((c) => `<div class="crit"><div class="cl"><b>${esc(c.label)}</b>${ed(c.notes, "p")}</div><div class="meter" aria-label="${c.score ?? "no"} of 5">${[1, 2, 3, 4, 5].map((v) => `<i class="${c.score !== null && v <= c.score ? "on" : ""}"></i>`).join("")}<span>${c.score ?? "–"}</span></div></div>`).join("");
      pages.push(page(`${String(sec - 1).padStart(2, "0")} · Screening scorecard`, `${esc(p.name)}: screening scorecard`, n, model, `
<p class="lede">${ed("Scored by our team after the second layer screen. We score critically: a 3 means meets, a 4 is strong, and a 5 is reserved for areas where a candidate is exceptional.")}</p>
<div class="sc-head"><div><span class="k">Average across ${scored} criteria</span><span class="big">${p.team.average?.toFixed(1) ?? "–"}<small> / 5</small></span></div><div><span class="k">Overall recommendation</span><span class="big">${ed(p.team.recommendation ?? "")}</span></div></div>
<div class="scorecard">${rows}</div>
<p class="legend">1 Does not meet · 2 Weak · 3 Meets · 4 Strong · 5 Exceptional</p>`));
    }
  }

  // 5. First layer screen
  if (model.firstScreen.length) {
    n++;
    pages.push(page(`${String(sec++).padStart(2, "0")} · First layer screen`, "First layer screen", n, model, `
<p class="lede">${ed(`${model.firstScreen.length} candidate${model.firstScreen.length === 1 ? " has" : "s have"} been through our first layer screen. We score candidates once they clear the second layer, so these profiles show what stood out and what we still need to confirm.`)}</p>
<div class="cards">${model.firstScreen.map((p) => `<div class="card"><div class="ch"><b class="nm">${esc(p.name)}</b>${star(p)}<span class="meta">${esc(p.title)}, ${esc(p.company)} · ${esc(p.location)}</span></div>
<p><span class="tag">Signal</span>${ed(p.signal)}</p><p><span class="tag w">Watch</span>${ed(p.watch)}</p></div>`).join("")}</div>${legend()}`));
  }

  // 6. Responded
  if (model.responded.length) {
    n++;
    pages.push(page(`${String(sec++).padStart(2, "0")} · Conversations`, "Responded and initial conversation", n, model, `
<p class="lede">${ed(`${model.responded.length} leaders have responded and had an initial conversation with our team. Candidates with direct or adjacent industry experience are listed first.`)}</p>
<table class="t"><thead><tr><th>Name</th><th>Company</th><th>Title</th><th>Industry</th><th>Location</th></tr></thead><tbody>${model.responded.map((p) => `<tr><td><b class="nm">${esc(p.name)}</b>${star(p)}</td><td>${esc(p.company)}</td><td>${esc(p.title)}</td><td>${p.industry === "direct" ? '<span class="ind">Direct</span>' : p.industry === "adjacent" ? '<span class="ind adj">Adjacent</span>' : ""}</td><td class="mut">${esc(p.location)} ${li(p)}</td></tr>`).join("")}</tbody></table>${legend()}`));
  }

  // 7. Outbound
  if (model.outbound.length) {
    n++;
    pages.push(page(`${String(sec++).padStart(2, "0")} · Outbound`, "Outbound", n, model, `
<p class="lede">${ed(`${model.outbound.length} leaders in the pipeline to connect with.`)}</p>
<table class="t compact"><thead><tr><th>Name</th><th>Company</th><th>Title</th><th>Location</th></tr></thead><tbody>${model.outbound.map((p) => `<tr><td><b class="nm">${esc(p.name)}</b>${star(p)}</td><td>${esc(p.company)}</td><td>${esc(p.title)}</td><td class="mut">${esc(p.location)}</td></tr>`).join("")}</tbody></table>${legend()}`));
  }

  // 8. No longer in process
  if (model.out.length) {
    n++;
    pages.push(page(`${String(sec++).padStart(2, "0")} · Closed`, "No longer in process", n, model, `
<p class="lede">${ed("[Why each candidate left the process, and what it tells us about the market.]")}</p>
<div class="cards">${model.out.map((p) => `<div class="card"><div class="ch"><b class="nm">${esc(p.name)}</b><span class="meta">${esc(p.title)}, ${esc(p.company)}</span></div><p>${ed("[Reason]")}</p></div>`).join("")}</div>`));
  }

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(model.job.title)} · pipeline report (draft)</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,400;6..72,500;6..72,600&family=Public+Sans:wght@300;400;500;600;700&display=swap">
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
:root{--navy:#0d1526;--navy-2:#1b2740;--ink:#141b2b;--mut:#606a7c;--faint:#8a93a3;--line:#e2e6ee;--soft:#f5f7fb;--blue:#2f6fcf;--blue-2:#8fb4ea;--blue-soft:#eaf1fc;--paper:#fff;
--serif:"Newsreader",Georgia,"Times New Roman",serif;--sans:"Public Sans",-apple-system,"Segoe UI",Helvetica,Arial,sans-serif}
*{box-sizing:border-box}
html{background:#e6e9ef}
body{margin:0;color:var(--ink);font:300 9.6pt/1.55 var(--sans);-webkit-font-smoothing:antialiased}
h1,h2,h3,h4{margin:0}
a{color:var(--blue);text-decoration:none}
b{font-weight:600}
.page{width:8.5in;min-height:11in;margin:24px auto;background:var(--paper);box-shadow:0 2px 18px rgba(13,21,38,.12);padding:.55in .7in .85in;position:relative}
.pb{flex:1}
.ph{display:flex;justify-content:space-between;align-items:baseline;font:500 7pt/1 var(--sans);letter-spacing:.18em;text-transform:uppercase;color:var(--faint);margin-bottom:30px}
.ph .sec{color:var(--blue)}
.pf{position:absolute;left:.7in;right:.7in;bottom:.4in;display:flex;justify-content:space-between;align-items:center;padding-top:10px;border-top:1px solid var(--line);font-size:7pt;color:var(--faint)}
.pf b{font:500 9pt/1 var(--serif);color:var(--ink);margin-left:12px}
.draft-tag{font-size:6.5pt;letter-spacing:.16em;text-transform:uppercase;color:#a0661a;border:1px solid #e3c48f;padding:2px 6px}
h2{font:500 25pt/1.08 var(--serif);letter-spacing:-.01em;margin-bottom:10px;max-width:6.4in}
.lede{color:var(--mut);font-size:10pt;max-width:5.9in;margin:0 0 20px}
.eyebrow{font:600 7pt/1 var(--sans);letter-spacing:.24em;text-transform:uppercase;color:var(--blue-2)}
.eyebrow.dark{color:var(--blue)}
.kick{font:600 7.5pt/1 var(--sans);letter-spacing:.18em;text-transform:uppercase;color:var(--ink);margin:28px 0 12px}

/* cover */
.cover{background:var(--navy);color:#fff;padding:.75in .8in .7in;overflow:hidden;display:flex;flex-direction:column;height:11in}
.cover::after{content:"";position:absolute;right:-1.4in;top:-1.4in;width:4.6in;height:4.6in;border:1px solid rgba(143,180,234,.18);border-radius:50%}
.cover::before{content:"";position:absolute;right:-.6in;top:-.6in;width:3in;height:3in;border:1px solid rgba(143,180,234,.12);border-radius:50%}
.lock{display:flex;align-items:baseline;gap:12px;font-size:10pt;position:relative;z-index:1}
.lock .firm{font:600 10pt/1 var(--sans);letter-spacing:.2em;text-transform:uppercase}
.lock .for{font:italic 400 11pt/1 var(--serif);color:var(--blue-2)}
.lock .client{font:500 13pt/1 var(--serif)}
.cv-mid{margin:auto 0;padding:60px 0 40px;max-width:6.3in}
.cover h1{font:500 50pt/1 var(--serif);letter-spacing:-.02em;margin:18px 0 18px}
.sub{font:400 13pt/1.45 var(--serif);color:#c9d3e3;margin:0 0 22px}
.date{font-size:8.5pt;letter-spacing:.14em;text-transform:uppercase;color:var(--blue-2);margin:0}
.fun{display:grid;gap:9px;border-top:1px solid #2a3652;padding-top:18px}
.fun .row{display:grid;grid-template-columns:1.9in 1fr .5in;align-items:center;gap:14px}
.fun .fl{font-size:7.5pt;letter-spacing:.1em;text-transform:uppercase;color:#aab6cb}
.fun .ft{height:8px;background:#18233a;display:block}.fun .ft i{display:block;height:100%;background:linear-gradient(90deg,var(--blue),#5a93e6)}
.fun b{font:500 17pt/1 var(--serif);text-align:right}

/* tables */
.t{width:100%;border-collapse:collapse;font-size:8.8pt}
.t th{text-align:left;font:600 6.6pt/1.2 var(--sans);letter-spacing:.16em;text-transform:uppercase;color:var(--faint);padding:0 8px 8px;border-bottom:1px solid var(--ink)}
.t td{padding:10px 8px;border-bottom:1px solid var(--line);vertical-align:top}
.t.compact td{padding:6px 8px;font-size:8.4pt}
.t small{display:block;color:var(--mut);font-size:7.8pt;margin-top:1px}
.t .n{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
.nm{font-weight:600;color:var(--ink);white-space:nowrap}
.co{font-weight:500}
.rk{font:500 20pt/1 var(--serif);color:var(--blue);width:34px;padding-top:7px!important}
.rank td:nth-child(2){width:1.55in}.rank td:nth-child(3){width:1.35in}.rank td:nth-child(5){width:1.15in}
.as{color:var(--ink)}
.watch{color:var(--mut)}
.mut{color:var(--mut)}
.star{color:var(--blue);margin-left:4px;font-size:.95em}
.legend{font-size:7pt;color:var(--faint);margin:10px 0 0}.legend span{margin-left:14px}

/* stage progress */
.prog{display:inline-grid;gap:4px}
.prog .dots{display:flex;gap:3px}
.prog .dots i{width:12px;height:3px;background:var(--line);display:block}
.prog .dots i.on{background:var(--blue)}
.prog .dots i.now{background:var(--navy)}
.prog .pl{font-size:7.4pt;font-weight:500;color:var(--ink);white-space:nowrap}
.prog.out .pl{color:var(--faint)}

/* pull quote and notes */
.pull{margin-top:28px;padding:18px 0 0;border-top:2px solid var(--navy);display:grid;grid-template-columns:1.6in 1fr;gap:20px}
.pull .k{font:600 7pt/1.4 var(--sans);letter-spacing:.18em;text-transform:uppercase;color:var(--blue)}
.pull p{margin:0;font:400 13pt/1.45 var(--serif);color:var(--ink)}
.stats{display:grid;grid-template-columns:repeat(5,1fr);border-top:1px solid var(--ink);border-bottom:1px solid var(--line);margin:4px 0 18px}
.stats div{padding:12px 10px 12px 0}
.stats b{display:block;font:500 22pt/1 var(--serif)}
.stats span{display:block;font-size:6.6pt;letter-spacing:.12em;text-transform:uppercase;color:var(--faint);margin-top:6px;line-height:1.35}
.notes{display:grid;grid-template-columns:1fr 1fr;gap:16px 26px}
.note{display:grid;grid-template-columns:26px 1fr;gap:8px}
.note .num{font:500 13pt/1.2 var(--serif);color:var(--blue)}
.note b{display:block;font:500 11.5pt/1.3 var(--serif);margin-bottom:4px}
.note p{margin:0;color:var(--mut);font-size:8.8pt}

/* profile */
.prof{display:grid;grid-template-columns:1fr 2.05in;gap:30px}
.pn{font-size:30pt;margin:10px 0 6px}
.role{font-size:10pt;color:var(--mut);margin:0 0 22px}
.role b{color:var(--ink)}
h4{font:600 7pt/1 var(--sans);letter-spacing:.18em;text-transform:uppercase;margin:20px 0 8px;color:var(--ink)}
h4.blue{color:var(--blue)}
.fit,.probe{list-style:none;margin:0;padding:0;display:grid;gap:7px}
.fit li,.probe li{position:relative;padding-left:18px;font-size:9.4pt;line-height:1.5}
.fit li::before{content:"";position:absolute;left:0;top:.62em;width:9px;height:1.5px;background:var(--ink)}
.probe li::before{content:"?";position:absolute;left:0;top:0;font:600 8pt/1.7 var(--sans);color:var(--blue)}
.tl{list-style:none;margin:0;padding:0;border-left:1px solid var(--line)}
.tl li{display:grid;grid-template-columns:.95in 1fr;gap:10px;padding:6px 0 6px 14px;position:relative}
.tl li::before{content:"";position:absolute;left:-4px;top:12px;width:7px;height:7px;border-radius:50%;background:#fff;border:1.5px solid var(--blue)}
.tl li:first-child::before{background:var(--blue)}
.tl .yr{color:var(--faint);font-size:8.4pt;font-variant-numeric:tabular-nums}
.tl b{display:block;font-size:9.2pt}.tl span{color:var(--mut);font-size:8.6pt}
.side{background:var(--soft);padding:18px 18px 20px;display:grid;gap:15px;align-content:start;border-top:3px solid var(--navy)}
.side .k{display:block;font:600 6.5pt/1 var(--sans);letter-spacing:.18em;text-transform:uppercase;color:var(--faint);margin-bottom:5px}
.side .v{font-size:10pt;font-weight:500}
.big{font:500 22pt/1 var(--serif)}.big small{font-size:11pt;color:var(--faint)}
.rec{display:inline-block;margin-left:8px;font-size:8pt;font-weight:600;background:var(--blue);color:#fff;padding:2px 7px;vertical-align:middle}

/* scorecard */
.sc-head{display:grid;grid-template-columns:1fr 1fr;border-top:2px solid var(--navy);border-bottom:1px solid var(--line);padding:14px 0;margin-bottom:6px}
.sc-head .k{display:block;font:600 6.8pt/1 var(--sans);letter-spacing:.18em;text-transform:uppercase;color:var(--faint);margin-bottom:6px}
.crit{display:grid;grid-template-columns:1fr 1.55in;gap:24px;padding:11px 0;border-bottom:1px solid var(--line);align-items:center}
.cl b{font-size:9.6pt}.cl p{margin:2px 0 0;color:var(--mut);font-size:8.5pt}
.meter{display:flex;gap:4px;align-items:center}
.meter i{flex:1;height:6px;background:var(--line);display:block}
.meter i.on{background:var(--blue)}
.meter span{font:500 12pt/1 var(--serif);width:18px;text-align:right}

/* cards */
.cards{display:grid;gap:0;border-top:1px solid var(--ink)}
.card{padding:14px 0;border-bottom:1px solid var(--line);display:grid;gap:5px}
.ch .nm{font:500 13pt/1.2 var(--serif)}
.ch .meta{display:block;color:var(--mut);font-size:8.4pt;margin-top:2px}
.card p{margin:0;font-size:9.2pt}
.tag{display:inline-block;width:.6in;font:600 6.6pt/1.6 var(--sans);letter-spacing:.16em;text-transform:uppercase;color:var(--blue)}
.tag.w{color:#a0661a}
.ind{display:inline-block;font-size:7pt;font-weight:600;padding:2px 6px;background:var(--blue);color:#fff}.ind.adj{background:none;color:var(--blue);border:1px solid var(--blue)}

/* editing */
.ed{outline:none;border-radius:2px}.ed:hover{background:#fff6dc}.ed:focus{background:#fff1c2}
.cover .ed:hover,.cover .ed:focus{background:rgba(255,255,255,.08)}
.bar{position:sticky;top:0;z-index:5;background:#fff8e6;border-bottom:1px solid #f0d58a;padding:10px 16px;font:400 10pt/1.4 var(--sans);display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap}
.bar button,.mv button{font:inherit;font-size:9pt;border:1px solid var(--ink);background:#fff;padding:5px 10px;cursor:pointer;margin-left:6px}
.mv{display:flex;margin-top:6px}.mv button{padding:0 6px;margin:0 3px 0 0}
@page{size:Letter;margin:0}
@media print{
  html,body{background:#fff}.no-print{display:none!important}
  .page{margin:0;box-shadow:none;break-after:page;min-height:11in}
  .t tr,.card,.crit,.note{break-inside:avoid}
  .ed:hover,.ed:focus{background:none}
}
@media screen and (max-width:8.6in){.page{width:auto;margin:12px 8px;padding:24px 18px 70px;min-height:0}.cover{height:auto}.pf{left:18px;right:18px;bottom:20px}.prof,.notes,.pull,.sc-head{grid-template-columns:1fr}.stats{grid-template-columns:repeat(3,1fr)}.fun .row{grid-template-columns:1fr 1fr .4in}.t{display:block;overflow-x:auto}.cover h1{font-size:36pt}}
`;
