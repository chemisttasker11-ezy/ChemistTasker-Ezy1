## Summary

Combine PR #201 with the reviewed local fixes at `d35d6e2f`. All five independently reproduced blockers are closed. Backend gates show zero new failures against `021d801d`; pre-existing failures and one local Postgres AHPRA environment failure remain disclosed.

## What changed

- **Tenant/auth:** calendar/shift/admin boundaries, accepted memberships, safe invitations/re-invites, password reset and session-specific socket revocation, mobile sign-out/startup and push-device cleanup (B06/B07/B16/B17/B19/B30/B43/B46/B52/B62, F03-N1/N2/N3, F04-N1/N2, C071-N1/N2).
- **Shifts/roster:** one booking per occurrence, accepted dates/hours, manager-only booking identities/docs, safe pending-payment/text/rate edits, booked-slot/history protection, cover/leave locking, complete pagination and export parity (B20/B21/B35/B36/B37/B38/B41/B54/B55/B60/B61/B67/B71, F01-N1/N2/N3, C020-N6, C021-N2/N6, C031-N1, C032-N1, C078-N2/N3, C079-N1).
- **Money/invoices:** order-safe subscriptions/refunds, unique intents, per-offer Pills, Decimal/HALF_UP and overnight penalties, accepted-shift invoice saving, receipt/revision privacy (B01/B02/B04/B10/B53/B57/B58/B66/B68/B69, C004-N2, F07-N1/N2/N3/N4, F08-N2).
- **Paid-offer reconciliation:** retain losing/expired checkout payments without booking the loser; create one durable refund-required alert per intent, delivered after commit. Delivery failure preserves the alert; rollback removes alert/payment together. No automatic refund is claimed (B04/B54).
- **Attendance/holidays:** valid kiosk assignment resolution/retries and legacy-review protection; overnight/timezone corrections, archived rosters, provisional rejection and employment refresh. Posting-store holidays use statewide fallback without a district and flag relevant local dates (B14/B29/B32, C002-N1, C028-N4/N5, C029-N1/N2, C039-N1, F06-N2).
- **Chat/Hub:** retained null-sender history, immediate access checks before receive/delivery, safe group edits, fresh previews, stable paging, private mentions/workspace reset and preserved question-only poll votes (B03/B05/B48/B50, C004-N1, C005-N1, C030-N2, C047-N1/N2, C048-N1, C073-N1, F13-N1).
- **Talent/marketplace/parity:** token referee decline, complete referee answers, completed-work ratings, talent moderation/deletion/renewal, anonymous-safe search, Postgres audience lock, ethical inventory/privacy/atomicity and enquiry/referral races; web/mobile/Next routing/session parity (B12/B24/B25/B26/B31/B34/B42/B45, C009-N3, C010-N1, C011-N1, C023-N3, C077-N1/N2, F10-N2/N3/N4/N6, F14-U1/U2/U3/U4/U7).
- **CI:** tests live next to their apps and run in existing workflows; all 12 Postgres-only modules are listed in the existing Postgres step (46163796). No qa_release or PR-specific workflows.

## How it was tested

- **Backend:** Django runner with `core.contract_test_settings`: 1,619 tests, zero NEW failures versus PR #201 base `021d801d`. Remaining AHPRA/onboarding/attendance-schema failures pre-exist there. After the last fixes, billing/chat/notifications/users/shift-actions: 302 tests, no new failures.
- **Audit runtime on Docker/Postgres:** F04-N1, F04-N2, F03-N1 and the active `member_status` route: 16/16 OK.
- **Independent blocker tests on Postgres:** 14/14 OK across all five blockers; all closed.
- **Every Postgres-only module:** 12 modules, 175 tests, one failure: `client_profile.test_postgres_concurrency.AhpraSuspensionAcceptRace`. AHPRA enforcement is off in the local stack environment; this is the same family as pre-existing AHPRA failures. Commit `46163796` makes the existing CI Postgres step run every Postgres-only module; this local result is not a claim of a green remote CI run.
- **Kiosk standalone:** `python -m unittest attendance_tests.test_pr201_b29_kiosk`: 34 OK.
- **Migrations:** remote attendance 0005, billing 0003/0004 and client_profile 0088 forward/rollback/forward OK on realistic data. Billing 0004 aborts cleanly on a real duplicate intent without rewriting financial rows. Local chat 0004 and users 0006 rollback/forward OK. `makemigrations --check` clean.
- **Frontend:** shared-core 386 tests + build OK; web `tsc` OK and auth-flow 29 pass; mobile `tsc` OK and script tests OK; landing_next typecheck OK.
- **Repository audits:** shared-core-boundary `--strict` against `origin/main`, architecture, shared-core-package, api-v1-cutover, native-tab-routes, frontend-static-wiring, ui-boundaries and dashboard-visual-states: all OK.
- **Browser walk (agy g3, Docker stack built from this branch, seeded test users): 9/9 PASS, no errors.** Description-only shift edit and a per-date rate kept on reload; chain rename keeps its 2 pharmacies; manager invite/accept/remove leaves no access or old invite; chat after staff removal shows the message as "Former member"; org admin creates a roster shift and the region admin sees only its region; poll question edit keeps votes and staff cannot edit/delete it; Explorer availability publishes; an ineligible role shows Apply disabled; invoice-from-shift had no eligible shift in the seed. Screenshots checked by the orchestrator.


## Migrations

Remote attendance 0005, billing 0003/0004 and client_profile 0088 passed realistic forward/rollback/forward rehearsals. Local chat 0004 and users 0006 passed rollback/forward; makemigrations --check is clean. Billing 0004 deliberately aborts on real duplicate intents without merging/deleting financial records; reconcile before retrying.

## Deploy notes

- Enable Stripe webhook events **charge.refunded** and **customer.subscription.updated** on the intended endpoint; verify test-mode delivery/retries.
- Confirm B01 subscriber price IDs `price_1T52imBQXaySV5ukuwLH3ikI` and `price_1T52jFBQXaySV5ukkXOKPHSV` exist in the Stripe account/mode used by checkout.
- **No forced re-login.** New session/password claims upgrade on refresh; old tokens keep their expiry grace. Old-session socket logout and legacy refresh tokens after an admin password change retain the documented grace limitations.
- Keep the posting-store holiday rule and statewide fallback; no worker work-base prompt is required. Region Admin permissions follow admin_level.
- Review durable refund-required alerts operationally; provider acceptance and physical-device acceptance are not established by these gates.

## Open grill items / deferred work

- Owner/provider: Stripe prices/events, historical duplicate intents and Pills keys, cross-session duplicate charges/refund reconciliation, existing staff repricing and separate calendar verification.
- Retention/privacy: former-member message label, old removed-admin rows, deleted restricted groups (F09-N1), poll option/vote policy, former-staff DM/custom-group access, anonymous organisation filter and deleted-account talent backfill.
- Product/data: future trial eligibility, historical invoice repair (C025-N1), escalation outreach (B09), same-day/legacy rating support.
- Deferred engineering: F06-N1 payroll handoff and B70 recurring checkout remain unproven; F14-U1 reason text and F14-U7 retry loops remain. Non-blocking structural refactors are listed in the combined handover.

## Handover

- [Final combined fix handover](PR201_COMBINED_FIX_HANDOVER.md)
- [Handover to the original online agent](PR201_ONLINE_AGENT_HANDOVER.md)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
