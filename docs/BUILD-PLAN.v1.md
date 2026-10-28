# Build plan v1 · Loxo candidate scoring

Written 28 Oct 2026. Decides the platforms, the hosting, what is still to build,
and the step-by-step package delivered to the client. Two decisions are marked
**[Houssem to approve]**. Pricing is out of scope for now.

## 1. The platforms (final list)

| Platform | Role | Account owner | Status |
|---|---|---|---|
| GitHub (`Weaver`) | Source code, history | Houssem | In use |
| Houssem's Mac | Development, day-one tests, trial run | Houssem | In use |
| Loxo | Candidates in, scorecards out | Client | Waiting for API key |
| Anthropic API (Claude) | The scoring | Client (Houssem invited) | To create at go-live |
| Render (Pro, Virginia) | Runs the system 24/7 | Client (Houssem invited) | Decided 28 Oct 2026, after Railway's security incident; test on Houssem's own account first |
| Client's Claude workspace | Loxo MCP for quick questions (extra) | Client | At onboarding |

Not used, and why:

- **n8n** (dropped, approved 28 Oct 2026). The server we built already
  receives Loxo's webhook, queues, scores and writes back. n8n would add a
  platform, a login, a monthly cost and a second place where things can break,
  for no gain. The brief lists n8n under Stack; update it if approved.
- **Vercel.** Built for websites. Functions stop after a time limit (300 s by
  default on Pro, configurable to 800 s) and keep no files, so the server would
  have to be reshaped, and the client would need a Vercel Pro seat.
- **Make / Zapier.** Charge per step; at 100+ candidates a month that costs more
  than a server, and the scoring logic still has to live in our code.
- **Google Cloud Run / AWS.** Cheapest and very robust, but the client would
  have to run a cloud billing account with projects and permissions. Too heavy
  for a search firm that does not build software. Keep as the answer if the
  client's IT ever requires AWS or Google.
- **A raw VPS (Hetzner, DigitalOcean droplet).** Cheap, but we would maintain the
  operating system and security updates ourselves.
- **OpenAI.** Testing only until the Claude key exists; remove after.
- **The community MCP server (tbensonwest/loxo-mcp-server).** Unofficial. Loxo's
  official MCP is free on the client's plan and supported. Used only as a
  cross-check of field names.

## 2. Hosting: Render (decided 28 Oct 2026), compared

| Need | Render (chosen) | Railway (dropped) | Vercel | Cloud Run |
|---|---|---|---|---|
| Always-on server for Loxo's webhook | Yes, Starter instance | Yes | Functions only | Yes |
| Scheduled job (hourly safety sweep) | Yes, built-in cron jobs | Yes | Yes, with time limits | Needs Cloud Scheduler |
| Runs 30+ minutes for a 100-candidate job | Yes | Yes | No (800 s max) | Yes (jobs) |
| Client owns billing, Houssem invited | Yes | Yes | Yes | Yes, but complex |
| Deploy from Houssem's private GitHub | Yes | Yes | Yes | Via build setup |
| Setup by a non-technical client | ~10 minutes | ~10 minutes | ~10 minutes | Hours |
| Rough running cost | ~$8/month compute + Pro plan (needed to invite members) | ~$5/month on Hobby, usage included | $20/seat/month | Often free tier |

Decision: **Render, Pro workspace, Virginia region.** Railway was chosen
first on price (Hobby, about $5/month) but dropped the same day: its status
page reports a security incident on 21 Oct 2026, asks customers to rotate
credentials stored in environment variables, and has paused new sign-ups with
no reopening date. Render's own docs: Pro allows unlimited members (Hobby only
one), includes the SOC 2 Type 2 report, cron jobs from $1/month, a Virginia
region. Total about $27–33/month; confirm the Pro price at sign-up.

## 3. Architecture as it will run

```
Loxo ──(webhook: candidate added)──▶ Render web service ──▶ Claude API
  ▲                                        │
  └────────(scorecard written)─────────────┘
Render cron job, every hour: re-check chosen jobs, score anyone missed
```

- **Fast path:** the webhook. A candidate added to a chosen job is scored in
  about a minute.
- **Safety net (to build):** an hourly sweep lists the candidates on each chosen
  job and scores anyone without an AI scorecard. It catches missed webhooks,
  server restarts and deploys, and it also does the first pass on the 20 to 100
  candidates already on a job when that job is switched on.
- **Nothing stored on the server.** Candidate data passes through memory only.
  Logs carry IDs and outcomes, never resume text.

## 4. What is still to build before the key arrives

In order. Each step tested, committed, pushed.

1. **Hourly safety sweep.** A script the Render cron job runs, with a daily cap
   on candidates scored (cost control). Re-runs are already safe: anyone with
   an AI scorecard on that job is skipped.
2. **Server without disk.** Production keeps no files; the webhook body and
   dry-run payloads are only saved locally on the Mac for day one.
3. **Render setup.** Both services from the same repo, settings listed in
   `docs/RUNBOOK.v2.md`. Done.
4. **Scorecard from Loxo (optional, depends on Josh's answer).** Loxo has
   scorecard templates per job. If his criteria live there, read them from Loxo,
   so his team changes criteria in Loxo without asking us.
5. **Spend guard.** Daily candidate cap, plus a spending limit set on the
   Anthropic account at go-live.
6. **Recruiter one-pager.** What the scorecard means, the flags, and that it is
   advisory.
7. **Runbook.** How to deploy, switch a job on or off, rotate a key, read the logs.

## 4b. Keeping the bill reasonable without lowering quality

Prices used (Anthropic, per million tokens): Claude Opus 5.5 $4 in / $20 out;
Claude Sonnet 5.5 $2 in / $10 out. Message Batches run at half price but are
not instant.

Rough cost per candidate: about $0.05 to $0.14 on Opus (long resume, high
effort at the top end), about half that on Sonnet. 600 candidates a month:
about $30 to $80 on Opus, $15 to $40 on Sonnet. Measure the real figure in
the trial before promising anything.

Already built:
- Each candidate is scored once per job; re-runs skip anyone who already has
  an AI scorecard.
- Only the jobs the client chooses are scored.
- At most two attempts per candidate; no retry loops on the AI.
- HTML and contact details stripped before sending, so fewer tokens.

To build (added to the list above):
- **Half price for anything not urgent.** The sweep and the first pass on a
  newly switched-on job use the Batch API. New candidates from the webhook
  stay instant.
- **Daily cap and an account spending limit.** A bug or a flood of candidates
  can never run up a large bill.
- **Ignore duplicate webhooks.** The same person and job within a short window
  is scored once.
- **Keep inputs lean, never silently cut.** Keep the newest notes and the
  latest resume; if anything is left out, the scorecard says so.
- **Cost on record.** Tokens used are logged per candidate; a monthly cost
  summary per job.

Decided in calibration, with the client's own judgement as the bar:
- Opus versus Sonnet, and effort high versus medium. Use the cheapest
  setting that scores the 10 calibration candidates as well as the best one.
  If the cheaper setting is worse, keep the better one: quality first.

## 5. The package, step by step

**Step 0 · Agreement.** Scope (the four things in the brief), the five items,
the contract clause (client owns data and scorecard; Houssem keeps the right to
reuse general code). No access to anything yet.

**Step 1 · Discovery day, read-only, from the Mac.** Connection test; list
scorecard types and IDs; save one real record to confirm field names; check how
Loxo responds under load; see how scorecards appear in Loxo's screens. Record
everything under Findings.

**Step 2 · Calibration.** Score the test job as a dry run. Josh or a recruiter
scores 10 of the same candidates themselves; compare. Adjust the prompt as a new
version (`scoring-prompt.v2.md`), compare Claude Opus with Sonnet for quality
and cost, repeat until Josh says the scores read like his team's judgement.

**Step 3 · Production setup.** Client creates the Anthropic and Render
accounts and invites Houssem (15 minutes, a short guide provided). Deploy from
GitHub, enter the keys in Render's settings, register the
Loxo webhook, switch writing on for the test job only.

**Step 4 · Go live.** Switch on the jobs Josh chooses; the sweep scores the
candidates already on them. Connect Loxo's official MCP to the firm's Claude.
30-minute walkthrough with the team, recruiter one-pager handed over.

**Step 5 · Care, monthly.** Check costs and errors, review where recruiters
disagreed with the scores, tune the prompt, update scorecards, add jobs.

## 6. Open questions (for Josh, at Step 0 or 1)

- Is the scorecard the same for every search, or per job? Is it already in Loxo?
- Compensation in the scoring: leave out, or use pay expectations against the
  role's budget?
- How should the team see the ranking of a whole job: Loxo's own view of
  scorecards, or a ranked list we send on request?
