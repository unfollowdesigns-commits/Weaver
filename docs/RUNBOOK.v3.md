# Runbook v3 · running the scoring system on Render

Replaces v2, 30 Oct 2026. What changed: Weaver now drafts each search's criteria
descriptions itself the first time it sees the search (keeping the firm's own criteria
names from Loxo) and uses them straight away. Those drafts must survive deploys, and
Render wipes a service's files on every deploy unless they sit on a persistent disk;
Render cron jobs cannot use a disk. So production is **one web service with a small
persistent disk**, and the hourly catch-up runs inside it. For Houssem. Menu names on
Render may move slightly; the setting names are what matter.

## What runs where

- **One web service** (`npm start` = `scripts/serve.js`), always on:
  - receives Loxo's webhook and scores new candidates within about a minute;
  - every hour (`SWEEP_EVERY_MINUTES=60`) catches up anyone missed, through Claude's
    half-price Batch API;
  - keeps each search's drafted criteria on its **persistent disk** (`CRITERIA_DIR`).
  Health check `/health`.
- Region **Virginia**. Build `npm ci`, start `npm start`.
- No cron job. (`scripts/sweep.js` still exists for running a catch-up by hand.)
- With a disk, Render stops the old instance before starting the new one on each deploy:
  a pause of about a minute. A candidate added during it is picked up by the next hourly
  catch-up. The service runs as a single instance, which is all it needs.
- Candidate data is never written to the disk: only the criteria drafted from job
  descriptions. Logs show IDs and outcomes only.

## A. Test on your own Render account (no client data)

Unchanged from v2 section A (free web service, mock provider, health check, test
webhook). A free service cannot have a disk: drafted criteria are then re-drafted after
each restart, which is fine for a test with sample data only.

## B. Go live in the client's account

1. Client: Render workspace on the **Pro** plan, card added, Houssem invited. Anthropic
   account, card, monthly spending limit, Houssem invited.
2. New Web Service from the `Weaver` repo, Virginia, Starter instance (always on).
3. **Add a disk**: Settings > Disks (or "Advanced" when creating). Mount path
   `/var/data`, the smallest size offered. Render does not show the disk price on its
   pricing page: check it on the screen and tell the client (expected to be small).
4. Environment variables (every name from `.env.example`): `SCORING_PROVIDER=claude`,
   `ANTHROPIC_API_KEY`, the Loxo values and IDs (`LOXO_SCORECARD_TYPE_ID=2`,
   `LOXO_RECOMMENDATION_YES_ID=3`, `LOXO_RECOMMENDATION_NO_ID=2`),
   `CRITERIA_DIR=/var/data/criteria`, `AUTO_CRITERIA=true`, `SWEEP_EVERY_MINUTES=60`,
   `LOXO_AUTO_SCORE_JOB_IDS` (start with one search), `WEBHOOK_SECRET`,
   `DRY_RUN=true`, `LOXO_WRITE_ENABLED=false`.
5. Register the webhook (from the Mac, client's key in `.env`):
   `node scripts/register-webhook.js --url https://<service>.onrender.com/loxo/webhook`
6. Dry run: watch the logs for a day ("drafting the criteria", "scored", "dry run").
7. After Josh approves: `DRY_RUN=false` and `LOXO_WRITE_ENABLED=true`.
8. Delete the test service from step A.

## Day-to-day

- **Switch a search on:** add its ID to `LOXO_AUTO_SCORE_JOB_IDS`. The first time
  Weaver sees it, it drafts the criteria descriptions (one AI call, cents) and scores
  everyone at the next catch-up. Nothing to do by hand.
- **Josh wants to change a search's criteria:** write them (start from the drafted
  version in `CRITERIA_DIR`, or `npm run scorecard:draft -- --loxo-job <id>` on the Mac),
  approve (`npm run scorecard:draft -- --approve <id>`), commit and push. The approved
  version wins from then on. Then `npm run rescore -- --loxo-job <id>` (count and cost
  first, `--go`, then `--go --write`) updates everyone scored on the earlier criteria.
- **The job description changes in Loxo:** the next scoring drafts new criteria
  descriptions (a new version). Run `npm run rescore` for that search if the change matters.
- **Only approved criteria, never automatic ones:** `AUTO_CRITERIA=false`.
- **Switch everything off fast:** `LOXO_WRITE_ENABLED=false`.
- **Costs:** Anthropic console for AI usage; Render billing for the server and disk.

## When something goes wrong

Same table as v2, plus:

| Symptom in the logs | Meaning | Fix |
|---|---|---|
| "drafting the criteria" after every deploy | The disk is missing or `CRITERIA_DIR` is not on it | Check the disk mount and `CRITERIA_DIR=/var/data/criteria` |
| "no approved scorecard for this search yet" | `AUTO_CRITERIA=false` and the search has none | Approve criteria for it, or set `AUTO_CRITERIA=true` |
| `sweep failed` | The hourly catch-up hit an error | Read the message; the next hour retries |
