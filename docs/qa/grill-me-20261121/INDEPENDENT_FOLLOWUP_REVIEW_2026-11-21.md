# Independent follow-up verification — PR #267 (21 November 2026)

**Disposition:** FOLLOW-UP PARTIALLY ACCEPTED; **the claimed 311 genuine owner decisions / 277 immediately askable are NOT independently signed off as exact** until GM-18's reconstructed numbering is reconciled with the dedup graph. This is a documentation/source review only. No app code, schema, runtime test, production payment or deployment was changed.

## Verified independently

| Follow-up item | Evidence checked | Verdict |
|---|---|---|
| GM-18 rebuilt | `areas/GM-18-talent-recruitment.md` contains 26 explicitly numbered `GM-18-Q01`–`Q26` sections with actual-behaviour descriptions and alternatives. Original numbering was unrecoverable and the document says so. | **DONE as reconstructed source document**; not recovered original |
| 540/311/9/20/4/196 accounting | `followup/followup-genuine-dedup.md` has 26 area rows summing 540, with categories 311 genuine, 9 approved, 20 code gaps, 4 verification items, 196 references/duplicates; 346 canonical groups and 311 numbered genuine items. | **ARITHMETIC PASS; SEMANTIC DEDUP FAIL / STALE MAPPING** (details below) |
| PR #257 relationship | GitHub compare of `97c4543e051b43fe30ec7e2e61ad3d69957a918e` → `ad01356ee4689c8afaafc3028b5571c45101d925`: ahead 220, behind 0. The compare returned **300 files maximum**, so it does not provide a complete per-file inventory. | **220-commit ancestry verified; no exhaustive 220-commit functional diff** |
| 5 risk-critical core files | Independent both-head file fetch + blob-SHA equality for `backend/shifts/posting.py` (`302153eb...`), `backend/billing/checkout_reservations.py` (`715d1bac...`), `backend/shifts/interest.py` (`ef0f8920...`), `backend/workforce/roster/worker_actions.py` (`646be7b9...`), `backend/shifts/escalation.py` (`739dbbaa...`). | **PASS: byte-identical**; original business-logic gaps persist in these files |
| Talent anonymity | `backend/talent/serializers/explorer.py` differs between heads (`652c880...` → `48a1276...`), but its authenticated read serializer still includes `explorer_name`, `author_user_id`, `explorer_user_id`. `backend/talent/views/explorer.py` uses `IsAuthenticated` for list/retrieve and unmasked serializer. | **Leak persists at #257**; not a sign-off of the wider privacy surface |
| GM-19 changed | `backend/talent/serializers/availability.py` differs (`feed4ab...` → `b46c498...`). At #257, `UserAvailabilitySerializer.validate` checks supported weekdays 0..6, requires recurring end/date structure and rejects non-positive time order (with a metadata-PATCH compatibility exception). `backend/shifts/announcements.py` remains identical. | **Previous blanket “no availability validation” is wrong for #257.** Full matching/notification re-trace still pending |
| 29-item unverified closure | `followup/followup-unverified-closure.md` itemises 24 VERIFIED, 4 PARTIALLY VERIFIED (ON-Q15, GM-05-Q16, GM-25-C05/C18), 1 UNKNOWN pentest (GM26-Q43). | **Documented source reinspection is substantial**; no independent repeat of all 24 fetches, no physical/penetration test |
| Launch-blocker buckets | `followup/followup-launch-blocking.md` contains 617 rows in blocking section and 206 in optional section, totalling 823 area entries (540 question entries + 283 code-gap entries). | **COUNT PASS, NOT 617 UNIQUE DEFECTS**. Duplicates and conditional feature inclusion must be normalised |

## Required correction 1 — reconstructed GM-18 IDs invalidate the old canonical mapping

The dedup was authored before the reconstructed GM-18 trace. It still labels eight GM-18 questions “title unrecovered”, when their reconstructed numbers are explicitly allocated to **different concepts**. The same ID cannot simultaneously represent the presumed lost question and the newly reconstructed one:

| GM-18 ID | Dedup document's canonical meaning | Actual reconstructed question | Correct treatment |
|---|---|---|---|
| Q04 | Filters / unrecovered title | Talent-board filters | Title is now known; validate merge |
| Q08 | Standalone “commercial model” | Heart / favourites action | Merge with `HEART` in GM-05-Q14 |
| Q09 | Standalone “commercial model” | Can a pharmacy block a worker? | Merge with `BLOCK-WORKER` in GM-15-Q43 |
| Q10 | Standalone “commercial model” | Off-platform/direct hiring policy | Merge with `OFFPLATFORM-HIRING` in GM-26-Q20 |
| Q13 | Standalone talent lifecycle | Fix authenticated anonymous-identity leak | Reclassify as privacy implementation gap / existing reveal-audience policy; not standalone lifecycle |
| Q14 | Standalone talent lifecycle | Hidden, stale, lapsed-credential posts | Reconcile with `TALENT-LAPSE` (GM-01-Q17), `AVAIL-STOP` (GM-19-Q06), and related visibility-gate gaps |
| Q23 | Entire subject “UNKNOWN” | When should a talent post stop showing? | Cross-reference `AVAIL-STOP` and `TALENT-STALENESS`; not an unknown topic |
| Q24 | Disclosure | Who can see availability? | Cross-reference `AVAIL-VISIBILITY` (GM-19-Q04); the terms disclosure subject is Q26 |

**Consequence:** the reported exact total `311` and ready-now total `277` are **PROVISIONAL** despite correct arithmetic on the pre-reconstruction inventory. Rebuild canonical-to-source mappings using the NEW GM-18 wording, not the original lost worker report's hypothetical numbering. Recheck all 26 for new unmatched decisions, code gaps, duplicate merging and the status of the 8 previously blocked GM-18 titles. Do not silently assert a corrected total until the reconciliation is rerun. The 540 raw area-entry count can remain as the historical snapshot only if the source-entry inventory and reconstructed questions are the same 26 numbered slots.

## Required correction 2 — prevent recommendations from becoming binding owner choices

`areas/GM-18-talent-recruitment.md` says “OFFER-01 C decided in principle in the consolidated queue.” A coordinator recommendation in the queue **is not an owner decision**. Correct status is `OPEN_POLICY (C recommended)`; ask the owner once in sequence. Other area files should use the same rule.

## Required correction 3 — do not equate a routed penalty endpoint with enabled live charges

At #257, `backend/billing/urls.py` still routes `charge-penalty/`; `backend/billing/shift_payments.py::charge_penalty` still calculates 10%/20% on eligible assignments. However it calls `assert_can_create_shift_charge("cancellation")`, and `backend/billing/release_guards.py` checks `BILLING_LIVE_SHIFT_PENALTY_ENABLED` for live-mode charges, plus provider/environment constraints. In test mode it permits test-provider checkouts in allowed non-production environments. **The route exists and the business rule is unsafe to enable; it is not established that real live charges are currently enabled.** Production env settings were not inspected. Disabling/removing the legacy route before activating production charging remains a release task.

## Required correction 4 — update stale entrypoints / review claims

- PR #267 body still says “524 unique”, GM-18 worker trace missing, old do-not-ask list and code-broken owner decisions “SUPERSEDED”. This has been overtaken by the follow-up. Update the PR summary.
- `README.md` still says GM-18's trace is missing and lists the old 29 unverified questions. Point to `FOLLOWUP_2026-11-21.md`, this audit, the reconstructed GM-18 and the four partial + pentest unknown.
- `followup/followup-genuine-dedup.md` and `followup/followup-launch-blocking.md` were assembled before GM-18 reconstruction/#257 refresh. Mark them snapshot/provisional; do not silently say all their source labels reflect the final follow-up.
- `followup/followup-pr257-refresh.md` calls 10 areas UNCHANGED based mostly on PR #257's *own* 64-file diff. The 187 intermediate commits were not exhaustively reviewed. Use “no change identified in sampled files” rather than an absolute unchanged conclusion, pending a complete comparison.
- `followup/followup-launch-blocking.md` treats goods marketplace as optional based on *recommended* LAUNCH-01 deferral. No owner LAUNCH-01 answer is recorded, so this categorisation is **conditional**. Launch requirements must be recomputed once the owner selects an actual release cut.
- Source-only documents and past CI references do not prove exact-head test, staging, real Stripe, Android, iOS, accessibility, qualified legal review, or a pentest. Keep release HOLD.

## Next acceptance gate

1. Rebuild the canonical question ledger by applying the reconstructed GM-18 mapping, then publish new verified genuine/duplicate/ready counts.
2. Trace GM-19 matching end-to-end on #257 (serializer `validate`, public slot sanitisation, recurrence and overlap, booking conflict/leave suppression, alerts, worker calendar/talent post copy).
3. Obtain the rest of the head-to-head delta (GitHub compare returns 300 files); inspect changed auth, billing, notification and onboarding flows to justify every “UNCHANGED”.
4. Reconcile and repair the four partial onboarding/payment-parity items, independently test the claimed resolved items as needed; do not mark Q43 as passed without actual security evidence.
5. Ask LAUNCH-01 as an unanswered owner choice; record the exact response and scope. Only then label feature-conditional launch blockers and create the implementation plan.

**Final:** Follow-up delivers real source-review improvements; **do not sign off the exact 311/277 totals or launch readiness yet**.
