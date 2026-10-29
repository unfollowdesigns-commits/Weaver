# Claude skill for the firm's team

Two versions, never overwritten:
- `dp-recruiting/` (v1): uses Weaver's reads and the firm's language.
- `v2/dp-recruiting/` (current, 30 Oct 2026): also scores on demand with Weaver's exact
  method, writes the firm's client pipeline report, one-page profiles, outbound priority,
  and Weaver-vs-team comparisons. Method in `references/`.

Install v2 at onboarding with Loxo's official connector (see docs/CLAUDE-LOXO-SETUP.v1.md):
zip the `v2/dp-recruiting` folder (the zip must contain the folder named dp-recruiting with
SKILL.md inside) and upload it under Organization settings > Plugins & skills.
Contains no candidate data. Change by adding a new version, then re-upload.
