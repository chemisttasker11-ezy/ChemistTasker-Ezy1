# Grill Me — binding owner decision and implementation status ledger

**Policy:** Only an explicit owner decision with source/effective context can change an approved business rule. A source-code contradiction is `IMPLEMENTATION_GAP`, not `SUPERSEDED`. This ledger begins with historical #184 carried decisions and Issue #250; no *new* owner answer is asserted by PR #267.

## Status vocabulary

- `APPROVED`: explicit historical/current owner decision with source.
- `APPROVED_DIRECTION_DETAIL_REQUIRED`: owner approved the direction; details not supplied must be separately asked.
- `OPEN_POLICY`: no owner answer; present one decision question with alternatives.
- `IMPLEMENTATION_GAP`: code does not enforce existing decision; requires remediation + tests, not reapproval.
- `EVIDENCE_OPEN`: code may exist; relevant runtime/current-head verification absent.
- `DEFERRED`: user expressly deferred a feature, with scope/date/version.
- `SUPERSEDED_BY_OWNER`: historical rule replaced by a newly sourced owner decision, never merely by source-code behaviour.

## Historical owner rule register — immediately relevant to the Grill

| ID | Binding intent | Decision state | Current implementation / source issue | Next action |
|---|---|---|---|---|
| D01 | External offer acceptance reserves; verified booking payment confirms | APPROVED | Checkout/reservation lifecycle exists; exact concurrent production behavior untested here | Test paid/unpaid transitions and booking truth |
| D02 | 24h if start >48h; 6h if start 12–48h; 2h if start 2–12h; 30min if <=2h, never beyond start | APPROVED + IMPLEMENTATION_GAP | Stripe provider expiry exists, no D02 pay-by policy in `checkout_reservations.py` | Implement server-owned deadline and expiry worker |
| D03 | Unpaid expiry releases same existing audience, not automatic escalation, worker and manager notified, no penalty | APPROVED + IMPLEMENTATION_GAP | Scheduled same-audience expiry not evidenced | Idempotent release, notice/outbox and race tests |
| R01 | Internal roster for active employed FT/PT/casual staff, not external locums | APPROVED | Role enforcement requires full journey check | Reject external roster writes |
| R04A | Per-pharmacy owner setting controls worker-initiated cover publication | APPROVED_DIRECTION_DETAIL_REQUIRED + IMPLEMENTATION_GAP | `auto_publish_worker_requests` lacks evidenced backend consumer | Implement config/permission policy, retain assignee until approved |
| R04B | Named eligible colleagues for cover; widening to favourites/public requires manager | APPROVED_DIRECTION_DETAIL_REQUIRED + IMPLEMENTATION_GAP | Current cover path asks nobody; manager picks replacement | Implement invite/accept/escalate |
| R04C | Replacement accepts, passes role/conflict, then manager approves transfer | APPROVED + IMPLEMENTATION_GAP | Manager can assign without target accept (`worker_actions.py`) | Add consent and concurrent transfer tests |
| R06 | Vacancy/needs-cover uses SAME Shift/Slot and linked roster occurrence | APPROVED + IMPLEMENTATION_GAP | Reuse exists in parts, linked needs-cover state not evidenced | Add visible state without duplicate shift |
| E01/E01A | Cumulative staff/favourites/owner-chain/org/public eligible access, notification skip is not access revocation | APPROVED + IMPLEMENTATION_GAP (reported) | Earlier favourites may lose visibility on widening | Recheck querysets and add five-tier tests |
| E01B | No organisation-wide worker broadcast; notice prefs independent of access | APPROVED | Notification paths not fully current-head verified | Distinct audience vs notification test |
| E03 | Owner chooses persisted escalation intervals at posting; roster publish does not escalate | APPROVED | Lazy processing and missing notices reported | Scheduled idempotent escalation and tests |
| P02 | Sourcing tier governs warning/penalty policy, employment classification separately relevant | APPROVED_DIRECTION_DETAIL_REQUIRED | No safe comprehensive charge engine for release | Legal review, immutable source snapshot |
| P05 | Chain/org cancellations handled internally; incident badges may still apply | APPROVED | Exact enforcement unverified | Test organisation/chain boundaries |

**Source:** `docs/qa/shift-lifecycle/OWNER_DECISION_REGISTER.md` at PR #184 head and `docs/qa/launch-grill/questions.json` (30 carried entries). This is a priority **subset**, not a claim to reproduce all 30; the complete historic carried list remains in the source JSON until the canonical mapping is generated.

## Owner answer recording template

| Question ID | Existing approved rule / conflicts | Current actual and verified SHA | Recommended + alternatives | Owner answer verbatim, source and date | Effective surface/roles | Tests and state | Release gate |
|---|---|---|---|---|---|---|---|
| LAUNCH-01 | PR #200 PRODUCTION NO-GO (audit; not a substitute for owner policy) | PR #249 `97c4543e` + later PR #257 `ad01356e` not fully reconciled | A: no live transactions until gates clear; B: browse-only early access; C: limited opt-in after specific gates; D: full after proven acceptance | **UNANSWERED** | All web and Expo | EVIDENCE_OPEN | P0 |
| VERIFY-GATE-01 | existing AHPRA policy applies where required | At #249 head member/public gate differs; backend interest path inspected | Require current credential at irreversible external booking, cache policy explicit | **ANSWERED** by ON-Q03 = B, launch grill 23 Oct 2026: check on every outside booking | External bookings / verified roles | APPROVED + IMPLEMENTATION_GAP (BL-01) | P0 |
| REFUND-01 | D01-D03 payment reservations; cancellation remuneration separate | No complete refund workflow demonstrated | Qualified legal/finance decision on refunds vs credits and timing | **UNANSWERED** | Billing, cancelled booking | OPEN_POLICY | P0 |
| OFFER-01 | Owner decision not established | Dedicated firm offer exists; public exposure/PII risk | Enquiry first on public; trusted dedicated offer can be firm, with consent | **UNANSWERED** | Talent, booking | OPEN_POLICY | P1 |

**Sign-off cannot be inferred from a filled row**: implemented, backend tested, web verified, Expo verified and launch approval are separate evidence transitions. Avoid copying one decision into multiple independent records; secondary areas must reference its canonical ID.

## Additional changes found in independent audit

- `PAYBY-01` and `CARRIED-01` in consolidated queue must be implementation checkpoints, not policy re-asks (corrected).
- `GM-07-Q04` original section still presents a yes/no policy although R04C is approved. Treat that question as a **source mismatch and remediation**, unless the owner explicitly initiates a change request.
- `GM-18` remains missing its primary 26-question trace, and `GM-25` needs a latest-head comparison before the owner interview.

## Launch grill answers carried in (added 21 Nov 2026 review)

Source: launch grill artifact database, collection `answers`, written 23 Oct 2026. PR #267 had listed these as open.

| ID | Answer | Status |
|---|---|---|
| ON-Q01 sign-up tracks | KEEP | APPROVED |
| ON-Q02 before Verified | KEEP, given against a wrong "today" text | Re-confirm once as GM01-Q04 |
| ON-Q03 where verification is enforced | B: every outside booking is checked | APPROVED + IMPLEMENTATION_GAP (BL-01) |
| ON-P01 AHPRA exemption | A: employees skip, favourites are checked | APPROVED + IMPLEMENTATION_GAP (BL-02); closes AHPRA-FAV-01 |
| ON-Q04 pay details | B: told early, finished before accepting | APPROVED + IMPLEMENTATION_GAP (BL-03) |

Also binding (owner, 13 Nov): D93 (no role change to Explorer; Explorers get no invoices) and D96 (an Explorer can never hold an admin role; built). Carried from the job memory: R1, E1, grill #9, D2, D3, E17/E18.
