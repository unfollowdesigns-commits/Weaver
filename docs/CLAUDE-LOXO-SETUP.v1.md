# Connecting the firm's Claude (or ChatGPT) to Loxo, and adding the firm's skill

Checked against the vendors' help pages on 29 Oct 2026. Menus change: confirm live on the call.
Sources: help.loxo.co/en/articles/15668374-loxo-s-mcp, loxo.co/products/loxo-mcp,
support.claude.com articles 11175166, 12512180, 13119606; help.openai.com 12584461, 20001066
(OpenAI pages read from search snippets only).

## Before the call
- Loxo: MCP is included on their plan (they have API access, so Professional or above).
  Sign-in is a normal Loxo login (no key). Each person only sees what their Loxo account can see.
- Server address: https://app.loxo.co/api/district-partners/mcp (built from their confirmed
  slug; test it on the call).
- Claude: who is the Owner of their Claude organization? Only an Owner can add the connector
  and the firm skill. Which plan: Team or Enterprise?
- Have claude-skill/v2/dp-recruiting zipped: right-click the folder > Compress. The zip must
  contain the folder named dp-recruiting with SKILL.md inside.

## Claude, part 1: the Owner adds Loxo once for the whole firm
1. Organization settings > Connectors > Add > Custom > Web.
2. Name: Loxo. URL: https://app.loxo.co/api/district-partners/mcp. Continue.
3. Review the sign-in settings Claude detects. Continue.
4. Authentication: Sign in when needed. OAuth client: Use Claude's published identity
   (recommended). Leave Request headers empty (no shared key).
5. Add.

## Claude, part 2: each recruiter, once
1. Customize > Connectors > find Loxo (marked Custom) > Connect > sign in with their own Loxo login.
2. In a chat: "+" > Connectors > switch Loxo on.

## Claude, part 3: the Owner adds the firm skill for everyone
1. Organization settings > Plugins & skills > Policy: turn on "Cloud code execution and file
   creation" and "Skills" (skills do not work without code execution).
2. Organization settings > Plugins & skills > Add > Upload a skill > choose dp-recruiting.zip.
3. It reaches every member at once, switched on. Members can switch it off but not delete it.
   (Older screens call this "Organization settings > Skills".)

## Test on the call (5 questions)
1. "Top 5 on the Head of Finance and Accounting search, and why."
2. "Prep my call with [a candidate on that search]."
3. "Compare [two candidates] on the search's scorecard."
4. "Draft this week's client update for that search."
5. "Show me the AI scorecard Weaver wrote for [a candidate]." If Claude cannot read
   scorecards, switch Weaver to writing notes (LOXO_WRITE_TARGET=note).

## Safety, say it on the call
- Loxo's connector can also create, edit and delete records (beta). Claude asks before any
  action: the team reads what it is about to do and only approves reads, or edits they asked for.
  The firm skill tells Claude never to write to Loxo unless asked.
- Webhooks cannot be managed through the connector; Weaver's automatic scoring keeps using the
  API key on the server. The two do not interfere.

## ChatGPT instead (if the firm prefers it)
Possible on ChatGPT Business or Enterprise; custom connectors are still beta there.
1. An admin: Workspace settings > Permissions & roles > turn on developer mode / custom MCP
   connectors.
2. Workspace settings > Apps > create a custom app > paste the Loxo address > sign-in type OAuth.
3. Drafts > Publish (accept the warnings about write actions).
4. Each user: the app shows as "custom"; sign in with Loxo on first use.
5. The skill: ChatGPT has Skills on Business and Enterprise (same open format as Claude's);
   an admin enables skill uploads, then upload dp-recruiting.zip and share it with the workspace.
   If uploads are not available, paste SKILL.md into a shared Project's instructions.
Exact menu names on ChatGPT were not confirmed (help pages blocked to our checker): check live.
