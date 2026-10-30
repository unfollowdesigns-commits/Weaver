# 06 · Every command, in plain words

Always first, in a new Terminal window:
```bash
cd ~/Documents/"District Partners"/weaver
```

| Command | What it does | Costs AI money? | Writes to Loxo? |
|---|---|---|---|
| `npm test` | Runs Weaver's 132 built-in checks. Should end with `pass 132`, `fail 0`. | No | No |
| `npm run ready` | Before the email: tests, the Yes rule on your saved real run, people on the open searches. Prefix it as in file 01. | No | No |
| `npm run preflight` | Checks every key, ID and setting. Add `-- --estimate` to count people and cost, `-- --server <address>` to check the live server. | No | No |
| `npm run score:claude -- --loxo-job <number>` | Scores everyone on one search with Claude and makes a report in `data/runs/`. | Yes (DP's account) | No |
| `npm run verify` | Checks the newest run: no names, no pay, no errors, real cost. | No | No |
| `npm run rebar -- data/runs/<folder>` | Applies the current Yes rule to a saved run. | No | No |
| `npm run write-test -- --provider claude` | Shows what would be written on the test search. Add `--go --update` to write one test scorecard there (only on "Accounting - Test"). | Yes (one candidate) | Only with `--go`, only the test search |
| `npm run loxo:check` | Connection test and the Loxo IDs. Add `-- --jobs` to list open searches with their numbers. | No | No |
| `npm run rescore -- --loxo-job <number>` | Re-scores people scored on older criteria. Count and cost first; `--go` to score; `--go --write` (with the switches) to update Loxo. See file 05. | With `--go` | Only with `--write` |
| `npm run scorecard:draft -- --loxo-job <number>` | Drafts criteria for a search so they can be reviewed and approved. | Yes (a few cents) | No |

## Opening things

| To | Type |
|---|---|
| Edit the keys and settings | `open -e .env` |
| Open the newest report | `open "$(ls -td data/runs/*/ | head -1)report.html"` |
| Open a document in this folder | `open -e docs/<name>.md` or `open -e guide/<name>.md` |

## Getting an update from the build chat

```bash
rm -rf ~/weaver-update ~/Downloads/weaver-update*
```
Download the newest `weaver-update.zip` from the build chat, then:
```bash
cd ~/Documents/"District Partners"/weaver && rsync -a ~/Downloads/weaver-update/ ./ && npm test 2>&1 | grep -E "ℹ (pass|fail)"
```
The pass number the build chat gives you, and `fail 0`.
