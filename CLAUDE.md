# District Partners · Loxo candidate scoring system

Build brief. Read this first, every session.

## Who

Client: District Partners (DP), executive search firm, Washington DC.
Contact: Josh Fisher, founder.
Built by: Houssem Gabsi.

DP already uses Claude. They dump candidate data into a chat by hand and
generate client-facing pipeline reports from it. They do not build software.
They want the data plumbing and the scoring automated.

Their ATS is Loxo. Plan tier to confirm, must be professional or above.

## Why they came to us

30 Oct 2026 (Houssem): Josh first asked Loxo to build this for them and Loxo never
got back to him. Speed matters more than polish; positioning: "you asked Loxo, we
built it on top of Loxo". Keep it on Loxo's official, documented access only, write
only into Loxo's own scorecards or notes, so it works alongside anything Loxo ships
later and never puts their Loxo support at risk.

## What the client asked for

Josh's exact four questions:

1. How to enable and connect Loxo MCP to ChatGPT.
2. Whether the integration provides complete candidate work histories, notes
   and resume contents.
3. Whether all candidates on a specific job can be retrieved in one request.
4. Whether AI-generated assessments and scores can be written back into Loxo.

He wants to evaluate and rank 20 to 100 candidates at a time, and score new
candidates automatically as they are added to a job.

## Scope v1

Four things. Nothing else.

1. Pull every candidate on a given job from Loxo.
2. Score each candidate against that job's scorecard.
3. Write the score and the written assessment back into Loxo.
4. Run automatically when a candidate is added to the job.

## Out of scope

Do not build these in v1 even if they seem useful.

- The client-facing pipeline report PDF. DP already produces these themselves.
  Possible phase 2, only if they ask. 29 Oct 2026 (Houssem): prepare it now as
  phase 2, not switched on or sold in v1. Built: `npm run report:client`
  (scripts/client-report.js, src/client-report/). Read-only; drafts DP's report
  from Loxo, Weaver's first reads and the team's own Loxo scorecards; the AI
  writes only the short narrative, with references (C1...) instead of names
  and no pay; the team edits in the browser and prints to PDF. Stage mapping in
  config/report/stages.v1.json, to confirm against their real Loxo stages.
- A UI or dashboard. The output lives in Loxo.
- Any rewrite of DP's existing Claude prompts or report format.
- Anything touching the DP website project, which is separate work.

## Stack

- Loxo REST API for read and write.
- Claude API for scoring. One call per candidate so 100 candidates is fine.
- Render for hosting (Pro workspace, Virginia region), in the client's own
  account. Since 30 Oct 2026: one always-on web service with a small persistent
  disk; the hourly catch-up runs inside it (Render cron jobs cannot use a disk,
  and drafted criteria must survive deploys). See docs/RUNBOOK.v3.md. (Decided
  28 Oct as web service + cron; changed for automatic criteria.)
  n8n was dropped: the server already does the trigger and orchestration.
- Node for any scripts.

No new services without a reason written down here.

- OpenAI (added 27 Oct 2026): testing only, because Houssem has an OpenAI key
  and no Claude key yet. Sits behind the same provider switch
  (`SCORING_PROVIDER`). Production scoring stays on Claude. Remove once the
  Claude key is in place.
- `@anthropic-ai/sdk` is the only package dependency.

## Unknowns to resolve before writing feature code

These three change the shape of the build. Test them first, against a real
API key, and record the answers in this file under Findings.

1. Does the API return resume text or parsed resume content, or only
   metadata? Loxo states their own in-app AI chat does not expose raw resume
   files. The REST API may behave differently. Unconfirmed either way.
2. Can scores be written into Loxo scorecard fields, or only into notes and
   activity? Loxo documents "some write actions like logging activity or
   updating a deal" through MCP. API write scope unconfirmed.
3. Does Loxo fire a webhook when a candidate is added to a job, or does the
   workflow have to poll on a timer?

Loxo's public API docs could not be read during scoping. Treat every API
detail as unverified until a call against the real account proves it.

## Needed from the client

Simplified 28 Oct 2026 (Houssem: the client has no scorecard and should not
have to design one). Ask for two things only:

1. Loxo API key, read access first. Write access added after a working demo.
   If "API Keys" is missing in Loxo Settings, Loxo support switches it on
   (paid feature, Professional plan or above).
2. Which searches to test: all open searches, or the ones Josh picks.
   29 Oct 2026: the client wants a full test across their searches, not
   one job. `scripts/score-jobs.js` scores several jobs in one read-only run,
   shows the candidate count and cost estimate first, and makes a summary page
   plus one report per search. `scripts/fake-loxo.js` serves sample searches
   locally so the full flow can be shown before the key arrives.

Decided by us, shown to Josh for a yes or a change:
- Scorecard: per search, like DP's own (see the correction below). Drafted by
  `npm run scorecard:draft` from the job, approved by Josh, saved as
  `config/scorecards/jobs/job-<id>.v<N>.json`. Fallback for any search without
  one: `config/scorecards/standard-executive.v2.json` (DP's scale labels).
- Where the score lands: a Loxo scorecard on the candidate.

Correction, 29 Oct 2026, after DP sent two of their own client pipeline
reports (kept off the repo: real candidates). DP does have a scorecard:
- Nine criteria per search, written for that role (e.g. industry insight,
  technical depth, relocation, scaling, C-suite partnership), scored 1 to 5:
  1 Does not meet, 2 Weak, 3 Meets, 4 Strong, 5 Exceptional. "We score
  critically." Average shown as "4.1 / 5", plus an overall recommendation Yes.
- They score only after the second layer screen, with interview knowledge.
- Per candidate they write "Where he fits" / "Where to probe", and in tables
  "Strongest signal" / "Watch item". Industry tag: star for direct industry,
  open star for adjacent.
- Stages: Outbound, Responded and initial conversation, First layer screen,
  Second layer screen and cleared, Submitted to client.
- Compensation (base, bonus, equity) is shown in their reports to the client.
Consequences: Weaver is the first read on the record before any call, not a
replacement for their post-interview scorecard. Use their scale labels and
wording; criteria per search (drafted from the job, approved by Josh), with
the standard scorecard as fallback. The pipeline report is the obvious
phase 2. Built 29 Oct 2026: scorecard v2, scoring prompt v2 (strongest
signal, watch item, where they fit, where to probe, industry star), per-search
scorecards with draft and approve, report in DP's navy and blue (their brand
color; Houssem: keep the color, improve the layout).

## Rules

- API keys live in a local .env file, never in chat, never committed, never
  pasted into a message. .env is in .gitignore from the first commit.
- Start read-only. No write call runs against the live account until Josh has
  seen a dry run and approved it.
- Candidate data is real people's personal and compensation data. Keep it in
  the project folder, do not copy it into chats or scratch files.
- A human stays in the loop on every score. The system surfaces an
  assessment, it never decides an outcome. Automated scoring that feeds
  hiring decisions is regulated in some US jurisdictions, and Loxo draws the
  same line for their own tool.
- Never overwrite an existing file. Add a new version beside it.
- Commit messages are shown in the hosting dashboard, which the client will
  see once the system runs in their account. Keep them short and neutral:
  what changed in the system, nothing else. No client names, no prices, no
  comments on vendors or decisions. Reasons go in this file, not in commits.

## Standard for client deliverables

Set 29 Oct 2026 after Houssem had to ask twice. Every proposal, preview or
deck for the client covers all of these before it is shown to him:

1. Their own words: what they asked, answered point by point.
2. The package: everything included, and what is not included.
3. How it works in plain words, plus an "under the hood" view (data flow,
   which systems are called, what is removed before the AI).
4. Running costs: every provider, who pays, monthly range, scaling with
   volume, one-off test cost, and the cost guards. Our fee "quoted
   separately" unless Houssem gives numbers.
5. Their data: where it runs, who owns the accounts, training, revoking.
6. Safety and human review; timeline; what we need from them; next steps.
7. Their world: a Washington, DC executive search firm placing leaders in
   PE- and VC-backed growth companies. Samples, wording and examples fit it.
8. Plain language, no technical terms on client pages; US spelling.
9. Checked as rendered (desktop, phone, PDF pages) before sending.

## Note on MCP

Loxo MCP is a chat connector. It only runs while a person is typing. It is
free on professional plans and worth Josh turning on for ad-hoc questions,
but it cannot score candidates automatically and is not the foundation of
this build. This system runs on the REST API.

## Where things live

- Code: GitHub `unfollowdesigns-commits/Weaver`. The repo is the source of
  truth.
- Houssem's Mac: `~/Documents/District Partners/4 BUILD - Loxo Candidate Scoring`,
  a clone of the repo. The local `.env` with the real keys lives only here.
- Test server (Houssem's own Render, free plan, sample data only, Virginia):
  https://loxo-scoring-test.onrender.com, service srv-dbgvokg8v5cc73fm4csg,
  deploys automatically from this branch. Delete it at go-live.
- Client preview (sample data, no client name):
  https://claude.ai/artifact/AUCwjDSusArDCtc5Lrhoqm, built from
  `preview/weaver.v6.html` since 29 Oct 2026 (DP navy and blue, their scorecard wording and stages; v5 before it: plain-language client version with the full package: Weaver scoring and Claude connected to Loxo; v2 before it;
  `preview/shortlist.html` is the earlier one). Client-facing pages use no
  technical terms: no API, MCP, webhook, server, Render.

## Findings

Record confirmed API behaviour here, with the endpoint and the date, so
nothing gets re-guessed later.

From Loxo's official API reference (https://loxo.readme.io/llms.txt), read
27 Oct 2026. Documented, not yet tested on the real account:

1. Resume text: yes. `GET /{slug}/people/{person_id}/resumes` lists resumes,
   newest first; `GET /{slug}/people/{person_id}/resumes/{id}` returns the
   extracted text and says if it was truncated.
2. Write-back: yes, as a real scorecard. `POST /{slug}/scorecards` takes
   person_id, job_id, scorecard_type_id (required), recommendation type,
   summary, and scorecard_attributes (name, score, notes) per criterion.
   Alternative: a note via `POST /{slug}/person_events`.
3. Trigger: webhooks exist. `POST /{slug}/webhooks` with item_type
   `candidate`, action `create`, endpoint_url. No polling needed.

Also documented: candidates on a job `GET /{slug}/jobs/{job_id}/candidates`
(scroll_id pagination, filter by person_id); person and intake notes
`GET /{slug}/people/{id}` (field `description`); work history
`GET /{slug}/people/{id}/job_profiles`; activity notes
`GET /{slug}/person_events?person_id=` (notes_format=plain). Auth: bearer
token, URL https://{domain}/api/{agency_slug}/..., default domain app.loxo.co.
API keys: Settings > API Keys, account admins only. API is a paid feature.

Confirmed on the real account, 29 Oct 2026 (npm run loxo:check):
- Connection works with LOXO_DOMAIN=app.loxo.co and LOXO_AGENCY_SLUG=
  district-partners (their web address is district-partners.app.loxo.co).
  Bearer key format: `sk-loxoapi-...`. They also sent a second hex key whose
  purpose is unknown; not used.
- Scorecard types: 1 Interviewer, 2 Recruiter -> LOXO_SCORECARD_TYPE_ID=2.
  Recommendation types: 1 Strong No, 2 No, 3 Yes, 4 Strong Yes ->
  LOXO_RECOMMENDATION_YES_ID=3, LOXO_RECOMMENDATION_NO_ID=2.
- No webhooks set up yet. Activity types include "Note" (2176068).
- GET /jobs returned exactly 100 with no scroll_id: it pages by page number.
  `list()` now follows page numbers too. Job statuses seen: Active, On Hold,
  Placement, "Opportunity Closed - ..." (several reasons).

First probe, job 3688816 (Head of Finance and Accounting, 194 candidates), 29 Oct 2026:
- GET /people/{id} came back thin: name, compensation fields (all null on that
  person), types and custom fields only. No title, company, location or
  description. Now also read: GET /people?include_ids[]=&serialization_set=
  api_row_person_with_job_and_edu_profiles (documented), merged in.
- GET /people/{id}/job_profiles returned ids only; each is now fetched from
  /job_profiles/{id} (up to 10). Education from /education_profiles.
- That person had no resume in Loxo. Resume coverage to measure.
- Coverage on that search (all 194, loxo:check --probe --sample 200, run
  before request pacing, so possibly slightly low): 164 with a resume, 170
  with a real work history entry, 73 with notes over 200 characters, 178 with
  enough to score. By stage: Outbound 146/143, Responded 14/12, Screened 5/5,
  Submitted 3/3, No longer in process 26/15. The first 10 in pipeline order
  happened to be bare records. No title on the person record: current title
  and company now come from the open work history entry.
- First real run, 29 Oct 2026: 8 screened/submitted candidates on 3688816,
  OpenAI gpt-4.1 on Houssem's key (dry run). Resumes and recruiter notes came
  through; write-ups specific. Found: pay reached the model through recruiter
  notes and the job's salary range (one "where to probe" mentioned current
  comp). Fixed: pay sentences removed from notes, resume and job description
  before the model, prompt v3 forbids pay, output guard removes and flags any
  pay mention. Their team's top candidate (4.1 / Yes in their report) scored
  3.4 and ranked 4th on the bare Loxo template; 7 of 8 Yes. Sharpened
  scorecard job-3688816.v1 written from their report. Re-run with it (same 8,
  gpt-4.1): their top candidate 3.9 / Yes (tied first), 5 Yes / 3 No, industry
  stars match their own report, order close to theirs. A "No" at 3.9 ranked
  first by average: ranking now puts Yes before No, then average. gpt-4.1
  still writes "likely ..." inferences from titles; check Claude on this.
- Review of the second run (30 Oct 2026, Houssem's coworker), all fixed: model
  name removed from the report header; candidates now chosen by name from the
  firm's own report (--names-file, local file in data/), since 3 of the 8 by
  stage were not in it and the submitted candidate was missing; pay from Loxo
  pay fields only (notes mixed candidate pay with the firm's outreach pitch and
  were cut mid-sentence); range from the scorecard ($200k ceiling per the
  firm's report; the Loxo job said $160k-$220k); adjacent industry widened to
  match the firm's stars (enterprise software counts); one fixed location rule;
  direct-industry anchors with named IT solutions firms; "No" means a missed
  must-have, explained in the report; the team's own scores removed from notes
  before the model (a first read had matched the team's 4.1 exactly); no
  resume means evidence never cites a resume; flag legend in the report.
  Scorecard job-3688816.v2. Location rule and range to confirm with Josh.
- Independent code review, 30 Oct 2026 (20 findings, all fixed, each with a
  test from the reviewer's own examples in test/review-fixes.test.js): names and
  LinkedIn handles now scrubbed from resume, notes and history; graduation years
  blanked on degree lines; pay detection widened (TC, all-in, earns, full dollar
  amounts, M) and narrowed for business figures (raises, savings, Compensation
  Committee); team recommendations and Weaver's own notes kept from the model;
  stage names passed in report, full test and sweep; Loxo pay fields parsed as
  the first amount; constant scroll cursors followed; writes never retried on
  5xx (duplicates); empty records skipped in sweep and webhook (rotating window,
  daily cap taken after the check); webhook matches the person exactly; Loxo
  filters double-checked on our side (a record without a person id trusts the
  filter); pay removed from criterion evidence; no model name in Loxo; accents
  in names; only http(s) links; blank team scores are no score. Known and
  accepted: in direct (non-batch) mode a candidate whose answers keep failing is
  retried each hourly run (production uses batches, which count failures).
- Rehearsal: test/support/real-shape-loxo.js reproduces the real account's
  quirks; test/e2e-real-shape.test.js runs read, privacy, scoring, report, write
  payload and client report end to end; scripts/fake-loxo-real.js serves it on
  port 8792 for running the commands by hand.
- Two more review passes on name and pay cleaning (30 Oct 2026), all cases fixed
  with tests (test/review-fixes.test.js). Pay: one rule set in isAboutPay (pay
  words unless pay-as-a-topic; pay figures with cues; counts are not pay; business
  figures stay without a cue). Names: folded matching, possessives, titles,
  hyphen/apostrophe parts, everyday-word parts only next to the name, the
  candidate's own employers/schools/location kept whole unless they hold two name
  parts (own firm). Known limits, accepted and stated: an everyday-word name part
  used alone ("Austin led FP&A") stays; nicknames not in Loxo stay; a firm named
  after the surname only ("Roe Advisory") keeps the surname; unusual pay phrasing
  can still slip through the cleaning, which is why the prompt forbids pay and the
  output guard plus `npm run verify` check what the AI wrote. Final pass (same day):
  a firm named after the candidate is scrubbed (protected employers only when the
  name part is an everyday word), loosely written team scores removed ("avg 4.1",
  "strong yes", "gave him a 4"), more pay shorthand caught ("he's at 240", "W2 was
  410", "240 + 40"), percentages, counts and business amounts kept, school names
  cleaned, hyphenated full names caught, name matches never cross a full stop.
  102 tests. After every real run, `npm run verify` before anything is shown.
- Automatic criteria (30 Oct 2026, Houssem's decision: "no manual step, every
  search as sharp as Imperium, Josh can tweak later"): the first time Weaver sees
  a search without an approved scorecard, it drafts the descriptions (what a 3 and
  a 5 look like) and the industry definitions from the job, keeping the firm's
  exact criteria names from the Loxo template, stores them (CRITERIA_DIR, a
  persistent disk on Render) and uses them straight away, in test runs and live.
  One draft per search even under concurrent triggers; reused across restarts; a
  changed job description gives a new version. Reports say "drafted automatically,
  not yet approved". An approved scorecard always wins; then `npm run rescore`.
  AUTO_CRITERIA=false restores approved-only live scoring. This replaces "drafted
  by npm run scorecard:draft, approved by Josh" as the default.
- Re-scoring after criteria change (30 Oct 2026, Houssem's ask before go-live):
  `npm run rescore -- --loxo-job <id> [--go] [--write]`. Finds AI scorecards on
  the search whose summary names another scorecard version, shows count and
  cost, re-scores only those, and updates each existing AI scorecard in place
  (PUT /scorecards/{id}: documented by Loxo, to test on "Accounting - Test"
  with the write test). Not available with LOXO_WRITE_TARGET=note yet. Manual
  on purpose: a criteria change never triggers AI cost by itself.
- First full-search run (30 Oct 2026, Imperium search 3688816, all 194, gpt-4.1, scorecard
  v2, prompt v3): 180 read, 14 not enough in Loxo, 0 errors, all verify checks passed. But 129
  of 180 "yes" (72%), down to averages of 3.0: a pass mark, not a short list. Also: he/she
  guessed in places; the pay guard wiped two whole summaries for one sentence; one record with
  no evidence on any criterion came back "- / 5, No"; one evidence line quoted the scorecard's
  rule. Fixed the same day: prompt v4 ("yes" is the short list, "they", no quoting rules, no
  "likely"); code bar for "yes" (average 3.5 or more and evidence on 7 of 9, else listed No with
  a below_bar flag, ranked above other Nos; a scorecard can set recommendation.yes_min_average);
  pay guard drops only the pay sentence; he/she rewritten to "the candidate"; a read with no
  evidence is "not enough to score"; verify checks pronouns, quoted rules, empty reads and warns
  above 50% yes. Claude skill v3 says the same. On that run the 3.5 bar alone would leave about
  65 yes (36%). Josh's top candidate's rank in this run not yet checked. Re-run to confirm.
  Re-run with prompt v4 (same day): 179 read, 15 not enough, 0 errors, all checks passed, but
  only 7 yes (4%): the AI itself said no to 172, the prompt overshot. Prompt v5: the AI's yes/no
  only answers "is a must-have missed"; the short-list bar is applied in code from the scores.
  Expected near the ~65 estimate above. Re-run to confirm.
- Go-live package (30 Oct 2026, Houssem: "the full package ready, no surprises, before I write
  to Josh"). docs/GO-LIVE.v1.md is the one ordered list to delivery (email to Josh, first Claude
  run, write test on the call, Render setup, switch on). Built for it: `npm run preflight`
  (every account, key, ID and setting; the Claude key checked free with a model lookup);
  `npm run write-test` (one scorecard on "Accounting - Test", read back, no duplicate, update
  in place); verify prints the real AI cost of each run; test/claude-provider.test.js checks the
  Claude connection against a stand-in Claude service (Opus 5.5 high effort, JSON format,
  refusal fallback "default", batch without fallback, thinking and fallback blocks skipped).
  Fixed while auditing: Weaver now recognizes its own Loxo scorecards by creator name OR summary
  first line (if Loxo drops one, no duplicates); the team-scorecard reader uses the same test;
  in dry run the server remembers who it read (only mattered with batch off: batches already
  acted as memory); the daily cap now covers the hourly catch-up. Recruiter guide v4 (Yes rule,
  below-bar flag). `npm run rebar` re-applies the bar to a saved run without AI calls.
  120 tests. The OpenAI test key ran out (Houssem, 30 Oct): next real run is on DP's Claude key.
- Claude skill v4 (30 Oct 2026, Houssem: "Josh asks like he asks a coworker, no limitations, no
  complications"): plain casual requests, acts first, one short question at most; "sharpen a
  search" drafts three lines (must-haves, target companies/industries, location) for the Loxo
  job description, which Weaver's automatic criteria then read (a changed description gives a
  new criteria version). This is how searches other than Imperium get as sharp: Imperium's
  criteria were written from the firm's own report, a new search only has its job description.
- Every open search, nobody types numbers (30 Oct 2026, Houssem: "scan their Loxo"; until then
  LOXO_AUTO_SCORE_JOB_IDS had to list each search number by hand). src/searches.js: empty or
  "all" = every search Loxo shows as open (isOpenStatus: Active/Open), re-read every 10 minutes
  and on a webhook for an unknown search (a search opened today is picked up); a list limits it;
  LOXO_SKIP_JOB_IDS leaves searches out (the test search 3011811). Used by the server, the
  hourly catch-up, the manual sweep and preflight. Backlog on all open searches is worked
  through within the 200-a-day cap. docs/GO-LIVE.v2.md replaces v1 (four asks in the email to
  Josh, no search list, no Imperium-specific questions). 124 tests. `npm run preflight --
  --estimate` counts everyone on the open searches (Loxo only, free) and shows the one-time
  backlog cost (2.5 to 5 cents a read in batch, about 8% skipped as name-only) and days at the cap.
- Ready kit (30 Oct 2026, Houssem: "I want everything ready"): `npm run ready` (tests, current Yes
  rule on the first full real run on the Mac, people and one-time cost on the open searches; prints
  only counts); render.yaml Blueprint for DP's Render (checked against render.com/docs/blueprint-
  spec: runtime node, region virginia, plan 0.5c-512mb since "starter" is no longer a plan ID,
  autoDeployTrigger "off" since autoDeploy is deprecated, 1 GB disk at /var/data, secrets
  sync:false, WEBHOOK_SECRET generated, dry run on); docs/EMAIL-JOSH.v1.md, docs/CALL-AGENDA.v1.md,
  deliverables/dp-recruiting-skill.v4.zip; docs/GO-LIVE.v3.md (Phase 0 ready check, Blueprint).
- Independent review, 30 Oct 2026 afternoon (a separate Claude session, at Houssem's request), all
  fixed: (1) the write test could write a real score to any search number typed; it now refuses
  anything but 3011811 or a search titled "test" (LOXO_TEST_JOB_ID deliberately not used: the Mac's
  .env may still point it at the live Imperium search); (2) the daily cap lived in memory and did
  not count every AI call; it is now kept in usage.json on the disk (survives restarts) and every
  AI call through the server counts, including retries, batches and criteria drafts (capProvider),
  with none made past it; manual Mac scripts are deliberate and not capped; (3) "stop" only
  stopped writing; SCORING_PAUSED=true now stops all AI scoring (or Suspend the service);
  (4) docs: step numbers, preflight's WEBHOOK_SECRET check no longer fails before step 9, email
  wording ("limits itself to about 200 a day", monthly limit = hard ceiling). GO-LIVE.v4,
  EMAIL-JOSH.v2, CALL-AGENDA.v2. 127 tests.
- Guide folder (30 Oct 2026, Houssem: "a full folder of how to use Weaver and what to do now, step
  by step, as for a person who never used it"): guide/00 to 08 (start here, today, when Josh replies,
  the call, switch it on, day to day, every command, if something goes wrong, words). Every command
  checked against the scripts; file 01 step 5 rehearsed with a .env still set to one search (the
  prefix LOXO_AUTO_SCORE_JOB_IDS= overrides it). Found while writing: DP's Loxo key may be read-only
  (the plan was "read first, write after a demo"), so EMAIL-JOSH.v3 asks for write access before the
  call. CALL-AGENDA.v3: pay answer worded exactly (filtered, instructed, output checked), after the
  review noted that some pay phrasings get through the filter (known limit, see above).
- guide/01b-TEST-IT-YOURSELF (30 Oct 2026, Houssem: "how to test"): optional, on his own Claude key
  (about $2): Test A real Claude on the Imperium screened candidates plus verify; Test B the server
  on the Mac in dry run, every open search, cap 5 in a separate counter file. Test B rehearsed on the
  stand-in Loxo: criteria drafted, 4 scored, the 5th stopped by the cap (counted as failed), 0 written.
- Ready check on the real account (30 Oct 2026): Yes 63 of 179 (35%) on the first full run with the
  current rule; the team's #1 at rank 31 or better, in Yes (team's top 10: 2 to 3 in Yes, 4 just
  below the bar, their submitted candidate a No for missing IT solutions experience: ask Josh if
  that is a must-have). 145 open searches, 27,283 people: scoring all would take ~126 days at the
  cap and $628-1,255. Houssem: "steady and good cost", rank "when they need", as Josh asked (20-100
  at a time). Built: src/baseline.js. The hourly catch-up scores only people added after Weaver
  first saw a search (kept in baseline.json on the disk); a search's existing pipeline is scored
  only when listed in LOXO_BACKLOG_JOB_IDS (Josh names it; "all" = old behaviour). The webhook
  is unaffected (a created candidate is new). Preflight --estimate costs only the listed searches.
  EMAIL-JOSH.v4 (nothing to fill in; asks which searches to rank first), GO-LIVE.v5,
  CALL-AGENDA.v4, guide updated. 132 tests.
- Rate limit: 429 after a burst of roughly 12 requests a second. Client now
  paces to LOXO_MAX_PER_SECOND (default 4) and retries 429 with 2-30 s waits.
- Pipeline entry: { id, position, person: {...}, workflow_stage_id,
  latest_person_event, candidate_rejection_reason }. Stage names from
  GET /workflow_stages (documented), mapped by id.
- The job carries DP's own scorecard template (scorecard_template with
  scorecard_template_attributes[].name/position). Weaver now uses it when the
  search has no approved file, before the standard scorecard.
- Job: description_text (plain), company.name, status.name, salary fields,
  counts[] (id, name, count). Scorecards list pages with current_page /
  total_pages. Person events: notes text, activity_type.name, job_id.

Not documented: response field names (schemas are empty), webhook body
format, rate limits. `src/loxo/map.js` guesses with fallbacks; confirm with
`npm run loxo:check -- --job <id> --probe` and the first saved webhook in
data/webhooks/, then record the real names here.

Cross-check, 28 Oct 2026: the community server tbensonwest/loxo-mcp-server
(unofficial, not used in the build) reads the same API. Its code shows lists
under `candidates` / `people` with `scroll_id` and `total_count`; person
fields `title`, `company` (text), `city`/`state`/`country`, `description`,
`skillsets` (comma text), `job_profiles` with `month`/`year`/`end_month`/
`end_year` and `company.name`; `education_profiles` with `school`/`year`;
and compensation fields on the person (`compensation`, `salary`, `bonus`,
`equity`), which stay out of the model input. `src/loxo/map.js` handles both
these names and the earlier guesses. Still to confirm on the real account.
Its tests (29 Oct) show a pipeline entry as `{ id, person: { name },
workflow_stage_id }` (person nested, so the person id is `person.id`) and a
created event returned as `{ person_event: { id, person_id, job_id, ... } }`.
Both already handled. Test fixtures written by that developer, not Loxo.

## Status

27 Oct 2026: scoring half built, by Houssem's decision, before the Loxo key
(an exception to "test the unknowns first"; that part does not depend on
them). Built and tested on made-up data: scorecard file, scoring prompt v1,
Claude / OpenAI / offline providers, answer checks, average and recruiter
flags computed in code, ranked dry-run report. See README.

The candidate record sent to the model leaves out name, contact details,
pay and graduation years (since 30 Oct 2026 also inside resume and note text). Candidate text is fenced as data, so instructions
hidden in a resume are ignored and flagged.

Same day, also built from Loxo's API reference: Loxo read (job, pipeline,
person, work history, latest resume text, notes), write-back as a Loxo
scorecard or a note (blocked until LOXO_WRITE_ENABLED=true and DRY_RUN=false;
skips candidates that already have an AI scorecard), and a small webhook
server for automatic scoring, limited to the jobs in LOXO_AUTO_SCORE_JOB_IDS.
Tested against a simulated Loxo only.

29 Oct 2026, end of day: first results sent to Josh (email + PDF of the 8-candidate
dry run on the Imperium search, gpt-4.1 on Houssem's key, with his OK). The email
explains: it lives in Loxo once approved (scorecard, note as fallback), people with
nothing in Loxo are listed not scored, Claude + Loxo connector works alongside.
Asked Josh for: 5 to 10 searches for the full test, scorecard feedback, an
Anthropic account in the firm's name (steps sent). Proposed on the call: a
10-minute write test on their old "Accounting - Test" search (job 3011811).

Open items (updated 29 Oct 2026):
- Run on the real account: needs the Loxo key and the list of searches.
- Confirm Loxo's real field names and webhook body on day one.
- First real-model run: the answer schema uses only features Claude's
  structured outputs support (checked 29 Oct), but no live call has been made
  yet (no Claude key; OpenAI test pending on Houssem's Mac).
- Ranking inside Loxo: scorecards sit on each candidate; whether Loxo's
  pipeline view shows scores side by side is unknown. Until checked, the
  ranked view is our report. Do not write into recruiters' pipeline comments
  without Josh's agreement.
- Compensation stays out of the scoring unless the client decides otherwise.
  30 Oct 2026: Josh noted the report showed no salaries; Josh's first message
  asked to analyze "compensation and location". Decision: pay is shown to the
  team, never to the AI. src/pay.js: pay fields when filled, else pay
  sentences from the team's notes (where it lives on their account), the
  search's salary range (job salary_min/max), and a plain above/within/below
  range check. In the first-read report (Pay column, pay box per candidate,
  "not used in the score") and in the client report. Not written to Loxo.
  To ask Josh: separate check (built) or inside the score.
- Webhook secret travels in the URL query (Loxo cannot send headers, as far
  as documented); it can appear in the host's request logs. Only account
  members see those logs. Rotate it if anyone leaves.
- Render test service: auto-deploy on push did not fire (28-29 Oct); manual
  deploys work. Check the GitHub connection in Render before go-live.
- Hosting history below mentions Railway; the decision is Render.

Decisions, 27 Oct 2026 (Houssem): production runs in the client's own
accounts (their Anthropic account and server host, Houssem invited as admin);
they pay usage directly, Houssem charges setup plus a monthly management fee.
Code stays in Houssem's repo and deploys to their host. At onboarding, also
connect Loxo's official MCP to the client's Claude workspace as an extra
(not the unofficial community server).

28 Oct 2026 (Houssem): hosting is Railway (Hobby, about $5/month, up to 3
members per project; Pro if they need compliance documents or more members).
Render was considered and dropped on cost: its free workspace cannot invite
members, so it needs Pro. Built the same day: hourly sweep using Claude's
Batch API at half price (the batches are the only state), daily cap,
duplicate filter, already-assessed check before calling the AI, input limits
with flags, server with nothing written to disk. Runbook and recruiter guide in
docs/. 35 tests pass.

Later on 28 Oct 2026: hosting moved from Railway to Render. Railway's status
page: security incident on 21 Oct 2026, customers told to rotate credentials
stored in environment variables, new sign-ups paused with no reopening date.
Not acceptable for candidate data, and the client could not sign up anyway.
Render: Pro workspace needed to invite Houssem (Hobby allows one member); Pro
also gives the SOC 2 Type 2 report. Roughly $27-33/month in total; confirm
the Pro price at sign-up.
