# PR #249 — W3–W8 web ↔ Expo contract and acceptance register
**Review date:** 5 November 2026 (Australia/Brisbane)  
**Target:** PR #249 stacked on draft PR #248; no merge/deploy/provider charge/store release.  
**Status discipline:** `SOURCE` means operation/field is visible in the inspected implementation; `TEST` means a regression exists but still requires exact-head execution; `STAGING` and `DEVICE` are **not accepted** without real evidence. QR scanner and clinical calculator remain frozen/excluded.

The acceptance unit is an **entire business task**: same eligibility, fields, validation, server data, mutations, state changes, error handling and access denial as web, with native navigation and design. Merely finding a route or a button is not PASS.

## A. W3 Post Shift — individual field/operation audit
Primary web implementation: `frontend_web/shared/postShift/PostShiftForm.tsx` and its Details, Skills, Visibility, Timetable and Pay steps; native: `frontend_mobile/roles/shared/shifts/PostShiftScreen.tsx` plus corresponding native steps; contract owner: `shared-core/src/domains/shifts/postingDraft.ts`.

| Web field / action | Native field / action | Source status | Actual acceptance |
| --- | --- | --- | --- |
| Posting pharmacy and scoped manager authorization | pharmacy picker and `useShiftSurface` | SOURCE | OWNER, ORG_ADMIN, delegated MANAGE_ROSTER, outsider denial, switch pharmacy while save pending |
| Role needed and locum/casual/FT/PT employment | role and employment controls | SOURCE | all permitted roles; backend refuses unsupported combinations |
| Workload tags, required/preferred skills, software defaults, support on shift | native Details and Skills steps, shared skills registry | SOURCE | draft edits, long-list scrolling, persisted payload |
| Description and pharmacy/role reusable template | description input, load/use/save/delete template | SOURCE | separate pharmacies and roles, stale fetch, invalid template delete, network retry |
| Anonymous posting and visibility | visibility step with allowed tiers | SOURCE | no private details on public/anonymous board |
| Staff, favourites, chain and broader notifications | visibility notification flags | SOURCE | only authorized audiences notified; edit does not re-send incorrectly |
| Automatic/custom/off escalation date and hour | native date + time picker | SOURCE | exact local date/time, DST and backend ordering |
| One date, selected dates, per-date hours | calendar selection, selected date-time map | SOURCE | multi-slot payload equivalence, duplicates and timezone |
| Recurring weekdays/end date and single-user-only | Timetable step | SOURCE | occurrence expansion and locked booking protection |
| Weekday/Saturday/Sunday/public holiday/early/late rate defaults | native rate fields and `calculateShiftRates` | SOURCE | pharmacy location and actual holiday region, QLD/NSW/DST, part-day events |
| Pharmacist-provided/fixed/flexible rate and per-occurrence overrides | Pay step, dirty-rate reconciliation | SOURCE | manual override preserved after async recalculation |
| Owner bonus, ABN/TFN preference, included super, percentage, FT/PT annual/hourly ranges | Pay step and shared payload builder | SOURCE | Award and payroll arithmetic, display vs immutable agreed terms |
| Dedicated worker, private booking, dates and route prefills | parsed deep links, one-time prefill | SOURCE | URL normalization; user edits never overwritten |
| Preview, validation, create, edit, retry and leave-with-unsaved-changes | native review + submit, edit parameter, guard | SOURCE | exact server error, double tap, stale account response and protected booked edits |
| Separate persisted Save Draft / Publish states | no independent web draft operation identified | NOT A PARITY GAP | separate product design/change control if later desired |

W3 Shift Centre also includes active/confirmed/history/public/community, shift/slot deep-link focus, candidate/reveal/ratings/counteroffers, escalate/buzz/reject/delete/share, Pills and Stripe checkout/recovery, deferred payroll activation, historical assignment and worker invoice hand-off. **Source presence does not establish concurrency or device acceptance.**

## B. W4–W5 workforce and pharmacy operations
| Web business field or action | Expo source | Required positive/negative outcome |
| --- | --- | --- |
| Managed pharmacy and org/chain selection | Owner/organization/admin workspace contexts and native dashboard navigation | Owner only own stores; organisation only member stores; delegated admin only assigned capabilities; switch isolation |
| Staff memberships, invitations, accept/reject/leave | `roles/shared/ManageMembershipsScreen.tsx`, membership shared-core | ACCEPTED only activates; declined/revoked cannot browse private rosters or conversations |
| Roster assignment, publish, acknowledgement and revisions | roster workspace, published-roster acknowledgement | Worker sees correct revision, manager sees acknowledgement, no mutation after locked publication without allowed correction |
| Clock in/out, missing punches, kiosk and cover | attendance native parity components, real attendance endpoints | pharmacy timezone, double clock prevention, authorized correction with reason |
| Timesheet revision, notes, manager checks, approve/reopen and adjustment | `roles/shared/timesheets/TimesheetDetailScreen.tsx` | revision-bound action, approver permissions, period freeze and recalculation |
| Payroll export, settlement channel and period lock | manager payroll navigation and backend workforce transitions | unauthorized worker denied; locked period refuses new settlement-linked work; reasoned correction remains usable |

**Do not infer manager permission from an account role alone.** Authoritative status is backend membership/capability on the **selected pharmacy**.

## C. W6 finance, messages and notifications
| Web field or outcome | Expo counterpart | Required acceptance |
| --- | --- | --- |
| Customer/item/expense, GST/BAS, ABN and payment data | native FinanceWorkspace and editor | same values, validation and cash/accrual estimate caveat |
| Issued/received invoice, status, version and immutable history | finance native list/detail, revision history | revision-specific PDF read-only; stale version 409; no unapproved payment side-effects |
| Save/send/revise/approve/mark paid/record payment | revision-aware finance actions | issuer/recipient/manager rights, signed-out rejection and multi-device replay |
| Authenticated invoice PDF | native share with PDF magic-byte validation and cache cleanup | provider opens, iOS/Android, no previous-account file after account switch |
| Room list/group/DM/participants, typing, unread, message edit/delete/pin/reaction | chat native list and `messages/[id].tsx` | 500+ messages, pagination, realtime reconnect, no other account's room state |
| Chat attachment access | new `/api/v1/messages/{id}/attachment/`, shared-core `downloadChatAttachment` | current participant only, revocation/deletion deny, no raw storage redirect, temporary files cleaned |
| Notifications/read receipt/push navigation | native notifications inbox and push handling | 20-row pages, confirmed read writes, correct persona and pharmacy deep-link, offline retry |

**Storage qualification:** code-level authorization cannot defeat a separately **public Azure Blob container** or a still-valid legacy SAS link. Confirm container private, raw URL blocked and previously exposed URLs expired in authorized staging before declaring attachment security PASS.

## D. W7 ordinary Marketplace and W8 ethical Marketplace/public content
| Web field / state machine | Expo counterpart | Required acceptance |
| --- | --- | --- |
| Public approved goods: search/category/mode/paging | Marketplace browse/filters | anonymous read, no unapproved/private fields, accurate pagination and recoverable errors |
| Seller personal/pharmacy context, category constraints and item details | native seller/category/details steps | verify owner/user identity and exact permitted pharmacy/category/mode |
| Price, shipping, pictures, audience and review | native photos/audience/review steps | server version and category policy unchanged; retry idempotent |
| Submit/review/publish/withdraw/escalate | native My Listings and listing-detail transitions | only legal transitions; user lacks action when status/version changes |
| Buyer enquiry and trade terms | listing detail with eligibility/terms access | selected pharmacy membership; blocked buyer denied; same request ID does not create duplicate negotiation |
| Private ethical pharmacy approval/grants/inventory/lots/import | `ethicalMarketplace.tsx`, selected workspace pharmacy | no inventory on account or pharmacy switch; source pharmacy stock only |
| Ethical S4/S8 grants, transfer request/approval/dispatch/receive and document proof | ethical transfer native steps | schedule and jurisdiction policy, source/destination isolation, version/stock invariants |
| Explorer dashboard, talent profile, publication and recommendations | Explorer native home/profile/talent | age/verification privacy, published-only public discovery |
| Published articles/blog/news, reactions/comments/replies/reports | native Explore, RichContent and ArticleDetail | public readable, contributor-authorized writes, pagination and safe outgoing links |
| Public community, editorial posting, polls, legal links | native community/editorial and public route | published vs draft access, capability-limited edits, safe public navigation |

Marketplace and ethical UI subtrees are now keyed to account and (for ethical inventory) selected pharmacy so previous private state cannot remain mounted during an identity/scope switch. Server authorization remains final.

## E. Real HTTP / PostgreSQL acceptance battery (NOT RUN IN THIS DOCUMENT)
Use isolated test users and *test-mode* provider records only; do **not** charge or modify live shifts.
1. OWNER A + store A and OWNER B + store B, delegated admin with and without MANAGE_ROSTER/STAFF/COMMUNICATIONS, ORG_ADMIN across two permitted stores, verified pharmacist, other staff, unverified Explorer and anonymous visitor. Exercise each action as allowed user, foreign store user, and logged-out user; inspect response and persisted database, not UI hiding alone.
2. Two independent PostgreSQL connections: offer acceptance versus slot-rate change; receipt/terms hash must refuse stale version without work assignment.
3. Two web/mobile clients: same slot different candidate, overlapping recurrence, different distinct slots, Pills against Stripe reservation, webhook before checkout ACK, repeated signed webhook and declined/expired provider session. Assert exactly one accepted assignment/payment obligation and auditable refund/reconciliation for duplicates.
4. Payroll: lock period before deferred activation, activation before freeze, simultaneous retries, finishing date of overnight shift, covering offer and roster writers; all unauthorized or frozen writes must fail atomically without invalidating legitimate reasoned corrections.
5. Finance: version conflict on sent/received revisions and paid status from two clients; no old-version approval or duplicate invoice/payment.
6. Ordinary Marketplace: duplicate enquiry same idempotency key vs changed payload; published to withdrawn and forbidden transition; seller/buyer and pharmacy-crossing denial; public list never exposes private address.
7. Ethical Marketplace: wrong owner, revoked professional grant, different pharmacy, unapproved schedule or jurisdiction, S8 isolation, concurrent lot reservation and transfer completion; no stock movement on rejected transition.
8. Chat: direct API GET room/list/file as a current participant, outsider, revoked member, foreign pharmacy, logged out, deleted message; verify direct /media/chat denial and **Azure private container** policy.

Existing relevant backend test suites include `billing.test_checkout_reservations`, `billing.test_checkout_reservations_postgres`, `workforce.tests.test_payroll_activation_locking`, `workforce.tests.test_assignment_freeze_postgres`, `shifts.test_offer_terms_version_postgres`, `marketplace.tests`, `ethical_marketplace.tests`, `ethical_marketplace.test_pr201_b31_pg`, and `chat.test_api.ChatAttachmentTests`. Run exact-head SQLite and PostgreSQL CI; **test source existence is not a passing result.**

## F. Native Android/iOS acceptance — pending devices
Six personas: owner, organisation manager, delegated admin, pharmacist, other staff and Explorer. In each persona:
- Small Android and small iPhone, large Android and large iPhone, standard text and 1.6× text; physical touch targets, keyboard avoiding view and scroll reachability
- Fresh install, background/resume, cold deep-link launch, update notice, offline/retry, expired JWT, account switch and app restart
- W3 Post Shift native date/time picker, long Shift Centre scroll and repeated push link, candidate reveal/accept/decline, pending card checkout UI
- W4/W5 roster publication/acknowledge, missing-punch correction, manager approval, state-specific holiday display and locked-period denial
- W6 attachment PDF/photo OS share, native invoice PDF, chat >500 messages, unread count, cross-account privacy and notification settings
- W7/W8 marketplace listing photo/camera permissions, filtered browse, ordinary/ethical role-specific transitions, articles/comments, public links
- VoiceOver and TalkBack, reduced motion, error alerts, unavailable camera/location and biometrics, app links, back navigation, OS share cancellation
- Signed IPA/APK/AAB, actual universal/app-links association, Android fingerprint/Apple Team ID, store availability and OTA/runtime rollback

**Not device-certified:** this environment provides GitHub file and CI access, not an installed Expo simulator, Apple signing environment, Play Console/TestFlight, staging login roster, authorized Stripe/email/push provider credentials or physical iOS/Android phones. Recording unrun checks as PASS would be misleading.

## Release hold
Keep #249 draft/unmerged. No change to QR scanner, clinical calculator policy, real charges, deployment or store releases. Final release decision requires full exact-SHA CI, independent source review, real-role staging permissions, production-equivalent private attachment storage, signed device acceptance and explicit approval.
