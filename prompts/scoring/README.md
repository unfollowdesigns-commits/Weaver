# Scoring prompt

The prompt Claude uses to give a first read of one candidate against one search's scorecard.

- `scoring-prompt.v1.md`: first version, assessment and open questions.
- `scoring-prompt.v2.md` (in use since 29 Oct 2026): written in the firm's own report language
  (where they fit, where to probe, strongest signal, watch item, industry star) and its
  scoring habit (3 meets, 4 strong, 5 exceptional).

- `scoring-prompt.v3.md` (in use since 29 Oct 2026): as v2, and never mentions pay. Pay sentences
  are also removed from notes, resume and job description before the model sees them.

Versioning: never overwrite. Add `scoring-prompt.v3.md` beside the others and point
`DEFAULT_PROMPT` in `src/prompt.js` at it.
