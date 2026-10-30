# 03 · The 30-minute call with Josh

The full agenda with answers to likely questions: `docs/CALL-AGENDA.v3.md`. This page is the
short version.

## Before the call (10 minutes)

- File 02 is done: preflight all PASS, the Claude run checked, the build chat said it is ready.
- In Terminal, be inside the Weaver folder:
  ```bash
  cd ~/Documents/"District Partners"/weaver
  ```
- Open the report from file 02, step 5, in your browser.

## 1. Show the result (10 min)

- The ranked list, Yes group on top. Say: "Yes means no must-have missed, an average of 3.5
  or more, and evidence on most criteria. The same rule on every search."
- One candidate: score per criterion with one line of evidence, strongest signal, watch item,
  where to probe. "Every score shows where it came from. No evidence means 'no evidence', never a guess."
- Pay is shown next to the score and never used in it.
- Ask: "Does the top of this list look like who you'd call first?"

## 2. The write test, live (5 min)

This writes one scorecard into the old "Accounting - Test" search, nowhere else. It refuses any
other search. First without writing:
```bash
npm run write-test -- --provider claude
```
You should see: `Dry run. Would write one scorecard: ...`

Then for real (only now, with Josh watching and saying OK):
```bash
npm run write-test -- --provider claude --go --update
```
You should see a list of PASS lines and, at the end, `WRITE TEST PASSED`. Josh opens that
candidate in Loxo ("Accounting - Test" search) and sees the scorecard. INFO lines are
information. If any line says FAIL: do not switch writing on later; send the output to the build chat.

## 3. How it runs day to day (5 min)

- Every open search is covered by itself, new searches too. New candidates are scored within
  minutes. The people already on the searches are worked through over the first days.
- Weaver limits itself to about 200 a day; the monthly limit on DP's Claude account is the
  hard ceiling.
- Sharper results on any search: three lines in the Loxo job (must-haves, target companies,
  location). His own Claude can draft them.
- A person always decides. One switch stops writing into Loxo, another stops all scoring.

## 4. Approval and next steps (5 min)

- Josh says yes to writing first reads into Loxo for his open searches.
- Optional, same call: connect Loxo to his Claude and upload the DP skill
  (`deliverables/dp-recruiting-skill.v4.zip`; steps in `docs/CLAUDE-LOXO-SETUP.v1.md`).
- Ask who on his team gets the one-page guide for recruiters (`docs/RECRUITER-GUIDE.v4.md`).
- Make sure you have the Render invite (needed for file 04).

## 5. Questions (5 min)

Answers in `docs/CALL-AGENDA.v3.md`, section 5.

Next: file 04, the same day if you can.
