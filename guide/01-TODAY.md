# 01 · Today: update, check, send the email

About 20 minutes. Free: no AI is used, nothing is written to Loxo. Do the steps in order.
Copy each command exactly (the grey boxes), paste it into Terminal, press Enter, and compare
with "You should see".

## Step 1. Open Terminal

Press Cmd + Space, type `Terminal`, press Enter. A window opens with a line ending in `%`.

## Step 2. Remove old copies of the update

```bash
rm -rf ~/weaver-update ~/Downloads/weaver-update*
```
You should see: nothing (a new line ending in `%`). "no matches found" is also fine.

## Step 3. Download the latest update

In the build chat, download the **most recent** file called `weaver-update.zip`.
Safari unzips it by itself into a folder. Check it is there:

```bash
ls -d ~/Downloads/weaver-update
```
You should see: `/Users/houssemguebsi/Downloads/weaver-update`

If you see "No such file or directory": open Finder > Downloads, double-click
`weaver-update.zip`, then run the line above again.

## Step 4. Copy the update into your Weaver folder

```bash
cd ~/Documents/"District Partners"/weaver && rsync -a ~/Downloads/weaver-update/ ./
```
You should see: nothing. Your line now ends in `weaver %`. Your `.env` (keys) and your earlier
runs are not touched.

## Step 5. Run the ready check

```bash
LOXO_AUTO_SCORE_JOB_IDS= LOXO_SKIP_JOB_IDS=3011811 npm run ready
```
(The first part makes sure it counts every open search and leaves the test search out, whatever
is in your `.env`.)

It takes a few minutes: it counts people on every open search at Loxo's speed limit.
You should see, with your own numbers:

```
Weaver ready check

1. Tests: 132 passed, 0 failed
2. Yes rule on the real run of 2026-10-29: Yes … of … (…%)
   Report opened in your browser. Find the team's #1 candidate from their PDF and note the rank (number only).
3. Searches and cost:
   PASS  Loxo connection works  (app.loxo.co/district-partners)
   PASS  Searches Weaver will score  (every open search except 3011811: … found)
   INFO  People on these searches  (… on … searches)
   INFO  People already on them  (not scored: new candidates only ...)
   INFO  New candidates  (a few cents each, at most 200 a day)
```

- If line 1 shows any "failed" above 0: stop, send that line to the build chat.
- If line 3 says "could not count": your Loxo key in `.env` is missing or wrong; send the lines.

## Step 6. Check the report

A report opened in your browser (the first full run on the Imperium search, with today's Yes
rule). Open Josh's own PDF report and find his team's #1 candidate in the browser report.
Note the rank number on the left (for example 3). Do not write the name anywhere.

What good looks like: about a third are Yes, and the team's #1 is in the Yes group, near the top.

## Step 7. Send the results to the build chat

Copy everything from "Weaver ready check" down, plus the rank number, into the build chat.
The build chat checks the result and tells you when the email can go.

If the team's #1 is not in the Yes group, the build chat fixes the rule first. Do not send the
email until the build chat says the result is right.

Optional, before the email: file 01b tests real Claude scoring and the automatic part on your
own Claude key (about $2). Send those results to the build chat too.

## Step 8. Send the email to Josh

The text is in `docs/EMAIL-JOSH.v4.md` in your Weaver folder. Nothing to fill in. Open it:

```bash
open -e docs/EMAIL-JOSH.v4.md
```

1. Copy from "Josh," down to "Houssem" into a new email in Gmail.
2. Subject: `Weaver: ready for go-live`
3. Remove the stars (**) around the bold words if they show up as stars. Send.

Done for today. Next: file 02, when Josh sends the Claude key.
