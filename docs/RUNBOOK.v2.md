# Runbook v2 · running the scoring system on Render

Replaces v1 (Railway), 28 Oct 2026: Railway paused new sign-ups after a
security incident on 21 Oct 2026 and told customers to rotate credentials
stored in its environment variables. For Houssem. Menu names on Render may move
slightly; the setting names are what matter.

## What runs where

- **Web service** (`npm start` = `scripts/serve.js`): always on, receives Loxo's
  webhook, scores new candidates within about a minute. Health check `/health`.
- **Cron job** (`node scripts/sweep.js`, schedule `0 * * * *`): every hour,
  scores anyone missed through Claude's half-price Batch API, then exits.
- Both build from the same GitHub repo (`Weaver`) with `npm ci`.
- Region: **Virginia** (closest to Washington DC). Cannot be changed later.
- Nothing is stored on the server. Logs show IDs and outcomes only.

## A. Test on your own Render account (now, no client data)

A free Hobby workspace is enough for this test (one member: you). The free web
service sleeps after 15 minutes without traffic and wakes in about a minute;
that is fine for a test, not for production.

1. Render: New, Web Service, connect GitHub, pick `Weaver`, branch
   `claude/project-skeleton-setup-3nz55n` (later `main`).
   Region Virginia. Build command `npm ci`. Start command `npm start`.
   Health check path `/health`.
2. Environment variables:
   `SCORING_PROVIDER=mock`, `WEBHOOK_SECRET=<32+ random characters>`,
   `LOXO_AGENCY_SLUG=test`, `LOXO_API_KEY=test`, `DRY_RUN=true`,
   `LOXO_WRITE_ENABLED=false`.
3. Open `https://<service>.onrender.com/health`: it must say `ok`.
4. Test call from Terminal:
   `curl -X POST "https://<service>.onrender.com/loxo/webhook?token=<WEBHOOK_SECRET>" -d '{"job_id":1,"person_id":2}'`
   Expect `202`, and in the logs: "job not switched on, skipped".
   Wrong token: `401`.
5. Optional (cron jobs are paid, minimum $1/month): New, Cron Job, same repo,
   schedule `0 * * * *`, command `node scripts/sweep.js`, same variables. With
   writes off it logs "Sweep not run" and exits: correct.

Real scoring needs the client's Loxo key and is tested on the Mac first.

## B. Go live in the client's account

1. Client creates a Render workspace on the **Pro** plan (needed to invite
   members, and it gives access to Render's SOC 2 Type 2 report), adds a card
   and invites Houssem. Client creates an Anthropic account, adds a card, sets
   a monthly spending limit, and invites Houssem.
2. In their workspace: web service as in A.1 but on the always-on Starter
   instance (`0.5c-512mb`), and the cron job as in A.5. Real variables, every
   name from `.env.example`: `SCORING_PROVIDER=claude`, `ANTHROPIC_API_KEY`,
   the Loxo values, the IDs from `npm run loxo:check`,
   `LOXO_AUTO_SCORE_JOB_IDS` with the test job only. Use an environment group
   so both services share the same values.
3. Register the webhook (from the Mac, client's key in `.env`):
   `node scripts/register-webhook.js --url https://<service>.onrender.com/loxo/webhook`
4. After Josh approves the dry run: `DRY_RUN=false` and
   `LOXO_WRITE_ENABLED=true`. The next sweep scores the candidates already on
   the job; new ones are scored as they arrive.
5. Delete the test service from step A.

## Day-to-day

- **Switch a job on:** add its ID to `LOXO_AUTO_SCORE_JOB_IDS` (environment
  group). The next hourly sweep does the first pass at half price.
- **Switch everything off fast:** `LOXO_WRITE_ENABLED=false`.
- **Change the scorecard:** add `config/scorecards/<name>.v2.json`, point
  `SCORECARD_FILE` at it, push. Never edit a version in use.
- **Change the prompt:** add `prompts/scoring/scoring-prompt.v2.md`; test on
  the Mac against the calibration candidates first.
- **Rotate a key:** new key, update the variable, redeploy, delete the old key.
- **Costs:** Anthropic console for AI usage; Render billing for the server.
  Logs show tokens per candidate.

## When something goes wrong

| Symptom in the logs | Meaning | Fix |
|---|---|---|
| `Loxo ... 403` | Key, slug or domain wrong, or API not on the plan | Check the three variables |
| `Loxo ... 404` | Wrong ID or wrong slug | Check the job ID and the slug |
| `daily cap reached` | More than `DAILY_SCORE_CAP` today | Normal; the sweep continues tomorrow |
| `left_for_review` in the sweep summary | AI answer failed twice for that person | Look at the record; usually a near-empty profile |
| `a batch is still running` | Previous half-price batch not finished | Normal; wait an hour |
| `delivery without job_id/person_id` | Loxo's webhook body uses other names | Run the server locally with `SAVE_DEBUG_FILES=true`, read the body, update `scripts/serve.js` |
