# 05 · Day to day, once Weaver is live

## What happens by itself

- **Every hour** Weaver looks at DP's Loxo, finds every open search, and scores anyone not yet
  scored (in the half-price batch). New searches are picked up the same way.
- **When a candidate is added** to an open search, Loxo tells Weaver and it is scored within
  minutes.
- **Each first read** lands in Loxo as a scorecard on the candidate: score per criterion with
  evidence, Yes or No, strongest signal, watch item, where to probe. Marked
  "AI first read, awaiting recruiter review".
- **Nobody is scored twice.** Name-only records are skipped for free.
- **Limit:** about 200 AI calls a day; the rest waits for the next day. DP's monthly limit on
  their Claude account is the hard ceiling.

## What you check (5 minutes a week)

1. Render > weaver > **Logs**: recent `scored` lines and no repeated `error` lines.
2. DP's Claude account (console.anthropic.com) > Usage: spend as expected.
3. Once a month after the first month: compare Weaver with the team's own scorecards on a
   couple of searches (ask the build chat to set up the comparison).

## Switches (all in Render > weaver > Environment, then Save)

| You want to | Set |
|---|---|
| Stop writing into Loxo, keep scoring | `LOXO_WRITE_ENABLED` = `false` |
| Stop everything, no AI calls, no cost | `SCORING_PAUSED` = `true` (or Suspend the service) |
| Start again | set them back (`true` / `false`) |
| Rank a search Josh asks for (everyone already on it) | add its number to `LOXO_BACKLOG_JOB_IDS` (comma-separated). Done the same day; about $5 to $10 for 200 people |
| Leave a search out | add its number to `LOXO_SKIP_JOB_IDS` (comma-separated) |
| Score fewer a day | lower `DAILY_SCORE_CAP` |
| Lower the cost per candidate | `CLAUDE_MODEL` = `claude-sonnet-5-5` (about half the price, a bit less depth) |

## Making a search sharper

Each new search's criteria are drafted from its Loxo job description. For sharper results,
the partner adds three lines to the job description in Loxo:
- Must-haves: what rules a candidate out.
- Target companies or industries: where the ideal person works now, and good neighbors.
- Location: where the role sits and what is acceptable.

Weaver reads the new description the next time it scores that search. People already scored
keep their first read; to re-score them on the new criteria, on the Mac:
```bash
cd ~/Documents/"District Partners"/weaver && npm run rescore -- --loxo-job <search number>
```
It shows how many and the cost first, and changes nothing. Then, to score them (still writing
nothing):
```bash
npm run rescore -- --loxo-job <search number> --go
```
Then, to update their scorecards in Loxo (the switches are for this one command only):
```bash
LOXO_WRITE_ENABLED=true DRY_RUN=false npm run rescore -- --loxo-job <search number> --go --write
```

## What the team sees and does

The one-page guide for recruiters is `docs/RECRUITER-GUIDE.v4.md`. In short: start with the
Yes group, read the evidence, agree or overrule. A person always decides.
