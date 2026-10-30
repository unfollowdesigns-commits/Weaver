# 02 · When Josh replies: DP's Claude key and the first real run

About 30 minutes. This run uses DP's Claude account (about $10 to $20, on their account, not
yours). Nothing is written to Loxo.

What you should have from Josh: the Claude key (starts with `sk-ant-`), shared privately.
The Render invite can come later (file 04).

## Step 1. Put the key in `.env`

In Terminal:
```bash
cd ~/Documents/"District Partners"/weaver && open -e .env
```
The `.env` file opens in TextEdit. Change or add these lines (one per line, no spaces around `=`):

```
SCORING_PROVIDER=claude
ANTHROPIC_API_KEY=sk-ant-...the whole key from Josh...
DRY_RUN=true
LOXO_WRITE_ENABLED=false
DAILY_SCORE_CAP=200
```
If a line with the same name already exists, change it rather than adding a second one.
Leave every other line as it is. Save (Cmd + S) and close TextEdit.

## Step 2. Check everything

```bash
npm run preflight
```
Free. You should see PASS on every line, including:
```
PASS  Scoring runs on Claude  (claude)
PASS  Claude key works and has the model  (claude-opus-5-5)
PASS  Loxo connection works  (...)
```
INFO lines are information, not problems. If a line says FAIL, it says what is wrong; fix that
line in `.env` (step 1) and run it again. If you cannot fix it, send the output to the build chat.

## Step 3. The first real run on Claude

On the search already tested (the one Josh's team sent their own report for):
```bash
npm run score:claude -- --loxo-job 3688816
```
It reads from Loxo, then counts up as it scores (`1/194`, `2/194` …). About 15 to 30 minutes.
At the end you should see:
```
Dry run: nothing written to Loxo. ...
Done. … scored, … not enough in Loxo, 0 errors. Report: data/runs/...-claude/report.html
```

## Step 4. Check the run

```bash
npm run verify
```
You should see `ALL CHECKS PASSED` at the end, and a line with the real cost:
`INFO  AI cost of this run: about $…`

## Step 5. Look at the report

```bash
open "$(ls -d data/runs/*-claude | tail -1)/report.html"
```
Check the same two things as in file 01: about a third Yes, and the team's #1 in the Yes group
near the top.

Send to the build chat: the verify block, the cost line, and the rank number (no names).
The build chat confirms it is ready to show Josh. If not, it fixes it before the call.

Next: file 03, the call.
