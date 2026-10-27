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
- `scripts/` small helper scripts (Node)
- `data/` local working data, never committed
- `CLAUDE.md` the full build brief and findings

## Status

Scoped, not started. Waiting on access details from DP. See `CLAUDE.md`.
