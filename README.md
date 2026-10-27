# District Partners: candidate scoring for Loxo

## What it does

When candidates are added to a job in Loxo, this system:

1. Pulls every candidate on that job.
2. Reads each candidate against the job's scorecard, using Claude.
3. Writes a score and a short written assessment back into Loxo, on the candidate.

Josh's team opens Loxo as usual and finds the assessment there. Nothing else
changes in how they work.

## What it does not do

- It does not decide anything. It gives a recommendation and its reasoning. A
  person at DP reviews every score.
- It does not produce the client-facing pipeline reports. DP already does that.
- It has no screen of its own. The results live in Loxo.

## Safety

- Candidate data is personal and includes pay. It stays in Loxo and in this
  project's local, private folder.
- It starts read-only. Nothing is written to Loxo until Josh has seen a dry run
  and said yes.

## Folders

- `n8n/workflows/` exported n8n workflows (the automation)
- `prompts/scoring/` the instructions Claude follows to score a candidate
- `preview/` a single-page demo with made-up data, to show DP what to expect (open `preview/index.html`)
- `src/` the scoring engine (Node)
- `config/scorecards/` scorecards, one file per version
- `samples/` made-up job and candidates for testing
- `test/` automated checks (`npm test`)
- `scripts/` commands to run, such as a dry run on a job
- `data/` local working data, never committed
- `CLAUDE.md` the full build brief and findings

## Running the scoring (for Houssem)

Needs Node 20.9 or newer.

```
npm ci
npm test                  # checks, no API calls
npm run score:sample      # offline run on the made-up candidates, free
npm run score:openai      # real model, for testing (needs OPENAI_API_KEY and OPENAI_MODEL in .env)
npm run score:claude      # production model (needs ANTHROPIC_API_KEY in .env)
```

Each run writes `data/runs/<date>-<provider>/report.html`, the dry-run report
Josh approves before anything goes to Loxo. `data/` is never committed.

Add `--limit 2` to try a couple of candidates first. To use another job,
candidate file or scorecard: `--job`, `--candidates`, `--scorecard`.

## With the real Loxo account (day one, once the key is in `.env`)

```
npm run loxo:check                                  # connection test, lists the IDs for .env
npm run loxo:check -- --job 123 --probe             # job title, candidate count, raw sample saved to data/probe/
npm run score:claude -- --loxo-job 123 --limit 3    # score 3 real candidates, dry run
npm run score:claude -- --loxo-job 123              # the whole job, dry run
```

A dry run never writes to Loxo. It saves the report and `loxo-payloads.json`,
exactly what would be written. After Josh approves: set `LOXO_WRITE_ENABLED=true`
and `DRY_RUN=false`, then add `--write`. A candidate who already has an AI
scorecard on that job is skipped, so a re-run does not create duplicates.

## Automatic scoring

`npm run serve` starts a small server that Loxo calls when a candidate is
added to a job (`node scripts/register-webhook.js --url https://.../loxo/webhook`
sets that up). Only jobs listed in `LOXO_AUTO_SCORE_JOB_IDS` are scored. It needs
to run somewhere with a public https address; where to host it is still to decide.

## Status

Built: scoring, Loxo read, Loxo write (scorecard or note), automatic scoring
server. Tested on made-up data and a simulated Loxo. Not yet run against the
real account: waiting on the Loxo key. See `CLAUDE.md`.
