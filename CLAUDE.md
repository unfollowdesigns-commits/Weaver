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
  Possible phase 2, only if they ask.
- A UI or dashboard. The output lives in Loxo.
- Any rewrite of DP's existing Claude prompts or report format.
- Anything touching the DP website project, which is separate work.

## Stack

- Loxo REST API for read and write.
- Claude API for scoring. One call per candidate so 100 candidates is fine.
- Render for hosting (Pro workspace, Virginia region): one always-on web
  service (webhook) and one hourly cron job (sweep), in the client's own
  account. Decided 28 Oct 2026; see docs/RUNBOOK.v2.md.
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
- Scorecard: `config/scorecards/standard-executive.v1.json`, nine criteria
  scored 1 to 5, each with what 3 (meets) and 5 (exceptional) look like.
  Josh can change it; a per-job scorecard comes later if he asks.
- Where the score lands: a Loxo scorecard on the candidate.

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
  `preview/shortlist.html`.

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

## Status

27 Oct 2026: scoring half built, by Houssem's decision, before the Loxo key
(an exception to "test the unknowns first"; that part does not depend on
them). Built and tested on made-up data: scorecard file, scoring prompt v1,
Claude / OpenAI / offline providers, answer checks, average and recruiter
flags computed in code, ranked dry-run report. See README.

The candidate record sent to the model leaves out name, contact details,
pay and graduation years. Candidate text is fenced as data, so instructions
hidden in a resume are ignored and flagged.

Same day, also built from Loxo's API reference: Loxo read (job, pipeline,
person, work history, latest resume text, notes), write-back as a Loxo
scorecard or a note (blocked until LOXO_WRITE_ENABLED=true and DRY_RUN=false;
skips candidates that already have an AI scorecard), and a small webhook
server for automatic scoring, limited to the jobs in LOXO_AUTO_SCORE_JOB_IDS.
Tested against a simulated Loxo only.

Open: run it on the real account (needs the five items), confirm field
names, decide where the webhook server is hosted (n8n in front of it, or on
its own; costs money, ask Houssem), compensation (left out of the model input
on purpose; decide with the client), and the client's real scorecard.

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
