# Go-live v2 · Weaver for District Partners

The one list from here to delivered. 30 Oct 2026. Every step, in order, with who does it, the
exact command, and what "done" looks like. Nothing else is needed. Replaces v1 (what changed:
Weaver now scores every open search in Loxo by itself, nobody types search numbers; the email
to Josh has four asks). Replaces the order in RUNBOOK v3 section B and its "switch a search on"
line (the runbook stays the reference for the rest of day-to-day use).

Before any command on the Mac: `cd ~/Documents/"District Partners"/weaver`

## Where things stand

Built and proven on the real Loxo account (read-only):
- Reads every candidate on a search, including resumes, work history and notes (194 on the
  test search), within Loxo's rate limit.
- Keeps names, pay, graduation years and the team's own scores away from the AI.
- Scores against each search's own criteria (drafted automatically for every new search,
  the firm's criteria names kept), ranks, and writes the report.
- Finds every open search in Loxo by itself, every hour, so a search opened tomorrow is
  covered without anyone touching a setting. Closed searches and the test search are left out.
- Same rule for Yes on every search: no must-have missed, average 3.5 or more, evidence on
  7 of 9 criteria.

Built and proven against stand-ins, proven for real on the day (the steps below do it):
- The Claude connection (request shape, refusal fallback, half-price batch): checked against
  a stand-in Claude service. Step 3 makes the first real call.
- Writing the scorecard into Loxo, reading it back, no duplicates, update in place: rehearsed
  on a stand-in Loxo, including one that drops a field. Step 6 does it on their test search.
- Automatic scoring of new candidates: the server and hourly catch-up are tested; step 10
  switches them on.

124 automated tests pass. `npm run verify` checks every run before anything is shown.

## Phase 1 · One email to Josh (Houssem)

Ask for everything at once, so there is no second round:
1. **Claude account** in DP's name: console.anthropic.com, organization "District Partners",
   card under Billing, a monthly spending limit (suggest $100 to start), an API key named
   "Weaver" sent privately (password manager or on a call, never plain email).
2. **Render workspace** on the Pro plan with a card, and Houssem invited as admin.
3. **OK to write test scores** into the old "Accounting - Test" search (job 3011811).
4. **A 30-minute call** for steps 4 to 7.

## Phase 2 · When the Claude key arrives (Houssem, Mac, 15 minutes)

**Step 1.** In `.env`: `SCORING_PROVIDER=claude` and `ANTHROPIC_API_KEY=sk-ant-...`.
Keep `DRY_RUN=true` and `LOXO_WRITE_ENABLED=false`.

**Step 2.** `npm run preflight`
Done when every line is PASS (INFO lines are information). It also lists the open searches
Weaver found in Loxo. Free. If a line fails, it says what to fix.

**Step 3.** First real Claude run, on the search already tested (the one the team sent their own
report for), the report Josh will see:
`npm run score:claude -- --loxo-job 3688816` then `npm run verify`
Done when verify says ALL CHECKS PASSED. Verify prints what the run cost (expected about $10
to $20 for the full search on DP's account, about 5 to 10 cents a candidate; the automatic
hourly scoring uses batch, half that). Open the report and check where the team's own #1
candidate from their report lands: in the Yes group, near the top. If it is not, stop and send the verify block
and the rank to the build chat before the call.

## Phase 3 · The 30-minute call with Josh

**Step 4.** Show the report from step 3 (top of the list, one candidate card, the legend).

**Step 5.** Write test on "Accounting - Test", first without writing:
`npm run write-test -- --provider claude`
It scores one candidate and shows what it would write. Then for real:
`npm run write-test -- --provider claude --go --update`
Done when it says WRITE TEST PASSED and Josh opens that candidate in Loxo and sees the
scorecard (criteria, scores, summary marked "AI first read, awaiting recruiter review").
It writes one scorecard on the test search only. Josh can delete it in Loxo afterwards.

**Step 6.** Josh approves: scores may be written into Loxo for his open searches.

**Step 7.** Agree who on the team reads `docs/RECRUITER-GUIDE.v4.md` (how to read a first
read, what Yes and No mean, that a person always decides).

## Phase 4 · Switch it on in DP's Render (Houssem, about 1 hour)

**Step 8.** Render > New > Web Service > the Weaver repo. Region Virginia, instance Starter,
build `npm ci`, start `npm start`, health check path `/health`.
Add a disk: mount path `/var/data`, smallest size. Note the disk price shown on screen.

**Step 9.** Environment variables (exactly these):
```
SCORING_PROVIDER=claude
ANTHROPIC_API_KEY=<DP's key>
LOXO_API_KEY=<DP's Loxo key>
LOXO_AGENCY_SLUG=district-partners
LOXO_DOMAIN=app.loxo.co
LOXO_MAX_PER_SECOND=4
LOXO_WRITE_TARGET=scorecard
LOXO_SCORECARD_TYPE_ID=2
LOXO_RECOMMENDATION_YES_ID=3
LOXO_RECOMMENDATION_NO_ID=2
LOXO_AUTO_SCORE_JOB_IDS=
LOXO_SKIP_JOB_IDS=3011811
SCORECARD_FILE=config/scorecards/standard-executive.v2.json
AUTO_CRITERIA=true
CRITERIA_DIR=/var/data/criteria
SWEEP_EVERY_MINUTES=60
WEBHOOK_SECRET=<new long random text, 40+ characters>
DAILY_SCORE_CAP=200
SWEEP_MAX_PER_RUN=50
USE_BATCH=true
SAVE_DEBUG_FILES=false
DRY_RUN=true
LOXO_WRITE_ENABLED=false
```
`LOXO_AUTO_SCORE_JOB_IDS` stays empty: Weaver scores every open search it finds in Loxo.
(Only if Josh ever wants to limit it: list search numbers there, separated by commas.)
`LOXO_SKIP_JOB_IDS` keeps the test search out.

Make the secret on the Mac with: `openssl rand -hex 24`. Put the same value in the Mac's
`.env` as `WEBHOOK_SECRET` (step 11 needs it).

**Step 10.** Deploy. Then on the Mac, with the same values in `.env`:
`npm run preflight -- --server https://<service>.onrender.com`
Done when every line passes (writing shows OFF: correct for now).

**Step 11.** Tell Loxo to call Weaver when a candidate is added (changes a Loxo setting, so it
needs the write switches for this one command only):
`LOXO_WRITE_ENABLED=true DRY_RUN=false node scripts/register-webhook.js --url https://<service>.onrender.com/loxo/webhook`

**Step 12.** One day in dry run. Render logs show "scored ... dry run" lines for new candidates
and the hourly catch-up. Nothing is written.

**Step 13.** Switch writing on: in Render, `DRY_RUN=false` and `LOXO_WRITE_ENABLED=true`, save.
From now on every first read lands in Loxo as a scorecard. The hourly catch-up also works
through everyone already on the open searches, at most 50 an hour and 200 a day (the cost
caps), so a large backlog takes a few days and costs roughly $5 to $10 a day until it is done.
New candidates are scored within minutes of being added.

**Step 14.** Clean up: delete the test service on Houssem's own Render
(loxo-scoring-test). Remove `OPENAI_API_KEY` from the Mac's `.env`.

Delivered.

## If something is different on the day

| What | What happens | What to do |
|---|---|---|
| Preflight: Claude key fails | Nothing runs | Check the key was copied whole and billing is set up |
| The team's #1 is not in the Yes group (step 3) | Report not shown yet | Send the verify block and the rank to the build chat; criteria get adjusted for that search, then re-run |
| Write test: "Creator name kept" says no | Fine: Weaver also recognizes its scorecards by the summary | Nothing |
| Write test: any FAIL line | Writing stays off | Send the output to the build chat; do not do step 13 |
| Write test: update in place fails | Everything works except re-scoring after a criteria change | Go live anyway; fix before the first criteria change |
| Loxo's call to Weaver looks different than expected | The hourly catch-up still scores every new candidate within the hour | Nothing urgent; check the logs |
| Claude declines to score one record | That person gets no score and is retried later; nothing wrong is written | Nothing |
| Costs higher than expected | Daily cap stops it at 200 a day | Lower `DAILY_SCORE_CAP`, or set `CLAUDE_MODEL=claude-sonnet-5-5` (half the price) |
| Josh wants a search left out | It is not scored | Add its number to `LOXO_SKIP_JOB_IDS` in Render |
| A new search opens in Loxo | Picked up within the hour, criteria drafted from its job | Nothing (for sharper results, three lines in the job: must-haves, target companies, location) |
| Anything must stop now | | In Render: `LOXO_WRITE_ENABLED=false` |

## Running costs (for the client)

- Claude (DP's account): about 5 to 10 cents per candidate read directly, half that in the
  automatic hourly batch. A 100-candidate search is about $5 to $10 the first time; new
  candidates after that cost cents each. The first days work through the backlog on all open
  searches within the 200-a-day cap. `npm run verify` shows the real figure for every run.
- Render (DP's account): Pro workspace plus a Starter instance plus a small disk, roughly
  $27 to $33 a month in total; confirm on screen at sign-up.
- Loxo: their existing plan (API access is part of it).
- Our fee: quoted separately.
