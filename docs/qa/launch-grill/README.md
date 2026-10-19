# Launch grill: onboarding, shifts, talent board, availability

Owner interview to close the launch gaps. It builds on the shift-lifecycle grill in `docs/qa/shift-lifecycle/` (those answers are carried over, not re-asked).

- **Answer here (saves to the cloud as you type):** https://claude.ai/artifact/7d2DpzhTY9xbj9Ux1fW3XW (private to the owner)
- `LAUNCH_GRILL.html`: the same page, opened locally. It saves to this browser only; use Review & export to move answers.
- `questions.json`: 142 questions in 8 areas. Each shows how the app works today, a "Keep current logic" option where something exists, a recommendation and competitor sources.
- `REVIEW.md`: independent deep review (market, Australian law, code); its 25 fixes and 6 new questions are applied.
- `AUDIT.md`: 35 code and decision gaps found at PR #182 head (read-only audit).
- `RESEARCH_SHIFTS.md`, `RESEARCH_TALENT.md`: competitor research (AU, US, Canada, UK), 20 Oct 2026.

Nothing here changes app behaviour. Recommendations are not decisions until the owner answers.

## Code base checked
`current` describes PR #182 (stacked on #181) **plus PR #183** (AHPRA desktop verification). Changes marked "(with PR #183)". `PR183_CHECK.json` lists the #183 edits and the three places #182 and #183 clash in behaviour (LA-P01..03); a test merge has no file conflicts.
