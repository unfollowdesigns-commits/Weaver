# 07 · If something goes wrong

General rule: stop, do not try other commands, copy what Terminal printed (no names, no keys)
into the build chat, and say which file and step you were on.

| What you see | What it means | What to do |
|---|---|---|
| `npm error Missing script` or `Cannot find module` | You are not in the Weaver folder | Run `cd ~/Documents/"District Partners"/weaver` and try again |
| `No such file or directory` for `~/Downloads/weaver-update` | The zip was not unzipped | Finder > Downloads > double-click `weaver-update.zip` |
| `fail` above 0 after `npm test` | The update is incomplete or mixed | Send the lines to the build chat; do not continue |
| `FAIL  Claude key works ...` | Key copied wrong, or billing not set up on DP's Claude account | Re-paste the whole key in `.env` (file 02, step 1); ask Josh to check Billing |
| `FAIL  Loxo connection works` | Loxo key missing or wrong in `.env` | Check the `LOXO_API_KEY` line; send the output to the build chat |
| `ANTHROPIC_API_KEY is not set` or `OPENAI_API_KEY is not set` | The provider in `.env` has no key | File 02, step 1 |
| `429` or "rate limit" | Loxo asked to slow down | Nothing: Weaver waits and retries by itself |
| `Refused: ... is not a test search` | The write test only runs on "Accounting - Test" | Use the command exactly as in file 03 |
| `No candidate with enough in Loxo to score on this search` (write test) | The test search has no one with a resume or work history | Ask Josh to add one person with a resume to "Accounting - Test", then run it again |
| `401` or `403` when writing (write test or step 4 of file 04) | The Loxo key is read-only | Josh gives it write access in Loxo > Settings > API Keys |
| `verify` shows FAIL on "No errors" | Some candidates were not scored (for example Claude declined one) | Send the verify block to the build chat before showing anything |
| Render logs: `daily cap reached` | 200 AI calls used today | Normal; it continues tomorrow |
| Render logs: `sweep failed` once | One hourly run hit a problem | Nothing; the next hour retries. If it repeats, send the lines |
| Render: service not "Live" after deploy | Setup problem | Send the last lines of Render > Logs to the build chat |
| Costs higher than expected | | Render > Environment: lower `DAILY_SCORE_CAP`, or `SCORING_PAUSED=true` to stop all AI calls |
| Anything looks wrong in Loxo | | Render > Environment: `LOXO_WRITE_ENABLED=false`, Save. Then tell the build chat |

## The two stop switches

- **Stop writing into Loxo:** `LOXO_WRITE_ENABLED=false`
- **Stop everything (no AI calls, no cost):** `SCORING_PAUSED=true`, or Suspend the service in Render
