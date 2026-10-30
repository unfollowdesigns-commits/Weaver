# 01b · Test it yourself before Josh (optional, about $2, 30 minutes)

File 01 checks the Yes rule and the cost for free. This file tests the two things that have
never run on real data yet, using your own small Claude account, before Josh is involved:

- **Test A:** real Claude scoring real DP candidates (25 people), checked by verify.
- **Test B:** the automatic part: Weaver running on your Mac, finding DP's open searches by
  itself and scoring a few people, in dry run.

Nothing is written to Loxo in either test. Candidate records go to your own Claude account,
the same way your earlier tests went to your OpenAI account.

What these tests cannot cover (only possible with Josh, files 03 and 04): writing into Loxo,
Loxo calling Weaver when a candidate is added, and running in DP's Render.

## Step 1. Your own Claude key ($5 credit)

1. Go to console.anthropic.com, sign up with your own email.
2. Billing: add a card and $5 of credit.
3. API Keys: create a key named "Weaver test". Copy it (starts with `sk-ant-`).

## Step 2. Put it in `.env`

```bash
cd ~/Documents/"District Partners"/weaver && open -e .env
```
Add or change these lines, save, close:
```
SCORING_PROVIDER=claude
ANTHROPIC_API_KEY=sk-ant-...your test key...
```
(When Josh sends DP's key, you replace this line with his: file 02.)

Check:
```bash
npm run preflight
```
You should see `PASS  Claude key works and has the model  (claude-opus-5-5)`. Other FAIL
lines (for example WEBHOOK_SECRET) do not matter for these tests.

## Test A. Real Claude, 25 real candidates (about $1 to $3)

The people the team has already spoken to on the tested search:
```bash
npm run score:claude -- --loxo-job 3688816 --stages "Responded,Screened,Submitted to Account Manager,Submitted to Client"
```
Then:
```bash
npm run verify
```
You should see `ALL CHECKS PASSED`, a line `INFO  AI cost of this run: about $…`, and a line
`INFO  Yes … of …`. Open the report:
```bash
open "$(ls -d data/runs/*-claude | tail -1)/report.html"
```
Check the team's #1 from their PDF is in the Yes group, near the top. Note the rank.

## Test B. The automatic part, on your Mac (capped at 5 AI calls, under $1)

This starts Weaver on your Mac the way it will run on Render, but in dry run and limited to 5 AI
calls. It treats the tested search (3688816) as one Josh asked to rank, and every other open
search as "new candidates only". Paste it as one line:
```bash
SCORING_PROVIDER=claude DAILY_SCORE_CAP=5 DAILY_CAP_FILE=data/test-usage.json BASELINE_FILE=data/test-baseline.json LOXO_BACKLOG_JOB_IDS=3688816 DRY_RUN=true LOXO_WRITE_ENABLED=false LOXO_AUTO_SCORE_JOB_IDS= LOXO_SKIP_JOB_IDS=3011811 USE_BATCH=false WEBHOOK_SECRET=local-test-only-local-test-only CRITERIA_DIR=data/scorecards/auto npm start
```
You should see within seconds:
```
... Listening on :8787. Provider claude. Searches: every open search except 3011811 (existing candidates on 3688816; elsewhere new candidates only). Writes off (dry run). Daily cap 5 AI calls (5 left today, ...).
```
After one minute the hourly catch-up starts. It reads every open search at Loxo's speed limit,
so it takes a few minutes. You should see many lines like:
```
... job 1234567: first seen, 120 people already on it (not scored); new candidates from now on
```
(one per search: those people are left alone, which is the point), then one line:
```
... sweep {"written":0,"already_done":0,"submitted":0,"scored_direct":5,...}
```
- `"written":0`: correct, nothing goes into Loxo in this test.
- `"scored_direct"` about 5: people on the tested search, stopped by the 5-call limit. If a
  `"failed":1` also shows, that is the next person stopped by the limit: the limit works.

When you see the `sweep {...}` line, stop Weaver: press **Control + C**.

Then clean up the two test files:
```bash
rm -f data/test-usage.json data/test-baseline.json
```

## Send to the build chat

- From Test A: the verify block (from `Run:` to `ALL CHECKS PASSED`) and the rank number.
- From Test B: the `Listening on ...` line, one `first seen` line and the `sweep {...}` line.

No names. The build chat confirms both before you send the email to Josh.
