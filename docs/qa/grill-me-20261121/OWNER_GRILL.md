# Owner grill: start here (one document, 21 Nov 2026)

This is the one page Tom (the owner) goes through. It sits on top of the 27 area files in `areas/` and replaces the reading order in `README.md` for the owner interview. The older files stay as evidence.

**How we go through it (grilling method):** one area at a time. Each area is a design tree. Every round asks the whole current **frontier**: the numbered questions whose prerequisites are already settled, each with the recommendation, worded so that "yes" accepts it. A question that depends on one still open waits for a later round. Facts are looked up in the code, never asked of you. An area is done only when its frontier is empty and you confirm we share the same understanding; then the next area starts. Answers are **recorded only, not built**: building starts after the whole grill. Where an answer is already live in code, the question says "already implemented: <file:line>". Settled terms go into the root [`GLOSSARY.md`](../../../GLOSSARY.md); an ADR is offered only for hard-to-reverse, surprising trade-offs. Answers are written under the question in the area file and in [`OWNER_DECISION_LEDGER.md`](OWNER_DECISION_LEDGER.md).

**Code the answers rest on (checked 21 Nov):**
- **Web and Expo together: `origin/agent/pr257-int` at `21add924`.** This branch changed the web too (sessions, Explorer rules, posting window and more) and is what merges to main, so it is the "today" for both. Every area file has a "Web and Expo today, side by side" table (pr257 refs in every cell, 361 of 364 refs checked to exist, 3 corrected) and a "Platforms per question" table (Web + Expo, Web only, Expo only). Of 175 flows, 19 differ, and each is marked intended (web only / Expo only), a parity question, or a possible defect. 7 rows were flagged as possible defects and checked in code (2 confirmed, BL-26 and BL-25; 1 confirmed as BL-08; 1 refuted; 2 intended; 1 a parity question). **Second review (orchestrator, 22 Nov, replacing the Claude B review that could not run):** I checked the 12 differing rows not yet verified and 6 sampled "same" rows in code. 2 differences were wrong and are corrected: Expo does have a signed-out talent board (GM-18), and web does have the travel radius (GM-19). 1 "parity question" is an intended storage difference (GM-01 session refresh). The 6 sampled "same" rows were right, but their file:line refs often point near the code rather than at it (one corrected, GM-23); treat the refs as a pointer to the file.
- Deployed today: `origin/main` at `8ccf8f77` (PR #247, 3 Nov). Where main still differs, the area says "(main today: ...; changes at the PR #257 merge)".
- The original area traces were made at PR #249 head `97c4543e`, 333 commits behind pr257, so every claim on a changed file was re-checked (section 4).

## 1. Already decided: never re-asked

| Source | Decisions |
|---|---|
| Carried owner decisions (30, launch grill `questions.json`) | D01-D05, R01, R04, R04A-R04D, R06, E01, E01A, E01B, E03, P02, P04-P12, FEES, F01, F04, NOPEN |
| Launch grill answers (artifact `answers`, 23 Oct) | ON-Q01 **KEEP**, ON-Q02 **KEEP** (re-confirm once at GM01-Q04 with the corrected baseline), ON-Q03 **B** (checked on every outside booking), ON-P01 **A** (employees skip the AHPRA check, favourites are checked), ON-Q04 **B** (told early, pay details finished before accepting) |
| Job memory, carried in | R1 (owner may record invoice payment without approval), E1 (platform admins may bypass emergency-cover attendance evidence checks: intended), grill #9 (plain draft roster staff deleted with their shift: still true in code), D2 (cover terms accepted only as shown), D3 (legacy paid session in a locked period goes to refund / manual follow-up), E17/E18 (ABN wins for cross-site cover; staff wins for unrostered local cover), iOS native acceptance deferred |
| Owner, 13 Nov | D93 (no role change to Explorer; Explorers get no invoices), D96 (an Explorer can never be an admin; built) |
| Deferred by the owner | Planner: PR #181 simplified vs PR #192 original; keep both until asked (GM-23-W01) |

**AHPRA-FAV-01** and **VERIFY-GATE-01** are answered by ON-P01 and ON-Q03. Engineering follows BL-01 and BL-02. **GM01-Q04** is the single re-confirmation of ON-Q02. **GM-07-Q04 to Q06** and **GM13-Q01/Q02** implement carried decisions through BL-06.

**Already implemented in code** (live, not pending; refs at `pr257` `21add924` unless marked):

| Decision | Live? | Where |
|---|---|---|
| D96 no Explorer admins | Yes on pr257; not yet on main | `backend/access_control/admin_roles.py` |
| Grill #9 draft roster staff deleted with the shift | Yes | `backend/workforce/roster/views.py:233-234` |
| D2 terms accepted only as shown | Cover terms: yes on main and pr257 (`main:backend/attendance/cover_terms.py:214`). Outside offers: pr257 only (`backend/shifts/offers.py:386`, BL-21) | |
| PR #242 items 2, 3, 7 (QR/PIN confirmations, stale cover terms, overnight activation): built, **not decided**; asked again as GM-08-W01, GM-14-W01, GM-09-W01 | Yes, merged 3 Nov | `backend/attendance/kiosk_api.py:449`, `backend/attendance/cover_terms.py`, `backend/shifts/payroll.py` |
| ON-Q01 sign-up tracks KEEP | Yes (unchanged behaviour) | GM-01 Part B |
| R1 record invoice payment without approval | Yes | GM-17 F11 |
| D01, D02, D03, D04, R04A, R04B, R04C, R06, E01A, ON-Q03, ON-P01, ON-Q04 | **No, or only partly**: answered but not built | ENGINEERING_BACKLOG BL-01, BL-02, BL-03, BL-06, BL-15 |

## 2. Areas, open questions, suggested order

"Open" = questions to ask, after removing answered ones, questions merged into another area (counted once, where they are owned) and questions the PR itself marks not re-validated (asked after re-validation). Added = the waiting decisions placed in this review (section 3).

| # | Area(s) | Open (22 Nov) | Added this review | First question |
|---|---|---|---|---|
| 0 | **LAUNCH-01** (owned by GM-26), with GM-21-W01, GM-16-W01, GM-16-W02 | 1 + 3 | marketplace switches, free trial, web-only billing | What launches, on which surfaces, after which gates? |
| 1 | GM-01 Sessions/auth | 16 | GM01-Q04 note | GM01-Q04 (re-confirm) |
| 1 | GM-02 Worker onboarding | 17 | answered table | ON-P03: which AHPRA lookup runs at launch? |
| 1 | GM-05 Roles/membership | 14 | W01 invitee active before password | GM-05-W01 |
| 2 | GM-03 Pharmacy setup | 7 | | PHARM-GATE-01 |
| 2 | GM-04 Organisations | 8 | | GM-04-Q01 |
| 3 | GM-10 Posting/rates | 13 | | RATE-01 (after GM-09-Q01) |
| 3 | GM-11 Audience/escalation | 11 | | GM-11-Q01 |
| 3 | GM-12 Interest/offers | 18 | | GM-12-Q06 |
| 4 | GM-13 Reservation/payment | 5 | W01 paid orphan, W02 release only by cancellation | GM-13-W01 |
| 4 | GM-16 Subscriptions/fees | 17 | W01, W02 (asked in row 0) | GM16-Q01-FIRST |
| 5 | GM-08 Attendance/kiosk | 12 | W01 re-grill QR/PIN confirmation | GM-08-Q01 |
| 6 | GM-09 Timesheet/payroll | 12 | W01 re-grill overnight activation | GM-09-Q01 |
| 7 | GM-14 Terms/Award/GST/super | 9 | W01 re-grill stale terms | GM14-Q04 (ACCEPT-01 / GM14-Q03 is asked once, in GM-12, as GM-12-Q25) |
| 7 | GM-17 Invoices/refunds | 12 | W01 answered by R1 | REFUND-01 |
| 8 | GM-15 Cancellation/disputes | 32 | W01 (defect, not a question) | GM15-01 |
| 9 | GM-06 Employment/leave | 9 | | GM-06-Q06 |
| 9 | GM-07 Roster/cover/swap | 9 | W01 posting window, W02 self-dealing, W03 answered | GM-07-W01 |
| 10 | GM-18 Talent/recruitment | 14 | | AUDIENCE-01, then OFFER-01 |
| 10 | GM-19 Availability/matching | 13 | | GM-19-Q03 |
| 10 | GM-24 Explorer/public | 15 | W01 explorer admin rows; D93 answered | GM-24-Q21 (GM-24-Q01 is asked once, in GM-02, as ON-Q05) |
| 11 | GM-20 Chat/Hubs | 20 | W01 revoked-member edits | GM20-Q01 |
| 11 | GM-22 Notifications/rewards | 16 | | GM22-17 (GM22-04 is asked once, in GM-15, as GM15-39) |
| 12 | GM-21 Marketplace | 21 | W01 (asked in row 0) | after LAUNCH-01 |
| 12 | GM-23 Calendars/operations | 15 | W01 deferred | GM-23-13 (GM-23-01 is asked once, in GM-19, as GM-19-Q12) |
| 13 | GM-25 Web/Next/Expo parity | 27 | | MOBILE-PARITY-01 (after the joint re-check) |
| 13 | **GM-27 Mobile-only flows (new)** | 9 | Q01–Q07, including cached export and QR retention | GM27-Q01 |
| 14 | GM-26 Admin/privacy/security/release | 17 | W01 reCAPTCHA keys (owner action), W02 Dependabot, W03 node-forge, W04 minimatch | GM26 first non-launch question |

**Total open: 385** (each asked once; LAUNCH-01 in row 0 carries GM21-Q01, GM25-Q01 and GM26-Q36; GM-15-W01 is a defect, not a question).

**Easiest way through (rewritten 23 Nov in the launch-grill style):** open [`OWNER_GRILL.html`](OWNER_GRILL.html) (also published privately at https://claude.ai/artifact/VyoJebVTsdcNfJtWiDrqi1). Every item is one plain scenario with the choices, what happens to the people under each choice, and the recommended choice first. The 385 items are 374 questions to answer, 2 already deferred or decided by the owner, 8 engineering items with nothing to choose and 1 owner action. 45 more cards list the decisions already made, marked **Already decided** (the 24 decisions made for the owner are questions marked **My call: confirm or change**). The technical text stays in the area files and under each card's "Full detail for engineers". Answers stay in the browser; **Export my answers** gives the text to paste back. Codex (gpt-6.2-sol) rewrote the cards; the orchestrator checked ids, recommendations and samples against the sources.


**Update 22 Nov (orchestrator, done alone at the owner's request):** duplicates merged. Each repeated question is now asked once: 90 questions carry their 168 copies, and every copy says "Merged 22 Nov: asked once, as X in GM-nn" (talent-board questions stay in GM-18 and availability in GM-19; the rest are asked the first time they come up in this order). **385 questions are open** (388 before LAUNCH-01 absorbed its three parts) (counted from each area's question headings: 168 merged copies and 37 answered ones excluded). The GM-21 and GM-24 "Platforms per question" tables had shifted question numbers and were rebuilt from the real headings; 12 waiting-decision (W) questions missing from those tables were added. All 173 web/Expo rows were checked by hand and their refs re-pointed at the exact line (re-exports followed). Wrong claims corrected: GM-04 organisation invoices (web has a summary only), GM-17 subscription by invoice (web-only), GM-02 banking (neither onboarding asks for bank details), GM-07 worker swap (missing on Expo, now BL-34), GM-07 acknowledgement, GM-24 Explorer shifts. Still loose: about 45 refs point at a type, import or log line in the right file (second pass pending).

_Before 22 Nov:_ **463 open question entries across the area and launch rows above.** Ask the launch-blocking questions first (marked in `followup/followup-launch-blocking.md`). The owner can defer the remaining optional questions by area.

## 3. Where the 17 waiting decisions went

| W | Decision | Placed as |
|---|---|---|
| W-01 | D148 posting window and roster planning | GM-07-W01 |
| W-02 | D153 free trial at launch | GM-16-W01 |
| W-03 | D156 invitee active before setting a password | GM-05-W01 |
| W-04 | D166 marketplace switches at launch | GM-21-W01 |
| W-05 | D167 production reCAPTCHA keys | GM-26-W01 (owner action) |
| W-06 | D178 roster manager edits a shift they're booked on | GM-07-W02 |
| W-07 | Subscription/seats web only | GM-16-W02 |
| W-08 | D20 revoked-membership messages | GM-20-W01 |
| W-09 | D11 Dependabot verdicts | GM-26-W02 |
| W-10 | D96 explorer admin rows in production | GM-24-W01 |
| W-11 | Post-shift recovery: prefill + notice vs banner | GM27-Q01 |
| W-12 | Grill #9 draft roster staff | GM-07-W03 (answered, still true in code) |
| W-13 | Re-grill PR #242 items 2, 3, 7 (merged 3 Nov, live) | GM-08-W01, GM-14-W01, GM-09-W01 |
| W-14 | Release register items 1-9 | 1: GM-17-W01 (answered by R1); 2, 3, 7: W-13; 4, 5: GM-13-W01, W02; 6: GM-26-W03; 8: GM-15-W01 (defect, backlog BL-04); 9: GM-26-W04 |
| W-15 | Launch grill reconcile | partial: the 5 answered + 30 carried are reconciled; the other launch-grill questions are carried in the area files under their old IDs (each area's re-validation table) |
| W-16 | Install the i-have-adhd skill | Not a product question: tooling, outside this grill |
| W-17 | Planner two versions | GM-23-W01 (deferred by the owner) |

## 3b. Decisions I made for you: confirm or change (added 22 Nov)

The 17 waiting decisions above were only the ones I had parked for you. My decision logs also hold the calls I made myself while you were away. Most are engineering (who reviewed what, commits, test fixes) and need nothing from you. The 24 below change what users see or what is stored, so each one is now a question in its area. "Yes" keeps my call.

| ID | Area | Platforms | Decision | Built? |
|---|---|---|---|---|
| GM-27-OD-01 | GM-27 | Expo only | Opening the app with no network keeps you signed in | yes: commit 172622e8 |
| GM-27-OD-02 | GM-27 | Expo only | A saved, unsent change that the phone cannot read is never overwritten silently | yes: `frontend_mobile/features/parity/marketplace.tsx:518` and the shared saved-request store |
| GM-05-OD-03 | GM-05 | Web + Expo | Attendance approvals and the roster need both staff and roster rights | yes: pr257 |
| GM-05-OD-04 | GM-05 | Web + Expo | Organisation tabs are hidden when Lina lacks the right | yes: pr257 |
| GM-05-OD-05 | GM-05 | Web + Expo | A new invitee with no name shows as their email address | yes: commit 7855bbd8 |
| GM-05-OD-06 | GM-05 | Web + Expo | When Ali is removed, what happens to his future roster shifts? | open question |
| GM-09-OD-07 | GM-09 | Web + Expo | A worker's correction request notifies the managers | yes: commit 7855bbd8 |
| GM-09-OD-08 | GM-09 | Web + Expo | May a removed worker still raise a correction on a past timesheet? | open question |
| GM-10-OD-09 | GM-10 | Web + Expo | The server refuses shift dates before today or more than 4 months ahead | yes: pr257 |
| GM-10-OD-10 | GM-10 | Expo only | Reminder of your own decision: Expo Post shift has no separate draft/publish | your call, not built |
| GM-16-OD-11 | GM-16 | Expo only | Both Pills entries and Pill rewards stay on Expo | yes: pr257 |
| GM-17-OD-12 | GM-17 | Web + Expo | Organisation Invoices are on Expo but not in web's organisation menu | yes: pr257 |
| GM-18-OD-13 | GM-18 | Web + Expo | Resending a talent pitch never creates a duplicate | yes: pr257 |
| GM-22-OD-14 | GM-22 | Expo only | A notice about a shift at your other pharmacy opens that pharmacy | yes: commit cc5f2787 |
| GM-24-OD-15 | GM-24 | Web + Expo | Learning pages show the "Careers & learning" articles | yes: commits 7855bbd8 and 22ceb013 |
| GM-24-OD-16 | GM-24 | Expo only | Public shift links and the signed-out shift board are on Expo too | yes: pr257 |
| GM-24-OD-17 | GM-24 | Web only | Referee forms stay web-only (intended) | yes: pr257 |
| GM-25-OD-18 | GM-25 | Web only | Owner and organisation "public" and "community" shift boards: web pages with no menu links | yes: pr257 |
| GM-25-OD-19 | GM-25 | Expo only | iPhones older than iOS 16.4 cannot install the app | yes: pr257 (SDK 58) |
| GM-25-OD-20 | GM-25 | Expo only | App landing: no auto-rotating carousel; picking a persona preselects the role | yes: pr257 |
| GM-25-OD-21 | GM-25 | Web + Expo | Tab rows and stronger grey text | yes: pr257 (mobile) |
| GM-25-OD-22 | GM-25 | Web + Expo | Error wording | yes: commits 172622e8 and cc5f2787 |
| GM-26-OD-23 | GM-26 | Web + Expo | Resend-protection records are kept forever | yes: pr257 |
| GM-26-OD-24 | GM-26 | Web + Expo | Three small risks I accepted | yes: pr257 |

Already covered by an existing question, so not added again: no payment countdown on Home cards (no deadline exists yet) = GM13-Q03; no "Ben and 2 others are free" line (nobody can see others' availability) = GM-19-Q04.
Built only to match web (parity, not a choice): roster acknowledgement notice in My Roster, Timesheets link for roster delegates, manager Leave entry, on-screen QR for invites, receipt attach from Finance (D76 a-e).
Not asked (process or tooling, no effect on users): commit grouping, reviewer routing, SDK upgrade steps, lint rules set to warn, the deepmerge security override, security pins, Android build folder, memory guard.

**Count:** 463 open questions + 24 = 487.

## 4. Claims corrected against current code

Codex A checked 292 claims across all 26 original areas, at both refs (read-only, file:line evidence for each). **203 hold; 89 needed a correction.** Each area file now opens with its own correction table, and the full evidence is in [`followup/claim-check-2026-11-21.md`](followup/claim-check-2026-11-21.md). Corrections per area: GM-01 5, GM-02 3, GM-03 5, GM-04 2, GM-05 4, GM-06 3, GM-07 2, GM-08 1, GM-09 3, GM-10 4, GM-11 3, GM-12 3, GM-13 6, GM-14 4, GM-15 3, GM-16 1, GM-17 2, GM-18 4, GM-19 3, GM-20 1, GM-21 2, GM-22 5, GM-23 3, GM-24 2, GM-25 6, GM-26 9.

The ones that change what you'd answer:
- **Pay details (GM-13, GM-14):** missing TFN/super details do **not** block acceptance; payroll is deferred. Missing or unverified ABN details do block the ABN pathway.
- **Unpaid reservations (GM-13, GM-15):** Stripe session expiry alone leaves the app hold and offer in place. Authorised manual expiry can release the hold after provider confirmation. The D02/D03 business transition is still missing (BL-06).
- **Escalation (GM-11, GM-12):** escalation only pauses while interest exists. If every interest is withdrawn, a later visit can escalate again; a decline or offer expiry alone doesn't stop it.
- **Anonymity (GM-11, GM-22, GM-24, GM-26):** there is no anonymity guarantee before acceptance. The terms preview and several notices show the pharmacy's real name (BL-13). Anonymous talent posts can expose the author to signed-in users (BL-08).
- **Posting window (GM-07, GM-10, GM-23):** the server posting window exists only on the Expo branch; deployed main has none.
- **Terms version (GM-12, GM-14, GM-15, GM-18):** PR257 adds the external-offer version check (BL-21). Cover already requires the reviewed version on main. The terms snapshot still needs cancellation and legal-version decisions.
- **Expo screens (GM-02, GM-03, GM-25):** Explorer Shifts, the owner Hub and the Learning screen are real screens now, not placeholders. Pharmacist onboarding goes to the basic-profile form.
- **Things the PR said were missing but exist:** password-reset links do expire (GM-01); PIN setup requires 4-6 digits (GM-08); Expo exports approved timesheet hours to CSV (GM-09); approved leave blocks roster publication (GM-06); Django admin can edit the pharmacy verification flag (GM-03); audit records exist for roster, marketplace, content and admin reconciliation (GM-26).
- **Security holes the PR listed that are not holes (GM-26 B62, B65):** roster authority and rate calculation are checked at the action level.
- **Explorer admin guard (GM-05, GM-24):** built on the Expo branch only; deployed main gets it with the PR #257 release.

Corrections that touched this review's own additions (GM-05, GM-07, GM-13, GM-24) are already fixed in those questions' text.

## 5. Uncovered areas added

- **GM-27 Mobile-only flows** ([`areas/GM-27-mobile-only-flows.md`](areas/GM-27-mobile-only-flows.md)): seven questions on post-shift recovery, offline next shifts, app lock, opening workspace, invitations from worker QR, export of cached shift details to Google Calendar or Maps, and QR contact sync and invitation-code retention.
- Checked and already covered, so not added: offline kiosk/attendance (GM-08), notifications and push (GM-22, GM01-F13), account deletion and privacy (GM-26), worker self-invoicing and finance (GM-17 F8-F18), kiosk (GM-08), payments (GM-13/16/17), admin (GM-26), Explorer rules (GM-24, now with D93/D96).

## 6. Engineering backlog (not owner questions)

Defects and carried rules the code does not yet follow are in [`ENGINEERING_BACKLOG.md`](ENGINEERING_BACKLOG.md), BL-01 to BL-34. The area files keep their own code-gap notes. BL-07 links the existing O4 fix in `local/o4-fixes`.
