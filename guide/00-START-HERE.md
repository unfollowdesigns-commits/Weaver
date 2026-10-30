# Weaver guide · start here

Written 30 Oct 2026 for Houssem. Plain language, one step at a time. Read this page first,
then open the file for the step you are on.

## What Weaver is, in five lines

1. Weaver reads District Partners' Loxo: every open search, every candidate on it (resume,
   work history, recruiter notes).
2. It scores each candidate against that search's own scorecard (DP's criteria, 1 to 5),
   with one line of evidence per score.
3. It ranks them: "Yes" (worth calling first) above "No".
4. It writes that first read into Loxo as a scorecard on the candidate, marked
   "AI first read, awaiting recruiter review". A person always decides.
5. It runs by itself: every hour it checks Loxo, and new candidates are scored within minutes.

## Where things are

- **Your Mac folder:** `~/Documents/District Partners/weaver`. Every Weaver command is typed in
  Terminal from inside this folder.
- **The keys:** in the file `.env` inside that folder. Never paste a key into any chat or email.
- **The code:** GitHub, repo `unfollowdesigns-commits/Weaver`, branch
  `claude/project-skeleton-setup-3nz55n`.
- **This guide:** the `guide` folder inside your Mac folder (after step 1 of file 01).

## Where you are now

Weaver is built and tested on DP's real Loxo (reading only). Nothing has been written into
their Loxo. Josh has not yet been asked for the go-live accounts.

## The path to delivered (each file is one stage)

| File | What | Who | Time |
|---|---|---|---|
| 01-TODAY.md | Update your Mac, run the free check, send the email to Josh | You | 20 min |
| 01b-TEST-IT-YOURSELF.md | Optional, before the email: test real Claude scoring and the automatic part on your own Claude key | You | 30 min, about $2 |
| 02-WHEN-JOSH-REPLIES.md | Put DP's Claude key in, first real run on Claude | You | 30 min |
| 03-THE-CALL.md | The 30-minute call: show results, test writing into Loxo, approval | You and Josh | 30 min |
| 04-SWITCH-IT-ON.md | Set Weaver up in DP's Render account, one day of dry run, then live | You | 20 min + 1 day |
| 05-DAY-TO-DAY.md | How Weaver runs once live, what you check, how to stop it | You | 5 min a week |

Reference files:
- 06-COMMANDS.md: every command, what it does, what you should see.
- 07-IF-SOMETHING-GOES-WRONG.md: what to do when a step does not go as written.
- 08-WORDS.md: plain meanings of the words in this guide.

## Three rules that never change

1. **Keys stay in `.env`.** Never in a chat, an email, or a screenshot.
2. **Never paste candidate names into a chat.** Counts and numbers only.
3. **Nothing is written into DP's Loxo until Josh says yes** (file 03). Until then everything
   is "dry run": Weaver shows what it would write, and writes nothing.

## When you are stuck

Copy what Terminal printed (no names, no keys) into the build chat and say which step you
were on. Do not try a different command than the one written here.
