# The 30-minute go-live call with Josh (v4)

Replaces v3: cost answer for new candidates plus searches ranked on request (EMAIL-JOSH.v4). v3 replaced v2: the data answer now says exactly what the pay filter does (review, 30 Oct).

Before the call (Houssem, Mac): DP's Claude key in `.env`, `npm run preflight` all PASS, the
first Claude run done on the tested search with `npm run verify` ALL CHECKS PASSED, the team's
#1 in the Yes group. Report open in the browser. Terminal in the weaver folder.

**1. The result (10 min).** Open the report.
- The ranked list: the Yes group first. "Yes means no must-have missed, an average of 3.5 or
  more, and evidence on most criteria. The same rule on every search."
- One candidate card: the score per criterion with one line of evidence, strongest signal,
  watch item, where to probe. "Every score points to where it came from. No evidence means
  'no evidence', never a guess."
- Pay: shown next to the score, never used in it.
- Ask: "Does the top of this list look like who you'd call first?"

**2. The write test, live (5 min).** On "Accounting - Test":
`npm run write-test -- --provider claude --go --update`
Josh opens that candidate in Loxo and sees the scorecard. It must say WRITE TEST PASSED.

**3. How it runs day to day (5 min).**
- Every open search is covered automatically; new candidates within minutes; the existing
  pipeline over the first days within Weaver's limit of about 200 a day.
- Sharper results on any search: three lines in the Loxo job (must-haves, target companies,
  location). His Claude can draft them.
- A person always decides. One switch stops writing into Loxo; another stops all scoring.
- After the first month: compare with the team's own scores and adjust.

**4. Approval and next steps (5 min).**
- Josh approves writing to Loxo.
- Optional, same call: connect Loxo to his Claude and upload the skill
  (`deliverables/dp-recruiting-skill.v4.zip`, Organization settings > Skills; steps in
  docs/CLAUDE-LOXO-SETUP.v1.md).
- Who on the team gets the recruiter guide (docs/RECRUITER-GUIDE.v4.md).
- Houssem switches it on in DP's Render the same day (go-live plan, Phase 4); one day in
  dry run, then live.

**5. Questions (5 min).** Likely ones and answers:
- "How is this different from Loxo's AI?" Loxo ranks against the job description; Weaver
  scores against your scorecard, with evidence, and writes it into Loxo.
- "Can it be wrong?" Yes, like any first read. That's why every score shows its evidence and
  your team decides.
- "Is our data used to train AI?" No: it runs in your own Claude account, and the API does not
  train on it by default. Names and contact details are removed before the AI reads a record;
  sentences about pay are filtered out too, the AI is told never to use or mention pay, and
  anything it writes is checked for pay before anyone sees it.
- "What does it cost?" Cents per new candidate; about $5 to $10 to rank a search of 200 when you ask; limited to
  about 200 a day by Weaver, with your monthly limit as the hard ceiling, plus about $30 a month for Render.

- Ask: which searches to rank first. Add them to `LOXO_BACKLOG_JOB_IDS` in Render (guide/05).
- Ask: is IT solutions industry experience a must-have on the Imperium search? Weaver treats it as one,
  which is why the submitted candidate (no IT solutions experience, his own watch item) is a No.
