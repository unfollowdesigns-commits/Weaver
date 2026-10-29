# Per-search scorecards

One file per Loxo search, written for that role the way the firm writes its own:
nine criteria, scored 1 Does not meet, 2 Weak, 3 Meets, 4 Strong, 5 Exceptional.

- Draft: `npm run scorecard:draft -- --provider claude --loxo-job <id>` writes
  `job-<id>.draft.json` and a `.txt` to send to the partner for approval.
- Approve: `npm run scorecard:draft -- --approve <id>` saves `job-<id>.v<N>.json`.
  Scoring uses the highest approved version from then on. Drafts are never used.
- A search with no approved file uses `config/scorecards/standard-executive.v2.json`.

Never edit an approved file: approve a new version instead.
