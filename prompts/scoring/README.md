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

- `scoring-prompt.v4.md` (in use since 30 Oct 2026): as v3, and after the first full-search run
  (180 read, 72% "yes" with gpt-4.1): "yes" means the short list (every must-have met, strong on
  most of what matters), not a pass mark; "they", never he or she; no quoting the scorecard's rules
  back; no "likely" guesses. The code also holds a minimum bar for "yes" (see src/validate.js).
