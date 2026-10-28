# Steps from now to go-live

Who does what: **Houssem**, **Josh** (client), **Claude** (this project's coding sessions).
Tick each box before moving on.

## Phase 1 · Send and agree (this week)

- [ ] **Houssem** — Check both links are shared ("anyone with the link"):
  preview https://claude.ai/artifact/AUCwjDSusArDCtc5Lrhoqm and proposal
  https://claude.ai/artifact/UcbpNer23XpoTsCVEcdTEg.
- [ ] **Houssem** — Send Josh the message (answers to his four questions, the two
  links, the two things we need).
- [ ] **Houssem** — 15-minute call if he wants: show the preview; ask whether the
  scorecard changes per job, how many candidates a month, and whether pay
  expectations should count.
- [ ] **Houssem** — Agree how he shares the API key: a one-time secret link
  (for example Bitwarden Send or 1Password), or he pastes it into your `.env`
  himself on a screen share. Never email, never chat.

## Phase 2 · Josh sends two things

- [ ] **Josh** — Loxo API key and one job ID.
- [ ] **Houssem** — Put the key, the agency slug and the job ID in `.env` on the
  Mac (`LOXO_API_KEY`, `LOXO_AGENCY_SLUG`, `LOXO_TEST_JOB_ID`).
- [ ] **Josh** — Looks at the standard scorecard (in the preview) and says yes
  or what to change. **Claude** makes any change as a new version.

## Phase 3 · Day one, read-only, from the Mac (about 1 hour, together)

- [ ] **Houssem** — `git pull`, then `npm ci`.
- [ ] **Houssem** — `npm run loxo:check`: connection test, lists the IDs.
  Paste the output to Claude (it holds IDs and names of types, no candidates).
- [ ] **Houssem** — `npm run loxo:check -- --job <ID> --probe`: saves one real
  record in `data/probe/` on the Mac. Do not paste it into chat.
- [ ] **Claude** — Tells you which fields to check in those files; confirms or
  fixes the mapping; records the findings in `CLAUDE.md`.
- [ ] **Houssem** — Fill the IDs in `.env` (`LOXO_SCORECARD_TYPE_ID`, the
  recommendation IDs).

## Phase 4 · Trial run on his job (1 to 3 days)

- [ ] **Houssem** — `npm run score:openai -- --loxo-job <ID> --limit 3`
  (or `score:claude` once a Claude key exists). Nothing is written to Loxo.
- [ ] **Houssem** — Open the report (`data/runs/.../report.html`). Check it reads
  like a recruiter's judgement. Tell Claude what feels wrong, in general terms.
- [ ] **Claude** — Adjusts the prompt as a new version; repeat until it reads right.
- [ ] **Houssem** — Run the whole job; send Josh the report.
- [ ] **Josh** — A recruiter scores about 10 of the same candidates; compare.
- [ ] **Josh** — Approves, or says what to change.

## Phase 5 · Set up in his accounts (about 1 hour, on a call)

- [ ] **Josh** — Creates a Render workspace (Pro), adds a card, invites Houssem.
- [ ] **Josh** — Creates an Anthropic account, adds a card, sets a monthly
  spending limit, invites Houssem, creates an API key for Weaver.
- [ ] **Josh** — Adds write access to the Loxo key (or a new key with write).
- [ ] **Houssem + Claude** — Deploy Weaver in his Render: web service + hourly
  cron job, Virginia, settings from `.env.example` (`docs/RUNBOOK.v2.md`, part B).
- [ ] **Houssem** — `node scripts/register-webhook.js --url https://<his-service>.onrender.com/loxo/webhook`
- [ ] **Houssem** — Switch writing on for the test job only
  (`DRY_RUN=false`, `LOXO_WRITE_ENABLED=true`, `LOXO_AUTO_SCORE_JOB_IDS=<ID>`).
- [ ] **Josh** — Opens a candidate in Loxo and sees the AI scorecard.

## Phase 6 · Go live

- [ ] **Josh** — Chooses the jobs to score; **Houssem** adds them to
  `LOXO_AUTO_SCORE_JOB_IDS`. The hourly sweep scores the candidates already on them.
- [ ] **Houssem** — Connects Loxo's official MCP to the firm's Claude
  ("Claude with Loxo") and shows a few example questions.
- [ ] **Houssem** — 30-minute walkthrough with the team; hand over
  `docs/RECRUITER-GUIDE.v1.md`.
- [ ] **Houssem** — Delete the test service on your own Render.

## Phase 7 · Every month

- [ ] Check the Anthropic and Render bills, and the logs for errors.
- [ ] Ask the team where they disagreed with scores; tune the prompt.
- [ ] Update scorecards, add jobs.
