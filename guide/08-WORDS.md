# 08 · Words in this guide

| Word | Plain meaning |
|---|---|
| Terminal | The Mac app where you type commands. Cmd + Space, "Terminal". |
| Command | A line you paste into Terminal and run with Enter. |
| Weaver folder | `~/Documents/District Partners/weaver` on your Mac. |
| `.env` | A hidden file in the Weaver folder with the keys and settings. Open with `open -e .env`. Never share it. |
| Key | A secret password that lets Weaver use an account (Loxo, Claude). |
| Loxo | DP's recruiting system, where the candidates and searches live. |
| Search | A job DP is recruiting for, in Loxo. Each has a number (for example 3688816). |
| Open search | A search marked Active in Loxo. Weaver scores only these. |
| First read | Weaver's assessment of a candidate before anyone has spoken to them. |
| Scorecard | Where the first read is saved on the candidate in Loxo. |
| Criteria | The 9 things a candidate is scored on for a search, from DP's scorecard in Loxo. |
| Yes / No | Yes: no must-have missed, average 3.5 or more, evidence on most criteria. No: the rest. |
| Claude | The AI that scores. Runs in DP's own Claude account. |
| Render | The service that runs Weaver around the clock, in DP's own account. |
| Dry run | Weaver scores but writes nothing into Loxo. The safe default. |
| Write test | One test scorecard written on the "Accounting - Test" search to prove writing works. |
| Batch | Half-price way of sending many candidates to Claude at once; used by the hourly catch-up. |
| Hourly catch-up | Weaver's hourly pass over all open searches to score anyone new. |
| Webhook | Loxo telling Weaver "a candidate was just added", so it scores within minutes. |
| Daily cap | Weaver's own limit: about 200 AI calls a day. |
| Monthly limit | The spending limit set on DP's Claude account. The hard ceiling. |
| Build chat | This chat with Claude, where Weaver was built and where you send results. |
