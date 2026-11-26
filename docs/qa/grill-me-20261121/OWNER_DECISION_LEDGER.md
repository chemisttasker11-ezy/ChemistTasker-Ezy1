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
| LAUNCH-01 | PR #200 PRODUCTION NO-GO (audit; not a substitute for owner policy) | PR #249 `97c4543e` + later PR #257 `ad01356e` not fully reconciled | A: no live transactions until gates clear; B: browse-only early access; C: limited opt-in after specific gates; D: full after proven acceptance | **ANSWERED: OTHER**, owner, 24 Nov 2026. Fix known problems first (protects bookings and payments); websites first so Tom and Sara can use them; phone payments open a link, pay in the browser and return to the app; Pills payments stay in the app | All web and Expo (web first) | APPROVED_DIRECTION_DETAIL_REQUIRED + IMPLEMENTATION_GAP (BL-35) | P0 |
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

## Row 0 launch answers (added 24 Nov 2026)

Source: owner, 24 Nov 2026, Grill Me row 0. Recorded only, not built.

| ID | Answer | Status |
|---|---|---|
| LAUNCH-01 (also GM21-Q01, GM25-Q01, GM26-Q36) | OTHER: fix the known problems first; websites first; phone payment opens a link, pays in the browser and returns to the app; Pills payments stay in the app | APPROVED_DIRECTION_DETAIL_REQUIRED + IMPLEMENTATION_GAP (BL-35) |
| GM-16-W01 free trial | OTHER: 2-month trial, max 2 shifts a week, 6 a month, 10 in total, all features; payment step becomes the last confirmation before the worker; shifts dated within 2 months after the trial end, then off the board; trial shifts need no payment even if covered in that window | APPROVED_DIRECTION_DETAIL_REQUIRED + IMPLEMENTATION_GAP (BL-36) |
| GM-16-W02 seats | A: buy or change seats on the website | APPROVED |
| GM-21-W01 marketplace switches | OTHER: goods commitments, escalation and catalogue lookup on; contact by chat; S1 and regular stock for everyone, S2 for owners, no S3; no ethical marketplace for now | APPROVED_DIRECTION_DETAIL_REQUIRED + IMPLEMENTATION_GAP (BL-37) |

**Points to confirm with the owner (found while recording):**
1. Trial caps: 2 shifts a week over 2 months would allow about 17, and 6 a month would allow 12, but the total is 10. The total of 10 always binds first; the weekly and monthly caps only pace it. Confirm that is the intent, and whether the trial ends at 2 months or when the 10th shift is used, whichever comes first.
2. Trial end vs shift window: the last allowed shift date is 2 months after the trial end, so a shift can be dated about 4 months after sign-up; the posting limit today is 4 months ahead. Confirm both limits apply together.
3. "No payment needed" for trial shifts vs "payment step becomes the last confirmation": confirm the screen stays but no money is taken, and what happens to a trial shift still unpaid when it is covered after the 2-month window.
4. GM-21-W01 option C also switched on ethical private browsing, inventory and transfers; the owner turned the ethical marketplace off. Confirm that ethical access applications (default on today) also close, and what S1, S2 and S3 mean for the product.
5. LAUNCH-01 is OTHER, so no A-D gate list is chosen. Confirm whether the GM-26 option A list (PR #200 NO-GO items) is the "known problems" list, and when Expo launches after the websites.
6. Pills in the app vs the D01 rule: confirm a Pills payment confirms the booking in-app under the same verified-payment rule.

## GM-01 owner answers (Grill Me, 24 Nov 2026)

Recorded only, not built. Full wording and engineering ids (`BL-GM01-n`) are in `areas/GM-01-sessions-auth.md` and `ENGINEERING_BACKLOG.md`. Big external items: `POST_GRILL_LIST.md`.

| ID | Answer | Status |
|---|---|---|
| ON-Q01 / GM01-Q02 sign-up tracks | KEEP (pharmacist, other staff, Explorer, owner) | APPROVED |
| ON-Q02 before Verified / GM01-Q04 | KEEP: browse everything, only applying to public shifts needs Verified. Refinement: pharmacist hub not browsable or commentable until verified as a pharmacist (at least an AHPRA number) | APPROVED + IMPLEMENTATION_GAP (BL-GM01-3) |
| GM01-Q01 sign-in length | Websites only (owner refinement 24 Nov: Expo excluded, keeps today's long session): unticked box = 2-hour session, ticked = up to 90 days | APPROVED + IMPLEMENTATION_GAP (BL-GM01-1) |
| GM01-Q03 unconfirmed email | C: require confirmation; correct the email on the code screen, new code | APPROVED + IMPLEMENTATION_GAP (BL-GM01-2) |
| GM01-Q05 extra sign-in check | D: owners and org admins first (email code, authenticator app, backup codes, 30-day device); WhatsApp later; workers later | APPROVED + IMPLEMENTATION_GAP (BL-GM01-4); DEFERRED part: WhatsApp |
| GM01-Q06 devices | D: device list and sign out everywhere | APPROVED + IMPLEMENTATION_GAP (BL-GM01-5) |
| GM01-Q07 "keep me signed in" | C: ticking extends the sign-in (websites only) | APPROVED + IMPLEMENTATION_GAP (BL-GM01-1) |
| GM01-Q08 expired session | C: explain and save her place | APPROVED + IMPLEMENTATION_GAP (BL-GM01-6, BL-14) |
| GM01-Q09 return after sign-in | C: linked page on the website | APPROVED + IMPLEMENTATION_GAP (BL-GM01-7) |
| GM01-Q10 phone/web sign-in parity | A: keep all steps, check the website refresh | APPROVED + IMPLEMENTATION_GAP (BL-14) |
| GM01-Q11 biometrics | Other: keep phone unlock, protect details like the saved sign-in; face, fingerprint and PIN; websites after launch | APPROVED + IMPLEMENTATION_GAP (BL-GM01-8) |
| GM01-Q12 offline sign-out | C: sign out now, finish when back online | APPROVED + IMPLEMENTATION_GAP (BL-GM01-9) |
| GM01-Q13 password reset | C: link expires; every device signed out | APPROVED + IMPLEMENTATION_GAP (BL-GM01-10) |
| GM01-Q14 wrong passwords | Other: captcha after 3; after 5 an email code to retry, or 1-hour wait | APPROVED + IMPLEMENTATION_GAP (BL-GM01-11) |
| GM01-Q15 page not allowed | C: brief explanation and request access | APPROVED + IMPLEMENTATION_GAP (BL-13) |
| GM01-Q18 mobile numbers | C (partly): number change; overseas numbers via WhatsApp only, moved to a next stage. Owner resolution 24 Nov 2026 (conflict with GM02-Q24): only Explorers may show photo ID instead of the Australian mobile check, as today; no widening to other roles | APPROVED (BL-GM01-12: change-number flow only); DEFERRED part: WhatsApp (`POST_GRILL_LIST.md`) |
| GM01-Q19 codes | C: keep 6 digits / 10 minutes / 5 tries; protect real accounts in test mode | APPROVED + IMPLEMENTATION_GAP (BL-17) |
| GM01-Q16, Q17 | Asked in GM-18 (GM-18-Q13, Q14) | Not asked here |

## GM-02 owner answers (Grill Me, 24 Nov 2026)

Full wording, and the orchestrator's "my call: confirm or change" details, are under each question in `areas/GM-02-worker-onboarding-credentials.md`. Build rows: `BL-GM02-n` in `ENGINEERING_BACKLOG.md`.

| ID | Answer | Status |
|---|---|---|
| ON-Q05 Explorers and shifts | C: paid shifts after moving to a staff role; pathway offered at offer time | APPROVED + IMPLEMENTATION_GAP (BL-GM02-1) |
| ON-Q06 AHPRA re-check | Other: as today plus a background check when an offer is made; ask to re-verify on a problem | APPROVED + IMPLEMENTATION_GAP (BL-GM02-2) |
| ON-P03 lookup source | KEEP current desktop setup. Verified: desktop and Claude fallback wired; Scrapling not in the repo; live server value not checked | APPROVED + EVIDENCE_OPEN (owner confirms production `AHPRA_SOURCE` and Scrapling) |
| ON-Q07 unconfirmed registration | Act only on confirmed results; unavailable register never cancels; confirmed lapse blocks new and starts a support review | APPROVED + IMPLEMENTATION_GAP (BL-GM02-3) |
| ON-P02 suspended or cancelled | KEEP: auto-cancel, pause, notify | APPROVED |
| ON-Q08 ID check | KEEP, plus the owner can ask for ID before the final step | APPROVED + IMPLEMENTATION_GAP (BL-GM02-4) |
| ON-R01 evidence retention | B: seven years, except ID files deleted once the result is recorded | APPROVED + IMPLEMENTATION_GAP (BL-GM02-6, BL-GM02-7) |
| ON-Q09 indemnity cover | C: badge only, plus the owner can ask for cover before the final step | APPROVED + IMPLEMENTATION_GAP (BL-GM02-5, BL-GM02-4) |
| ON-Q10 super on ABN terms | KEEP | APPROVED |
| ON-Q11 pharmacy checks before posting | Other: public posting once the ABN is confirmed; no human review | APPROVED + IMPLEMENTATION_GAP (BL-GM02-8) |
| ON-Q12 site brief | KEEP optional, plus hints in onboarding and posting | APPROVED + IMPLEMENTATION_GAP (BL-GM02-9) |
| ON-Q13 saved payment method | KEEP | APPROVED |
| ON-Q14 organisations join | KEEP | APPROVED |
| GM02-Q21 offers to unverified workers | Other (A): show the check result and allow sending for group and chain shifts only. Public offers keep the send gate. ~~Worker acceptance still requires eligible credentials under BL-01.~~ Owner confirmed this scope on 24 Nov 2026. | APPROVED + LOCAL SEND-GATE FIX (BL-GM02-10 readiness and upgrade flow still open). The acceptance sentence is SUPERSEDED_BY_OWNER: see GM02-Q21-R1 |
| GM02-Q21-R1 internal roster and group bookings | "We only notify the owner about his worker but let him do whatever with his internal roster and the inter-group booking." The reading is in the 24 Nov implementation record (my call: confirm or change) | APPROVED + IMPLEMENTATION_GAP (BL-01 scope) |
| GM02-Q22 expiry date alone | KEEP | APPROVED |
| GM02-Q23 intern talent posts | KEEP | APPROVED |
| GM02-Q24 mobile check skip | KEEP: only Explorers (reconfirmed 24 Nov over GM01-Q18) | APPROVED |

## GM-05, GM-03 and GM-04 owner answers (24 Nov 2026)

Source is the owner's 24 November Grill Me answer export, checked against PR #267 at `f0389924`. The owner entries below preserve the full exported text. The status line records the local disposition.

### GM-05 — Staff, managers and invites

#### Q-05 — When should email invitations expire?

> A (Expire after seven days and allow withdrawal) = recommended: sara can still see the link after expiry and can apply to join, instead of directly enrolled via direct link if she accepted on time

Approved. Verify expiry and withdrawal, then add the existing join-application path for expired direct invites.

#### Q-06 — Who can appoint admins across the pharmacy group?

> A (Let group admins invite and chief admins appoint) = recommended: both group admin if their responsiblity permits, and chief admin can invite and appoint, Grace manages only pharmacies in her named region. The chief admin can work across the whole group.

Approved. Verify that permissioned group admins and chief admins can invite and appoint within scope.

#### Q-07 — Who should appoint and remove pharmacy managers?

> KEEP (Keep it like today): it is already sat up now with clear roles and responsibilities for each level of pharmacy admin, please confirm with me

Open for owner confirmation. Review the existing admin levels and responsibilities.

#### Q-08 — How should shared invitation links work?

> OTHER: it is already has the function to set the duration of the generated link, please confirm

Keep existing behaviour. Verified configurable expiry in web, Expo and the backend.

#### Q-09 — What happens to bookings when Tom removes someone?

> B (Sort out confirmed bookings before removal): or keeps it for ben as itis , so all the options, Sort out confirmed bookings before removal Your answer Tom has to keep/cancel or reassign Saturday's booking before he can remove Ben. That covers the booking but can delay the removal.

Approved. Preserve confirmed bookings by default and support explicit keep, cancel or reassign before removal.

#### Q-11 — Can pharmacy managers work shifts with the same account?

> OTHER: there is already the personna switcher , that how it works. omar is a worker (pharmacist/other staff) in pharmacy X, the owner asigned him as well as an admin, he still can keep both, and getting personna switcher to choose. BUT it is not working vice versa, so if he first asigned as admin there is no way to get other personna to be worker with a role as well, discuss with me how to make it work both ways without messing up our logic.

Open for discussion. Worker-first switching is the baseline. The admin-first path needs an agreed role and verification workflow.

#### Q-18 — Should group employees get more pharmacy memberships?

> KEEP (Keep it like today): 3 in real life is enough

Keep the three active pharmacy membership limit.

#### Q-19 — Should Tom's membership stay protected?

> KEEP (Keep it like today) = recommended

Keep owner membership protection.

#### GM-05-OD-03 — Who should see the roster and attendance approvals?

> KEEP (Keep it like today) = recommended

Keep existing roster and attendance approval permissions.

#### GM-05-OD-04 — Should Lina see sections she cannot use?

> KEEP (Keep it like today) = recommended

Keep capability-based navigation.

#### GM-05-OD-05 — Should Tom enter a name when inviting staff?

> KEEP (Keep it like today) = recommended: her remaining info will be fetched from her application and the owner/admin will confirm/edit as today

Keep profile data prefill and owner or admin review and editing.

#### GM-05-OD-06 — Should removing Ali free up his future shifts?

> OTHER: or keeps it for Ali as it is , so all the options, Sort out confirmed bookings before removal Your answer Tom has to keep/cancel or reassign Saturday's shifts before he can remove Ali. That covers the shifts but can delay the removal.

Approved. Keep the existing booked shift as an explicit option alongside cancellation and reassignment.

#### GM-05-W01 — When should Mia join the pharmacy team?

> A (Show Mia as invited until she joins) = recommended

Approved. Show an invitation as pending until the invitee joins.

### GM-03 — Pharmacy setup

#### GM-03-Q06 — Can Tom put off adding his pharmacy?

> D (Let Tom skip and keep a reminder visible) = recommended

Approved. Allow skipping pharmacy setup with a visible reminder.

#### GM-03-Q07 — Who is responsible when Tom books a pharmacist?

> C (The pharmacy makes the agreement and names a pharmacist) = recommended: if the person setting up the account is not the pharmacist ,A proprietor pharmacist should be named and his phone number added as well (not checked) check against our data and send a text sms. ahpra check , abn check if the proprietor pharmacist is setting it by themself, ahpra, abn of added pharmacy will need pharmacy email , phone in the pharmacy details discuss with me please

Open for discussion. Record the pharmacy agreement choice. The named proprietor pharmacist, checks and SMS flow need agreement before implementation.

#### GM-03-Q08 — How should Tom group his pharmacies?

> KEEP (Keep it like today): he can see which group claims his pharmacy , accept or reject. that is today

Keep the current group claim accept or reject flow.

#### GM-03-Q09 — What can Tom change after Sara books?

> KEEP (Keep it like today): Let Tom edit and but it is not going to affect confirmed booking and that should be shown to tom while he is doing any changes. Tom can update details and sees which upcoming bookings are affected. Sara is told about important address or hours changes. Her agreed pay/shift details (address,hrs) stays the same. Business number changes follow today’s rules.

Approved refinement. Keep confirmed shift terms and show the owner which bookings an edit affects. Notify booked workers of important address or hours changes.

#### GM-03-Q10 — Which documents should Tom provide before posting?

> OTHER: Show which documents are on file Sara can see which documents Tom has supplied after confirmation. Tom can post even if none are on file. Tom can post straight away whether he uploads documents or leaves them out. Sara may arrive without a guide. Tom can send her a ready link as will for all these documents to sara

Approved. Keep documents optional for posting and support a shareable link for the confirmed worker.

#### GM-03-Q11 — When should Tom set pay rates and payroll?

> KEEP (Keep it like today): Payroll starts off. Tom can turn it on when adding or editing his pharmacy

Keep payroll off by default with owner control.

#### GM-03-Q12 — Who should approve Tom’s pharmacy for marketplace trading?

> D (Have a named reviewer check and tell Tom) = recommended: check id, pharmacy approval number, abn if not checkedand all the details including pharmacy email, phone address

Approved. Named review of marketplace trading, with the listed checks. Public shift posting after ABN confirmation follows ON-Q11.

### GM-04 — Groups, chains and regions

#### GM-04-Q02 — How should organisations, chains and regions work?

> OTHER: why you assume pharmacy can belong to several chains? discuss, and Define legal groups, chains and regions Tom uses chains linked to an owner or group to share shifts and find cover. A pharmacy can belong to one legal group and several chains. Regions are place names several pharmacies decided by the group admin. still not in the escalation levels and should defer for later. discuss this one with me to decide

Open for discussion. The desired chain cardinality and group structure need a decision. Keep regions outside shift escalation.

#### GM-04-Q05 — What can Lina do at pharmacies she doesn't manage?

> KEEP (Keep it like today)

Keep existing scoped group admin access.

#### GM-04-Q06 — Should pharmacies start with group rates and rules?

> KEEP (Keep it like today)

Keep existing group rate and rule behaviour.

#### GM-04-Q07 — Who can see and book shifts across the group?

> KEEP (Keep it like today): he actually can and there is a control for that, he can go to the group directly and his staff will be able to see it, and he can decide if he want his fav locum list to get notified or not. please confirm

Keep current posting controls. Verify group posting, staff visibility and favourites notification on the existing paths.

#### GM-04-Q08 — Who should hear when a shift changes?

> A (Tell affected workers, the owner and shift managers) = recommended: Tell affected workers, the owner and shift managers Recommended Sara, Tom and the managers looking after the shift hear about the change. Lina has to check shifts herself to spot repeat cancellations. Also tell anyone who saved the shift Workers who followed (saved) the shift also hear about the change, even if they never applied.

Approved. Notify affected workers, the owner, shift managers and workers who saved the shift.

#### GM-04-Q09 — When and how should Ben's cancellation rules be set?

> A (Use the closest relationship when Ben accepts) = recommended

Approved. Use the closest relationship at acceptance to determine cancellation rules.

#### GM-04-Q10 — Do we need pharmacy regions at launch?

> KEEP (Keep it like today) = recommended

Keep existing region behaviour at launch.

#### GM-04-Q11 — Should private shift incidents count towards public shift bans?

> A (Count only incidents from public bookings) = recommended

Approved. Only public booking incidents count towards public shift bans.

### Local implementation record (24 Nov 2026)

#### Owner follow-ups from the review

- Kiosk and PIN notices open the Vite pages. Next does not serve the kiosk interface.
- Browser sign-in normally waits for pending server revocation. On 26 Nov 2026 the owner confirmed that sign-in may proceed when both Web Locks and IndexedDB coordination are unavailable.
- The offer send exception covers group and chain only. Ordinary public and pharmacy-private sends keep their checks. GM02-Q21-R1 below replaces the earlier note that acceptance rules continue to apply.
- **GM02-Q21-R1 (owner, 24 Nov 2026, review round).** "We only notify the owner about his worker but let him do whatever with his internal roster and the inter-group booking." Replaces the acceptance part of GM02-Q21 and the earlier "acceptance keeps BL-01" note.
  - Reading (my call: confirm or change): for the pharmacy's own staff and internal roster, and for `OWNER_CHAIN` and `ORG_CHAIN` shifts, the credential gate does not block sending, accepting or finalising. The manager gets the worker's check result as a notice, and it also shows on the offer.
  - `LOCUM_CASUAL` and `PLATFORM` keep the full BL-01 gate at sending, accepting and finalising.
  - Not built on this branch. The work is on `build/bl01-02-booking-gate`; close the gap when it is integrated.

#### Owner follow-ups on the integration (26 Nov 2026)

- Launch starts with fresh data, so the legacy zero-rate workaround is deferred.
- App two-factor enrolment remains off until the supported sign-in screens can complete a challenge.
- The group booking warning requires current, active staff membership in the relevant chain or organisation. The exception is checked again at acceptance and finalisation.
- Confirmed bookings preserve their booked time zone alongside the site address when the pharmacy changes location or time zone.

These dispositions apply to the local working files based on `1f00f6b4`. The full owner answers above remain the decision record.

| Decisions | Local disposition |
|---|---|
| GM-05 Q-05 and W01 | Direct invites expire in seven days and can be withdrawn or reissued. An expired invitee can apply through the existing application form. New direct invitees join after setting their first password. Draft rosters can plan their shifts while published rosters still require an active membership. Existing approved applications retain their activation flow. |
| GM-05 Q-06, Q-08, Q-18, Q-19, OD-03 through OD-05 | Retained the existing role and pharmacy scope, configurable shared-link expiry, three-active-membership cap, owner protection, capability-based roster and navigation access, and application data review and prefill. |
| GM-05 Q-09 and OD-06 | Removal now requires an explicit decision to retain confirmed bookings, and web and Expo explain how to review them first. Existing roster workflows handle available changes before removal. Cancellation or reassignment of already-booked outside work still needs the booking cancellation and consent workflows, including BL-15 and BL-06. |
| GM-03 Q06, Q08 and Q11 | Added a first-pharmacy reminder to the web owner overview. Expo already has one. The existing group claim accept or reject flow and payroll-off default remain in use. |
| GM-03 Q09 and Q10 | The edit screens preview upcoming booking dates. A site change sends a notice and preserves the assigned location. Confirmed bookings expose a shareable documents link on web and Expo that opens the worker's signed-in confirmation view. Posting continues with documents optional. |
| GM-03 Q12 | Django admin records approval, refusal or withdrawal with the reviewer, evidence fields, time and reasons as applicable. The owner receives the decision. The ordinary marketplace review uses the existing approval gate. The two-business-day target remains an operating commitment. |
| GM-04 Q05, Q06, Q07 and Q10 | Retained existing scoped group access, pharmacy rate and rule settings, group posting with favourites notification controls, and region scope outside escalation. |
| GM-04 Q08 and Q09 | Shift changes notify affected workers, owners, assigned managers and followers on the implemented edit, cancellation, cover, swap and release paths. Offer acceptance records the closest relationship in the existing terms. AHPRA cancellation reads the frozen source for new bookings. |
| GM-04 Q11 | Approved rule carried forward to GM-15. The booking source needed for the rule is stored. The current backend has no verified incident ladder or public ban evaluator to apply this filter to. |
| GM-05 Q-07 and Q-11, GM-03 Q07, GM-04 Q02 | Open for owner confirmation or discussion. |
