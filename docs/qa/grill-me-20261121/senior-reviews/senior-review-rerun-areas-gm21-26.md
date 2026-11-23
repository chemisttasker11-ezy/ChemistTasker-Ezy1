# Senior review — re-run areas GM-21, GM-22, GM-23, GM-25, GM-26

**Senior reviewer:** parent coordinator (this agent), 2026-11-21.
**Method:** I did not trust the worker reports at face value. For each area I independently re-fetched 1 load-bearing file at PR #249 head `97c4543e051b43fe30ec7e2e61ad3d69957a918e` via GitHub read-only tools, one call at a time with ≥8 s between calls, and checked the worker's key claims against the code. Where a claim rests on a file I did not re-fetch, that is stated as a residual, not treated as verified.
**Head note:** PR #249 API head `97c4543e051b43fe30ec7e2e61ad3d69957a918e`, branch `fix/pr248-expo-production-waves-20261104`, open draft. The PR body text naming a "working head `26cae2d6`" is the short SHA of the last listed implementation commit, not the branch head — all workers traced at the correct `97c4543e` head.
**Scope freeze (Issue #250):** documentation/decisions only; no code changed in any area.

## GM-21 Ordinary/ethical marketplace — PASS

- Worker file: `~/workspace/grill-gm21/GM-21-ordinary-ethical-marketplace.md` (20 questions, first GM21-Q01 — launch scope, recommend A defer from launch cut).
- Verified myself at head: `backend/marketplace/models.py` contains **zero** hits for `stripe` / `payment` / `fee` — the "no payment path in `models.py`" finding is confirmed. `public_discovery` appears once in the file (the field itself); the worker's "never consulted" claim rests on its wider read of the app, which I did not repeat.
- Residual: the wider "no payment path anywhere in either app", "no notification ever sent", reservations never expiring, review admin-only, internal-transfer destination acceptance — all rest on the worker's full-app read (both apps + migrations + Next/Expo screens). The worker's own process note: one false-positive 429-detector stop (matched `EMAIL_TASK_RATE_LIMIT` inside a successfully downloaded `settings.py`), detector corrected, loop resumed — no real 429, and the first-pass deviation (a call after a 429) was not repeated.
- No corrections to substance.

## GM-22 Notifications/rewards — PASS

- Worker file: `~/workspace/goals/chemisttasker-grill-me/files/GM-22-notifications-rewards-trace.md` (28 questions, first GM22-04 — channel rule, recommend A in-app + push, email for money/cancel).
- Verified myself at head: `backend/shifts/emails.py` sets `"pharmacy_name": shift.pharmacy.name` **unconditionally in 6 places** inside `build_shift_email_context` — the anonymous-pharmacy leak (wider than Oct 2026: reminder email, shift-updated notice, not-selected notice) is confirmed.
- Residual: the "no dedup, no push retry, no staleness voiding, no audit log" claim, quiet-hours 22:00–07:00, empty-body auto notices, and the Next-has-no-centre claim (default-branch search only, flagged as such by the worker) rest on the worker's read. GM22-07 and GM22-15 remain NOT RE-VALIDATED; GM22-03's cancel half is not re-traced — all flagged in the file, not presented as current.
- No corrections to substance.

## GM-23 Calendars/operations — PASS

- Worker file: `~/workspace/grill-me/gm-23-calendars-operations.md` (29 questions, first GM-23-01 — single live source of truth, recommend A; alternate first GM-23-23 timezone).
- Verified myself at head: directory listing of `backend/team_calendar/` at head contains `__init__.py, apps.py, migrations, models.py, recurrence.py, serializers.py, tasks.py, test_api.py, urls.py, views.py` — **`operations_rules.py` is absent** — the "Oct 2026 ops-rules engine does not exist at this head" finding is confirmed.
- Residual: the three-timezone finding (server Sydney, pharmacy zone, per-user push-pref zone default Brisbane), "team calendar and roster calendar never meet", and Expo W4 calendar screens rest on the worker's read. The PR #249 body wave list ("Waves W4 pharmacy operations; W5 attendance/workforce…") was confirmed verbatim by the worker.
- No corrections to substance.

## GM-25 Web/Next/Expo parity/UX — PASS

- Worker file: `~/workspace/grill-me/GM-25-web-next-expo-parity.md` (38 questions, first GM25-Q01 — launch cut, recommend B Vite web + Next public first, Expo after Senior Package Testing).
- Verified myself at head: `frontend_web/src/pages/dashboard/sidebar/TalentBoard/hooks/useTalentFeed.ts` (the hooks copy) contains **zero** hits for `verification` / `normalizeVerification` — the worker's "diverged twins" claim for that copy is confirmed (the top-level copy maps `verification: normalizeVerification`; the hooks copy omits it).
- Residual: the 314-file composition (222 mobile / 22 shared-core / 17 web / 37 backend / 12 docs / 3 scripts / 1 .github), the public-board ×3 diff, C11's fresh re-trace, and Q10 (Expo pays via `Linking.openURL` to Stripe Checkout, return-to-app leg unverified) rest on the worker's read. C05, C06, C07, C10, C17, C18 remain NOT RE-VALIDATED; C19/C20 mechanics belong to GM-22/GM-23 (parity angle only) — all flagged in the file.
- No corrections to substance.

## GM-26 Admin/privacy/security/release — PASS WITH NOTE

- Worker file: `~/workspace/grill-me/GM-26-admin-privacy-security-release.md` (48 questions, first GM26-Q36 — launch cut, recommend A no launch until the NO-GO is cleared; recorded identically and flagged for the single-launch-decision consolidation).
- Corroborated from my own earlier read of `backend/core/settings.py` at head: `DEBUG = env.bool("DEBUG", default=False)` and `ALLOWED_HOSTS = ["*"]` only when DEBUG — consistent with the worker's Q42 findings.
- **Note (not a correction):** the runtime-proof items the worker itself flags are still open — B62/B63/B65 negative tests, B64 fix verification, exact-head CI, live staging check, production env values, Expo privacy parity. Q07, Q12–Q20, Q22–Q26, Q33 remain NOT RE-VALIDATED; Q43 (pentest) is UNKNOWN (nothing evidenced). None of these is presented as current in the file.
- Residual: the `platform_admin` 0-hit claim (by direct reads, per the worker), the `audit_log` 0-hit claim (no audit trail evidenced), Q40 deletion tracing, and Q41 privacy-body comparison rest on the worker's read.
- No corrections to substance.

## Totals (wave-3 areas)

- 5 areas senior-reviewed by me: GM-21 (20 Qs), GM-22 (28), GM-23 (29), GM-25 (38), GM-26 (48) = **163 questions**, all OPEN, none owner-decided.
- Verdicts: 4 PASS, 1 PASS WITH NOTE (GM-26 — runtime proof still open, as the worker itself flags).
- No worker report required a correction to its substance. No code was changed. No PR/branch created. Owner not notified.
