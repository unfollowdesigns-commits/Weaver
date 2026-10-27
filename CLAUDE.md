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
- n8n for orchestration and the trigger.
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

Ask for all five in one message.

1. Loxo API key, read access first. Write access added after a working demo.
2. One job ID with real candidates on it.
3. The scorecard: the list of criteria, the scale, and whether the list is
   fixed or changes per job. Reference point, a real DP scorecard used nine
   criteria scored 1 to 5, where 3 meets, 4 is strong, 5 is exceptional, with
   an average and a yes or no recommendation.
4. Where the score should land in Loxo. A scorecard field, a custom field or
   a note.
5. Confirmation of their Loxo plan tier.

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
- Client preview (sample data, no client name):
  https://claude.ai/artifact/AUCwjDSusArDCtc5Lrhoqm, built from
  `preview/shortlist.html`.

## Findings

Empty until the first API key arrives. Record confirmed API behaviour here,
with the endpoint and the date, so nothing gets re-guessed later.

## Status

27 Oct 2026: scoring half built, by Houssem's decision, before the Loxo key
(an exception to "test the unknowns first"; that part does not depend on
them). Built and tested on made-up data: scorecard file, scoring prompt v1,
Claude / OpenAI / offline providers, answer checks, average and recruiter
flags computed in code, ranked dry-run report. See README.

The candidate record sent to the model leaves out name, contact details,
pay and graduation years. Candidate text is fenced as data, so instructions
hidden in a resume are ignored and flagged.

Not built, waiting on the five items from the client: reading from Loxo,
writing back to Loxo, the trigger (n8n). The example scorecard is a
placeholder until the client sends theirs.
