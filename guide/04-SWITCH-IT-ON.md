# 04 · Switch it on in DP's Render account

About 20 minutes, then one day of dry run, then live. You need: the Render invite from Josh
(accepted), DP's Claude key and DP's Loxo key, and Josh's yes from the call.

## Step 1. Create Weaver on Render (one go)

1. Log in to render.com and switch to DP's workspace (top left), where you were invited.
2. Click **New** > **Blueprint**.
3. Connect GitHub with your own GitHub account (the code is in your repo), choose the repo
   **Weaver**, branch **claude/project-skeleton-setup-3nz55n**.
4. Render reads the setup file (`render.yaml`) and shows one service called **weaver**, with a
   disk. It asks for two values:
   - `ANTHROPIC_API_KEY`: paste DP's Claude key.
   - `LOXO_API_KEY`: paste DP's Loxo key (the same one as in your `.env`).
5. Note the disk price shown on screen, then click **Apply** (or **Create**).
6. Wait until the service shows **Live** (a few minutes). Its address is at the top of the
   service page, like `https://weaver-xxxx.onrender.com`. Note it.

7. Service **weaver** > **Environment**: set `LOXO_BACKLOG_JOB_IDS` to the numbers of the searches
   Josh asked to rank, comma-separated (for example `3688816,3701234`). Leave it empty if he has
   not named any yet. Click **Save**.

Weaver starts in dry run: it scores, writes nothing to Loxo. On every open search it scores the
candidates added from now on; the people already on a search are scored only on the searches
in `LOXO_BACKLOG_JOB_IDS`.

## Step 2. Copy the webhook secret to your Mac

1. In Render: service **weaver** > **Environment**. Find `WEBHOOK_SECRET` (Render made it).
   Click to reveal and copy the value.
2. On the Mac:
   ```bash
   cd ~/Documents/"District Partners"/weaver && open -e .env
   ```
   Add or change the line `WEBHOOK_SECRET=` followed by the value. Save, close.

## Step 3. Check the live server

Replace the address with yours:
```bash
LOXO_AUTO_SCORE_JOB_IDS= LOXO_SKIP_JOB_IDS=3011811 npm run preflight -- --server https://weaver-xxxx.onrender.com
```
You should see every line PASS, including `PASS  Live server answers`, and
`INFO  Writing into Loxo  (OFF: dry run ...)`. That OFF is correct for now.

## Step 4. Tell Loxo to call Weaver when a candidate is added

This changes one setting in DP's Loxo, so it needs the write switches for this one command only
(they are not saved). Replace the address with yours:
```bash
LOXO_WRITE_ENABLED=true DRY_RUN=false node scripts/register-webhook.js --url https://weaver-xxxx.onrender.com/loxo/webhook
```
You should see: `Registered: Loxo will call the server when a candidate is added to a job.`
(or `Already registered. Nothing changed.` if it was done before).
If you see 401 or 403: the Loxo key is read-only; Josh gives it write access in Loxo >
Settings > API Keys, then run it again. (Even without this step, the hourly catch-up scores
every new candidate within the hour.)

## Step 5. One day of dry run

In Render: service **weaver** > **Logs**. Over the day you should see lines like:
```
Listening on :10000. Provider claude. Searches: every open search except 3011811 (existing candidates on 3688816; elsewhere new candidates only). Writes off (dry run). ...
job 1234567: first seen, 120 people already on it (not scored); new candidates from now on
submitted 50 candidates in batch ...
job 1234567 person 7654321: scored 3.8 yes
job 1234567 person 7654321: dry run, nothing written
```
Nothing is written to Loxo during this day. If you see `sweep failed` or `error` lines, copy
them (no names) to the build chat.

## Step 6. Go live: switch writing on

The next day, in Render: service **weaver** > **Environment**:
- `DRY_RUN` → `false`
- `LOXO_WRITE_ENABLED` → `true`

Click **Save**. Render restarts Weaver (about a minute). From now on, every first read is written
into Loxo as a scorecard: new candidates within minutes, and the people already on the searches
in `LOXO_BACKLOG_JOB_IDS` the same day (at most 200 a day).

Check after an hour: open a candidate on one of the searches Josh asked to rank in Loxo; you should see a scorecard by
"Candidate scoring (AI, awaiting review)".

## Step 7. Clean up

- On your own Render account: delete the old test service **loxo-scoring-test**.
- On the Mac, in `.env`: delete the line starting with `OPENAI_API_KEY`.

Delivered. Next: file 05 for day to day.
