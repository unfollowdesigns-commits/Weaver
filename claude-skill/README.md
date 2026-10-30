# Claude skill for the firm's team

Two versions, never overwritten:
- `dp-recruiting/` (v1): uses Weaver's reads and the firm's language.
- `v2/dp-recruiting/` (30 Oct 2026): also scores on demand with Weaver's exact
  method, writes the firm's client pipeline report, one-page profiles, outbound priority,
  and Weaver-vs-team comparisons. Method in `references/`.
- `v3/dp-recruiting/` (30 Oct 2026): Weaver's Yes rule (short list, 3.5 bar), "they" not he/she.
- `v4/dp-recruiting/` (current, 30 Oct 2026): talks like a coworker (plain, casual requests,
  no wording to learn, acts first, at most one short question), "how is a search going", and
  "sharpen a search" (drafts must-haves, target companies and location for the Loxo job
  description, which Weaver then reads).

Install v4 at onboarding with Loxo's official connector (see docs/CLAUDE-LOXO-SETUP.v1.md):
zip the `v4/dp-recruiting` folder (the zip must contain the folder named dp-recruiting with
SKILL.md inside) and upload it under Organization settings > Plugins & skills.
Contains no candidate data. Change by adding a new version, then re-upload.
