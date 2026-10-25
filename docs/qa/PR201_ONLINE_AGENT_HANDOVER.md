# PR #201 handover to the online agent

26 October 2026. Final local branch: `fix/pr201-combined`, implementation head `d35d6e2f`. Nothing is pushed by this documentation task. The original PR base is `021d801d`; your reviewed follow-up ends at `49b79ee1`.

We kept your useful fixes, combined overlaps, and fixed the remaining regressions before assembling the branch. All five independently reproduced blockers are now closed. This is not a claim that the whole backend suite is green or that every audit finding is resolved.

## Evidence and meaning of the verdicts

The commit decisions below come from **our** `remote-pr201-verdicts.md`: Claude B's three review passes, Codex's second opinion on money/Award paths, our own Postgres red tests and realistic migration rehearsals. Your own tests and handover were context, not independent proof. Final corrections are supported by the review reports and gates listed in [the combined handover](PR201_COMBINED_FIX_HANDOVER.md#evidence-and-scope).

Notes folder: `C:/Users/semse/AppData/Local/Claude-Data/claude_pzs8sxrjxfjjc/side-session-notes/local_64a56407-9037-4ce4-8e28-c6cd03192f07/`. Reports folder: `C:/Users/semse/AppData/Local/Temp/claude/C--ChemistTasker-Ezy/ddb284c5-2936-4748-acbb-71fb39b861d8/scratchpad/`.

**Accepted** means we kept the stated scope. **Accepted with fix** means a correction or combination was required and is now integrated. **Changed/superseded** identifies code or CI structure we deliberately replaced. The original review's B25 rejection was a hold on the broken implementation; the final branch contains its Postgres fix.

## Your commits: what we kept and changed

The original PR's `523a4c2c`, `71676fac`, `92b450c6`, `c8eec6e7`, `341e4acf`, `1e8de643` and `021d801d` were accepted for their calendar/tenant, invoice, member-status, admin-revocation, payment/ethical-status and dependency fixes. We added separate create/payment/invitation scope follow-ups. `3becaec7`'s authorised-remover fixture was retained. The tests in `8d13eb45` and `976f5b2c` were accepted with a structural change: app-local tests and existing CI replace their PR-specific package/workflow. Claude B reviewed this base in `claudeb-review.txt`; the later audit runtime gate is 16/16 OK.

| Your commit(s) | Final verdict | Why / our evidence / final correction |
| --- | --- | --- |
| f1199fe7, 113d9f6f (B35) | Accepted with fix | Keep tenant and occurrence-date checks; keep our POST/PUT removal and reject moving assignments. Drop matching-role validation on update because it blocks legitimate edits. `claudeb-merge.txt`; `workforce.tests.test_pr201_roster`, final backend comparison. |
| 47637a3f (B24/B25) | Accepted with fix | Completion gate is sound. Our Postgres repro found the nullable-join lock crash; c2b3ea5b locks only the listing row. Blocker 1 below is now green. |
| 10c6d7cc, 83468d03 (B31) | Accepted | Self-row lock, post-lock recheck and JSON-safe receipts retained. Claude B reviewed the source; `ethical_marketplace.test_pr201_b31_pg` was included in the final Postgres run. |
| c62f6314, 0caf8519, 15363d46, ae5602ac, a4cd1761 (B29) | Accepted with fix | Keep provisional evidence and append-only manager review. c0806439 hides/refuses already-applied legacy review rows; our blocker-5 controls pass. Final standalone module: 34 OK. |
| 7bc4a83c (B01) | Accepted; owner action | Subscriber prices retained. `billing.test_pr201_b01` uses mocks; the owner must confirm both IDs in the actual Stripe account/mode. |
| c8e482db (B02) | Accepted with fix | Seat resizing kept. f2d1c1b3 re-reads current Stripe state under locks so old events cannot regress quantity. Claude B/Codex review; `billing.test_pr201_b02`. |
| 838abd98, 76b2e3c8 (B53/B68) | Accepted with fix | Keep cancellation tombstones. Fix first invoice-before-checkout period loss, missing handler locks and a new paid checkout after cancellation in f2d1c1b3. `billing.test_pr201_b53`; final targeted run has no new failures. |
| 78e43824 (B57) | Accepted with fix | Cumulative partial/full refunds kept. 3b2a612a makes refund-before-checkout retryable rather than permanently lost. `billing.test_pr201_b57`; enable charge.refunded at the provider. |
| 9b8993ed, 85938d77 (C004-N2/B04) | Accepted with fix | Keep free-first ordering. Combine our explicit offers/candidate checks, one offer per slot and checkout idempotency. Both reviewers confirmed the original double-candidate/selection gaps. `billing.test_pr201_checkout`, `billing.tests`. Cross-session duplicate-charge policy remains on the grill list. |
| 3749cde1, 306ed6c6, 2313eb5e (B69) | Accepted | Intent get-or-create plus partial DB uniqueness retained. Realistic forward/rollback/forward passed; a genuine duplicate aborts cleanly without altering financial rows. `billing.test_pr201_b69`, finance Postgres tests. |
| 968fabea, 1cd43fcf; ledger part of 8968b378 (B10) | Accepted with combination | Keep remote pay_shift and self-row shift lock, plus one user-row ledger lock and one per-offer key format. Claude B/Codex review; independent lock-removal red test; remote finance 3/3 at 49b79ee1 and final Postgres execution. |
| Stripe part of 8968b378 | Accepted with fix | Customer/subscription scoping kept; a canceled customer starting a genuinely new checkout was still ignored. f2d1c1b3 fixes recovery without reviving stale canceled subscriptions. |
| a959d9a5 (B14 rates) | Accepted with fix | Effective-dated Award source retained. c78573bb makes cache dates explicit and fixes HALF_UP/context details. `shifts.test_pricing_contract`, `shifts.test_pr201_store_award_contracts`. Full legal calendar certification is not claimed. |
| a32b05e1, 80243bad, 97afd6f0 (holiday data/resolver) | Accepted with fix | Keep source-labelled state/local/part-day data. Our Postgres tests found no-district floor/pricing blockers. c78573bb uses statewide fallback and flags relevant local dates; all blocker repros pass. |
| ad0dcb3f, 7b39750c, 18a81503 (pricing/floors/snapshots) | Accepted with fix | Keep work-date/part-day bands and ordinary snapshot shape. Correct missing-district floor and non-payroll pricing with the store-based rule. `shifts.test_pr201_no_region_store`, Award/pricing contracts. Existing staff repricing remains an owner concern. |
| 72fd26bc, f8e33f82 (region API/validation) | Accepted with fix | Keep pharmacy region choices/validation; store location is authoritative. Worker-evidence interpretation is superseded by item 15. `organizations.test_pr201_holiday_region`; final backend suite comparison. |
| a1f0cf9c, 26a1dabb (holiday tests/CI) | Accepted with integration changes | Keep focused geography/data regressions; run them through existing CI. Final backend/shared-core gates do not certify every 2026-2027 council declaration. |
| a5f96b90, 49b9707f, 8b41e199 (shared holiday/hours presentation) | Accepted | Shared-core owns Vite/Next/Expo presentation. 358/358 shared-core tests at your head; final 386 tests + build and all client typechecks OK. |
| 28ba382a, e7735ca1 (pricing fingerprints) | Accepted within reviewed scope | Keep intentional source/warning fingerprint updates after checking behaviour; final contract suite has zero new failures. A changed hash alone is never proof of correct pay. |
| 191741ff (holiday ownership guidance) | Accepted with updated rule | Shared ownership retained; later store-based decision supersedes worker work-base requirements. |
| 766b9e2a, 3f508e6c, 03a2eaed; 02a566ac (worker work-base gate/tests/CI) | Changed/superseded | Our blocker 4 reproduced universal activation failure because no client supplied worker evidence. Owner chose posting-store holidays. The worker gate and its universal client requirement were removed; test/CI structure follows app ownership. |
| 43ddb8bc, 67bfff30, 0b32920a (store-based replacement) | Accepted | You fixed blocker 4 yourself. Our same activation repro failed at 03a2eaed and passed at 49b79ee1; code search confirmed worker gates removed. |
| df101686, ef6ff0c4, 22f0dcef, 49b79ee1 (chat revocation) | Accepted with fix | Keep REST/subresource/socket revocation. 62cf68fb corrects CONTACT employment_type and valid participant lookup; 6fc6eefc restores per-delivery checks; d35d6e2f adds chat session logout/password closure. `chat.test_revocation_contracts`, `chat.test_api`, `chat.test_websocket`. |
| 1bb06d79 (Region Admin) | Accepted with fix | Cross-org/inactive-user hardening kept. The red capability test was also red before your change: pre-existing B62 blanket grants. 4e8a0f42 makes capability follow admin_level and aligns roster create/list; scoped-role tests and final suite comparison cover it. |
| f82d13ef, 11878ce5 (finance/security CI) | Changed/moved | Tests retained next to their apps; PR-specific workflows removed in b8185509. 46163796 lists every Postgres-only module in existing CI. SQLite skips are not race-test passes. |
| c74e5f9f, e44ba9e7 (QA notes) | Accepted as historical evidence | Retained observations/limitations; final combined gates below supersede their intermediate release status. |

## The five blockers we found

All five failed in our own Postgres repros at `03a2eaed`, while their positive controls passed (`claudeb-repro-blockers.txt`). At `49b79ee1`, blocker 4 was already fixed by you; 1/2/3/5 were still open. The assembled branch's independent blocker run is **14/14 OK**.

| Blocker | What failed | Final fix and proof |
| --- | --- | --- |
| 1: marketplace audience | An authorised audience POST crashed on Postgres because FOR UPDATE touched a nullable outer join. | c2b3ea5b: select_for_update(of=("self",)). `B1MarketplaceAudience.test_audience_endpoint_blocker`; permanent app test `marketplace.test_pr201_b24_b25`. |
| 2: TFN floor without district | A QLD store with no district froze a below-Award rate or rejected an otherwise valid no-rate offer. | c78573bb: statewide floor with review flags on relevant local dates. `B2TfnAwardFloorNoRegion`; `shifts.test_pr201_no_region_store`. |
| 3: ABN pricing at payroll-enabled store | A locum shift without a district priced at 0.00/REGION_REQUIRED just because payroll was enabled. | c78573bb: statewide pricing without globally blocking existing stores. `B3AbnPricingPayrollOnNoRegion`; permanent no-region app tests. |
| 4: payroll activation | An existing accepted TFN offer could not activate payroll because worker evidence had no client input. | Your 43ddb8bc/67bfff30/0b32920a store-based replacement removes the gate. `B4ActivatePayroll.test_existing_accepted_offer_activation_blocker`, green already at 49b79ee1. |
| 5: already-applied kiosk evidence | A legacy NEEDS_REVIEW row with attendance_event already set appeared in review; approving it created another CLOCK_IN. | c0806439: hide applied rows and refuse approval with 409 under lock. `B5KioskLegacyReview` plus `attendance_tests.test_pr201_b29_kiosk`. |

## What we fixed on top, by area

- **Memberships/auth:** scoped immutable invite links, removal/re-invite admin revocation, response-notification privacy, no generic application bypass, phone-code/remember-me fixes, email-only reset secrets, push-device logout and mobile startup guards (B19, F03-N2/N3, C011-N2, C012-N1, B30, B43, C024-N1, C071-N1/N2, F11-N1/N3, B52).
- **Shifts/roster:** occurrence locks and accepted-date/hour booking/invoices, manager-only identities/documents, accepted memberships, pharmacy-local boards, safe description/rate edits, protected booked slots/history, scoped cover/leave approval and replacement terms, complete pagination and mobile payroll export (B54, F01-N1/N2, C020-N6, C021-N2/N6, B41, C032-N1, C078-N2/N3, C079-N1, B21/B55/B60, B37/B38/B61).
- **Billing/finance:** order-safe subscription events, early-refund retry, Decimal/HALF_UP money, overnight penalties, durable refund-required alerts for losing/expired paid offers, receipt/revision privacy and accepted-shift invoice saving (B02/B53/B57/B66, F08-N2, F07-N1/N2/N3/N4, B58). Refund alerts and payment roll back together; replays do not duplicate them. No automatic refund is promised.
- **Attendance:** kiosk assignment/time-window validation and retry handling, overnight corrections, archived-roster timesheets, provisional rejection recovery, employment-term refresh and pharmacy-timezone correction inputs (B32, C002-N1, C028-N4/N5, F06-N2, C029-N2, C039-N1).
- **Chat/Hub:** accepted-member Hub scope, safe group edits/poll question edits, null-sender history, fresh cached chat/deleted previews, stable mobile paging, mention privacy and private-workspace reset. Immediate access checks supersede the earlier 10-second membership throttle (B03/B05/B46/B48/B50, C004-N1, C005-N1, C030-N2, C047-N1/N2, C048-N1, F13-N1, C073-N1).
- **Onboarding/talent/marketplace/parity:** signed referee decline, required referee answers, completed-work ratings, hidden/expired/deleted-account talent protection, anonymous-safe search, ethical destination/schedule/lot privacy, atomic drafts and enquiry/referral races; matching web/mobile/Next adapters and routed recovery (C077-N1/N2, B12/B34/B45, C023-N3, F10-N2/N3/N4/N6, C010-N1, B26/B42, C011-N1, F14-U1/U2/U3/U4/U7, C074-N1).
- **Integration/CI:** preserve both sides of overlapping fixes, make description-only pending-payment edits safe, use app-local tests, and include every Postgres-only module in existing CI. Test fixture/contract changes encode the reviewed behaviour rather than weakening assertions.

## Testing done

These are the orchestrator's final gate results, transcribed for this docs-only handover. Baseline failures stay visible; no tests were rerun to write this file.

- **Backend:** Django runner with `core.contract_test_settings`: 1,619 tests, zero NEW failures versus PR #201 base `021d801d`. Remaining AHPRA/onboarding/attendance-schema failures pre-exist there. After the last fixes, billing/chat/notifications/users/shift-actions: 302 tests, no new failures.
- **Audit runtime on Docker/Postgres:** F04-N1, F04-N2, F03-N1 and the active `member_status` route: 16/16 OK.
- **Independent blocker tests on Postgres:** 14/14 OK across all five blockers; all closed.
- **Every Postgres-only module:** 12 modules, 175 tests, one failure: `client_profile.test_postgres_concurrency.AhpraSuspensionAcceptRace`. AHPRA enforcement is off in the local stack environment; this is the same family as pre-existing AHPRA failures. Commit `46163796` makes the existing CI Postgres step run every Postgres-only module; this local result is not a claim of a green remote CI run.
- **Kiosk standalone:** `python -m unittest attendance_tests.test_pr201_b29_kiosk`: 34 OK.
- **Migrations:** remote attendance 0005, billing 0003/0004 and client_profile 0088 forward/rollback/forward OK on realistic data. Billing 0004 aborts cleanly on a real duplicate intent without rewriting financial rows. Local chat 0004 and users 0006 rollback/forward OK. `makemigrations --check` clean.
- **Frontend:** shared-core 386 tests + build OK; web `tsc` OK and auth-flow 29 pass; mobile `tsc` OK and script tests OK; landing_next typecheck OK.
- **Repository audits:** shared-core-boundary `--strict` against `origin/main`, architecture, shared-core-package, api-v1-cutover, native-tab-routes, frontend-static-wiring, ui-boundaries and dashboard-visual-states: all OK.
- **Browser walk (agy, Docker stack):** see PR comment / to be added.

Browser walk: <result>

## Rules for further work

- Put tests next to the app they protect and run them in existing CI. Do not add qa_release folders or PR-specific workflows.
- Get independent review before accepting another agent's changes. For money, migrations and auth, include a second opinion and our own negative/control tests. A writer's PASS or CI claim is not independent evidence.
- Compare the same labels against an unchanged base. Report pre-existing failures separately. Run locks/races on Postgres and list every Postgres-only module in the existing Postgres CI step.
- Preserve test intent. Explain any deliberate contract/fixture change; never relax assertions or global test settings to make one failure disappear.
- Put owner choices on the grill list and log orchestrator decisions with their reasons. Do not silently choose retention, pay, refund or historical-repair policy.
- Keep backend/shared-core business rules shared across web, Next and Expo. Preserve routes, API contracts, scopes, WebSockets and background jobs.
- Keep the posting-store holiday rule, statewide fallback and capability-by-admin_level decisions. Worker work-base fields are superseded; deployment must not force re-login.

## Open grill list

- **B01 - Stripe price IDs:** confirm `price_1T52imBQXaySV5ukuwLH3ikI` and `price_1T52jFBQXaySV5ukkXOKPHSV` exist in the checkout Stripe account and mode. Mocked tests cannot establish this.
- **B02/B57 - Stripe events:** enable `customer.subscription.updated` and `charge.refunded` on the intended webhook endpoint and verify provider test-mode delivery/retries.
- **B03 - former-member label:** choose the label for a retained message with a NULL sender; historical names are not reconstructed by this fix.
- **Removed-admin cleanup:** decide how to reconcile historical revoked admin rows/linked memberships, including an inactive unaccepted admin invite linked to an already-ACCEPTED staff membership that cannot be revoked through the current route.
- **F09-N1 - deleted restricted groups:** choose restricted archive, hiding or deletion. The uncorrected deletion path can widen posts/comments/attachments to the pharmacy; closure is rejected.
- **C004-N3 - future trials:** current FREE_TRIAL_DAYS=0 refutes the active bypass. Before enabling trials, decide whether eligibility belongs to the billing account/organisation rather than the acting admin's join date.
- **C025-N1 - historical invoice repair:** identify a pre-0005 backup or original values and the affected records before authorising repair. Do not rewrite an applied migration or guess lost billing details.
- **C048-N1 - changing poll options:** question-only edits preserve votes. Decide whether option changes should be blocked, reset with explicit consent, or retain an audit history; they still delete votes/options today.
- **B05 - former-staff DMs/custom groups:** decide the desired retained HTTP access. Combined behaviour keeps remote REST revocation; CONTACT employment-type DMs are a separate allowed case.
- **F10-N2 - organisation filter:** decide whether `public-job-board/?organization=` may list anonymous vacancies for that organisation. Anonymous name/address search protection is fixed.
- **C023-N3 - deleted-account talent backfill:** decide whether/how to remove posts from accounts deleted before the new forward-deletion helper.
- **B09 - escalation outreach:** decide notification behaviour when original posting notifications were disabled; read-triggered escalation and missing outreach remain deferred.
- **B10 - old Pills keys:** decide reconciliation for historical shift-wide keys. New per-offer keys do not rewrite ledger history.
- **B69 - duplicate intents:** if deployment preflight finds genuine duplicates, reconcile them explicitly before applying billing 0004; the migration deliberately aborts.
- **B04 - separate checkout sessions:** decide cross-session duplicate-payment prevention/reconciliation for concurrent payers/platforms and UTC-midnight retries. Losing/expired paid offers now retain the payment and create one durable refund-required alert, but no automatic refund is claimed.
- **B14 - existing staff pay and calendar scope:** decide how refreshed existing assignments preserve agreed pay; no independent closure of the repricing concern is recorded. Exhaustive 2026-2027 state/council reconciliation remains the owner's separate work; source-labelled data is not legal certification.
- **B12 - rating boundaries:** decide support for same-day completed work and legacy assignments without slot_date; these remain excluded.

## Deferred engineering and later cleanup

F06-N1 payroll handoff and B70 repeated recurring checkout have no completed remediation evidence. F14-U1 lacks a disabled-Apply explanation; F14-U7 can still loop on Reconnect/Retry logout. These are separate from the five closed blockers.

The non-blocking structure follow-ups are in [Later refactors](PR201_COMBINED_FIX_HANDOVER.md#later-refactors-not-blocking): shared post-shift change detection, shared competing-offer expiry, one finance visibility predicate, a public shifts.history guard, notify_auth_changed in notifications.services, a smaller Stripe processor and a shared anonymous-safe search selector.
