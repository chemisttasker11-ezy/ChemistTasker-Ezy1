# Owner grill: start here (one document, 21 Nov 2026)

This is the one page Tom (the owner) goes through. It sits on top of the 27 area files in `areas/` and replaces the reading order in `README.md` for the owner interview. The older files stay as evidence.

**How we go through it:** one area at a time, one question at a time. For each question you see the scenario, what happens today, and the recommendation first. You answer keep / change (pick an option) / defer. Answers are written into the area file under the question, and into [`OWNER_DECISION_LEDGER.md`](OWNER_DECISION_LEDGER.md).

**Code the answers rest on (checked 21 Nov):**
- Web and backend as deployed: `origin/main` at `8ccf8f77` (PR #247, 3 Nov). This is also the base the PR traced, so web claims are current.
- Expo app and newest backend: `origin/agent/pr257-int` at `21add924`. The area files were traced at PR #249 head `97c4543e`, which is 333 commits and 514 files behind it, so every mobile claim and every claim on a changed backend file was re-checked. Results are in section 4.

## 1. Already decided: never re-asked

| Source | Decisions |
|---|---|
| Carried owner decisions (30, launch grill `questions.json`) | D01-D05, R01, R04, R04A-R04D, R06, E01, E01A, E01B, E03, P02, P04-P12, FEES, F01, F04, NOPEN |
| Launch grill answers (artifact `answers`, 23 Oct) | ON-Q01 **KEEP**, ON-Q02 **KEEP** (re-confirm once at GM01-Q04 with the corrected baseline), ON-Q03 **B** (checked on every outside booking), ON-P01 **A** (employees skip the AHPRA check, favourites are checked), ON-Q04 **B** (told early, pay details finished before accepting) |
| Job memory, carried in | R1 (owner may record invoice payment without approval), E1 (admin bypass intended), grill #9 (plain draft roster staff deleted with their shift: still true in code), D2 (cover terms accepted only as shown), D3 (legacy paid session in a locked period goes to refund / manual follow-up), E17/E18 (ABN wins for cross-site cover; staff wins for unrostered local cover), iOS native acceptance deferred |
| Owner, 13 Nov | D93 (no role change to Explorer; Explorers get no invoices), D96 (an Explorer can never be an admin; built) |
| Deferred by the owner | Planner: PR #181 simplified vs PR #192 original; keep both until asked (GM-23-W01) |

**AHPRA-FAV-01** and **VERIFY-GATE-01** are answered by ON-P01 and ON-Q03. Engineering follows BL-01 and BL-02. **GM01-Q04** is the single re-confirmation of ON-Q02. **GM-07-Q04 to Q06** and **GM13-Q01/Q02** implement carried decisions through BL-06.

## 2. Areas, open questions, suggested order

"Open" = questions to ask, after removing answered ones, questions merged into another area (counted once, where they are owned) and questions the PR itself marks not re-validated (asked after re-validation). Added = the waiting decisions placed in this review (section 3).

| # | Area(s) | Open | Added this review | First question |
|---|---|---|---|---|
| 0 | **LAUNCH-01** (owned by GM-26), with GM-21-W01, GM-16-W01, GM-16-W02 | 1 + 3 | marketplace switches, free trial, web-only billing | What launches, on which surfaces, after which gates? |
| 1 | GM-01 Sessions/auth | 18 | GM01-Q04 note | GM01-Q04 (re-confirm) |
| 1 | GM-02 Worker onboarding | 13 | answered table | ON-P03: which AHPRA lookup runs at launch? |
| 1 | GM-05 Roles/membership | 12 | W01 invitee active before password | GM-05-W01 |
| 2 | GM-03 Pharmacy setup | 11 | | PHARM-GATE-01 |
| 2 | GM-04 Organisations | 11 | | GM-04-Q01 |
| 3 | GM-10 Posting/rates | 12 | | RATE-01 (after GM-09-Q01) |
| 3 | GM-11 Audience/escalation | 11 | | GM-11-Q01 |
| 3 | GM-12 Interest/offers | 22 | | GM-12-Q06 |
| 4 | GM-13 Reservation/payment | 9 | W01 paid orphan, W02 release only by cancellation | GM-13-W01 |
| 4 | GM-16 Subscriptions/fees | 16 | W01, W02 (asked in row 0) | GM16-Q01-FIRST |
| 5 | GM-08 Attendance/kiosk | 12 | W01 re-grill QR/PIN confirmation | GM-08-Q01 |
| 6 | GM-09 Timesheet/payroll | 11 | W01 re-grill overnight activation | GM-09-Q01 |
| 7 | GM-14 Terms/Award/GST/super | 12 | W01 re-grill stale terms | ACCEPT-01 |
| 7 | GM-17 Invoices/refunds | 18 | W01 answered by R1 | REFUND-01 |
| 8 | GM-15 Cancellation/disputes | 42 | W01 (defect, not a question) | GM15-01 |
| 9 | GM-06 Employment/leave | 9 | | GM-06-Q06 |
| 9 | GM-07 Roster/cover/swap | 9 | W01 posting window, W02 self-dealing, W03 answered | GM-07-W01 |
| 10 | GM-18 Talent/recruitment | 25 | | AUDIENCE-01, then OFFER-01 |
| 10 | GM-19 Availability/matching | 13 | | GM-19-Q03 |
| 10 | GM-24 Explorer/public | 21 | W01 explorer admin rows; D93 answered | GM-24-Q01 |
| 11 | GM-20 Chat/Hubs | 19 | W01 revoked-member edits | GM20-Q01 |
| 11 | GM-22 Notifications/rewards | 26 | | GM22-04 |
| 12 | GM-21 Marketplace | 19 | W01 (asked in row 0) | after LAUNCH-01 |
| 12 | GM-23 Calendars/operations | 29 | W01 deferred | GM-23-01 |
| 13 | GM-25 Web/Next/Expo parity | 25 | | MOBILE-PARITY-01 (after the joint re-check) |
| 13 | **GM-27 Mobile-only flows (new)** | 7 | Q01–Q07, including cached export and QR retention | GM27-Q01 |
| 14 | GM-26 Admin/privacy/security/release | 27 | W01 reCAPTCHA keys (owner action), W02 Dependabot, W03 node-forge, W04 minimatch | GM26 first non-launch question |

**463 open question entries across the area and launch rows above.** Ask the launch-blocking questions first (marked in `followup/followup-launch-blocking.md`). The owner can defer the remaining optional questions by area.

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

Defects and carried rules the code does not yet follow are in [`ENGINEERING_BACKLOG.md`](ENGINEERING_BACKLOG.md), BL-01 to BL-24. The area files keep their own code-gap notes. BL-07 links the existing O4 fix in `local/o4-fixes`.
