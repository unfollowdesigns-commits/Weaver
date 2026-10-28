# Runbook v1 · running the scoring system on Railway

For Houssem. Plain steps. Menu names on Railway may move slightly; the setting
names are what matter.

## What runs where

- **Web service** (`npm start` = `scripts/serve.js`): always on, receives Loxo's
  webhook, scores new candidates within about a minute.
- **Cron service** (`node scripts/sweep.js`): runs every hour, scores anyone
  missed, uses the half-price Batch API with Claude, then exits.
- Both use the same GitHub repo (`Weaver`) and the same variables.
- Nothing is stored on the server. Logs show IDs and outcomes only.

## A. Test on your own Railway account (now, no client data)

1. Railway: create a project, "Deploy from GitHub repo", pick `Weaver`, branch
   `claude/project-skeleton-setup-3nz55n` (later: `main`).
2. Variables on the web service:
   `SCORING_PROVIDER=mock`, `WEBHOOK_SECRET=<32+ random characters>`,
   `LOXO_AGENCY_SLUG=test`, `LOXO_API_KEY=test`, `DRY_RUN=true`,
   `LOXO_WRITE_ENABLED=false`.
3. Networking: generate a public domain. Open `https://<domain>/health`: it must
   say `ok`.
4. Send a test call (Terminal):
   `curl -X POST "https://<domain>/loxo/webhook?token=<WEBHOOK_SECRET>" -d '{"job_id":1,"person_id":2}'`
   Expect `202`, and in the logs: "job not switched on, skipped".
   With a wrong token: `401`.
5. Add a second service from the same repo for the sweep: start command
   `node scripts/sweep.js`, cron schedule `0 * * * *`. With writes off it logs
   "Sweep not run" and exits: that is correct.

This proves deploys, the public address, the secret check and the schedule.
Real scoring needs the client's Loxo key, so it is tested on the Mac first
(section C).

## B. Go live in the client's account

1. Client creates a Railway account (Hobby, $5/month) and a project, and
   invites Houssem to it (Hobby allows up to 3 members per project). Client
   creates an Anthropic account, adds a card, sets a monthly spending limit,
   and invites Houssem.
2. In their project, repeat A.1 to A.5 with the real variables (copy every name
   from `.env.example`): `SCORING_PROVIDER=claude`, `ANTHROPIC_API_KEY`, the
   Loxo values, the IDs from `npm run loxo:check`, `LOXO_AUTO_SCORE_JOB_IDS`
   with the test job only.
3. Pick a US East region if Railway offers it (the client is in Washington DC).
4. Register the webhook (from the Mac, with the client's key in `.env`):
   `node scripts/register-webhook.js --url https://<domain>/loxo/webhook`
5. After Josh approves the dry run: set `DRY_RUN=false` and
   `LOXO_WRITE_ENABLED=true` on both services. The next sweep scores the
   candidates already on the job; new ones are scored as they arrive.
6. Delete your own test project from step A.

## Day-to-day

- **Switch a job on:** add its ID to `LOXO_AUTO_SCORE_JOB_IDS` on both services.
  The next hourly sweep does the first pass at half price.
- **Switch everything off fast:** set `LOXO_WRITE_ENABLED=false`. Scoring stops
  writing at once; the sweep stops running.
- **Change the scorecard:** add `config/scorecards/<name>.v2.json`, point
  `SCORECARD_FILE` at it, push. Never edit a version in use.
- **Change the prompt:** add `prompts/scoring/scoring-prompt.v2.md`; test it on
  the Mac against the calibration candidates before switching.
- **Rotate a key:** create the new key, update the variable, redeploy, delete
  the old key.
- **Costs:** Anthropic console shows usage per day; Railway shows the server
  bill. Logs show tokens per candidate.

## When something goes wrong

| Symptom in the logs | Meaning | Fix |
|---|---|---|
| `Loxo ... 403` | Key, slug or domain wrong, or API not on the plan | Check the three variables |
| `Loxo ... 404` | Wrong ID or wrong slug | Check the job ID and the slug |
| `daily cap reached` | More than `DAILY_SCORE_CAP` today | Normal; the sweep continues tomorrow |
| `left_for_review` in the sweep summary | AI answer failed twice for that person | Look at the record; usually a near-empty profile |
| `a batch is still running` | Previous half-price batch not finished | Normal; wait an hour |
| `delivery without job_id/person_id` | Loxo's webhook body uses other names | Run the server locally with `SAVE_DEBUG_FILES=true`, read the body, update `scripts/serve.js` |
