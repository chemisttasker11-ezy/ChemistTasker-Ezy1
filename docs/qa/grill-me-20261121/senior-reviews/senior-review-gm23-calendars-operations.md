# GM-23 Calendars / Operations — SENIOR REVIEW

**Senior verdict: ACCEPT AS BLOCKED — correct handling of the 429, re-run required. Not a pass on substance (nothing was re-validated), and the worker does not claim otherwise.**
**Reviewed:** 2026-11-21. Worker report file: [gm-23-calendars-operations.md](sandbox://workspace/grill-me/gm-23-calendars-operations.md)
**Method:** I read the full worker report, independently re-checked the PR #249 head/discrepancy via GitHub read-only tools, and cross-checked its verifiable claims against the already senior-reviewed GM-18/GM-19 findings.

## What I verified myself

1. **PR #249 head discrepancy — CONFIRMED.** The PR #249 body itself says "working head `26cae2d6`", while the API head is `97c4543e051b43fe30ec7e2e61ad3d69957a918e` (the `97c4543…` string is present in the API response). The worker was right to flag this as unresolved and to use the API head.
2. **SHAs the worker verified before the stop match the known-good values** reported independently by other workers: PR #184 `questions.json` SHA `9b700e31…`, 142 questions, 30 carried decisions; AUDIT.md 35 gaps at #182 head, 2026-10-20; PR #249 head `97c4543e…`. Consistent across GM-02/GM-05/GM-13/GM-15/GM-17/GM-18/GM-20.
3. **`search_code` is global, not repo-scoped — CONFIRMED.** I hit the same behaviour in my own GM-18 spot-checks (unrelated repos returned). The worker was right to abandon it and to warn against it.
4. **429 handling — CORRECT.** The worker stopped all GitHub calls immediately on the first 429 batch, attempted no retries, and marked every question NOT RE-VALIDATED. That is exactly the hard-stop rule. No Oct 2026 evidence is presented as current anywhere in the report; every §4/§5 claim carries the NOT RE-VALIDATED banner.

## What the worker got right (process quality)

- **Honest scope discipline:** the 12 new questions (GM-23-18–29: team-calendar views, ops rules engine, leave-on-calendar, display states, ops dashboard, timezone, permissions, export, notification channels, publishing, needs-cover, audit) are framed as NOT INSPECTED with recommendations explicitly labelled "proposed, needs tracing" — not smuggled in as findings.
- **Full re-run list (§8.2):** backend `team_calendar/`, talent availability files, announcements/escalation/base, roster validation, celery beat, notifications push-preference migration; web Vite/Next calendar pages; Expo W4 screens + calendar contract tests; shared-core contracts. Complete enough to re-run from.
- **Backlog kept separate (§8.3, B1–B13)** and marked as only-after-owner-answers; decision status correctly at NOT VERIFIED for all 29 questions.
- **First-question choice is sound:** GM-23-01 (LA-Q16 — calendar as single source of truth vs copied snapshot) is the right first ask; GM-23-23 (timezone) is correctly named as the alternate first question given its pay/Award severity.

## Corrections / notes — none to the report's substance

No corrections required. Two notes for the re-run (not worker errors):

1. **Reuse, don't re-trace, the availability half.** GM-18 (senior-reviewed PASS) already verified at this same head: LA-Q16 stale copy STILL VALID, LA-Q18 no server validation STILL VALID (bare `ModelSerializer`, confirmed by me), LA-Q17 partially changed (distance/travel now enforced for match emails, Verified filter still missing, escalated shifts still don't trigger), AV-Q09 split (distance now enforced, rate still missing). GM-19 verified the availability model and matching rules. On re-run, GM-23 should **adopt GM-18/GM-19's verified verdicts for AV-Q01–Q09 / LA-Q16–Q18** and spend its effort on the genuinely new GM-23 ground (GM-23-18–29) — team-calendar views, ops rules, leave, display states, dashboard, timezone, permissions, export, notifications, publishing, needs-cover, audit.
2. **Worker-reported, not independently verified by me:** the claim that PR #249's body lists "Waves W4 pharmacy operations; W5 attendance/workforce…" as next work. Plausible and consistent with the PR's wave structure, but I only read the top of the body; the re-run should confirm it when it re-fetches the PR.

## GM-23 deliverable (provisional — BLOCKED, not senior-approved as traced)

- **Traced flow:** historical-only matrix F1–F11 (§4), all NOT RE-VALIDATED. Unknowns honestly listed: team-calendar views, ops dashboard, leave-on-calendar, timezone/clock, display states, export/sync, push preferences (migration `0004_notificationpushpreference.py` content not read), Expo W4 screens.
- **Question queue:** 29 questions, GM-23-01 to Q29 (17 old: AV-Q01–Q09, AG-Q11–Q12, PO-Q05–Q07, LA-Q16–Q18; 12 new: GM-23-18–29), all NOT VERIFIED.
- **First question to ask the owner (once re-validated):** **GM-23-01 — Is the worker availability calendar the single live source of truth, with talent posts showing live calendar data, not a copied snapshot?** Options: A (recommended — before launch, single source of truth) · B (keep copied snapshot) · C (copy stamped "as at [date]" + auto-hide after N days) · Other / Defer. Alternate first: GM-23-23 (timezone).
- **Code gaps (Oct 2026, NOT RE-VALIDATED):** AV-01/LA-Q16 stale copy; AV-04/LA-Q17 match-email gaps; AV-05/LA-Q18 no server validation; ON-02 AHPRA expiry never enforced; SH-05/LA-Q08 lazy escalation; SH-06 escalation sends nothing; reminder has no cancelled-state suppression / no late-change alert.
- **Decision gaps:** AV-Q01–Q09, AG-Q11/Q12, PO-Q05–Q07, and all new GM-23-18–29 (notably GM-23-23 timezone — high legal/financial severity).
- **Required next step:** re-run after the GitHub rate limit clears — refresh the PR #249 head SHA first, re-fetch the §8.2 file list, re-mark each question STILL VALID / CHANGED / NO LONGER VALID, and only then is GM-23 senior-reviewable as traced. Do NOT ask the owner GM-23 questions from this report as if verified.
