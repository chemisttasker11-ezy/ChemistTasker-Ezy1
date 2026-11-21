# ChemistTasker Grill Me — launch-blocking vs optional/deferrable

**Scope:** every code gap and decision gap across all 26 Grill Me areas (PR #267, Issue #250), labelled **LAUNCH-BLOCKING** (must close before the first real user / first real transaction) or **OPTIONAL/DEFERRABLE** (can ship without it).
**Basis:** the 26 per-area trace files at PR #249 head `97c4543e`, the corrected consolidated queue and Owner Decision Ledger at `/tmp/grill267/`, and the independent senior audit (`INDEPENDENT_SENIOR_AUDIT_2026-11-21.md`). Read-only; no GitHub writes; no owner notification.

**Rules applied:** safety / legal / money / privacy gaps default to LAUNCH-BLOCKING unless the area file gives a concrete reason they can wait (e.g. a feature deferred from the launch cut in LAUNCH-01, like the marketplace). UX polish, parity nice-to-haves and deferred features are optional. Approved owner decisions whose implementation is missing (R04A / R04C / R06 / E01A / D02 / D03) are IMPLEMENTATION_GAPs and are blocking where the rule governs a first-user transaction. No evidence was invented for CI, device or payment tests that were not run: where the evidence for a gap's severity is itself unverified, the row says so (NOT RE-VALIDATED / UNKNOWN / evidence unverified).

**Counting note:** rows are counted *as written per area* (540 question entries + 283 code-gap entries = 823 rows). The same underlying gap often appears in several areas (e.g. the talent-board identity leak appears in GM-01, GM-02, GM-18, GM-19, GM-24, GM-25 and GM-26); those are listed in each area that traces them and flagged in the description where the canonical owner is another area. The consolidated queue's 524 figure is arithmetic after 16 merges, not a verified unique count (see audit §3.3), so no de-duplicated total is claimed here.

## Summary

- **Total rows labelled: 823** (540 question entries + 283 code-gap entries, as written per area)
- **LAUNCH-BLOCKING: 617**
- **OPTIONAL/DEFERRABLE: 206**

## Per-area counts (blocking vs optional)

| Area | Blocking | Optional | Total |
|---|---|---|---|
| GM-01 | 15 | 12 | 27 |
| GM-02 | 29 | 6 | 35 |
| GM-03 | 20 | 4 | 24 |
| GM-04 | 14 | 7 | 21 |
| GM-05 | 23 | 6 | 29 |
| GM-06 | 14 | 3 | 17 |
| GM-07 | 15 | 4 | 19 |
| GM-08 | 18 | 2 | 20 |
| GM-09 | 20 | 0 | 20 |
| GM-10 | 20 | 5 | 25 |
| GM-11 | 19 | 5 | 24 |
| GM-12 | 29 | 10 | 39 |
| GM-13 | 20 | 1 | 21 |
| GM-14 | 18 | 1 | 19 |
| GM-15 | 50 | 11 | 61 |
| GM-16 | 23 | 4 | 27 |
| GM-17 | 24 | 6 | 30 |
| GM-18 | 11 | 3 | 14 |
| GM-19 | 16 | 6 | 22 |
| GM-20 | 18 | 15 | 33 |
| GM-21 | 0 | 31 | 31 |
| GM-22 | 29 | 12 | 41 |
| GM-23 | 31 | 19 | 50 |
| GM-24 | 31 | 15 | 46 |
| GM-25 | 46 | 12 | 58 |
| GM-26 | 64 | 6 | 70 |
| **Total** | **617** | **206** | **823** |

## Top 10 launch-blocking items

1. **LAUNCH-01 (GM-25/GM-26/GM-21)** — No launch until the PR #200 PRODUCTION NO-GO is cleared; Vite + Next public first, marketplace deferred, Expo after Senior Package Testing. *Why blocking: The launch decision itself; everything else is framed by it.*
2. **Talent-board identity leak (GM-18/GM-24/GM-26, GM-18-Q01 / AUDIENCE-01)** — Authenticated talent feed/list/retrieve expose anonymous authors' full names and user IDs; only the public feed redacts. *Why blocking: P0 privacy leak at API level, confirmed at head in backend/talent/serializers/explorer.py.*
3. **D02/D03 not implemented (GM-13, GM13-Q01/Q02)** — No pay-by deadline and no same-audience expiry; only Stripe provider session expiry exists, with no scheduled expiry job. *Why blocking: APPROVED owner rules; money is taken without a deadline and unpaid reservations never release.*
4. **$0.00 payable rate (GM-10, GM-10-Q12)** — A FIXED shift can be created at $0.00 (default cascade ends at Decimal('0.00')); silent $0 fallback on pricing error. *Why blocking: Independently confirmed in backend/shifts/posting.py; shifts can be posted and paid at $0.*
5. **Legacy 10%/20% penalty route live (GM-13/GM-15/GM-16/GM-17, GM13-Q12)** — charge_penalty is still routed and callable, computes 10/20% over all assignments, has no idempotency and cancels nothing. *Why blocking: A callable charge that contradicts the no-penalty rule and the unimplemented P09 table; legal review (LA-R02) has not happened.*
6. **R04C target consent missing (GM-07, GM-07-Q04)** — Manager can transfer a shift without the swap/cover target's consent (backend/workforce/roster/worker_actions.py). *Why blocking: APPROVED owner rule; workers are assigned shifts they never accepted.*
7. **AHPRA gate is public-shifts-only (GM-02/GM-12, GM-12-Q01 / VERIFY-GATE-01)** — No Verified + current-AHPRA enforcement at interest/accept for member, chain, org, favourite or dedicated bookings; stored expiry never enforced. *Why blocking: Unvetted or lapsed-registration workers can be booked through every non-public path.*
8. **No pay card / fee truth (GM-13/GM-16, GM16-Q06)** — Owner pay card shows $n x 30 AUD always; PT/FT $80 and subscriber $15/$40 are not reflected, and fee/GST/total are not shown before posting. *Why blocking: The displayed price is wrong for most booking types while the server charges the right price.*
9. **Kiosk/PIN OTPs and pairing codes in notifications (GM-26, GM26-Q44/Q45)** — Kiosk codes and worker PIN OTPs in persistent notifications; pairing code in the kiosk_link_route URL; native pairing-code downgrade (PR #200 B62/B63/B64/B65). *Why blocking: Credentials leak through a channel that persists; confirmed present at head.*
10. **No exact-head CI / staging / device evidence (GM-25/GM-26, GM25-Q17/GM26-Q46)** — CI red on main, staging deploys queued since October (no self-hosted runner), no physical iOS/Android run, no pentest (UNKNOWN), Senior Package Testing not done. *Why blocking: The independent audit states senior-review passes do NOT equal production acceptance; none of this evidence exists.*

## Part 1 — LAUNCH-BLOCKING gaps

| Area | Gap ID | Description | Reason |
|---|---|---|---|
| GM-01 | GM01-Q03 | Should an unverified email block sign-in entirely, or let the worker in to finish verifying? | Decides whether unverified email grants any access; access-control boundary. |
| GM-01 | GM01-Q04 | Must a worker verify their mobile before they can browse anything? (carried ON-Q02, re-asked — FIRST QUESTION, see Part D) | Gate decides whether unverified users can browse/book at all. |
| GM-01 | GM01-Q07 | Fix the "Keep me signed in" inversion? (ticked = 7 days, unticked = 90 days) | Session-duration inversion (ticked = 7 days, unticked = 90 days) is a live security defect. |
| GM-01 | GM01-Q08 | When a session expires mid-use, what should the worker see? | Session expiry mid-use with no handling strands users on first transactions. |
| GM-01 | GM01-Q10 | Should every onboarding/auth step work on mobile, including the password and OTP screens? | If onboarding/auth steps fail on mobile, mobile users cannot join at launch. |
| GM-01 | GM01-Q12 | If sign-out fails (offline), should the app sign you out anyway or stay signed in? | Offline sign-out behaviour decides whether a lost/stolen phone stays signed in. |
| GM-01 | GM01-Q13 | Password reset signs every device out — keep that, and should the reset link expire? | Password-reset behaviour (sign-out everywhere, link expiry) is a security control. |
| GM-01 | GM01-Q14 | Login defences: keep 5-fails / 1-hour lockout, and should sign-in get a CAPTCHA? | Login lockout/CAPTCHA settings are the brute-force defence for first users. |
| GM-01 | GM01-Q16 | Should a signed-in worker be able to see an anonymous talent poster's real name? (carried LA-Q12) | Anonymous talent poster identity must not leak to signed-in workers. |
| GM-01 | GM01-Q17 | Should a talent post disappear when its author loses Verified status or their AHPRA lapses? (carried LA-Q13, lapsed-credential half) | Talent posts must disappear when Verified/AHPRA lapses, or lapsed workers keep getting booked. |
| GM-01 | CG-01 | Next migrated API client has no `refreshToken` callback | Session and auth controls decide who stays signed in and who is locked out. |
| GM-01 | CG-02 | No central `onAuthFailure` on Vite or Expo | Session and auth controls decide who stays signed in and who is locked out. |
| GM-01 | CG-04 | Expo biometric flag + user stored in AsyncStorage, not SecureStore | Session and auth controls decide who stays signed in and who is locked out. |
| GM-01 | CG-07 | Resend-while-live: does a new OTP invalidate the old one? | Security/credential exposure must be closed before first real users. |
| GM-01 | CG-08 | Next `ProtectedRoute` parity assumed, not line-checked | Next route-guard parity is unverified; an unguarded Next route would expose authenticated pages. |
| GM-02 | ON-Q02 | What can a worker do before they are Verified? | What an unverified worker can do is the core access-control boundary. |
| GM-02 | ON-Q03 | Where must role-appropriate verification be enforced? | Verification-enforcement scope decides where unvetted workers can be booked. |
| GM-02 | ON-P01 | Who is exempt from AHPRA gates on public shifts? | AHPRA exemption for favourites is a safety gate (AHPRA-FAV-01). |
| GM-02 | ON-Q04 | When must a worker's pay details (ABN or TFN, bank, super) be ready? | Pay details must be ready before a worker can be paid; otherwise bookings strand at payment. |
| GM-02 | ON-Q05 | What can Explorers (new to pharmacy) do with shifts? | Explorer shift access decides whether unvetted newcomers can take shifts. |
| GM-02 | ON-Q06 | How should AHPRA be re-checked after sign-up? | AHPRA re-check cadence decides whether lapsed registrations keep booking. |
| GM-02 | ON-P03 | Which AHPRA lookup should run at launch? | AHPRA lookup choice decides whether launch verifies registration at all. |
| GM-02 | ON-Q07 | If current registration cannot be confirmed, what happens to future bookings? | Unconfirmable registration must have a defined booking consequence. |
| GM-02 | ON-P02 | When the register shows Suspended or Cancelled, what happens? | Suspended/Cancelled registrations must stop future bookings immediately. |
| GM-02 | ON-Q08 | Who must pass an ID check? | ID-check scope is an identity/safety gate. |
| GM-02 | ON-R01 | How long should verification evidence be kept? | Verification-evidence retention is a privacy/legal obligation (APP 11). |
| GM-02 | ON-Q09 | Which workers must prove professional indemnity cover? | Indemnity cover is a safety/legal requirement for workers who dispense. |
| GM-02 | ON-Q10 | How should super show on ABN contractor terms? | Super on ABN contractor terms is a money/legal disclosure. |
| GM-02 | ON-Q11 | What must a pharmacy pass before posting to outside workers? | Pharmacy posting gate (PHARM-GATE-01). |
| GM-02 | ON-Q13 | Should pharmacies save a payment method during setup? | Saving a payment method at setup decides whether D02 deadlines are payable. |
| GM-02 | ON-Q14 | How do organisations (multi-site groups) join? | Organisation join path is needed for chain launch users. |
| GM-02 | ON-Q15 | Must every onboarding step work on mobile at launch? | Mobile onboarding parity is a launch gate; evidence is UNVERIFIED, do not ask until re-inspected. |
| GM-02 | GM02-Q20 | Should submitting a counter-offer on a public shift require Verified/AHPRA, like applying does? | Verification bypasses at counter-offer, manager offer, stored expiry and intern posts are safety gates. |
| GM-02 | GM02-Q21 | Should a manager be warned or blocked from offering a shift to an unverified or suspended worker? | Verification bypasses at counter-offer, manager offer, stored expiry and intern posts are safety gates. |
| GM-02 | GM02-Q22 | Should a passed AHPRA expiry date itself block new public applications, even without a fresh lookup? | Verification bypasses at counter-offer, manager offer, stored expiry and intern posts are safety gates. |
| GM-02 | GM02-Q23 | Should intern talent posts get the same AHPRA-expiry check pharmacist posts get? | Verification bypasses at counter-offer, manager offer, stored expiry and intern posts are safety gates. |
| GM-02 | GM02-Q24 | Who may skip the Australian mobile check, and what must they prove instead? | Who may skip the Australian mobile check is an identity gate. |
| GM-02 | CG-01 | No scheduled AHPRA register re-scan; only a 15-min admin alert about overdue desktop checks | Unverified or lapsed-registration workers must not be booked. |
| GM-02 | CG-03 | Stored ahpra_expiry_date not enforced at apply/accept | Unverified or lapsed-registration workers must not be booked. |
| GM-02 | CG-04 | Counter-offer submission + manager/dedicated offers bypass all verification | Unverified or lapsed-registration workers must not be booked. |
| GM-02 | CG-05 | Internal rostering never checks Verified/AHPRA, even for pharmacist/intern roles | Unverified or lapsed-registration workers must not be booked. |
| GM-02 | CG-06 | Talent-board authenticated feed still leaks full names/user IDs; only public_feed redacts | Identity must not leak before the agreed reveal. |
| GM-02 | CG-09 | Intern AHPRA expiry lives only in AhpraCheck.register_data, not on the profile | Unverified or lapsed-registration workers must not be booked. |
| GM-02 | CG-11 | BILLING_LIVE_DATE = 2025-06-01 with comment 'June 1, 2026'; FREE_TRIAL_DAYS = 0 | Billing live-date/comment contradiction decides when fees start; confirm which gate is authoritative. |
| GM-03 | GM-03-Q01 | What must a pharmacy pass before posting to outside workers? | Pharmacy posting gate decides what an unverified pharmacy can do to outside workers (PHARM-GATE-01). |
| GM-03 | GM-03-Q03 | Should pharmacies save a payment method during setup? | Saving a payment method at setup decides whether D02 deadlines are payable. |
| GM-03 | GM-03-Q04 | How do organisations (multi-site groups) join? | Organisation join path is needed for chain launch users. |
| GM-03 | GM-03-Q05 | Must every owner-setup step work on mobile (Expo) at launch — and what about Next? | Owner setup must work on mobile if Expo is a launch surface. |
| GM-03 | GM-03-Q06 | Can an owner skip adding a pharmacy forever, and should anything remind them? | An owner who can skip adding a pharmacy forever bypasses the posting gate. |
| GM-03 | GM-03-Q07 | Owner profile vs pharmacy profile: who is the legal party, and what happens when the owner isn't a pharmacist? | Legal party (owner vs pharmacy, non-pharmacist owner) decides who is liable. |
| GM-03 | GM-03-Q08 | One owner, several pharmacies: chain, organisation, or just "my pharmacies"? | One owner / several pharmacies data model governs chains and orgs at launch. |
| GM-03 | GM-03-Q09 | Can the owner change a pharmacy after shifts are posted — and what locks when? | Changing a pharmacy after posting must lock the right fields or live shifts change under workers. |
| GM-03 | GM-03-Q10 | Which pharmacy documents are required, who reviews them, and do they expire? | Pharmacy documents, reviewer and expiry decide whether a pharmacy stays verified. |
| GM-03 | GM-03-Q11 | Default rates and the payroll switch: where do they belong, and what is the default? | Default rates and the payroll switch decide what every shift pays. |
| GM-03 | GM-03-Q12 | Who verifies a pharmacy (`verified` flag), on what evidence, and is the owner told? | Who verifies a pharmacy and on what evidence is the posting gate itself. |
| GM-03 | CG-01 | Nobody can see or set `Pharmacy.verified`, and no review queue/notification exists for it. The flag is read-only in the API and invisible in both clients, yet t | Unverified or lapsed-registration workers must not be booked. |
| GM-03 | CG-02 | Verify the two ChooseAccountTypeCard targets exist and work (`/pharmacist/onboarding`, `/otherstaff/profile-basic-info`) for a converted PHARMACY_MANAGER accoun | Unverified or lapsed-registration workers must not be booked. |
| GM-03 | CG-03 | `roles/owner/shifts/create.tsx` still posts `hourly_rate` (lines 29, 84, 97, 301-302) — not a backend field. Hidden route (`app/owner/shifts/create.tsx` re-expo | Hidden legacy create-shift route posting a non-backend field can create malformed shifts. |
| GM-03 | CG-04 | Legacy cancellation-penalty checkout still live (`charge_penalty`, 10%/20%) although the register/audit said to suspend it; no UI calls it. Remove the route or  | Money must not move, or be mis-stated, without the agreed rule. |
| GM-03 | CG-05 | Stripe Price IDs still hard-coded in `charge_shift_fulfillment` (four `price_1T52…` literals); test/live cannot differ. Subscriber discount half of SH-03 is fix | Money must not move, or be mis-stated, without the agreed rule. |
| GM-03 | CG-07 | Check whether Expo enforces the web FIXED-rate four-rate rule. If not, a FIXED shift with missing day rates can fall back to `$0.00` (`posting.py` rate fallback | Invalid or zero-value data must not enter the system. |
| GM-03 | CG-09 | Next owner setup is unverified. Only a migrated `ownerSetup.ts` copy was found under `landing_next/`; no Next setup page was located. Confirm whether Next is a  | Unverified or lapsed-registration workers must not be booked. |
| GM-03 | CG-11 | `use_chemisttasker_payroll` is in neither pharmacy form (web or Expo). If GM-03-Q11 keeps it out of setup, document where the owner finds it; if it belongs in s | Payroll switch missing from both pharmacy forms hides the pay model from owners. |
| GM-03 | CG-12 | `Pharmacy.verified` does not reset when the ABN changes (ABN reset clears ABN fields only). If Q12 keeps the flag meaningful, reset/re-check it on ABN change. | Unverified or lapsed-registration workers must not be booked. |
| GM-04 | GM-04-Q01 | How do organisations (multi-site groups) join? [ex-#184 ON-Q14] — STILL VALID | Organisation join path is needed for chain launch users. |
| GM-04 | GM-04-Q02 | What is an organisation, a chain, and a region — and can one pharmacy belong to more than one? [NEW, refined by code] | Org/chain/region definitions are the launch data model. |
| GM-04 | GM-04-Q03 | What must a pharmacy pass before posting to outside workers (including its own chain/org)? [ex-#184 ON-Q11] — STILL VALID | Pharmacy posting gate, including inside its own chain/org. |
| GM-04 | GM-04-Q04 | Where must Verified / current AHPRA be enforced for chain and organisation tiers? [ex-#184 ON-Q03 + LA-P03] — STILL VALID, safety-critical | AHPRA enforcement on chain/org tiers is safety-critical. |
| GM-04 | GM-04-Q05 | What can an organisation admin do? (hierarchy, pharmacies, members, shifts) [NEW, refined] | Org-admin powers are an authorisation boundary. |
| GM-04 | GM-04-Q07 | How does org membership affect shift visibility and booking? (who counts as "in the org"?) [ex-#184 ON-Q03 context + E01/E01A] — CHANGED (member now partly defined) | Org membership decides who sees and can book org shifts (E01/E01A). |
| GM-04 | GM-04-Q08 | Who is told when a shift is cancelled, covered or replaced — are org admins told? [ex-#184 AG-Q09] — STILL VALID | Org admins must be told on cancel/cover/replace or shifts silently change. |
| GM-04 | GM-04-Q11 | Do favourite, chain and organisation incidents count toward the platform ladder? [ex-#184 CX-Q27] — NOT RE-VALIDATED | Whether chain/org incidents count toward the platform ladder affects suspension fairness; NOT RE-VALIDATED. |
| GM-04 | GM-04-Q12 | Who can see the talent board, and does "organisation" count as an employer there? [ex-#184 TB-Q01] — STILL VALID (adopted from GM-01) | Talent-board visibility for organisations is a privacy decision (AUDIENCE-01). |
| GM-04 | GM-04-Q01 | How do organisations (multi-site groups) join? | Organisation join path is needed for chain launch users. |
| GM-04 | CG-04 | Escalation only runs on shift-list load; no beat task; escalation notifies nobody | Escalation decides who is told about a shift and when it widens. |
| GM-04 | CG-05 | Talent-board anonymity leak: `list`/`retrieve` return full name/IDs; only `public_feed` redacts | Identity must not leak before the agreed reveal. |
| GM-04 | CG-06 | AHPRA expiry never enforced at apply/accept; no scheduled re-check; Verified stays true after lapse | Unverified or lapsed-registration workers must not be booked. |
| GM-04 | CG-08 | `PharmacyClaim` model exists but its API wiring is UNKNOWN — no claim endpoints in `organizations/views.py` | PharmacyClaim model exists with unknown API wiring; if claims are the org-join path it must be wired, else the join path is missing. |
| GM-05 | Q-01 | [ON-P01] ★ FIRST QUESTION — see Section 4 | Decides whether favourite locums skip the AHPRA gate (VERIFY-GATE-01/AHPRA-FAV-01). |
| GM-05 | Q-02 | [ON-Q03] Where must role-appropriate verification be enforced? | Verification-enforcement scope decides where unvetted workers can be booked. |
| GM-05 | Q-03 | [ON-Q05] What can Explorers (new to pharmacy) do with shifts? | Explorer shift access decides whether unvetted newcomers can take shifts. |
| GM-05 | Q-04 | [NEW] When a pharmacy invites someone with no account, should they become an active member immediately? | Inviting someone with no account must not silently make them an active member. |
| GM-05 | Q-05 | [NEW] Should a direct email invite ever expire, and can it be revoked? | Invite expiry/revocation is a security control; links that live forever can be abused. |
| GM-05 | Q-06 | [NEW] Who can create ORG_STAFF accounts and organisation memberships, and what does REGION_ADMIN actually scope? | ORG_STAFF creation and REGION_ADMIN scoping are authorisation boundaries. |
| GM-05 | Q-07 | [NEW] A Manager has exactly the same powers as the Owner. Keep that? | Manager having exactly the owner's powers is an authorisation decision. |
| GM-05 | Q-08 | [NEW] Invite links: who can generate them, how long do they live, and what stops abuse? | Invite-link generation, lifetime and abuse controls are security controls. |
| GM-05 | Q-09 | [NEW] What happens when a member is removed — bookings, roster, history? | Member removal must settle bookings, roster and history or orphaned work remains. |
| GM-05 | Q-11 | [NEW] The Pharmacy Manager one-time switch: what exactly happens, and is once really once? | The one-time Pharmacy Manager switch is irreversible; its exact effect must be defined. |
| GM-05 | Q-12 | [ON-Q02 + ON-11] What can a worker do before Verified, and when do they learn about payment blockers? | Pre-Verified access and early payment-blocker warnings decide whether workers strand at booking. |
| GM-05 | Q-13 | [ON-Q14] How do organisations (multi-site groups) join? (revalidated) | Organisation join path is needed for chain launch users (adopted from GM-04). |
| GM-05 | Q-15 | [ON-Q08] Who must pass an ID check? | ID-check scope is an identity/safety gate. |
| GM-05 | Q-16 | [ON-Q15 / LA-Q02 / LA-Q03] Must onboarding and account upgrades work fully on mobile at launch? | Mobile onboarding parity is a launch gate; NOT VERIFIED, do not ask until the joint re-inspection pass. |
| GM-05 | Q-17 | [LA-Q15] Web and mobile disagree on talent-board booking permissions — fix before launch? | Web/mobile talent-board booking-permission drift lets the wrong roles book; NOT VERIFIED. |
| GM-05 | CG-2 | AHPRA expiry is saved but never enforced at apply/accept (audit ON-02); only register status is checked. | Unverified or lapsed-registration workers must not be booked. |
| GM-05 | CG-3 | Platform staff (`is_staff`/`is_superuser`) can invite to any pharmacy but `user_can_change_membership()` gives them no change rights — asymmetric, probably unin | Tax/Award/super obligations must be correct before the first paid shift. |
| GM-05 | CG-4 | `MembershipInviteLink.expires_at` has no default anywhere inspected; a link created without an expiry may fail validation or live forever, depending on the view | Expiry and deadline rules decide whether slots and money strand. |
| GM-05 | CG-5 | Profile progress % counts optional fields while Verified needs email+mobile+AHPRA (audit ON-10) — drive UI from `verification_summary().missing`. | Unverified or lapsed-registration workers must not be booked. |
| GM-05 | CG-6 | `Membership.remove()` deletes chat participations and deactivates-or-deletes the row, but nothing inspected handles the removed person's future bookings/roster/ | Records, audit and deletion are legal/privacy obligations. |
| GM-05 | CG-7 | New-user invite magic link uses Django's default token (expiry = `PASSWORD_RESET_TIMEOUT`, value not inspected) while the membership it activates never expires. | Expiry and deadline rules decide whether slots and money strand. |
| GM-05 | CG-9 | `membership_covers_pharmacy()` semantics (does an org member with an empty pharmacy list cover nothing or everything?) not inspected — the region/org scoping ru | Roster/attendance correctness decides staffing and pay. |
| GM-05 | CG-10 | Frontend re-verification outstanding (429 block): mobile "add personal profile" (ON-04), Explorer shifts tab, Talent Board booking allow-lists, membership/invit | Mobile onboarding/invite screens were never re-inspected (429 block); parity is unverified. |
| GM-06 | GM-06-Q01 | Should every employed worker have a dated pay agreement (engagement), and who sets it? | A worker rostered with no pay agreement on file has no lawful pay terms. |
| GM-06 | GM-06-Q02 | Award or above Award — and what happens when the worker has a birthday (junior rates)? | Junior Award rates and birthday rate reviews are legal pay obligations. |
| GM-06 | GM-06-Q03 | Part-time contracted hours: what does the roster owe a part-timer? | Part-time contracted hours decide what the roster owes and what is paid. |
| GM-06 | GM-06-Q04 | Which leave types exist, and is leave paid, unpaid, or "the roster just changes"? | Whether leave is paid/unpaid decides pay for every leave request. |
| GM-06 | GM-06-Q06 | When leave is approved, what happens to the rostered shift? (FIRST QUESTION, see Part D) | Approved leave must do something defined to the rostered shift or the shift stays staffed by an absent worker. |
| GM-06 | GM-06-Q07 | Leave for a date range: who sees it, and should it block rostering inside the range? | Date-range leave must block rostering inside the range or double-booking follows. |
| GM-06 | GM-06-Q08 | When employment ends, what happens to the roster, the bookings, and the leave? | Employment end must settle roster, bookings and leave or orphaned shifts remain. |
| GM-06 | GM-06-Q06 | When leave is approved, what happens to the rostered shift? | Approved leave must do something defined to the rostered shift or the shift stays staffed by an absent worker. |
| GM-06 | CG-01 | No rule requires an engagement to exist before rostering; a member can be rostered with no pay terms on file | Money must not move, or be mis-stated, without the agreed rule. |
| GM-06 | CG-02 | Date-range leave notifies nobody on creation (and no decision notice was found for it either — `_notify_slot_leave_decision` only fires for slot-bound rows) | People must be told when their shift, booking or money changes. |
| GM-06 | CG-04 | `MembershipWorkSettings` (contracted minutes/pattern) and the engagement's `ordinary_hours_pattern` are two separate stores with no sync traced | Invalid or zero-value data must not enter the system. |
| GM-06 | CG-05 | No reminder or roster block for a junior rate review (birthday) approaching | People must be told when their shift, booking or money changes. |
| GM-06 | CG-06 | `WorkforceLeaveRequest` edit/cancel sends no notification (managers aren't told a request was withdrawn or changed) | People must be told when their shift, booking or money changes. |
| GM-06 | CG-07 | Two parallel roster route sets: `workforce/urls.py` (`roster/workspace`, `roster/validate`, `roster/publish`) vs `workforce/roster/urls.py` (`attendance/roster/ | Two parallel roster route sets with unknown canonical set; the wrong one may be the live one. |
| GM-07 | GM-07-Q02 | Who can build and publish a roster — owner, manager, roster manager, org admin? | Who can build and publish a roster is an authorisation boundary. |
| GM-07 | GM-07-Q04 | Should the swap/cover target have to accept before the manager approves? (carried R04C — CONTRADICTED BY THE CODE — FIRST QUESTION, see Part D) | R04C is APPROVED: swap/cover target must accept before manager approval; code transfers without consent (IMPLEMENTATION_GAP). |
| GM-07 | GM-07-Q05 | Who can be asked to cover — named colleagues only, or favourites and the public too? (carried R04B) | R04B is APPROVED: named colleagues for cover; widening needs a manager (IMPLEMENTATION_GAP). |
| GM-07 | GM-07-Q06 | The "publish cover" setting: build it, or delete it? (carried R04A + LA-Q11) | R04A is APPROVED: owner-controlled cover publication; the setting has no backend effect (IMPLEMENTATION_GAP). |
| GM-07 | GM-07-Q07 | When cover is needed, should the shift become a visible vacancy ("needs cover")? | R06 is APPROVED: needs-cover uses the SAME Shift/Slot; display not built (IMPLEMENTATION_GAP). |
| GM-07 | GM-07-Q08 | How late can a swap or cover request come in — and what happens near the start? | Late swap/cover deadlines decide whether last-minute changes can strand a shift. |
| GM-07 | GM-07-Q09 | When a shift changes hands, whose pay terms apply — and what does the worker see? | Pay terms on handover decide who is paid what when a shift changes hands. |
| GM-07 | GM-07-Q10 | Release to the marketplace: which audience, and who decides the tier? | Release-to-marketplace audience and tier decide who sees a released shift. |
| GM-07 | GM-07-Q04 | Should the swap/cover target have to accept before the manager approves? | R04C is APPROVED: swap/cover target must accept before manager approval; code transfers without consent (IMPLEMENTATION_GAP). |
| GM-07 | CG-01 | Reject reason classification is a substring hack: SWAP vs COVER is decided by whether the word "swap" appears in the request note | Reject reason decided by substring ('swap' in the note) misclassifies cover rejections. |
| GM-07 | CG-03 | No notifications on swap/cover request, approval, rejection, or release (none found in `worker_actions.py`) | People must be told when their shift, booking or money changes. |
| GM-07 | CG-04 | No notification on roster unpublish (whole week or single shift) was found | People must be told when their shift, booking or money changes. |
| GM-07 | CG-05 | No expiry/cleanup for pending swap/cover requests (a request can stay PENDING after its shift has passed) | Expiry and deadline rules decide whether slots and money strand. |
| GM-07 | CG-07 | Two parallel roster route sets: `workforce/urls.py` (`roster/workspace`, `roster/validate`, `roster/publish`) vs `workforce/roster/urls.py` (`attendance/roster/ | Two parallel roster route sets with unknown canonical set; the wrong one may be the live one. |
| GM-07 | CG-08 | Roster screens (build/publish/approve) not traced on any client — Vite, Next and Expo parity is UNKNOWN, not "no gap" | Roster screens untraced on all clients; parity is unknown, not 'no gap'. |
| GM-08 | GM-08-Q01 | Who is allowed to clock in — and should a verified locum with no booking be able to walk in and work? (FIRST QUESTION, see Part D) | Clock-in eligibility decides who can work and be paid; walk-in locums are a pay/authz risk. |
| GM-08 | GM-08-Q02 | Provisional attendance: who approves it, how fast, and what if nobody does? | Provisional attendance without approval rules means unapproved work and pay liability. |
| GM-08 | GM-08-Q03 | When does a missing worker become a no-show? (carried CX-Q11) — STILL VALID | No-show timing decides pay, incidents and cover. |
| GM-08 | GM-08-Q04 | Late arrival, early departure, early finish: is there a grace period, and what counts? (carried CX-Q12) — STILL VALID | Late/early grace rules decide what is paid for partial attendance. |
| GM-08 | GM-08-Q05 | Offline kiosk: how long may it run offline, and what happens to suspicious events? | Offline kiosk limits, replay and clock-skew rules decide whether attendance evidence is trustworthy. |
| GM-08 | GM-08-Q06 | PIN clock-in: keep it, who sets the PIN, and is 5-tries / 15-minutes right? (NEW) | PIN clock-in security (who sets it, lockout) is an attendance-fraud control. |
| GM-08 | GM-08-Q08 | Manager corrections: who can correct, and how does a worker dispute one? (carried CX-Q33) — STILL VALID | Manager corrections and worker disputes decide pay accuracy. |
| GM-08 | GM-08-Q09 | Breaks: paid or unpaid, how long, and who decides? (NEW, boundary with GM-09/GM-14) | Paid vs unpaid breaks decide pay for every shift. |
| GM-08 | GM-08-Q10 | Can a manager clock someone in or out for them? (MANAGER source) (NEW) | Manager clocking someone in/out for them is a fraud risk without controls. |
| GM-08 | GM-08-Q11 | What does attendance hand to the timesheet — and what marks a shift complete? (carried CX-Q32 / CX-R01, GM-09 boundary) | Attendance-to-timesheet handover decides what is paid and what marks a shift complete. |
| GM-08 | GM-08-Q01 | Who is allowed to clock in — and should a verified locum with no booking be able to walk in and work? | Clock-in eligibility decides who can work and be paid; walk-in locums are a pay/authz risk. |
| GM-08 | CG-01 | `sync_offline_batch` verification rules not line-read — the exact accept / NEEDS_REVIEW / reject conditions are UNKNOWN | Offline-sync verdict rules were not line-read; accept/NEEDS_REVIEW/reject conditions are unknown. |
| GM-08 | CG-02 | `credentials.py` not line-read — QR signing, PIN verification, pairing-code bodies unverified | QR signing, PIN verification and pairing-code bodies unverified; read before touching them. |
| GM-08 | CG-03 | No notifications on clock-in, provisional approval/rejection, or corrections (none found in `transitions.py`, `approvals.py`, `worker_actions.py`) | People must be told when their shift, booking or money changes. |
| GM-08 | CG-05 | No auto clock-out / no open-session cleanup was found (a forgotten clock-out leaves the session open indefinitely) | Session and auth controls decide who stays signed in and who is locked out. |
| GM-08 | CG-06 | No notification on roster unpublish affecting attendance (a worker's shift disappears while their clock-in window was open) | People must be told when their shift, booking or money changes. |
| GM-08 | CG-07 | Kiosk/attendance screens not traced on any client — Vite, Next and Expo parity is UNKNOWN, not "no gap" | Kiosk/attendance screens untraced on all clients; parity is unknown, not 'no gap'. |
| GM-08 | CG-08 | `attendance_tests/` directory + `backend/attendance/test_.py` (14 files) were listed but not read — test coverage for the traced behaviours is UNKNOWN (which of | Attendance test coverage is unknown (14 test files listed, none read; pass/fail at head unknown). |
| GM-09 | Q1 | Who pays whom, and when? (payment ownership — ASK FIRST, see §4) | Who pays whom, and when, is the money model for every shift; nothing else can be priced until it is decided. |
| GM-09 | Q2 | How is a timesheet created, and from what source of truth? | Timesheet source of truth decides what hours are paid. |
| GM-09 | Q3 | Who approves a timesheet, by when, and what happens if nobody does? | Approval deadline and auto-approval decide when pay is released. |
| GM-09 | Q4 | How are corrections handled before and after approval? | Corrections before/after approval decide pay accuracy. |
| GM-09 | Q5 | Which rate applies: base, overtime, weekend and public-holiday premiums? | Base/overtime/weekend/public-holiday rates are Award pay obligations. |
| GM-09 | Q6 | What does the payroll export contain, and where does it go? | Payroll export is how staff actually get paid; no export means no payroll run. |
| GM-09 | Q7 | ABN and TFN: what is collected, from whom, and how is it stored? | ABN/TFN collection and storage is tax and privacy law. |
| GM-09 | Q8 | How does a worker or pharmacy dispute hours or pay, and who decides? | Hours/pay disputes need a decider or pay is contested with no resolution. |
| GM-09 | Q9 | What records are kept, for how long, and who can see a worker's pay history? | Pay-history retention and visibility is a privacy/records obligation. |
| GM-09 | Q10 | What happens on the failure paths: no-show, early departure, shift cancelled mid-way, kiosk offline? | Failure paths (no-show, early departure, mid-shift cancel, offline kiosk) decide pay in every edge case. |
| GM-09 | CG-09-01 | `TimesheetCorrectionRequest` model exists but has NO API endpoint — unreachable via API (`models.py` vs `views.py`/`urls.py`/`transitions.py`) | Money must not move, or be mis-stated, without the agreed rule. |
| GM-09 | CG-09-02 | No notifications on ANY timesheet event (build, submit, approve, reopen, lock, correct, comment, check decision) — no notify/email/push calls in the workforce t | Money must not move, or be mis-stated, without the agreed rule. |
| GM-09 | CG-09-03 | No export endpoint (no CSV, no payroll export) and no export button on the manager page | No payroll export endpoint or button; staff cannot be paid from the system. |
| GM-09 | CG-09-04 | No money/rate/pay fields in the timesheet API or UI — minutes only | No money/rate/pay fields in the timesheet API or UI; timesheets are minutes-only. |
| GM-09 | CG-09-05 | TimesheetPeriod statuses REVIEW and APPROVED exist in the model but NO transition to them was found in the files read | Money must not move, or be mis-stated, without the agreed rule. |
| GM-09 | CG-09-06 | No reject state on a timesheet (only reopen / check decisions) | Money must not move, or be mis-stated, without the agreed rule. |
| GM-09 | CG-09-07 | No approval deadline, no auto-approval, no escalation | Escalation decides who is told about a shift and when it widens. |
| GM-09 | CG-09-08 | Manifest is a "future payroll/integration boundary" — nothing consumes it; `payroll.py` is a 20-line helper | Payroll manifest is unconsumed; payroll.py is a 20-line helper; no payroll boundary exists. |
| GM-09 | CG-09-09 | Open sessions (no clock-out) count worked minutes up to `min(now, period end)` with `open_session: true` — inflates worked time instead of blocking | Open sessions inflate worked minutes to now/period-end instead of blocking. |
| GM-09 | CG-09-10 | ROSTER_WITHOUT_ATTENDANCE is a BLOCKER, so a kiosk outage / missed punch blocks the whole timesheet until corrected at the attendance source | ROSTER_WITHOUT_ATTENDANCE blocks the whole timesheet on a kiosk outage/missed punch. |
| GM-10 | 1.2 Rates | what the worker sees (PO-Q03, resolved) | Invalid or zero-value data must not enter the system. |
| GM-10 | GM-10-Q01 | Who can post a shift, and from where? | Who can post a shift, and from where, is an authorisation boundary. |
| GM-10 | GM-10-Q02 | What fields are required to post a shift, and what happens when one is missing? | Required posting fields decide whether shifts are complete enough to book safely. |
| GM-10 | GM-10-Q03 | Must a shift carry a fixed hourly rate at posting, or can the rate be open/negotiable? [FIRST — see §3] | Fixed vs negotiable rate decides every transaction's price (RATE-01, after payer model and Award floor). |
| GM-10 | GM-10-Q04 | How are overtime, weekend and public-holiday loadings handled? | Overtime/weekend/public-holiday loadings are Award pay obligations. |
| GM-10 | GM-10-Q05 | Dates, times and timezones: what guards exist, and what time does the worker see? | Date/time/timezone guards decide the legal work date and DST correctness. |
| GM-10 | GM-10-Q06 | Can a posted shift be edited, and what changes after interest or acceptance? | Editing a posted shift after interest/acceptance changes agreed terms without consent. |
| GM-10 | GM-10-Q07 | Can a posted shift be withdrawn, and what happens to workers who already saw it or applied? | Withdrawal must notify workers who saw or applied, or they arrive for a cancelled shift. |
| GM-10 | GM-10-Q08 | Must a pharmacy pass any verification check before posting, and does it differ by audience? | Verification gate before posting decides whether unverified pharmacies reach outside workers. |
| GM-10 | GM-10-Q11 | What does posting trigger (notifications, fees, matching), and what do edit/withdraw/repost trigger? | Posting triggers (notifications, fees, matching) include the booking fee; a wrong trigger charges wrongly. |
| GM-10 | GM-10-Q12 | NEW: Can a shift ever be posted, displayed or paid at $0.00? | A $0.00 payable rate is confirmed in code; shifts must not be payable at $0. |
| GM-10 | CG-10-01 | No past-date guard anywhere (shared validation, slot serializer, `ShiftSlot.clean`) | Invalid or zero-value data must not enter the system. |
| GM-10 | CG-10-04 | FIXED shift can be created at $0.00 (default cascade ends at `Decimal('0.00')`) | Invalid or zero-value data must not enter the system. |
| GM-10 | CG-10-05 | Silent $0 fallback on pricing error (`get_locked_rate_for_slot` returns `DECIMAL_ZERO`; preview returns `"0.00"`) | Invalid or zero-value data must not enter the system. |
| GM-10 | CG-10-06 | PHARMACIST_PROVIDED with a missing worker rate preference raises `KeyError` (`pricing.py`) | Invalid or zero-value data must not enter the system. |
| GM-10 | CG-10-08 | Rate/role/payment edits allowed with PENDING or ACCEPTED offers; no re-notify / re-confirmation (`revise_shift`) | Money must not move, or be mis-stated, without the agreed rule. |
| GM-10 | CG-10-09 | Deleting a shift with PENDING interests/offers sends no notice (no delete hook) | Records, audit and deletion are legal/privacy obligations. |
| GM-10 | CG-10-10 | No duplicate-post / idempotency guard; two managers can post the same slot | Safety/legal/money/privacy default: no concrete reason in the area file to defer it. |
| GM-10 | CG-10-11 | Overtime not computed (flagged for payroll review only) | Money must not move, or be mis-stated, without the agreed rule. |
| GM-10 | CG-10-12 | No Next post-shift page found (search-only) | No Next post-shift page found; if Next is a launch surface, owners there cannot post. |
| GM-11 | GM-11-Q01 | When a shift escalates, who is told, and when does escalation stop? 🔴 [FIRST — see §4] | Escalation notices and stopping rules decide who is told and when a shift stops widening (E01A). |
| GM-11 | GM-11-Q02 | Should escalation pause while an offer waits for an answer? 🟠 | Whether escalation pauses while an offer waits decides whether a live offer is undercut. |
| GM-11 | GM-11-Q03 | How late may a scheduled escalation fire? 🔴 (code gap once decided) | How late escalation may fire decides whether workers are woken for dead shifts. |
| GM-11 | GM-11-Q04 | Fix before launch? Scheduled escalation only runs when someone loads a shift list. 🔴 (code gap) | Scheduled escalation only runs on shift-list load; without a job, escalation silently never happens. |
| GM-11 | GM-11-Q05 | Fix before launch? Match emails miss escalated shifts and reach unverified workers. 🟠 (code gap) | Match emails miss escalated shifts and reach unverified workers. |
| GM-11 | GM-11-Q07 | On an anonymous public post, what is hidden? 🟡 | What is hidden on an anonymous public post is a privacy rule. |
| GM-11 | GM-11-Q08 | When does an anonymous pharmacy's name reach the worker? 🟠 | When an anonymous pharmacy's name reaches the worker is a privacy rule. |
| GM-11 | GM-11-Q10 | When an offer is declined or expires, what happens to the shift's audience? 🟠 | Declined/expired offers must resume escalation or re-offer, or shifts die silently. |
| GM-11 | GM-11-Q11 | Who sees a shift, and can apply, at each tier — and what is gated? 🟡 | Who sees and can apply at each tier, and what is gated, is the verification boundary (VERIFY-GATE-01). |
| GM-11 | GM-11-Q12 | Do notification flags control escalation notices per tier, and is there an organisation-wide broadcast? 🟡 | Notification flags per tier and org-wide broadcast decide whether notices leak across tenants. |
| GM-11 | GM-11-Q13 | NEW: A favourite loses visibility when the shift escalates past LOCUM_CASUAL — keep it or fix it? 🟠 | E01A is APPROVED: widened audiences retain earlier eligible visibility; favourites losing visibility is an implementation gap. |
| GM-11 | GM-11-Q01 | When a shift escalates, who is told, and when does escalation stop? | Escalation notices and stopping rules decide who is told and when a shift stops widening (E01A). |
| GM-11 | CG-11-01 | No scheduled escalation job; lazy per-request scan in `base.py:get_queryset`; `celery.py` schedules only goods marketplaces | Escalation decides who is told about a shift and when it widens. |
| GM-11 | CG-11-03 | Any-interest stop rule (`escalation.py:interests__isnull=True`); no resume path | Escalation decides who is told about a shift and when it widens. |
| GM-11 | CG-11-04 | Escalation sends no notification at any tier | Escalation decides who is told about a shift and when it widens. |
| GM-11 | CG-11-05 | Match emails only on direct-to-PLATFORM posting; recipients not Verified-filtered | Unverified or lapsed-registration workers must not be booked. |
| GM-11 | CG-11-07 | PLATFORM escalation step silently skipped while pharmacy at daily public-shift limit (`escalation.py`) — no notice the step was skipped | Escalation decides who is told about a shift and when it widens. |
| GM-11 | CG-11-08 | `SHIFT_EMAIL_RECIPIENT_CAP = 50` — recipients beyond 50 silently not emailed at posting | People must be told when their shift, booking or money changes. |
| GM-11 | CG-11-09 | Anonymous PLATFORM post gets NO notices at all (`announcements.py` anonymous narrowing) | Identity must not leak before the agreed reveal. |
| GM-12 | 1 | Where must Verified + current AHPRA be enforced? | Unverified or lapsed-registration workers must not be booked. |
| GM-12 | 2 | What can a worker do before they are Verified? | Unverified or lapsed-registration workers must not be booked. |
| GM-12 | 3 | Who is exempt from AHPRA gates on public shifts? | Unverified or lapsed-registration workers must not be booked. |
| GM-12 | 4 | When must a worker's pay details (ABN/TFN, bank, super) be ready? | Money must not move, or be mis-stated, without the agreed rule. |
| GM-12 | 8 | How should applicants be ordered for the pharmacy? | Booking integrity decides whether one shift is promised twice. |
| GM-12 | 9 | What should the pharmacy see on each applicant? (incl. reveal) | Identity must not leak before the agreed reveal. |
| GM-12 | 10 | How long does an offer stay open? | Booking integrity decides whether one shift is promised twice. |
| GM-12 | 11 | When an offer is declined or expires, what happens to the shift? | Expiry and deadline rules decide whether slots and money strand. |
| GM-12 | 12 | Can a pharmacy offer one shift to several workers at once? | Booking integrity decides whether one shift is promised twice. |
| GM-12 | 14 | If the pharmacy accepts a counter-offer, is the worker booked? | Booking integrity decides whether one shift is promised twice. |
| GM-12 | 15 | When payment is required, should the first acceptance hold the slot against rival offers? | Money must not move, or be mis-stated, without the agreed rule. |
| GM-12 | 16 | Can the pharmacy withdraw a pending offer? What is the worker told? | Booking integrity decides whether one shift is promised twice. |
| GM-12 | 17 | Should withdrawing interest tell the pharmacy? | Booking integrity decides whether one shift is promised twice. |
| GM-12 | 18 | Is 'Request booking' (Talent Board) a firm offer or an enquiry? | Booking integrity decides whether one shift is promised twice. |
| GM-12 | 19 | When a shift escalates, who is told, and does a pending offer pause it? | Escalation decides who is told about a shift and when it widens. |
| GM-12 | 20 | Can a worker drop a reservation before payment without an incident? | Money must not move, or be mis-stated, without the agreed rule. |
| GM-12 | 21 | When a worker is booked, what happens to their overlapping applications? | Booking integrity decides whether one shift is promised twice. |
| GM-12 | 22 | Can a worker hold a reservation that overlaps another booking or roster shift? | Booking integrity decides whether one shift is promised twice. |
| GM-12 | 24 | Should reservations show a live payment countdown? / What happens after booking payment fails? | Money must not move, or be mis-stated, without the agreed rule. |
| GM-12 | CG-01 | `_require_public_shift_onboarding` (`interest.py:40`) appears unused; `express_interest` uses `require_public_ahpra` instead. Delete it or wire it — and confirm | Unverified or lapsed-registration workers must not be booked. |
| GM-12 | CG-02 | Offer expiry is lazy only (`offers.py:182`, `:355`); no scheduled expiry job visible in inspected files; no cap at shift start anywhere inspected. (SH-07; LA-Q0 | Expiry and deadline rules decide whether slots and money strand. |
| GM-12 | CG-03 | Rival offers are not expired in the payment-required accept branch (`offers.py:437-448` — expiry only in the no-payment branch). The slot lock prevents a true d | Money must not move, or be mis-stated, without the agreed rule. |
| GM-12 | CG-04 | Auto-escalation has no notification and never resumes after any interest (`escalation.py:81-92`). Notification part is a build; resume rule needs Q11/Q19 (GM-11 | Escalation decides who is told about a shift and when it widens. |
| GM-12 | CG-06 | No pharmacy withdraw-offer action in `ShiftOfferViewSet` (`offers.py:163-726`) or `base.py`. Build after Q16 is answered. | Booking integrity decides whether one shift is promised twice. |
| GM-12 | CG-08 | Interest withdraw is a silent DELETE with no notification (`offers.py:48`). Build after Q17. | People must be told when their shift, booking or money changes. |
| GM-12 | CG-09 | `finalize_shift_offer` has no overlap handling: nothing withdraws the worker's other pending interests/offers on other shifts, nothing blocks cross-shift overla | Booking integrity decides whether one shift is promised twice. |
| GM-12 | CG-10 | Re-offering an existing PENDING offer refreshes rate/times but does NOT refresh `expires_at` (`assignment.py:offer_shift`) — a re-offer silently shortens the wo | Session and auth controls decide who stays signed in and who is locked out. |
| GM-12 | CG-11 | `claim_shift` silently skips taken slots (partial claim possible without telling the worker, `browse.py:249`). Confirm deliberate or surface it after Q06/Q07. | Invalid or zero-value data must not enter the system. |
| GM-12 | CG-13 | No `reservations.py` module and no reservation-expiry job found; D03 reservation-expiry implementation untraced (GM-13 territory). Confirm where reservations ex | Expiry and deadline rules decide whether slots and money strand. |
| GM-13 | GM13-Q01 | The pay-by window does not exist. Should D02 be built as decided, or is Stripe's 24 hours the rule? (carried D02 — FIRST QUESTION, see Part D) | D02/D03 are APPROVED owner rules with no implementation; money must not be taken without a pay-by deadline and same-audience expiry. |
| GM-13 | GM13-Q02 | When a reservation expires unpaid, what exactly happens? (carried D03) | D02/D03 are APPROVED owner rules with no implementation; money must not be taken without a pay-by deadline and same-audience expiry. |
| GM-13 | GM13-Q04 | Can a worker drop a reservation before payment without an incident? (carried BK-Q14) | Dropping a reservation before payment without an incident decides worker penalties. |
| GM-13 | GM13-Q05 | How long does an offer stay open? (carried BK-Q05 / LA-Q09 / SH-07) | Offer-open duration decides how long a slot is held; uncapped offers outlive the shift. |
| GM-13 | GM13-Q06 | When an offer is declined or expires, what happens to the shift? (carried BK-Q06) | Declined/expired offers must have a defined fallback or shifts die silently. |
| GM-13 | GM13-Q07 | Can a pharmacy offer one shift to several workers at once? (carried BK-Q07) | Parallel offers decide whether one shift can be promised to several workers at once. |
| GM-13 | GM13-Q08 | What happens after booking payment fails? (carried BK-R01; SH-13 has no definition) | Payment-failure handling decides whether a failed checkout strands or double-charges. |
| GM-13 | GM13-Q09 | Payment arrives after expiry: credit, refund, or nothing — and who decides? (carried F04; GM-17 boundary) | Late payment (after expiry) credit/refund/nothing decides who keeps the money. |
| GM-13 | GM13-Q10 | Should pharmacies save a payment method during setup? (carried ON-Q13 / ON-08) | Saving a payment method at setup decides whether D02 deadlines are payable. |
| GM-13 | GM13-Q11 | When must worker pay details be ready — and who sees the gap early? (carried ON-Q04 / ON-11; GM-14 owns the wording) | Pay-readiness timing decides whether workers strand at payment. |
| GM-13 | GM13-Q12 | The old 10%/20% penalty route is still live. Remove it? (carried LA-Q06 / SH-02; GM-16 owns the charge) | The live 10%/20% penalty route must be removed before launch; it contradicts the no-penalty rule. |
| GM-13 | GM13-Q13 | AHPRA cancellation strands the payment reservation. Fix the release? (carried LA-P01) | AHPRA cancellation stranding a payment reservation leaves money and a shift stuck (LA-P01). |
| GM-13 | CG-1 | D02 not implemented (no deadline field, no bands, no expiry job). Build after Q01 = A/B/C. | Expiry and deadline rules decide whether slots and money strand. |
| GM-13 | CG-2 | No expiry job at all (`CELERY_BEAT_SCHEDULE` has no reservation/offer/escalation job). The Oct "expiry every 60 s" claim is false at this head. | Escalation decides who is told about a shift and when it widens. |
| GM-13 | CG-3 | LA-P01: AHPRA-cancel path strands the checkout reservation + Stripe session (F07). Fix before launch (Q13). | Unverified or lapsed-registration workers must not be booked. |
| GM-13 | CG-4 | Owner pay card shows `$n × 30 AUD` always (`ActiveShiftCard.tsx`, Expo `ActiveShiftCards.tsx`): PT/FT $80 and the subscriber $15/$40 are not reflected in the di | Owner pay card shows $n x 30 AUD always; PT/FT $80 and subscriber $15/$40 are not reflected — the displayed price is wrong while the server charges the right price. |
| GM-13 | CG-5 | No missed-webhook recovery: no polling/reconciliation job; a paid checkout whose webhook never arrives stays unfinalised until manual reconciliation. (Webhook d | Roster/attendance correctness decides staffing and pay. |
| GM-13 | CG-6 | `auto_escalate_due_shifts` has no schedule: the function exists (`escalation.py:81`) but no beat entry calls it and no caller was found in the traced files — es | Escalation decides who is told about a shift and when it widens. |
| GM-13 | CG-7 | Next has no pay UI: the migrated ShiftsBoard contains no payment section; an owner on Next cannot pay a reservation from the Next surface as traced. | Money must not move, or be mis-stated, without the agreed rule. |
| GM-13 | CG-8 | SH-13 is undefined: `AUDIT.md` contains no SH-13 definition; only BK-R01's `gap` field cites it. Define it or drop the citation. | Records, audit and deletion are legal/privacy obligations. |
| GM-14 | GM14-Q01 | Who ever decides whether super is payable for an ABN contractor — and what happens until they do? (new, from verified code) | Super for ABN contractors is undecided in code (always False); money/legal obligation. |
| GM-14 | GM14-Q02 | What must the worker see before accepting? (carried AG-Q01 / SH-09) | What the worker sees before accepting is the disclosure that makes terms enforceable. |
| GM-14 | GM14-Q03 | Does the pharmacy accept the same agreement? (carried AG-Q02 / SH-09 — FIRST QUESTION, see Part D) | Pharmacy must accept the same agreement, logged with time + version (ACCEPT-01). |
| GM-14 | GM14-Q04 | How is employee vs contractor status decided? (carried AG-Q04) | Employee vs contractor classification is a legal/tax determination. |
| GM-14 | GM14-Q05 | When must worker pay details be ready — and who sees the gap early? (carried ON-Q04 / ON-11) | Pay-readiness timing decides whether workers strand at payment. |
| GM-14 | GM14-Q07 | Which changes after booking need the worker's new consent? (carried AG-Q05 / SH-08 — NOT RE-VALIDATED) | Post-booking changes needing new consent decide whether terms can change under a worker; NOT RE-VALIDATED. |
| GM-14 | GM14-Q08 | Until the worker answers a change, which terms apply? (carried AG-Q06 — NOT RE-VALIDATED) | Which terms apply until the worker answers decides the binding terms; NOT RE-VALIDATED. |
| GM-14 | GM14-Q09 | If the worker rejects the change, what happens? (carried AG-Q07 — NOT RE-VALIDATED) | What happens if the worker rejects a change decides whether the booking survives; NOT RE-VALIDATED. |
| GM-14 | GM14-Q10 | Until re-consent is built, lock key fields after the first acceptance? (carried AG-Q08 / SH-08 — NOT RE-VALIDATED) | Locking key fields after first acceptance is the interim protection until re-consent is built; NOT RE-VALIDATED. |
| GM-14 | GM14-Q11 | Booking fees: GST and tax invoice? (carried LA-R01 / SH-15; jointly GM-16-Q15 / GM-17-Q06) | Booking-fee GST and tax invoice are tax obligations. |
| GM-14 | GM14-Q12 | (new) Who updates the Award rates, and when? (from verified code) | Award rates are hard-coded with no update owner; stale rates underpay workers. |
| GM-14 | CG-1 | No pharmacy acceptance recorded (Q03). Add acceptance logging at offer-send + subscribe/booking (needs the Q03 decision on when, then it is a build). | Records, audit and deletion are legal/privacy obligations. |
| GM-14 | CG-2 | Terms snapshot lacks cancellation table, platform terms version, breaks, duties, site details (Q02 / SH-09). Add once GM-15 decides the table. | Charges and terms need legal review and disclosure before they bind anyone. |
| GM-14 | CG-3 | `super_payable_confirmed` is always `False` (Q01). No workflow ever sets it — build the review workflow once Q01 is decided. | Tax/Award/super obligations must be correct before the first paid shift. |
| GM-14 | CG-4 | Award rates are hard-coded 01Jul26 dollars with no update mechanism (Q12). Name an owner + a review date. | Tax/Award/super obligations must be correct before the first paid shift. |
| GM-14 | CG-5 | No PDF/downloadable copy of the agreed terms (Q06). | Charges and terms need legal review and disclosure before they bind anyone. |
| GM-14 | CG-6 | No GST treatment or tax invoice anywhere (Q11). Needs the tax decision first, then it is a build. | Money must not move, or be mis-stated, without the agreed rule. |
| GM-14 | CG-7 | Payroll deferral is silent: a TFN worker can accept and work timesheet-only indefinitely with no reminder that payroll (and super) was never activated. A nudge/ | Money must not move, or be mis-stated, without the agreed rule. |
| GM-15 | 1.10 Notifications on cancel/cover/replace (AG-Q09/Q10) | 1.10 Notifications on cancel/cover/replace (AG-Q09/Q10) | People must be told when their shift, booking or money changes. |
| GM-15 | GM15-01 | CX-Q01 · What cancellation can launch, given fees are not yet enforceable? [STILL VALID] | What cancellation can launch, given fees are not yet enforceable, defines the whole launch cancellation policy. |
| GM-15 | GM15-02 | CX-Q02 · Who receives the owner cancellation fee? [STILL VALID] | Who receives the owner cancellation fee decides where cancellation money goes. |
| GM-15 | GM15-03 | CX-Q03 · If the pharmacy cancels an unpaid reservation, is any fee due? [STILL VALID] | Whether a fee is due on cancelling an unpaid reservation decides money on the commonest cancel path. |
| GM-15 | GM15-04 | CX-Q04 · At exactly 72h / 24h / 12h / 2h, which band applies? [CHANGED] | Cancellation-band boundaries decide the fee at exactly 72/24/12/2h. |
| GM-15 | GM15-06 | CX-Q06 · Inside the window, who is alerted and how fast? [STILL VALID] | Who is alerted inside the window, and how fast, decides whether cover can be found. |
| GM-15 | GM15-07 | CX-Q07 · If no manager answers before start and the worker doesn't come, what is it? [STILL VALID] | No manager answer before start decides whether a missing worker is a no-show with pay/incident consequences. |
| GM-15 | GM15-08 | CX-Q08 · How is a mutually agreed cancellation proven and approved? [STILL VALID] | Mutual cancellation needs proof and approval or either side can claim agreement. |
| GM-15 | GM15-11 | CX-Q11 · When does a missing worker become a no-show? [STILL VALID] | No-show timing decides pay, incidents and cover. |
| GM-15 | GM15-12 | CX-Q12 · How is late arrival treated? [STILL VALID] | Late-arrival treatment decides pay for partial attendance. |
| GM-15 | GM15-13 | CX-Q13 · How is a no-show confirmed? [STILL VALID] | No-show confirmation decides when incidents and pay consequences apply. |
| GM-15 | GM15-14 | CX-Q14 · If a worker cancels several dates of one booking, how many incidents is that? [STILL VALID] | Counting incidents per cancelled date decides the reliability ladder. |
| GM-15 | GM15-15 | CX-Q15 · After a confirmed booking is cancelled, how does the shift reopen? [STILL VALID] | How a cancelled shift reopens decides whether it can be refilled safely. |
| GM-15 | GM15-16 | CX-Q16 · Can the manager release a no-show's slot and repost straight away? [STILL VALID] | Releasing a no-show's slot and reposting decides whether the slot can be double-filled. |
| GM-15 | GM15-17 | CX-Q17 · If a worker's cancelled shift is filled by a replacement, what happens to the incident? [STILL VALID] | Whether a replaced shift clears the incident decides ladder fairness. |
| GM-15 | GM15-19 | CX-Q19 · When the pharmacy cancels a paid booking, what happens to the booking fee? [STILL VALID] | Pharmacy cancelling a paid booking: refund/credit/nothing decides money (REFUND-01). |
| GM-15 | GM15-20 | CX-Q20 · When the worker cancels or no-shows, what happens to the booking fee? [STILL VALID] | Worker cancelling/no-show: what happens to the booking fee decides money. |
| GM-15 | GM15-21 | CX-Q21 · Who approves refunds and credits? [STILL VALID] | Who approves refunds and credits decides whether money moves with oversight. |
| GM-15 | GM15-22 | CX-Q22 · How is the worker's cancellation pay paid out? [STILL VALID] | How worker cancellation pay is paid out decides money owed to workers. |
| GM-15 | GM15-23 | CX-Q23 · Who reviews disputes and appeals? [STILL VALID] | Who reviews disputes and appeals decides whether disputes have a decider. |
| GM-15 | GM15-25 | CX-Q25 · Who can see each part of a dispute? [STILL VALID] | Who can see each part of a dispute is a privacy rule. |
| GM-15 | GM15-26 | CX-Q26 · Which events count as an incident? [STILL VALID] | Which events count as incidents decides the reliability ladder. |
| GM-15 | GM15-27 | CX-Q27 · Do favourite, chain and organisation incidents count toward the platform ladder? [STILL VALID] | Whether chain/org incidents count toward the ladder affects suspension fairness. |
| GM-15 | GM15-28 | CX-Q28 · How far back does the ladder count? [STILL VALID] | How far back the ladder counts decides suspension fairness. |
| GM-15 | GM15-30 | CX-Q30 · What process applies before permanent suspension? [STILL VALID] | Process before permanent suspension is a fairness/legal safeguard. |
| GM-15 | GM15-32 | CX-Q32 · What marks a shift complete? [STILL VALID] | What marks a shift complete decides when wages become payable. |
| GM-15 | GM15-33 | CX-Q33 · How are disputed hours settled? [STILL VALID — PARTIAL] | Disputed hours settlement decides pay accuracy. |
| GM-15 | GM15-34 | CX-R01 · How are early finishes and extra hours paid? [STILL VALID] | Early finishes and extra hours pay decide money for partial shifts. |
| GM-15 | GM15-37 | CX-Q36 · Do cancelled, expired and no-show shifts stay in both sides' history? [STILL VALID] | Whether cancelled/expired/no-show shifts stay in history decides records and disputes. |
| GM-15 | GM15-38 | AG-Q09 · Who is told when a shift is cancelled, covered or replaced? [STILL VALID] | Who is told on cancel/cover/replace decides whether people learn their shift changed. |
| GM-15 | GM15-39 | AG-Q10 · Which channels carry those notices? [STILL VALID] | Which channels carry cancel notices decides whether the message arrives. |
| GM-15 | GM15-40 | BK-Q14 · Can a worker drop a reservation before payment without an incident? [STILL VALID] | Dropping a reservation before payment without an incident decides worker penalties. |
| GM-15 | GM15-41 | BK-R01 · What happens after booking payment fails? [STILL VALID — strengthened] | Payment-failure handling decides whether a failed checkout strands or double-charges. |
| GM-15 | GM15-43 | TB-Q09 · Can a pharmacy block a worker? [STILL VALID] | Whether a pharmacy can block a worker is a safety control. |
| GM-15 | GM15-44 | LA-P01 · AHPRA cancellation leaves a shift stuck as waiting for payment [CHANGED — PARTIAL] | AHPRA cancellation leaving a shift stuck waiting for payment strands money and the shift. |
| GM-15 | GM15-45 | LA-P02 · AHPRA cancellations bypass the cancellation policy and notices [STILL VALID] | AHPRA cancellations bypassing policy and notices leave workers and pharmacies uninformed. |
| GM-15 | GM15-46 | LA-Q06 / SH-02 · The old 10%/20% penalty route is still live [CHANGED — WORSE + GATED] | The live 10%/20% penalty route must be removed before launch. |
| GM-15 | GM15-47 | LA-Q10 / SH-09 · Accepted terms don't include the cancellation table or terms version [CHANGED — PARTIAL] | Accepted terms must include the cancellation table and terms version or charges are undisclosed. |
| GM-15 | GM15-48 | LA-P03 (context, GM-15 adjacent) · Chain and organisation shifts skip the AHPRA gate [STILL VALID — noted, owned by GM-02/GM-04] | Chain/org shifts skipping the AHPRA gate is a safety hole. |
| GM-15 | GM15-49 | LA-R02 · May cancellation charges launch before Australian legal review? [STILL VALID] | Cancellation charges need Australian legal review before they can launch (LA-R02). |
| GM-15 | GM15-01 | What cancellation can launch, given fees are not yet enforceable? | What cancellation can launch, given fees are not yet enforceable, defines the whole launch cancellation policy. |
| GM-15 | C1 | Legacy `charge-penalty/` route still live and proven buggy (timezone amounts, all-assignments charging, duplicate sessions, no idempotency) | Money must not move, or be mis-stated, without the agreed rule. |
| GM-15 | C2 | `charge_penalty` does not cancel anything — it only opens a checkout | Money must not move, or be mis-stated, without the agreed rule. |
| GM-15 | C4 | No cancelled/no-show/completed state on `ShiftSlotAssignment` (no status field at all) or `ShiftOffer` | Booking integrity decides whether one shift is promised twice. |
| GM-15 | C5 | AHPRA-cancelled assignments are deleted, vanishing from history instead of appearing as "cancelled" | Unverified or lapsed-registration workers must not be booked. |
| GM-15 | C6 | `RatingReport` has no admin registration and no review/resolve endpoint — reports go nowhere | Records, audit and deletion are legal/privacy obligations. |
| GM-15 | C7 | Engagement snapshot has no cancellation table, platform terms version, or pharmacy acceptance | Charges and terms need legal review and disclosure before they bind anyone. |
| GM-15 | C8 | Offer expiry is lazy (only on list); no background expiry job found for PENDING offers | Expiry and deadline rules decide whether slots and money strand. |
| GM-15 | C9 | No idempotency / persisted obligation for cancellation charges | Money must not move, or be mis-stated, without the agreed rule. |
| GM-15 | C10 | Subscriber fulfillment pricing fixed, but Stripe price IDs still hard-coded | Subscriber pricing fixed but Stripe price IDs still hard-coded; test/live prices cannot differ. |
| GM-16 | GM16-Q02 | Fix before launch? Subscribers charged full price; Stripe price IDs hard-coded. | Subscribers charged full price and hard-coded Stripe price IDs mean wrong money is charged. |
| GM-16 | GM16-Q03 | Fix before launch? The old 10%/20% penalty route is still live. | The live 10%/20% penalty route must be removed before launch. |
| GM-16 | GM16-Q04 | When should booking fees start? | When booking fees start decides whether the first bookings are charged. |
| GM-16 | GM16-Q05 | Should pharmacies save a payment method during setup? | Saving a payment method at setup decides whether D02 deadlines are payable. |
| GM-16 | GM16-Q06 | Should the pharmacy see the full cost before posting? | The pay card shows $n x 30 regardless of type/subscriber; the displayed price is wrong. |
| GM-16 | GM16-Q07 | What happens after booking payment fails? | Payment-failure handling decides whether a failed checkout strands or double-charges. |
| GM-16 | GM16-Q08 | Does a trialling subscription get the 50% discount? | Whether trialling subscriptions get the 50% discount decides money charged during trial. |
| GM-16 | GM16-Q09 | What happens the day a subscription lapses? | What happens the day a subscription lapses decides whether discounts stop mid-reservation. |
| GM-16 | GM16-Q10 | What happens to staff over 5 when extra seats drop? | Staff over 5 when extra seats drop decides whether workers lose access mid-subscription. |
| GM-16 | GM16-Q11 | Who receives the owner cancellation fee, and does the legacy penalty conflict? | Who receives the owner cancellation fee, and the legacy-penalty conflict, decide money and legality. |
| GM-16 | GM16-Q12 | Booking-fee refunds/credits and cancellation pay | Booking-fee refunds/credits and cancellation pay decide money (REFUND-01). |
| GM-16 | GM16-Q14 | May cancellation charges launch before Australian legal review? | Cancellation charges need Australian legal review before they can launch (LA-R02). |
| GM-16 | GM16-Q15 | Booking fees: GST and tax invoice? | Booking-fee GST and tax invoice are tax obligations. |
| GM-16 | GM16-Q16 | Subscription management: where, by whom, and what does cancelling do? | Owners cannot cancel a subscription in-app; a subscription that cannot be cancelled is a consumer-law problem. |
| GM-16 | GM16-Q18 | Does the pharmacy ever agree the fee/subscription terms that bind it? | Pharmacy agreement to fee/subscription terms decides enforceability of every fee (ACCEPT-01). |
| GM-16 | CG-01 | Hard-coded Stripe Price IDs in checkout_prices.py / stripe_support.py; test/live cannot differ | Money must not move, or be mis-stated, without the agreed rule. |
| GM-16 | CG-02 | Legacy charge_penalty still routed + exported; remove/suspend before launch | Money must not move, or be mis-stated, without the agreed rule. |
| GM-16 | CG-03 | Pay card shows $n x 30 AUD always; PT/FT $80 and subscriber $15/$40 not reflected | Pay card shows $n x 30 AUD always; PT/FT $80 and subscriber $15/$40 are not reflected — the displayed price is wrong while the server charges the right price. |
| GM-16 | CG-04 | Fee/GST/total not shown before posting (posting wizard not re-traced) | Money must not move, or be mis-stated, without the agreed rule. |
| GM-16 | CG-05 | BILLING_LIVE_DATE 2025-06-01 vs comment 'June 1, 2026'; which gate is authoritative unclear | Session and auth controls decide who stays signed in and who is locked out. |
| GM-16 | CG-06 | No in-app subscription cancel (web + Expo + backend absent) | Subscription lifecycle decides what owners are charged and what access they keep. |
| GM-16 | CG-07 | No missed-webhook sweeper / reconciliation queue; paid checkout can stay unfinalised | Safety/legal/money/privacy default: no concrete reason in the area file to defer it. |
| GM-16 | CG-09 | No dunning for invoice-path subscriptions; invoice stays inactive until paid, no reminder | Money must not move, or be mis-stated, without the agreed rule. |
| GM-17 | GM17-Q01 | FIRST QUESTION (ask this first) | Refund vs credit must be decided before any paid booking can be cancelled (REFUND-01). |
| GM-17 | GM17-Q02 | Worker cancels or no-shows: what happens to the booking fee? | Worker cancels/no-shows: what happens to the booking fee decides money. |
| GM-17 | GM17-Q03 | Who approves refunds and credits, and how fast? | Who approves refunds and credits, and how fast, decides whether money moves with oversight. |
| GM-17 | GM17-Q04 | Who receives the owner cancellation fee (the 10%/20% penalty)? | Who receives the owner cancellation fee decides where cancellation money goes. |
| GM-17 | GM17-Q05 | How is the worker's cancellation pay paid out? | How worker cancellation pay is paid out decides money owed to workers. |
| GM-17 | GM17-Q06 | Booking fee GST and platform tax invoice (launch-gating) | Booking-fee GST and platform tax invoice are tax obligations. |
| GM-17 | GM17-Q07 | Booking-fee trial and going live (PO-Q15, changed) | Booking-fee trial and going-live timing decide when money starts being charged. |
| GM-17 | GM17-Q09 | What should workers see: rate, super, GST, shift total? (PO-Q03) | What workers see (rate, super, GST, shift total) is the pay disclosure for every booking. |
| GM-17 | GM17-Q10 | Should the pharmacy see the full cost before posting? (PO-Q04) | Whether the pharmacy sees the full cost before posting decides informed payment. |
| GM-17 | GM17-Q11 | AHPRA auto-cancellation: fee, refund, notices (ON-P02 + LA-P02) | AHPRA auto-cancellation fee, refund and notices decide money and communication on forced cancels. |
| GM-17 | GM17-Q12 | Worker invoice corrections: credit notes, void, reversals (NEW) | Invoice corrections (credit notes, void, reversals) are needed to fix wrong money. |
| GM-17 | GM17-Q13 | Overdue worker invoices: reminders, escalation, late fees? (NEW) | Overdue worker invoices need reminders/escalation or money is never collected. |
| GM-17 | GM17-Q14 | Subscription paid by invoice: what if it is never paid? (NEW) | Subscription paid by invoice that is never paid decides whether access continues unpaid. |
| GM-17 | GM17-Q15 | Reconciliation queue: who works flagged payments? (NEW) | Reconciliation queue ownership decides whether flagged payments are ever worked. |
| GM-17 | GM17-Q16 | What marks a shift complete, so wages become payable? (CX-Q32) | What marks a shift complete decides when wages become payable. |
| GM-17 | GM17-Q17 | Cancellation penalty: fix the charge before it can ever be used? (NEW, code gap with decision attached) | The cancellation penalty charge must be fixed (or removed) before it can ever be used. |
| GM-17 | GM17-Q18 | Invoice numbering, tax-invoice wording and duplicate protection (NEW) | Invoice numbering, tax-invoice wording and duplicate protection are tax/legal obligations. |
| GM-17 | CG-01 | Subscriber discount fixed, but price IDs still hard-coded (`billing/checkout_prices.py`, `shift_payments.py`) — test/live prices cannot differ. (SH-03 remainder | Money must not move, or be mis-stated, without the agreed rule. |
| GM-17 | CG-02 | `charge-penalty/` route still live though the register says suspend it (SH-02); shared-core still exports it. | Money must not move, or be mis-stated, without the agreed rule. |
| GM-17 | CG-03 | `charge_penalty` has no persisted obligation, no idempotency key, ignores slot selection, uses ambient timezone (D8). Fix before live use (see Q17). | Money must not move, or be mis-stated, without the agreed rule. |
| GM-17 | CG-05 | No refund/credit-note/reversal endpoints or UI on either client (billing + worker_finance). | Money must not move, or be mis-stated, without the agreed rule. |
| GM-17 | CG-06 | No reconciliation queue/screen/owner — flag + notification only. | People must be told when their shift, booking or money changes. |
| GM-17 | CG-07 | No overdue reminders/escalation for worker invoices; no dunning for invoice-method subscriptions. | Money must not move, or be mis-stated, without the agreed rule. |
| GM-17 | CG-08 | Accepted terms snapshot has no cancellation band table / platform terms version / pharmacy-side acceptance (SH-09) — fees cannot be fairly charged until disclos | Money must not move, or be mis-stated, without the agreed rule. |
| GM-18 | GM-18-Q01–Q03 | Who can see the talent board, when is identity revealed, what stays hidden? (identity leak, P0) | Talent-board visibility/reveal is a P0 privacy decision (AUDIENCE-01). |
| GM-18 | GM-18-Q07–Q10 | Firm offer vs enquiry, offer expiry 48h flat, one offer per slot, commercial model | Firm offer vs enquiry decides booking semantics on public contacts (OFFER-01). |
| GM-18 | GM-18-Q11–Q12 | Where is Verified + current AHPRA enforced on talent bookings; which AHPRA lookup runs? | Verified + AHPRA enforcement on talent bookings is a safety gate. |
| GM-18 | GM-18-Q13–Q14 | Talent-post lifecycle: expiry, staleness, hidden/expired reads | Talent-post lifecycle (expiry, staleness, hidden/expired reads) decides whether dead posts keep booking. |
| GM-18 | GM-18-Q15 | One hiring-role policy: web vs Expo booking-permission drift | Web/mobile hiring-role drift lets the wrong roles book. |
| GM-18 | GM-18-Q16–Q17 | Talent-post availability: validation, matching | Talent-post availability validation and matching decide whether stale availability books workers. |
| GM-18 | GM-18-Q18 | Offer expiry not capped at shift start; re-offer does not extend expiry | Offer expiry not capped at shift start lets offers outlive the shift. |
| GM-18 | GM-18-Q19–Q21 | Availability snapshot sync, match alerts, distance/rate filters | Availability snapshot sync and match alerts decide whether stale availability books workers. |
| GM-18 | GM-18-Q24 | Disclosure: what must a worker/pharmacy see before a talent booking? | Disclosure before a talent booking is a legal requirement. |
| GM-18 | GM-18-Q25–Q26 | Launch timing for talent/recruitment: what launches, what waits? | Launch timing for talent/recruitment decides what of this area ships at all. |
| GM-18 | GM-18-MISSING | Primary worker trace (26 full question records) not recovered; only senior-review summary exists | The primary 26-question trace is missing; only a 39-line senior-review summary exists, so GM-18 cannot be signed off as traced. |
| GM-19 | GM-19-Q02 (ex AV-Q02) | How far can a repeating availability run? — 🔄 CHANGED (Oct claim wrong) | Unbounded repeating availability creates runaway recurrence data. |
| GM-19 | GM-19-Q03 (ex AV-Q03) | When does availability "match" a shift? ★ FIRST QUESTION — see §4 | When availability 'matches' a shift decides who gets alerted and booked. |
| GM-19 | GM-19-Q04 (ex AV-Q04) | Who can see a worker's availability? — ✅ STILL VALID (now fully verified) | Who can see a worker's availability is a privacy rule. |
| GM-19 | GM-19-Q05 (ex AV-Q05) | Should confirmed bookings block that time automatically? — 🔄 CHANGED (alert side now VERIFIED: they do not) | Confirmed bookings and leave must suppress match alerts or workers are alerted for time they cannot work. |
| GM-19 | GM-19-Q06 (ex AV-Q06) | When should a talent post stop showing? — ✅ STILL VALID (feeds now verified to call the rule) | When a talent post stops showing decides whether stale posts keep booking. |
| GM-19 | GM-19-Q10 (NEW) | Should availability validation be added, and what must it reject? — ✅ VERIFIED (no validation) | Availability input has no server validation; invalid data enters the system. |
| GM-19 | GM-19-Q12 (NEW) | Should the talent-post availability snapshot sync with the calendar? — ✅ VERIFIED (structural; never syncs) | Talent-post availability snapshot never syncs, so stale availability books workers. |
| GM-19 | GM-19-Q13 (NEW) | Next web: does an availability surface exist, and must it match Vite/Expo? — ✅ VERIFIED ABSENT | Next has no availability surface; if Next is a launch surface, workers there cannot set availability. |
| GM-19 | CG-1 | No availability validation (AV-05; Q10). Serializer has no `validate_` at all. Verified at head (`backend/talent/serializers/availability.py`); no validation te | Unverified or lapsed-registration workers must not be booked. |
| GM-19 | CG-3 | Match alerts use any-overlap while roster uses full containment (Q03). Both verified; the fix follows the owner's Q03 choice — the divergence itself is a code g | Unverified or lapsed-registration workers must not be booked. |
| GM-19 | CG-4 | Match emails miss escalated shifts (AV-04, first half). VERIFIED: escalation never re-announces (`escalation.py` has no announce call; `auto_escalate_due_shifts | Unverified or lapsed-registration workers must not be booked. |
| GM-19 | CG-5 | Match emails reach unverified / AHPRA-lapsed workers (AV-04, second half). VERIFIED: no Verified/AHPRA filter in `announce_availability_matches`; no lapsed-cred | Unverified or lapsed-registration workers must not be booked. |
| GM-19 | CG-6 | Booked time and approved leave do not suppress match alerts (Q05). VERIFIED: no assignment or leave check in `announce_availability_matches` (roster blocks both | Unverified or lapsed-registration workers must not be booked. |
| GM-19 | CG-7 | Authenticated talent list exposes author identity unmasked (LA-Q12). VERIFIED: authenticated list uses the unmasked serializer (`author_user_id`, `explorer_user | Unverified or lapsed-registration workers must not be booked. |
| GM-19 | CG-8 | Next-web availability surface absent (Q13). VERIFIED by listing: only `ShiftsBoard` + `TalentBoard` under the migrated dashboard sidebar. Parity gap (GM-25). | Next has no availability surface; if Next is a launch surface, workers there cannot set availability. |
| GM-19 | CG-9 | Missing coords/radius silently excludes a worker from matching. VERIFIED: `_user_can_travel_to_shift` returns no-match when coordinates or radius are missing —  | Unverified or lapsed-registration workers must not be booked. |
| GM-20 | GM20-Q01 | Who can start a direct chat with whom? [FIRST QUESTION — see §3] | Who can start a direct chat with whom is a contact/privacy boundary. |
| GM-20 | GM20-Q02 | When can a worker and a pharmacy chat — before or only after a booking? | Whether chat is allowed before a booking decides whether strangers can contact workers. |
| GM-20 | GM20-Q05 | Who can create a custom group chat? | Who can create custom group chats is an authorisation boundary (backend currently allows any authenticated user). |
| GM-20 | GM20-Q06 | How are abusive, spam, or wrong messages handled in chat? (report / block / mute) | Abuse/spam/wrong-message handling is a safety and moderation requirement. |
| GM-20 | GM20-Q07 | How long is chat history kept? | Chat-history retention is a privacy/records obligation. |
| GM-20 | GM20-Q08 | What identity does chat show? (anonymous talent authors, emails, photos) | What identity chat shows (anonymous authors, emails, photos) is a privacy rule. |
| GM-20 | GM20-Q09 | What files can be sent in chat (and in hub posts)? | What files can be sent decides malware and inappropriate-content risk. |
| GM-20 | GM20-Q12 | Who can edit, delete, or pin — and can an admin remove someone else's message? | Edit/delete/pin and admin removal are moderation controls. |
| GM-20 | GM20-Q14 | What happens to chat when a membership is revoked or an AHPRA registration is suspended? | Chat after membership revocation or AHPRA suspension must be cut off or suspended users keep contacting pharmacies. |
| GM-20 | GM20-Q16 | Who can post in the hubs — and is OTP verification enough, or must posters be Verified workers? | Hub posting gate (OTP vs Verified) decides whether unvetted users can post publicly. |
| GM-20 | GM20-Q17 | Is the public hub (articles + community posts) on at launch, and who moderates it? | Public hub at launch needs a moderator or unmoderated content goes live. |
| GM-20 | GM20-Q19 | Web/Expo parity: which gaps are launch-blocking? | Web/Expo chat parity gaps decide whether mobile users get the same safe chat. |
| GM-20 | C02 | AHPRA freeze enforced on WS only, not on REST message POST | Unverified or lapsed-registration workers must not be booked. |
| GM-20 | C03 | Expo `canPin` checks `role === 'OTHERSTAFF'`; real role is `OTHER_STAFF` — other staff can never pin on Expo | Expo canPin checks 'OTHERSTAFF' but the role is 'OTHER_STAFF'; other staff can never pin on Expo. |
| GM-20 | C04 | Backend allows any authenticated user to create groups/DMs; web/Expo role gates are UI-only | Session and auth controls decide who stays signed in and who is locked out. |
| GM-20 | C05 | `perform_destroy` double-check: a non-creator admin passes the first custom-group check, then hits "Only the creator can delete" — dead/confusing path | Records, audit and deletion are legal/privacy obligations. |
| GM-20 | C09 | DM creation silently creates an inactive CONTACT membership under the sender's pharmacy (privacy side effect; partner appears in sender's pharmacy context) | Identity must not leak before the agreed reveal. |
| GM-20 | C11 | `public_hub/permissions.py::verified()` defaults a missing `is_otp_verified` to True, while `pharmacy_hub` requires it True — same outcome today (field exists,  | Unverified or lapsed-registration workers must not be booked. |
| GM-22 | GM22-01 · PO-Q08 | When a shift escalates, who is told, and when does escalation stop? 🔴 decision · gap SH-06 — CHANGED | Escalation notices and stopping rules decide who is told and when widening stops. |
| GM-22 | GM22-02 · BK-Q06 | When an offer is declined or expires, what happens to the shift? 🟠 decision · gap D06 — CHANGED | Declined/expired offers must have a defined fallback or shifts die silently. |
| GM-22 | GM22-03 · AG-Q09 | Who is told when a shift is cancelled, covered or replaced? 🔴 decision · gap D07 — CHANGED (partial) | Who is told on cancel/cover/replace decides whether people learn their shift changed. |
| GM-22 | GM22-04 · AG-Q10 | Which channels carry those notices? 🔴 decision · gap D07 — ★ FIRST QUESTION (see Part D) — CHANGED | Which channels carry notices decides whether the message arrives at all. |
| GM-22 | GM22-05 · AG-Q11 | Which shifts get pre-shift reminders, and when? 🟠 decision · gap D12 — CHANGED | Pre-shift reminders decide whether workers show up. |
| GM-22 | GM22-06 · AG-Q12 | If a shift changes inside 12 hours of start, what happens to reminders? 🟠 decision · gap D12 — CHANGED | Shift changes inside 12h of start need defined reminder behaviour or workers arrive on stale information. |
| GM-22 | GM22-07 · CX-Q06 | Inside the window, who is alerted and how fast? 🔴 decision · gap R04D — NOT RE-VALIDATED | Inside-the-window alerts decide whether cover can be found in time; NOT RE-VALIDATED. |
| GM-22 | GM22-10 · LA-Q17 | Fix before launch? Match emails miss escalated shifts and reach unverified workers. 🔴 code · gap AV-04 — CHANGED (partial) | Match emails miss escalated shifts and reach unverified workers. |
| GM-22 | GM22-11 · PO-Q10 | How late may a scheduled escalation fire? 🟠 code · gap SH-05 — CHANGED | How late scheduled escalation may fire decides whether workers are woken for dead shifts. |
| GM-22 | GM22-12 · LA-Q08 | Fix before launch? Scheduled escalation only runs when someone loads a shift list. 🔴 code · gap SH-05 — CHANGED | Scheduled escalation only runs on shift-list load; without a job, escalation silently never happens. |
| GM-22 | GM22-13 · PO-Q09 | Should escalation pause while an offer waits for an answer? 🟡 decision — CHANGED | Whether escalation pauses while an offer waits decides whether a live offer is undercut. |
| GM-22 | GM22-14 · PO-Q12 | When does an anonymous pharmacy's name reach the worker? 🟠 decision — CHANGED (leak wider than Oct) | Anonymous pharmacy name reaching the worker is a privacy leak (wider than first traced). |
| GM-22 | GM22-16 · LA-P02 | Fix before launch? AHPRA cancellations bypass the cancellation policy and notices. 🔴 code — CHANGED (partial) | AHPRA cancellations bypassing policy and notices leave workers and pharmacies uninformed. |
| GM-22 | GM22-19 · NEW | Who sends the emails, and what happens when one fails? 🟠 decision/code — TRACED | Email sender and failure handling decide whether notices are ever delivered. |
| GM-22 | GM22-21 · NEW | Master event catalogue: which event notifies whom, on which channel? 🔴 decision — TRACED (draft table now filled) | The master event catalogue (who is notified, on which channel) is needed to build correct notices. |
| GM-22 | GM22-23 · NEW | Which payment / invoice / refund events notify whom? 🟠 decision — TRACED | Payment/invoice/refund notices decide whether money events are communicated. |
| GM-22 | GM22-25 · NEW | Are verification / AHPRA status changes notified (granted, lapsed, suspended, revoked)? 🟠 decision — TRACED (suspension) / NOT RE-VALIDATED (grant/lapse) | Verification/AHPRA status-change notices decide whether workers learn they are suspended. |
| GM-22 | GM22-26 · NEW | How are duplicate, failed and stale notifications handled — and is there an audit log? 🟠 code/decision — TRACED | Duplicate, failed and stale notifications with no audit log mean money/cancel notices can duplicate or vanish silently. |
| GM-22 | GM22-27 · NEW | Can a notification leak one tenant's information to another (wrong pharmacy, wrong worker, wrong role)? 🟠 decision/code — TRACED (mechanism) / NOT RE-VALIDATED (per-event negative tests) | Cross-tenant notification leaks expose one pharmacy's/worker's information to another. |
| GM-22 | GM22-04 · AG-Q10 | Which channels carry those notices? | Which channels carry notices decides whether the message arrives at all. |
| GM-22 | CG-06 | No dedup, no retry for push, no staleness voiding, no audit log. Duplicate `notify_users` = duplicate rows + pushes; push failures logged only; no sent-state on | People must be told when their shift, booking or money changes. |
| GM-22 | CG-08 | Refunds silent; reconciliation notices in-app-only; cancellation-penalty payment produces no notice | Money must not move, or be mis-stated, without the agreed rule. |
| GM-22 | CG-09 | Pills spend silent; no low-balance/expiry notice. Only referral awards notify (in-app + email, try/except pass) | Tax/Award/super obligations must be correct before the first paid shift. |
| GM-22 | CG-10 | No rating notification exists. `ratings/views.py` contains no notify/announce/send_async_email at all | People must be told when their shift, booking or money changes. |
| GM-22 | CG-11 | Next has no notification UI; Vite bell excludes chat while Expo includes it. Push is Expo-only | Next has no notification UI and Vite bell excludes chat while Expo includes it; mobile users miss notices web users get. |
| GM-22 | CG-13 | Auto-email in-app notices have empty bodies (title = subject only) and type TASK (so their push is held in quiet hours) | Auto-email in-app notices have empty bodies and wrong type (held in quiet hours). |
| GM-22 | CG-14 | Competing PENDING offers EXPIRED silently by `.update()` at accept time — no notice | Expiry and deadline rules decide whether slots and money strand. |
| GM-22 | CG-16 | Expo centre marks visible notices read on focus — money/cancel notices are not pinned and can be marked read by opening the list | Expo centre marks visible notices read on focus; money/cancel notices can be marked read without being seen. |
| GM-22 | CG-17 | No send-time recipient re-check. Recipient lists are built at trigger time; access revoked between trigger and send still gets the notice | Authorisation boundaries decide who can do what. |
| GM-23 | GM-23-01 | LA-Q16 / AV-01. Talent-post availability is copied once and never syncs with the calendar. Fix before launch? — FIRST QUESTION (Part D) | Talent-post availability copied once and never syncing means stale availability books workers. |
| GM-23 | GM-23-03 | AV-Q02 / AV-02. How far can a repeating availability run? (ADOPTED GM-19 + this trace) | Unbounded repeating availability creates runaway recurrence data. |
| GM-23 | GM-23-04 | AV-Q03 / AV-03. When does availability "match" a shift? (ADOPTED GM-19) | When availability 'matches' a shift decides who gets alerted and booked. |
| GM-23 | GM-23-05 | AV-Q04 / AV-06. Who can see a worker's availability? (ADOPTED GM-19) | Who can see a worker's availability is a privacy rule. |
| GM-23 | GM-23-06 | AV-Q05. Should confirmed bookings block that time automatically? (ADOPTED GM-19) | Confirmed bookings and leave must suppress match alerts or workers are alerted for time they cannot work. |
| GM-23 | GM-23-07 | AV-Q06 / AV-02. When should a talent post stop showing? (ADOPTED GM-19) | When a talent post stops showing decides whether stale posts keep booking. |
| GM-23 | GM-23-11 | AG-Q11. Which shifts get pre-shift reminders, and when? (re-verified this trace) | Pre-shift reminders decide whether workers show up. |
| GM-23 | GM-23-12 | AG-Q12. If a shift changes inside 12 hours of start, what happens to reminders? (re-verified this trace) | Shift changes inside 12h of start need defined reminder behaviour or workers arrive on stale information. |
| GM-23 | GM-23-13 | PO-Q05. For multi-date posts, how is "same worker for every date" set? (re-verified this trace, first half) | Same-worker-for-every-date on multi-date posts decides whether a worker is committed to all dates. |
| GM-23 | GM-23-14 | PO-Q06. How far ahead can recurring shifts run? (re-verified this trace — CHANGED) | Recurring-shift horizon is unbounded; runaway recurrence data follows. |
| GM-23 | GM-23-16 | LA-Q17 / AV-04. Match emails miss escalated shifts and reach unverified workers. Fix before launch? (re-verified this trace) | Match emails miss escalated shifts and reach unverified workers. |
| GM-23 | GM-23-17 | LA-Q18 / AV-05. Availability input has no validation. Fix before launch? (ADOPTED GM-18/GM-19) | Availability input has no server validation; invalid data enters the system. |
| GM-23 | GM-23-18 | NEW. Team calendar views: day / week / month — what does each role see? (verified this trace) | Calendar views per role decide who sees whose shifts (privacy). |
| GM-23 | GM-23-23 | NEW. Clock / timezone: whose time is a shift time? (verified this trace — ALTERNATE FIRST QUESTION) | Whose time a shift time is decides the legal work date; device timezone must not decide it. |
| GM-23 | GM-23-24 | NEW. Calendar permissions: who can create / edit / delete calendar entries, per role and per pharmacy? (verified server-side this trace) | Calendar create/edit/delete permissions per role and pharmacy are an authorisation boundary. |
| GM-23 | GM-23-28 | NEW. "Needs cover" on the calendar: who sees it, and how is it filled without double-booking? (verified this trace) | Needs-cover on the calendar (R06) decides whether cover shifts are visible without duplicating the shift. |
| GM-23 | CG-01 | No server-side availability validation (LA-Q18 / AV-05) | Invalid or zero-value data must not enter the system. |
| GM-23 | CG-03 | Match alerts use any-overlap while roster uses full containment (AV-Q03) | Booking integrity decides whether one shift is promised twice. |
| GM-23 | CG-04 | Match emails miss escalated shifts; no beat for escalation (LA-Q17, SH-05/SH-06) | Escalation decides who is told about a shift and when it widens. |
| GM-23 | CG-05 | Match emails reach unverified / AHPRA-lapsed workers (LA-Q17 second half) | Unverified or lapsed-registration workers must not be booked. |
| GM-23 | CG-06 | Booked time and approved leave do not suppress match alerts (AV-Q05) | Roster/attendance correctness decides staffing and pay. |
| GM-23 | CG-08 | Team-calendar recurrence/event validation gaps | Team-calendar recurrence/event validation gaps: a mistyped rule silently makes an event vanish. |
| GM-23 | CG-09 | Weekday convention split | Weekday convention split (Sunday=0 vs Monday=0) breaks cross-calendar recurrence. |
| GM-23 | CG-10 | Unpublish notifies nobody (whole week + per-shift) | People must be told when their shift, booking or money changes. |
| GM-23 | CG-11 | Reminder has no dedupe record; email-only | People must be told when their shift, booking or money changes. |
| GM-23 | CG-14 | Next has no calendar or roster surface | Next has no calendar or roster surface; if Next is a launch surface, owners there cannot roster. |
| GM-23 | CG-16 | Vite worker roster shows the team; Expo worker roster shows only self | Vite worker roster shows the team, Expo shows only self; accidental split needs an explicit choice. |
| GM-23 | CG-18 | Authenticated talent list exposes author identity unmasked (LA-Q12) | Identity must not leak before the agreed reveal. |
| GM-23 | CG-19 | Missing coords/radius silently excludes a worker from matching | Safety/legal/money/privacy default: no concrete reason in the area file to defer it. |
| GM-23 | CG-20 | Wizard blocks overnight entry (finish ≤ start rejected) while the backend handles overnight | Wizard blocks overnight entry while the backend handles overnight; night shifts cannot be entered via web. |
| GM-23 | CG-21 | Reminder emails bypass push preferences entirely | Reminder emails bypass push preferences entirely; quiet hours and opt-outs never apply. |
| GM-24 | GM-24-Q01 | What can Explorers ("new to pharmacy") do with shifts? [FIRST QUESTION — ask this first] | Explorer shift access decides whether unvetted newcomers can take shifts. |
| GM-24 | GM-24-Q02 | What can a worker do before they are Verified? | Pre-Verified access is the core access-control boundary. |
| GM-24 | GM-24-Q03 | Where must role-appropriate verification be enforced? | Verification-enforcement scope decides where unvetted workers can be booked. |
| GM-24 | GM-24-Q04 | Who is exempt from AHPRA gates on public shifts? | AHPRA exemption for favourites is a safety gate. |
| GM-24 | GM-24-Q06 | Who must pass an ID check? | ID-check scope is an identity/safety gate. |
| GM-24 | GM-24-Q07 | What must a pharmacy pass before posting to outside workers? | Pharmacy posting gate decides what an unverified pharmacy can do to outside workers. |
| GM-24 | GM-24-Q08 | On an anonymous public post, what is hidden? | What is hidden on an anonymous public post is a privacy rule. |
| GM-24 | GM-24-Q09 | When does an anonymous pharmacy's name reach the worker? | When an anonymous pharmacy's name reaches the worker is a privacy rule. |
| GM-24 | GM-24-Q10 | When a shift escalates, who is told, and when does escalation stop? | Escalation notices and stopping rules decide who is told and when widening stops. |
| GM-24 | GM-24-Q11 | Who can see the talent board? | Talent-board visibility is a P0 privacy decision. |
| GM-24 | GM-24-Q12 | When is an anonymous candidate's identity revealed? | When an anonymous candidate's identity is revealed is a privacy rule. |
| GM-24 | GM-24-Q13 | Fix before launch? Anonymous talent posts expose full names to any signed-in account. | Anonymous talent posts expose full names to any signed-in account (identity leak). |
| GM-24 | GM-24-Q14 | Is "Request booking" a firm offer or an enquiry? | Firm offer vs enquiry decides booking semantics on public contacts (OFFER-01). |
| GM-24 | GM-24-Q15 | Who can request a booking — fix the web/mobile drift? | Web/mobile booking-permission drift lets the wrong roles request bookings. |
| GM-24 | GM-24-Q19 | Should match emails go to unverified workers, and should escalated shifts notify? | Match emails to unverified workers and missing escalated-shift notices are safety/communication failures. |
| GM-24 | GM-24-Q21 | NEW: Should anonymous visitors see every role on the public job board? | Anonymous visitors seeing every role on the public job board is a public-exposure rule. |
| GM-24 | GM-24-Q23 | NEW: Share-link sitemap URLs are dead, and share tokens never expire? | Dead sitemap/share links and share tokens that never expire are a security and trust defect. |
| GM-24 | GM-24-Q24 | NEW: Which public site is canonical — Vite or Next — and who owns the public pages? | Which public site is canonical (Vite or Next) decides what visitors actually see. |
| GM-24 | GM-24-Q25 | NEW: Anonymous pharmacy detail keeps postcode + script volume — hide more? | Anonymous pharmacy detail keeps postcode + script volume; more identity leaks through the public board. |
| GM-24 | GM-24-Q26 | NEW: Non-anonymous talent posts expose identity to anonymous visitors — intended? | Non-anonymous talent posts expose identity to anonymous visitors. |
| GM-24 | GM-24-Q27 | NEW: Explorer interest that can never become a booking — fail fast? | Explorer interest that can never become a booking is a dead-end booking path. |
| GM-24 | GM-24-Q31 | NEW: Talent-post staleness — undated and full-time posts stay visible forever? | Undated and full-time talent posts staying visible forever means stale posts keep booking. |
| GM-24 | GM-24-Q32 | Launch-gate check: are the mobile dead-ends fixed? | Mobile dead-ends on the public boards are a launch gate. |
| GM-24 | CG-01 | Authenticated talent feed/list/retrieve leak anonymous authors' names + user ids (only `public-feed` redacts) | Identity must not leak before the agreed reveal. |
| GM-24 | CG-02 | Public-feed redaction ignores `is_anonymous=False` — identity exposed to anonymous visitors | Identity must not leak before the agreed reveal. |
| GM-24 | CG-04 | Share tokens have no expiry field | Expiry and deadline rules decide whether slots and money strand. |
| GM-24 | CG-08 | Role filter omits Explorer on both public boards | Authorisation boundaries decide who can do what. |
| GM-24 | CG-09 | Match emails go to unverified workers; escalated shifts never notify (escalation sends nothing) | Unverified or lapsed-registration workers must not be booked. |
| GM-24 | CG-11 | No test asserts anonymous-shift pharmacy redaction or authenticated-feed redaction | No test asserts anonymous-shift or authenticated-feed redaction; the privacy fix would ship untested. |
| GM-24 | CG-13 | Visibility is not re-checked when Verified is revoked / AHPRA lapses after posting (talent) | Unverified or lapsed-registration workers must not be booked. |
| GM-24 | CG-14 | Revoked-Verified / lapsed-AHPRA author posts stay visible (same root cause as CG-13) | Unverified or lapsed-registration workers must not be booked. |
| GM-25 | GM25-C01 | Must every onboarding step work on mobile at launch? | Mobile onboarding parity is a launch gate. |
| GM-25 | GM25-C02 | What can a worker do before they are Verified? | Pre-Verified access is the core access-control boundary. |
| GM-25 | GM25-C03 | Where must role-appropriate verification be enforced? | Verification-enforcement scope decides where unvetted workers can be booked. |
| GM-25 | GM25-C04 | What can Explorers (new to pharmacy) do with shifts? | Explorer shift access decides whether unvetted newcomers can take shifts. |
| GM-25 | GM25-C05 | When must a worker's pay details be ready, and is payment readiness shown early? (NOT RE-VALIDATED) | Pay-readiness timing decides whether workers strand at payment; NOT RE-VALIDATED. |
| GM-25 | GM25-C06 | What must a pharmacy pass before posting to outside workers? (NOT RE-VALIDATED) | Pharmacy posting gate; NOT RE-VALIDATED. |
| GM-25 | GM25-C07 | Should pharmacies save a payment method during setup? (NOT RE-VALIDATED) | Saving a payment method at setup decides whether D02 deadlines are payable; NOT RE-VALIDATED. |
| GM-25 | GM25-C08 | Mobile 'add personal profile' drops pharmacist rate/bank data (fix before launch?) | Mobile add-profile drops pharmacist rate/bank data (data loss). |
| GM-25 | GM25-C09 | Reachable mobile screens that dead-end / go nowhere (fix before launch?) | Reachable mobile screens that dead-end block first mobile users. |
| GM-25 | GM25-C11 | The auto-publish cover setting: build it, or delete it? (R04A) | R04A auto-publish cover setting is APPROVED with no backend effect (IMPLEMENTATION_GAP). |
| GM-25 | GM25-C12 | Anonymous talent posts expose full names to any signed-in account (fix before launch?) | Anonymous talent posts expose full names to any signed-in account (identity leak). |
| GM-25 | GM25-C13 | The talent board downloads everything, filters in-app (fix before launch?) | Talent board downloads everything and filters in-app; identity and data leak to every client. |
| GM-25 | GM25-C14 | Web and mobile disagree on Talent Board booking permissions (fix before launch?) | Web/mobile talent-board booking-permission drift lets the wrong roles book. |
| GM-25 | GM25-C15 | Talent-post availability copied once, never syncs (fix before launch?) | Talent-post availability copied once and never syncing means stale availability books workers. |
| GM-25 | GM25-C16 | Is 'Request booking' a firm offer or an enquiry? | Firm offer vs enquiry decides booking semantics (OFFER-01). |
| GM-25 | GM25-C19 | Which shifts get pre-shift reminders, and when? | Pre-shift reminder parity decides whether mobile users get the reminders web users get. |
| GM-25 | GM25-C20 | Escalation: who is told, and how late may it fire? (NOT RE-VALIDATED mechanics) | Escalation notice parity decides whether mobile users are told on escalation; NOT RE-VALIDATED. |
| GM-25 | GM25-Q01 | What is the launch cut across Vite web, Next web, and Expo? | Launch cut (LAUNCH-01): nothing else can be labelled until the launch scope is set. |
| GM-25 | GM25-Q02 | Vite vs Next: which routes live where, and is the migration finished/frozen/rolled back? | Vite vs Next canonical routes decide what visitors actually see; the migration is unfinished. |
| GM-25 | GM25-Q03 | Duplicated public boards: one implementation or tolerated twins? | Duplicated public boards (two implementations) will drift and confuse visitors. |
| GM-25 | GM25-Q04 | Shared-core scope: which flows must go through shared-core, and what happens to direct client API calls? | Shared-core scope decides which flows go through the tested transport and which bypass it. |
| GM-25 | GM25-Q05 | Dead, half-built, and 'coming soon' screens: delete, hide, or fix? | Dead, half-built and 'coming soon' screens must be deleted, hidden or fixed before first users meet them. |
| GM-25 | GM25-Q07 | Auth and session parity: same rules on all three surfaces? | Auth/session parity decides whether the same account is equally protected on all surfaces. |
| GM-25 | GM25-Q08 | Logged-out public surfaces: what must a visitor be able to do? | Logged-out public-surface rules decide what anonymous visitors can see and do. |
| GM-25 | GM25-Q09 | Offline and poor-network behaviour on Expo: what is the promise? | Expo offline/poor-network behaviour decides whether mobile users lose work offline. |
| GM-25 | GM25-Q10 | How does Expo take payment? (link-out to Stripe Checkout, return-to-app leg unverified) | Expo payment is a link-out to Stripe Checkout with the return-to-app leg unverified; money must return to the app. |
| GM-25 | GM25-Q11 | Notification parity: email vs push — same events, same content? | Notification parity decides whether mobile users get the same money/cancel notices as web users. |
| GM-25 | GM25-Q13 | Accessibility and text scaling: is 1.6x text a launch gate on both clients? | 1.6x text / accessibility is a launch gate in the audit's P0 evidence list; no device evidence exists yet. |
| GM-25 | GM25-Q17 | Launch sign-off evidence: what proves each surface ready? | Launch sign-off evidence per surface is the gate itself; no surface launches without it. |
| GM-25 | CG-1 | Mobile pharmacist onboarding posts rate/bank fields with no backend home; silently dropped | Invalid or zero-value data must not enter the system. |
| GM-25 | CG-2 | Mobile owner onboarding legacy screens + hidden create-shift route with hourly_rate; hub 'coming soon'; unrouted web OrganizationCreate | Invalid or zero-value data must not enter the system. |
| GM-25 | CG-4 | Payment-readiness timing not re-validated (NOT RE-VALIDATED) | Payment-readiness timing not re-validated; workers may strand at payment. Evidence NOT RE-VALIDATED. |
| GM-25 | CG-5 | Legacy 10%/20% penalty route still live (billing/urls.py:15) | Charges and terms need legal review and disclosure before they bind anyone. |
| GM-25 | CG-6 | Subscriber discount now applied; Stripe price IDs still hard-coded | Money must not move, or be mis-stated, without the agreed rule. |
| GM-25 | CG-7 | Escalation runs only on shift-list page views; no scheduled job (NOT RE-VALIDATED) | Escalation runs only on shift-list views; no scheduled job. Evidence NOT RE-VALIDATED. |
| GM-25 | CG-8 | Pending offers outlive the shift: flat 48h, no cap at shift start | Booking integrity decides whether one shift is promised twice. |
| GM-25 | CG-9 | Terms snapshot: consent booleans checked, no validated reviewed-snapshot identifier (D2 open) | Charges and terms need legal review and disclosure before they bind anyone. |
| GM-25 | CG-11 | Authenticated talent feed/list/detail return names and user IDs; only public reads mask (privacy, launch-gate) | Identity must not leak before the agreed reveal. |
| GM-25 | CG-12 | Hidden/expired reads now blocked; lapsed-credential re-check still missing | Expiry and deadline rules decide whether slots and money strand. |
| GM-25 | CG-13 | Talent board downloads everything, filters in-app; no server filters or distance filter | Safety/legal/money/privacy default: no concrete reason in the area file to defer it. |
| GM-25 | CG-14 | Web vs Expo Talent Board booking-permission drift; duplicate useTalentFeed; mobile publish-availability misroutes; add_view unthrottled | Money must not move, or be mis-stated, without the agreed rule. |
| GM-25 | CG-16 | Match emails miss escalated shifts; reach unverified workers (NOT RE-VALIDATED) | Match emails miss escalated shifts and reach unverified workers. Evidence NOT RE-VALIDATED. |
| GM-25 | CG-17 | Availability input has no server validation (bare ModelSerializer) | Invalid or zero-value data must not enter the system. |
| GM-25 | CG-18 | Diverged duplicate useTalentFeed copies (4 total); twin Expo talent-board routes; dual roles/+app trees; legacy roster twin; direct Axios in mobile adapters | Diverged duplicate useTalentFeed copies, twin routes and dual trees will drift; canonical surface is undocumented. |
| GM-25 | CG-19 | Shared-core suite needs re-verification on latest head; W3b/W3d/e/f unfinished; D2 terms snapshot open; 3 native reference screens unsigned at 1.6x text; Senior Package Testing not done | Shared-core suite needs re-verification on the latest head; native reference screens unsigned at 1.6x text; Senior Package Testing not done. No device/CI evidence exists. |
| GM-25 | CG-20 | 17 numbered logic drifts in PARITY_MATRIX (dashboard fallbacks, org claims, roster, timesheet, attendance timezone, invoices, chat pagination, nav, settings, interest grouping, transport, unrouted nav, placeholders) + missing destinations; rows not individually re-verified | 17 numbered logic drifts plus missing destinations; rows not individually re-verified at the #249 head. |
| GM-26 | GM26-Q01 | [P0 · decision] Who can see the talent board, and are anonymous candidates really anonymous? | Talent-board visibility and anonymous-candidate anonymity are P0 privacy. |
| GM-26 | GM26-Q02 | [P0 · decision] When is an anonymous candidate's identity revealed? | When an anonymous candidate's identity is revealed is a privacy rule. |
| GM-26 | GM26-Q03 | [P0 · decision] What stays hidden before identity reveal? | What stays hidden before identity reveal is a privacy rule. |
| GM-26 | GM26-Q04 | [P0 · code gap, timing decision] Fix before launch? Anonymous talent posts expose full names to any signed-in account. | Anonymous talent posts expose full names to any signed-in account (identity leak). |
| GM-26 | GM26-Q05 | [P1 · code gap, timing decision] Fix before launch? Hidden, stale and lapsed-credential posts can still be read. | Hidden, stale and lapsed-credential posts can still be read. |
| GM-26 | GM26-Q06 | [P1 · decision] How long should verification evidence be kept? (retention / APP 11) | Verification-evidence retention is a privacy/legal obligation (APP 11). |
| GM-26 | GM26-Q07 | [P1 · decision] Who must pass an ID check? | ID-check scope is an identity/safety gate; NOT RE-VALIDATED. |
| GM-26 | GM26-Q08 | [P1 · decision] What can a worker do before they are Verified? (gate scope) | Pre-Verified access is the core access-control boundary; NOT RE-VALIDATED. |
| GM-26 | GM26-Q09 | [P1 · decision] Where must role-appropriate verification be enforced? | Verification-enforcement scope decides where unvetted workers can be booked; NOT RE-VALIDATED. |
| GM-26 | GM26-Q10 | [P1 · decision] How should AHPRA be re-checked after sign-up? | AHPRA re-check cadence decides whether lapsed registrations keep booking; NOT RE-VALIDATED. |
| GM-26 | GM26-Q11 | [P1 · decision] Which AHPRA lookup should run at launch? (ScrapingBee vs desktop verifier) | Which AHPRA lookup runs at launch decides whether registration is verified at all; NOT RE-VALIDATED. |
| GM-26 | GM26-Q12 | [P1 · decision] If current registration cannot be confirmed, what happens to future bookings? | Unconfirmable registration must have a defined booking consequence; NOT RE-VALIDATED. |
| GM-26 | GM26-Q13 | [P1 · decision] When the register shows Suspended or Cancelled, what happens? | Suspended/Cancelled registrations must stop future bookings; NOT RE-VALIDATED. |
| GM-26 | GM26-Q14 | [P1 · decision] Which workers must prove professional indemnity cover? | Indemnity cover is a safety/legal requirement; NOT RE-VALIDATED. |
| GM-26 | GM26-Q15 | [P1 · decision] On an anonymous public post, what is hidden? (pharmacy anonymity) | What is hidden on an anonymous public post is a privacy rule; NOT RE-VALIDATED. |
| GM-26 | GM26-Q16 | [P1 · decision] When does an anonymous pharmacy's name reach the worker? | When an anonymous pharmacy's name reaches the worker is a privacy rule; NOT RE-VALIDATED. |
| GM-26 | GM26-Q17 | [P1 · decision] Who can see a worker's availability? | Who can see a worker's availability is a privacy rule; NOT RE-VALIDATED. |
| GM-26 | GM26-Q19 | [P1 · decision] Can a pharmacy block a worker? | Whether a pharmacy can block a worker is a safety control; NOT RE-VALIDATED. |
| GM-26 | GM26-Q20 | [P1 · decision] What is the rule for hiring a worker directly, off the platform? | Off-platform direct hiring decides whether bookings and fees bypass the platform; NOT RE-VALIDATED. |
| GM-26 | GM26-Q21 | [P1 · decision] Who approves refunds and credits? (platform admin finance role) | Who approves refunds and credits decides whether money moves with oversight; NOT RE-VALIDATED. |
| GM-26 | GM26-Q22 | [P1 · decision] Who reviews disputes and appeals? | Who reviews disputes and appeals decides whether disputes have a decider; NOT RE-VALIDATED. |
| GM-26 | GM26-Q24 | [P1 · decision] Who can see each part of a dispute? | Who can see each part of a dispute is a privacy rule; NOT RE-VALIDATED. |
| GM-26 | GM26-Q25 | [P1 · decision] What process applies before permanent suspension? | Process before permanent suspension is a fairness/legal safeguard; NOT RE-VALIDATED. |
| GM-26 | GM26-Q26 | [P2 · decision] Which events count as an incident? / How far back does the ladder count? / When does the reliability badge disappear? | Incident-ladder rules decide suspension fairness; NOT RE-VALIDATED. |
| GM-26 | GM26-Q28 | [P2 · decision] Do cancelled, expired and no-show shifts stay in both sides' history? | Whether cancelled/expired/no-show shifts stay in history decides records and disputes. |
| GM-26 | GM26-Q29 | [P1 · code gap, timing decision] Fix before launch? Web and mobile disagree on Talent Board booking permissions. | Web/mobile talent-board booking-permission drift lets the wrong roles book. |
| GM-26 | GM26-Q30 | [P1 · code gap, timing decision] Fix before launch? The talent board downloads every post and filters in the app. | Talent board downloads every post and filters in-app; identity and data leak to every client. |
| GM-26 | GM26-Q31 | [P0 · decision] May cancellation charges launch before Australian legal review? | Cancellation charges need Australian legal review before they can launch (LA-R02). |
| GM-26 | GM26-Q32 | [P1 · code gap, timing decision] Fix before launch? Accepted terms don't include the cancellation table or terms version. | Accepted terms must include the cancellation table and terms version or charges are undisclosed. |
| GM-26 | GM26-Q33 | [P1 · code gap, timing decision] Fix before launch? Booking fees lack explicit GST and tax-invoice treatment. | Booking-fee GST and tax-invoice treatment are tax obligations; NOT RE-VALIDATED. |
| GM-26 | GM26-Q34 | [P1 · code gap, timing decision] Fix before launch? Subscribers are charged full price, and Stripe price IDs are hard-coded. | Subscribers charged full price and hard-coded Stripe price IDs mean wrong money is charged. |
| GM-26 | GM26-Q35 | [P1 · code gap, timing decision] Fix before launch? Booking never refreshes AHPRA registration from the public register. | Booking never refreshes AHPRA from the public register; lapsed workers keep booking. |
| GM-26 | GM26-Q36 | [P0 · decision] What is the launch cut for GM-26 — which release blockers must close before the first real user? | Launch cut for release blockers (LAUNCH-01). |
| GM-26 | GM26-Q37 | [P0 · decision] Who is a platform admin, how do they get the power, and what can they do that nobody else can? | Who is a platform admin, how they get the power, and what they can do is the highest-privilege boundary. |
| GM-26 | GM26-Q38 | [P1 · decision] What is the audit trail for admin actions, and who can read it? | Admin audit trail is required to detect and prove misuse of platform power. |
| GM-26 | GM26-Q39 | [P1 · decision] What personal data is shown to whom — the full data-sharing map? | The full data-sharing map (what personal data is shown to whom) is a privacy obligation. |
| GM-26 | GM26-Q40 | [P1 · decision] Account deletion: what is deleted, what is kept (and why), and how long does it take? | Account deletion (what is deleted, kept, and how long it takes) is a privacy-law obligation. |
| GM-26 | GM26-Q41 | [P1 · decision] Privacy policy / terms: are they APP-compliant, versioned, and shown on Expo as well as web? | Privacy policy/terms must be APP-compliant, versioned, and shown on Expo as well as web. |
| GM-26 | GM26-Q42 | [P0 · security, decision + code gap] Secrets, DEBUG and ALLOWED_HOSTS: what is the production configuration, and who can see it? | Production secrets, DEBUG and ALLOWED_HOSTS configuration decides whether the production system is exposed. |
| GM-26 | GM26-Q43 | [P1 · security, decision] Has anyone pentested this, and what is the vulnerability-handling process? | No penetration test evidence exists (UNKNOWN); the audit lists a pentest among launch-condition verification. |
| GM-26 | GM26-Q44 | [P1 · security, code gap] Kiosk codes and worker PIN OTPs in notifications (PR #200 B64) | Kiosk codes and worker PIN OTPs in notifications leak credentials (PR #200 B64, confirmed present). |
| GM-26 | GM26-Q45 | [P1 · security, code gap] Region Admin cross-tenant shift actions; native pairing-code downgrade; pricing-preview leakage (PR #200 B62/B63/B65) | Region Admin cross-tenant actions, native pairing-code downgrade and pricing-preview leakage are security/privacy defects (PR #200 B62/B63/B65). |
| GM-26 | GM26-Q46 | [P1 · release, decision] Staging, migration rehearsal and rollback: what is the deploy path to production? | Staging, migration rehearsal and rollback decide whether production can be deployed and recovered safely. |
| GM-26 | GM26-Q47 | [P2 · code gap, timing decision] Fix before launch? Mobile 'add personal profile' drops pharmacist data / sends other staff to not-found; profile progress % doesn't match Verified; payment readiness only visible at acceptance. | Mobile add-profile drops pharmacist data and dead-ends; payment readiness is only visible at acceptance. |
| GM-26 | GM26-Q48 | [P2 · decision] Must every onboarding step work on mobile at launch? (parity gate for GM-26-adjacent onboarding) | Whether every onboarding step must work on mobile at launch is a parity gate. |
| GM-26 | GM26-Q36 | What is the launch cut for GM-26: which release blockers must close before the first real user? | Launch cut for release blockers (LAUNCH-01). |
| GM-26 | CG-01 | Authenticated talent API leaks anonymous names + user IDs | Identity must not leak before the agreed reveal. |
| GM-26 | CG-02 | List/detail reads bypass visibility filter; lapsed Verified/AHPRA doesn't hide posts | Unverified or lapsed-registration workers must not be booked. |
| GM-26 | CG-03 | Talent board downloads every post, filters in-app; no server filters | Safety/legal/money/privacy default: no concrete reason in the area file to defer it. |
| GM-26 | CG-04 | Web and mobile disagree on Talent Board booking permissions | Authorisation boundaries decide who can do what. |
| GM-26 | CG-05 | No fresh AHPRA lookup before booking | Unverified or lapsed-registration workers must not be booked. |
| GM-26 | CG-06 | Subscriber discount computed but never applied; hard-coded Stripe price IDs | Money must not move, or be mis-stated, without the agreed rule. |
| GM-26 | CG-07 | No GST / tax-invoice treatment on booking fees | Money must not move, or be mis-stated, without the agreed rule. |
| GM-26 | CG-08 | Accepted terms omit cancellation table, terms version, pharmacy acceptance | Charges and terms need legal review and disclosure before they bind anyone. |
| GM-26 | CG-09 | Mobile add-profile drops data / dead-ends; progress % ≠ Verified; payment readiness late | Unverified or lapsed-registration workers must not be booked. |
| GM-26 | CG-10 | Legacy 10%/20% penalty route still callable | Charges and terms need legal review and disclosure before they bind anyone. |
| GM-26 | CG-11 | Kiosk/PIN OTP in persistent notifications | Security/credential exposure must be closed before first real users. |
| GM-26 | CG-12 | Region Admin cross-tenant shift actions | Security/credential exposure must be closed before first real users. |
| GM-26 | CG-14 | Pricing-preview leakage | Identity must not leak before the agreed reveal. |
| GM-26 | CG-15 | (Candidate) Worker `mark-paid` surfacing undelivered invoice; negative balance on revised paid invoice | Worker mark-paid surfacing undelivered invoice / negative balance on revised paid invoice is a money defect; NOT re-traced (audit candidate). |
| GM-26 | CG-16 | No admin audit trail evidenced | Records, audit and deletion are legal/privacy obligations. |
| GM-26 | CG-17 | No in-product admin console evidenced (Django admin only) | Records, audit and deletion are legal/privacy obligations. |
| GM-26 | CG-18 | No incident ledger / sanction workflow | No incident ledger / sanction workflow exists; suspension cannot be applied or audited. NOT RE-VALIDATED. |
| GM-26 | CG-19 | Secrets in notifications: pairing code in `kiosk_link_route` URL | Pairing code in the kiosk_link_route URL leaks credentials (part of B64). |

## Part 2 — OPTIONAL / DEFERRABLE gaps

| Area | Gap ID | Description | Reason |
|---|---|---|---|
| GM-01 | GM01-Q01 | How long should a sign-in last, and should "Keep me signed in" exist on mobile too? | Session length is a policy choice; current sessions work, just unchosen. |
| GM-01 | GM01-Q02 | Which sign-up tracks should workers get at launch? (carried ON-Q01, corrected) | Sign-up tracks are launch scope; can launch with pharmacist + other-staff tracks. |
| GM-01 | GM01-Q05 | Should sign-in get a second factor (authenticator app), or is email code + mobile check enough? | Enhancement over the existing email-code + mobile check; not a missing control. |
| GM-01 | GM01-Q06 | How many devices can stay signed in, and should there be a "sign out everywhere" button? | Device-count limit and sign-out-everywhere are account hygiene, not a launch gate. |
| GM-01 | GM01-Q09 | After sign-in, should the worker return to the page that sent them there? (Web parity) | Return-path after sign-in is UX polish; sign-in itself works. |
| GM-01 | GM01-Q11 | Biometrics on the phone: keep it, and should the web get passkeys? (Expo-only feature) | Biometrics/passkeys are a convenience feature; password + OTP login exists. |
| GM-01 | GM01-Q15 | When a worker opens a page they are not allowed to see, should the app say so or silently send them home? | Denied-page UX (message vs silent redirect) is polish; the denial itself is enforced server-side. |
| GM-01 | GM01-Q18 | Mobile numbers: Australian only, locked forever once verified — keep that? | Australian-only numbers and permanent lock are policy choices; verification itself works. |
| GM-01 | GM01-Q19 | Email/mobile codes: keep 6 digits / 10 minutes / 5 tries, and is the test-mode code display safely off in production? | OTP parameters are settled; test-mode display is code-gated off production by default (residual staging-config risk only). |
| GM-01 | CG-03 | Vite login ignores `?next=` / return path | Return-path after login is UX polish; sign-in itself works. |
| GM-01 | CG-06 | Vite logout failure path not fully traced | Logout failure path is untraced; needs a re-read, not a launch decision. |
| GM-01 | CG-09 | Which screens open WebSocket tickets (socket auth UX on expiry) | WebSocket ticket UX on expiry is a session-adjacent nicety. |
| GM-02 | ON-Q01 | Which sign-up tracks should workers get at launch? | Sign-up tracks are launch scope; can launch with pharmacist + other-staff tracks. |
| GM-02 | ON-Q12 | Which site brief fields are required before the first post? | Site-brief fields are data quality; a minimal brief can launch. |
| GM-02 | CG-02 | Progress % does not match Verified: counts resume/bio/rates/referees; ignores email/mobile verification | Progress % display mismatch is UX; Verified is enforced server-side. |
| GM-02 | CG-07 | add_view counts every authenticated call, no limit | View-count inflation is a metrics nicety. |
| GM-02 | CG-08 | offers.accept() runs the AHPRA gate before checking the offer belongs to the caller | AHPRA gate running before the ownership check is an ordering wart with no user impact. |
| GM-02 | CG-10 | Owner-setup skip flag: web sessionStorage vs mobile AsyncStorage; web clear call site unverified | Skip-flag storage difference is a tiny parity fix. |
| GM-03 | GM-03-Q02 | Which site-brief fields are required before the first post? | Site-brief fields are data quality; a minimal brief can launch. |
| GM-03 | CG-06 | Delete or route `OrganizationCreate.tsx` — dead page, unrouted, would 403 for non-admins if linked. | Dead unrouted page; delete it, no user impact. |
| GM-03 | CG-08 | Vite has no global owner-setup guard found (`main.tsx` contains no `getOwnerSetupStatus` call; gate fires at login + inside setup pages). Confirm whether a web  | Small fix; no safety/money/privacy impact identified in the area file. |
| GM-03 | CG-10 | Skip-persistence differs by client (web sessionStorage vs Expo AsyncStorage) — unify to the decided behaviour once GM-03-Q06 is answered; today it is an acciden | Skip-persistence difference is a tiny parity fix once the skip rule is decided. |
| GM-04 | GM-04-Q06 | Are there org-level rates, policies or defaults (or is everything per pharmacy)? [NEW] | Org-level rates/policies are a convenience; per-pharmacy settings work at launch. |
| GM-04 | GM-04-Q09 | When is a worker's source (favourite, chain, org, public) frozen, and which wins if several apply? [ex-#184 CX-Q31] — NOT RE-VALIDATED | Source-freeze tie-break is a record-keeping detail; NOT RE-VALIDATED, verify before relying on it. |
| GM-04 | GM-04-Q10 | Do regions exist as a product concept, and if so what do they scope? [NEW] — CHANGED (role exists, geography still doesn't) | Regions as a product concept can wait; the role exists, geography does not. |
| GM-04 | CG-01 | Web `OrganizationCreate.tsx` is not routed anywhere — dead page | Dead unrouted page; delete it, no user impact. |
| GM-04 | CG-02 | `auto_publish_worker_requests` is read by NO backend code — the toggle changes nothing | Small fix; no safety/money/privacy impact identified in the area file. |
| GM-04 | CG-03 | `PharmacyOverviewContainer.tsx:93` TODO for admin scope | Admin-scope TODO is a UI nicety; org-admin powers are decided in Q05. |
| GM-04 | CG-07 | Membership invite flow not traced in depth; staff/locum manager screens not compared line-by-line (web vs Expo) | Small fix; no safety/money/privacy impact identified in the area file. |
| GM-05 | Q-10 | [ON-Q01] Which sign-up tracks should workers get at launch? (revalidated) | Sign-up tracks are launch scope; can launch with pharmacist + other-staff tracks. |
| GM-05 | Q-14 | [TB-Q08] What should the heart on a talent card do? | Talent-card heart behaviour is UX; favourites mechanics are decided elsewhere. |
| GM-05 | Q-18 | [NEW] The 3-pharmacy membership cap: keep it, raise it, or scope it? | The 3-pharmacy membership cap is a policy limit that can be raised later. |
| GM-05 | Q-19 | [NEW] Should the owner's own membership really be untouchable through the normal membership screen? | Owner-membership protection on the membership screen is admin UX polish. |
| GM-05 | CG-1 | `auto_publish_worker_requests` help text still promises "automatically create and publish a new shift", contradicting carried decisions R06/R04B (it is a per-ph | Small fix; no safety/money/privacy impact identified in the area file. |
| GM-05 | CG-8 | Invite `activate_immediately` flag can bypass the accept step for existing users; who can pass it and whether any UI exposes it was not inspected. | Small fix; no safety/money/privacy impact identified in the area file. |
| GM-06 | GM-06-Q05 | Should the product track leave balances and entitlements, or stay request-only? | Leave balances/entitlements tracking can stay request-only at launch. |
| GM-06 | GM-06-Q09 | Minimum staffing (coverage requirements): a rule, a warning, or decoration? | Minimum-staffing coverage is a warning/decoration at launch; enforcement can follow. |
| GM-06 | CG-03 | `CoverageRequirement` is never checked anywhere in the files read | CoverageRequirement never checked anywhere read; verify by whole-backend search, then decide (Q09). |
| GM-07 | GM-07-Q01 | Is the weekly draft → validate → publish → acknowledge roster the right shape? | Roster workflow shape works today; refining draft/validate/publish is a design choice. |
| GM-07 | GM-07-Q03 | Workers are asked to acknowledge the roster — what if they never do? | Unacknowledged rosters are a process detail; publication itself is the binding act. |
| GM-07 | CG-02 | `auto_publish_worker_requests` is read by NO backend code — the toggle changes nothing; its help text contradicts R06/R04B | Small fix; no safety/money/privacy impact identified in the area file. |
| GM-07 | CG-06 | `WorkerShiftRequest` model not read (status values, fields, indexes) — only its use in `worker_actions.py` was seen | Small fix; no safety/money/privacy impact identified in the area file. |
| GM-08 | GM-08-Q07 | QR scanning: confirm the current parameters and change nothing (scope freeze) | QR parameters are a scope freeze; confirm only, change nothing. |
| GM-08 | CG-04 | `Source.MANAGER` exists but nothing found writes it | Small fix; no safety/money/privacy impact identified in the area file. |
| GM-10 | GM-10-Q09 | Do drafts exist, and what does publishing a draft do? | Drafts are a convenience; posting works without them. |
| GM-10 | GM-10-Q10 | How does reposting work, and what carries over? | Reposting carry-over is a convenience; reposting from scratch works. |
| GM-10 | CG-10-02 | No end>start guard (overnight by convention only); equal times refused client-side only | Small fix; no safety/money/privacy impact identified in the area file. |
| GM-10 | CG-10-03 | No recurring-end cap (`recurring_end_date` unbounded) | Small fix; no safety/money/privacy impact identified in the area file. |
| GM-10 | CG-10-07 | No server-side draft state (in-memory only; session drop loses the post) | Server-side drafts are a convenience; in-memory drafts work until the session drops. |
| GM-11 | GM-11-Q06 | Who can start at a later tier, and can a tier be skipped entirely? 🟡 | Starting at a later tier or skipping tiers is an escalation-policy detail; tier gating itself is enforced separately. |
| GM-11 | GM-11-Q09 | What makes a shift "urgent", and does urgency change the audience/escalation? 🟡 | Urgency labelling is a display/policy detail; it does not change safety gates. |
| GM-11 | CG-11-02 | Per-request scan of every due shift on every list/detail load (performance) | Small fix; no safety/money/privacy impact identified in the area file. |
| GM-11 | CG-11-06 | Favourites lose community-list visibility past LOCUM_CASUAL (`browse.py:eligible_q`) — E01A partly violated | Small fix; no safety/money/privacy impact identified in the area file. |
| GM-11 | CG-11-10 | `base.py:get_queryset` does not filter by visibility tier (only `dedicated_user`); tier filtering lives only in `browse.py` | Small fix; no safety/money/privacy impact identified in the area file. |
| GM-12 | 5 | What can Explorers (new to pharmacy) do with shifts? | Policy/UX detail; the current behaviour is workable at launch and can be refined after. |
| GM-12 | 6 | Which ways can a worker get a shift at launch? | Policy/UX detail; the current behaviour is workable at launch and can be refined after. |
| GM-12 | 7 | Who may instant-book or be auto-accepted? | Policy/UX detail; the current behaviour is workable at launch and can be refined after. |
| GM-12 | 13 | What can a worker counter? | Policy/UX detail; the current behaviour is workable at launch and can be refined after. |
| GM-12 | 23 | Should must-have requirements block applying? | Policy/UX detail; the current behaviour is workable at launch and can be refined after. |
| GM-12 | 25 | What must the worker see before accepting? Does the pharmacy accept the same agreement? | Policy/UX detail; the current behaviour is workable at launch and can be refined after. |
| GM-12 | 26 | Code-gap timing questions (LAUNCH area, GM-12 slice) | Policy/UX detail; the current behaviour is workable at launch and can be refined after. |
| GM-12 | CG-05 | `reject_shift` has no role/verification check (`interest.py:192`). Almost certainly fine (declining is harmless) — confirm and leave, or add the check for symme | reject_shift lacking a role/verification check is almost certainly harmless; confirm and leave. |
| GM-12 | CG-07 | RESOLVED: buzz cooldown `SHIFT_OFFER_BUZZ_COOLDOWN` = 1 hour (`base.py`); `OFFER_EXPIRY_HOURS` = 48 (`assignment.py`). Do not quote other values. | Resolved: buzz cooldown 1h and offer expiry 48h confirmed; not a gap. |
| GM-12 | CG-12 | `getShiftCounterOffersBatch` returns `{}` when no ids are passed (`shared-core/api.ts:66-71`) — a stub fallback; confirm it cannot mask a real empty result. | Counter-offer batch stub returning {} needs a confirm-it-cannot-mask-real-results check only. |
| GM-13 | GM13-Q03 | Should reservations show a live payment countdown? (carried BK-Q13) | Live payment countdown is a display aid; the D02 deadline itself is the blocking item. |
| GM-14 | GM14-Q06 | Should both sides get a PDF copy of the agreement? (carried AG-Q03) | A PDF copy of the agreement is a convenience; terms are shown in-app at acceptance. |
| GM-15 | GM15-05 | CX-Q05 · How much notice counts as "enough window" for a normal manager approval? [STILL VALID] | 'Enough window' for manager approval is a process timing detail. |
| GM-15 | GM15-09 | CX-Q09 · What evidence may support an illness or emergency exemption? [STILL VALID] | Illness/emergency exemption evidence is a policy detail; a basic exemption rule can launch. |
| GM-15 | GM15-10 | CX-Q10 · Can a pharmacy emergency (closure, outage) waive the owner fee? [STILL VALID] | Pharmacy-emergency fee waiver is a policy detail; the fee rule itself is the blocking item. |
| GM-15 | GM15-18 | CX-Q18 · If the pharmacy cancels but offers the worker equal replacement work, is the fee waived? [STILL VALID] | Fee waiver for equal replacement work is a policy detail. |
| GM-15 | GM15-24 | CX-Q24 · How long to appeal, and how fast must support answer? [STILL VALID] | Appeal window and support response time are process timings; a basic process can launch. |
| GM-15 | GM15-29 | CX-Q29 · When should the reliability badge disappear? [STILL VALID] | When the reliability badge disappears is a display rule; the ladder itself is the blocking item. |
| GM-15 | GM15-31 | CX-Q31 · When is a worker's source (favourite, chain, org, public) frozen, and which wins if several apply? [STILL VALID] | Source-freeze tie-break is a record-keeping detail. |
| GM-15 | GM15-35 | CX-Q34 · Who can rate, and when? [CHANGED] | Who can rate, and when, is a reviews-policy detail. |
| GM-15 | GM15-36 | CX-Q35 · Should ratings from internal roster shifts appear on the public talent board? [STILL VALID] | Whether internal roster ratings appear publicly is a display decision. |
| GM-15 | GM15-42 | TB-Q05 · How should reviews and reliability show? [STILL VALID] | How reviews and reliability show is a display decision. |
| GM-15 | C3 | Shared-core `chargeShiftPenalty` sends `{hours}` the backend ignores | Shared-core sending {hours} the backend ignores is a dead parameter; remove it. |
| GM-16 | GM16-Q01 | Should the booking fee depend on shift length? | Length-dependent fees are a pricing refinement; a flat confirmed fee table can launch. |
| GM-16 | GM16-Q13 | If the pharmacy cancels an unpaid reservation, is any fee due? | No fee on cancelling an unpaid reservation is the recommended default; low risk if adopted. |
| GM-16 | GM16-Q17 | Pills: what are they, what are they worth, do they touch money? | Pills mechanics are traced; whether they touch money is a product decision that can be settled after launch if Pills do not move money. |
| GM-16 | CG-08 | Pills referral code not shown on either Pills screen (service exists, screens never call it) | Pills referral code not shown is a loyalty nicety. |
| GM-17 | GM17-Q08 | Should the booking fee depend on shift length? (PO-Q16, changed in part) | Length-dependent fees are a pricing refinement; a flat confirmed fee table can launch. |
| GM-17 | CG-04 | `voided_at` has no writer — no void endpoint/action anywhere (worker-finance.md confirms void not implemented). | Small fix; no safety/money/privacy impact identified in the area file. |
| GM-17 | CG-09 | `BILLING_LIVE_DATE` comment says "June 1, 2026" but the value is 2025-06-01 (`core/settings.py:681`) — misleading comment; value already past. | Small fix; no safety/money/privacy impact identified in the area file. |
| GM-17 | CG-10 | Legacy invoice UIs still live alongside the finance workspace on both platforms (web `InvoiceManagePage`/`LegacyInvoiceManagePage`, mobile legacy invoice routes | Legacy invoice UIs alongside the finance workspace are a consolidation task, not a launch gate. |
| GM-17 | CG-11 | Client `chargeShiftPenalty` sends `{hours}` which the server ignores — dead parameter; remove or honour it. | chargeShiftPenalty sending {hours} the server ignores is a dead parameter; remove it. |
| GM-17 | CG-12 | Stale-version refusal returns HTTP 400, not 409 (preserved contract per invoice acceptance doc) — keep the contract, document it; do not "fix" silently. | Stale-version 400-vs-409 is a preserved contract; document it, do not 'fix' it. |
| GM-18 | GM-18-Q04 | Talent-board filters: what filters exist, and do they leak identity? | Talent-board filters are a search convenience; visibility itself is the blocking item. |
| GM-18 | GM-18-Q05–Q06 | How do ratings/reviews show on talent posts ('0.0 (0)' for new workers)? | Rating display ('0.0 (0)' for new workers) is a display issue. |
| GM-18 | GM-18-Q22 | Talent-board filters (second group) / search behaviour | Talent-board filters (second group) are a search convenience. |
| GM-19 | GM-19-Q01 (ex AV-Q01) | How should workers set availability? — ✅ STILL VALID (screens now verified) | How workers set availability is a UX design choice; setting availability exists. |
| GM-19 | GM-19-Q07 (ex AV-Q07) | Should availability show when it was last confirmed? — ✅ STILL VALID (model verified, no field) | Showing when availability was last confirmed is a trust display. |
| GM-19 | GM-19-Q08 (ex AV-Q08) | Should urgent-shift alerts need a separate opt-in? — ✅ VERIFIED (single flag; no separate urgent consent) | Separate urgent-alert opt-in is a notification preference. |
| GM-19 | GM-19-Q09 (ex AV-Q09) | Should workers set a max distance and minimum rate for alerts? — 🔄 SPLIT (distance verified, rate verified absent) | Max distance and minimum rate filters are matching refinements. |
| GM-19 | GM-19-Q11 (NEW) | Should a roster availability warning block placement, or stay a warning? — ✅ VERIFIED (warning only) | Roster availability warning vs block is a UX choice; the warning exists. |
| GM-19 | CG-2 | Talent-post availability snapshot never syncs (AV-01; Q12). Structural fact in `models.py`; no sync mechanism exists. | Small fix; no safety/money/privacy impact identified in the area file. |
| GM-20 | GM20-Q03 | Should a chat thread be linked to a shift? | Linking a chat thread to a shift is an organisation convenience. |
| GM-20 | GM20-Q04 | Who belongs in a pharmacy's community chat, and can a pharmacy opt out? | Community-chat membership can be scoped or deferred at launch. |
| GM-20 | GM20-Q10 | How are people notified of messages, and can they mute a room? | Message notifications and room mute are notification preferences. |
| GM-20 | GM20-Q11 | Read receipts, typing, presence: what do people see? | Read receipts, typing and presence are UX polish. |
| GM-20 | GM20-Q13 | Should chat reactions include 💩? | Chat reactions (including the poo emoji) are cosmetic. |
| GM-20 | GM20-Q15 | Unread counts: fix the `?unread=1` filter or remove it? | The ?unread=1 filter is a UX bug; unread counts themselves are cosmetic. |
| GM-20 | GM20-Q18 | Hub posts: edit windows, pinning, tagging, polls — keep today's rules? | Hub edit windows, pinning, tagging and polls are feature details. |
| GM-20 | C01 | `GET /rooms/?unread=1` ignored by backend; `unread_total` never returned | Cleanup/polish; no user or money impact at launch. |
| GM-20 | C06 | REST message send broadcasts `message.created` twice (view + `post_save` signal); badge also sent twice from view + signal | Double broadcast of message.created is hygiene; clients already dedupe by id. |
| GM-20 | C07 | `shared-core` `startDm` carries a stale-build debug comment; two DM endpoints (by-user / by-membership) overlap | Stale-build debug comment and overlapping DM endpoints are cleanup. |
| GM-20 | C08 | `getUnreadRoomSummary` return type promises `unread_total` the backend never sends | Covered by C01 (unread filter). |
| GM-20 | C10 | Shift-contacts only covers `slot_date >= today` assignments; offers/interest and past shifts never appear | Shift-contacts covering only today-and-later assignments is a gap only if Q02/Q03 want offers/history listed. |
| GM-20 | C12 | Expo still shows "Hub will live here. Coming soon." when hub context loads as null | Cleanup/polish; no user or money impact at launch. |
| GM-20 | C13 | No message search in chat (rooms list search exists on clients; message content search does not) | No message search in chat is a missing feature; rooms-list search exists. |
| GM-20 | C16 | Owner without a staff membership: `get-or-create-group` returns the community room but adds no Participant row — WS send/receive eligibility untested | Small fix; no safety/money/privacy impact identified in the area file. |
| GM-21 | GM21-Q01 | Do we launch the goods marketplace at all, and for whom? [FIRST — see Part D] — VERIFIED, recommendation strengthened | Marketplace is deferred from the launch cut (LAUNCH-01); no marketplace transaction happens at launch. If it ever launches, banned-goods enforcement (Q02), identity checks (Q05), moderation (Q14) and ethical-medicines rules (Q15) become blocking first. |
| GM-21 | GM21-Q02 | What may be traded, and what is banned? — VERIFIED | Marketplace is deferred from the launch cut (LAUNCH-01); no marketplace transaction happens at launch. If it ever launches, banned-goods enforcement (Q02), identity checks (Q05), moderation (Q14) and ethical-medicines rules (Q15) become blocking first. |
| GM-21 | GM21-Q03 | Who can sell personally, and who can sell for a pharmacy? — VERIFIED | Marketplace is deferred from the launch cut (LAUNCH-01); no marketplace transaction happens at launch. If it ever launches, banned-goods enforcement (Q02), identity checks (Q05), moderation (Q14) and ethical-medicines rules (Q15) become blocking first. |
| GM-21 | GM21-Q04 | Who can buy, and how far does a listing travel? — CHANGED (public catalogue is wider than the model promises) | Marketplace is deferred from the launch cut (LAUNCH-01); no marketplace transaction happens at launch. If it ever launches, banned-goods enforcement (Q02), identity checks (Q05), moderation (Q14) and ethical-medicines rules (Q15) become blocking first. |
| GM-21 | GM21-Q05 | What identity check must a trader pass before listing or buying? — VERIFIED | Marketplace is deferred from the launch cut (LAUNCH-01); no marketplace transaction happens at launch. If it ever launches, banned-goods enforcement (Q02), identity checks (Q05), moderation (Q14) and ethical-medicines rules (Q15) become blocking first. |
| GM-21 | GM21-Q06 | Which marketplace terms must a user accept, and when? — VERIFIED | Marketplace is deferred from the launch cut (LAUNCH-01); no marketplace transaction happens at launch. If it ever launches, banned-goods enforcement (Q02), identity checks (Q05), moderation (Q14) and ethical-medicines rules (Q15) become blocking first. |
| GM-21 | GM21-Q07 | How does listing review work, and how fast? — VERIFIED | Marketplace is deferred from the launch cut (LAUNCH-01); no marketplace transaction happens at launch. If it ever launches, banned-goods enforcement (Q02), identity checks (Q05), moderation (Q14) and ethical-medicines rules (Q15) become blocking first. |
| GM-21 | GM21-Q08 | Sell, swap, free: what are the price rules? — VERIFIED | Marketplace is deferred from the launch cut (LAUNCH-01); no marketplace transaction happens at launch. If it ever launches, banned-goods enforcement (Q02), identity checks (Q05), moderation (Q14) and ethical-medicines rules (Q15) become blocking first. |
| GM-21 | GM21-Q09 | Audience circles and escalation: who sees it first, and when does it widen? — VERIFIED | Marketplace is deferred from the launch cut (LAUNCH-01); no marketplace transaction happens at launch. If it ever launches, banned-goods enforcement (Q02), identity checks (Q05), moderation (Q14) and ethical-medicines rules (Q15) become blocking first. |
| GM-21 | GM21-Q10 | Enquiry or firm offer: what is an exchange, and when is a listing held? — CHANGED (reservations never expire) | Marketplace is deferred from the launch cut (LAUNCH-01); no marketplace transaction happens at launch. If it ever launches, banned-goods enforcement (Q02), identity checks (Q05), moderation (Q14) and ethical-medicines rules (Q15) become blocking first. |
| GM-21 | GM21-Q11 | How is money handled — in-platform, or off-platform? — VERIFIED (no payment path exists) | Marketplace is deferred from the launch cut (LAUNCH-01); no marketplace transaction happens at launch. If it ever launches, banned-goods enforcement (Q02), identity checks (Q05), moderation (Q14) and ethical-medicines rules (Q15) become blocking first. |
| GM-21 | GM21-Q12 | Delivery and pickup: who pays, who organises, what proves it arrived? — VERIFIED | Marketplace is deferred from the launch cut (LAUNCH-01); no marketplace transaction happens at launch. If it ever launches, banned-goods enforcement (Q02), identity checks (Q05), moderation (Q14) and ethical-medicines rules (Q15) become blocking first. |
| GM-21 | GM21-Q13 | Internal transfers between a owner's pharmacies: transfer or listing? — CHANGED (no destination acceptance exists) | Marketplace is deferred from the launch cut (LAUNCH-01); no marketplace transaction happens at launch. If it ever launches, banned-goods enforcement (Q02), identity checks (Q05), moderation (Q14) and ethical-medicines rules (Q15) become blocking first. |
| GM-21 | GM21-Q14 | Moderation, reports, restrictions: who acts, how fast, can it be appealed? — VERIFIED | Marketplace is deferred from the launch cut (LAUNCH-01); no marketplace transaction happens at launch. If it ever launches, banned-goods enforcement (Q02), identity checks (Q05), moderation (Q14) and ethical-medicines rules (Q15) become blocking first. |
| GM-21 | GM21-Q15 | The ethical marketplace (medicines): who can use it, and what are the "ethical" rules? — VERIFIED (whole app traced) | Marketplace is deferred from the launch cut (LAUNCH-01); no marketplace transaction happens at launch. If it ever launches, banned-goods enforcement (Q02), identity checks (Q05), moderation (Q14) and ethical-medicines rules (Q15) become blocking first. |
| GM-21 | GM21-Q16 | What are buyers and sellers told, and what happens when a notification fails? — VERIFIED (no notifications exist) | Marketplace is deferred from the launch cut (LAUNCH-01); no marketplace transaction happens at launch. If it ever launches, banned-goods enforcement (Q02), identity checks (Q05), moderation (Q14) and ethical-medicines rules (Q15) become blocking first. |
| GM-21 | GM21-Q17 | Photos: what shows before review, and what is banned in images? — VERIFIED | Marketplace is deferred from the launch cut (LAUNCH-01); no marketplace transaction happens at launch. If it ever launches, banned-goods enforcement (Q02), identity checks (Q05), moderation (Q14) and ethical-medicines rules (Q15) become blocking first. |
| GM-21 | GM21-Q18 | Catalogue products and imports: who adds products, and who checks the rights? — VERIFIED | Marketplace is deferred from the launch cut (LAUNCH-01); no marketplace transaction happens at launch. If it ever launches, banned-goods enforcement (Q02), identity checks (Q05), moderation (Q14) and ethical-medicines rules (Q15) become blocking first. |
| GM-21 | GM21-Q19 | Web vs Expo parity: which marketplace screens exist on each client? — VERIFIED | Marketplace is deferred from the launch cut (LAUNCH-01); no marketplace transaction happens at launch. If it ever launches, banned-goods enforcement (Q02), identity checks (Q05), moderation (Q14) and ethical-medicines rules (Q15) become blocking first. |
| GM-21 | GM21-Q20 | Fees and commission: does the platform charge for trades? — VERIFIED (no fee anywhere) | Marketplace is deferred from the launch cut (LAUNCH-01); no marketplace transaction happens at launch. If it ever launches, banned-goods enforcement (Q02), identity checks (Q05), moderation (Q14) and ethical-medicines rules (Q15) become blocking first. |
| GM-21 | CG-01 | No payment path in either marketplace app. No payment/fee/Stripe/refund/payout field on any model; no payment code in views/services/tasks/signals/serializers/a | No payment path in either marketplace: marketplace deferred from launch (LAUNCH-01). |
| GM-21 | CG-02 | No notification is ever sent by either marketplace. Outbox models exist (`MarketplaceNotificationOutbox`, ethical outbox) with dedup key + retry fields, but not | No marketplace notifications: marketplace deferred from launch (LAUNCH-01). |
| GM-21 | CG-03 | `public_discovery` is never consulted. Field defaults True; public catalogue shows every PUBLISHED listing to anyone, anonymous included, regardless of circle | public_discovery never consulted: marketplace deferred from launch (LAUNCH-01). |
| GM-21 | CG-04 | Reservations never expire. `MarketplaceReservation.expires_at` nullable with no default; `accept_exchange` sets none; no release task; the EXPIRED exchange stat | Reservations never expire: marketplace deferred from launch (LAUNCH-01). |
| GM-21 | CG-05 | Review is Django-admin-only, no SLA, no revision API. `MarketplaceListingRevision` is model-only (never referenced in views/services/tasks/signals); no appeal p | Review is Django-admin-only with no SLA/appeal: marketplace deferred from launch (LAUNCH-01). |
| GM-21 | CG-06 | Write flags default off — read-only catalogue at defaults. `NEW_LISTINGS`/`CONTACT`/`NEW_COMMITMENTS`/`ESCALATION`/`CATALOGUE_LOOKUP` False; ethical writes Fals | Write flags default off (read-only catalogue at defaults): marketplace deferred from launch (LAUNCH-01). |
| GM-21 | CG-07 | Internal transfers are owner-driven with no destination-manager acceptance. No accept/reject action for the destination pharmacy | No destination acceptance for internal transfers: marketplace deferred from launch (LAUNCH-01). |
| GM-21 | CG-08 | Next composer buyer-role checkboxes exclude the Explorer-family roles though the backend allows all 8 roles as personal sellers/buyers | Next composer role checkboxes exclude Explorer-family roles: marketplace deferred from launch (LAUNCH-01). |
| GM-21 | CG-09 | Prohibited-goods list is guidance only. Seed `field_schema` "prohibited" lists are not enforced in `can_list_category`; only `requires_review` + human reviewer  | Prohibited-goods list is guidance only: marketplace deferred from launch; becomes blocking if the marketplace ever launches. |
| GM-21 | CG-10 | No revocation-freeze path. Nothing freezes live listings/exchanges when `IdentityVerification` is revoked or a pharmacy loses `verified` | No revocation-freeze path: marketplace deferred from launch (LAUNCH-01). |
| GM-21 | CG-11 | Goods sitemap content not verified. `public_sitemap.py` exists; whether PUBLISHED listings appear in it was not read (ethical listings are documented as never i | Goods sitemap content unverified: marketplace deferred from launch (LAUNCH-01). |
| GM-22 | GM22-08 · AV-Q08 | Should urgent-shift alerts need a separate opt-in? 🟡 decision — CHANGED | Separate urgent-alert opt-in is a notification preference. |
| GM-22 | GM22-09 · AV-Q09 | Should workers set a max distance and minimum rate for alerts? 🟡 decision — CHANGED (partial) | Max distance and minimum rate filters are matching refinements. |
| GM-22 | GM22-15 · AG-Q03 | Should both sides get a PDF copy of the agreement? 🟡 decision — NOT RE-VALIDATED | PDF copy of the agreement is a convenience; terms are shown in-app at acceptance. NOT RE-VALIDATED. |
| GM-22 | GM22-17 · NEW | Is there an in-app notification centre, and what does it do? 🟠 decision — TRACED | An in-app notification centre is UX; email and push already carry notices. |
| GM-22 | GM22-18 · NEW | How do Expo push notifications work, and what happens when permission is denied? 🔴 decision — TRACED | Push-permission-denied behaviour is UX; in-app and email notices still exist. |
| GM-22 | GM22-20 · NEW | What notification preferences can a worker (and a pharmacy) set — including quiet hours? 🟡 decision — TRACED | Notification preferences and quiet hours are user preferences. |
| GM-22 | GM22-22 · NEW | What Pills / rewards notifications exist (earn, spend, expiry, low balance)? 🟡 decision — TRACED | Pills/rewards notifications are a loyalty feature. |
| GM-22 | GM22-24 · NEW | Is either side told when a rating is left, or when a reliability badge / incident is applied? 🟡 decision — TRACED (ratings) / NOT RE-VALIDATED (incidents) | Rating notices are a courtesy; incident notices need re-validation before relying on them. |
| GM-22 | GM22-28 · NEW | Do chat / hub messages notify, and where does GM-22 end and GM-20 (Chat/Hubs) begin? 🟡 decision — TRACED (boundary) | Chat/hub notification boundary is a routing detail between two working systems. |
| GM-22 | CG-07 | Email retry then drop, no bounce handling. Celery autoretry max 5 then dropped, no dead-letter; failure only logged; no bounce handling anywhere traced | Small fix; no safety/money/privacy impact identified in the area file. |
| GM-22 | CG-12 | Push denied → silent null. No retry prompt, no in-app explanation traced; push handler has no sound/badge | Push denied leads to silent null; in-app and email notices still exist. |
| GM-22 | CG-15 | AHPRA admin email uses raw `send_mail` (synchronous, not the async task path) | AHPRA admin email using raw send_mail is a reliability nicety; it still sends. |
| GM-23 | GM-23-02 | AV-Q01. How should workers set availability? (ADOPTED GM-19) | How workers set availability is a UX design choice; setting availability exists. |
| GM-23 | GM-23-08 | AV-Q07. Should availability show when it was last confirmed? (ADOPTED GM-19) | Showing when availability was last confirmed is a trust display. |
| GM-23 | GM-23-09 | AV-Q08. Should urgent-shift alerts need a separate opt-in? (ADOPTED GM-19 + new context) | Separate urgent-alert opt-in is a notification preference. |
| GM-23 | GM-23-10 | AV-Q09. Should workers set a max distance and minimum rate for alerts? (ADOPTED GM-19) | Max distance and minimum rate filters are matching refinements. |
| GM-23 | GM-23-15 | PO-Q07. How should owners repeat a past shift? (re-verified as far as traced) | Repeating a past shift is a convenience; posting from scratch works. |
| GM-23 | GM-23-19 | NEW. Operations tasks / rules engine: what rules run, when, and who acts on them? (verified this trace — the engine is gone) | The operations-rules engine is gone; it is a missing feature, not a launch gate. |
| GM-23 | GM-23-20 | NEW. Leave on the calendar: how do leave / roster / cover requests appear? (verified this trace) | Leave display on the calendar is a display detail; leave itself is enforced elsewhere. |
| GM-23 | GM-23-21 | NEW. Shift display on the calendar: what state does each entry show? (verified this trace) | Shift display states on the calendar are a display detail. |
| GM-23 | GM-23-22 | NEW. Operations dashboard: what does it show, to whom, and how fresh is it? (verified this trace — NOT BUILT) | The operations dashboard is not built; role dashboards exist. |
| GM-23 | GM-23-25 | NEW. External calendar: export / sync to Google / Outlook / Apple, or ICS download? (verified this trace — NOT BUILT) | External calendar export/sync is a convenience; no export exists today. |
| GM-23 | GM-23-26 | NEW. Calendar notifications: which calendar events notify, on which channel, and can the worker turn them off? (verified this trace) | Calendar-notification preferences are a notification detail covered by GM-22. |
| GM-23 | GM-23-27 | NEW. Roster publishing: what does publishing a roster do to calendars, and can it be undone? (verified this trace) | Roster publish/unpublish calendar effects are display details; the unpublish notice itself is GM-07 CG-04. |
| GM-23 | GM-23-29 | NEW. Calendar history / audit: can the owner see who changed what, when? (verified this trace — split) | Calendar history/audit is a records nicety; roster actions are already audited. |
| GM-23 | CG-02 | Talent-post availability snapshot never syncs (LA-Q16 / AV-01) | Small fix; no safety/money/privacy impact identified in the area file. |
| GM-23 | CG-07 | Operations-rules engine is gone; Oct citation dead (ON-02) | Operations-rules engine is gone; it is a missing feature, not a launch gate. |
| GM-23 | CG-12 | No calendar export / sync (GM-23-25) | No calendar export/sync is a convenience; nothing exists on any client. |
| GM-23 | CG-13 | No operations dashboard (GM-23-22) | No operations dashboard is a missing feature; role dashboards exist. |
| GM-23 | CG-15 | Team calendar and roster calendar never meet | Team calendar and roster calendar never meet; a unified view is a convenience. |
| GM-23 | CG-17 | No audit trail for calendar events / work notes | No audit trail for calendar events/work notes is a records nicety; roster actions are audited. |
| GM-24 | GM-24-Q05 | Which sign-up tracks should workers get at launch? | Sign-up tracks are launch scope; can launch with pharmacist + other-staff tracks. |
| GM-24 | GM-24-Q16 | How should reviews and reliability show? | How reviews and reliability show is a display decision. |
| GM-24 | GM-24-Q17 | Who can rate, and when? | Who can rate, and when, is a reviews-policy detail. |
| GM-24 | GM-24-Q18 | Should ratings from internal roster shifts appear on the public talent board? | Whether internal roster ratings appear publicly is a display decision. |
| GM-24 | GM-24-Q20 | Should urgent-shift alerts need a separate opt-in? | Separate urgent-alert opt-in is a notification preference. |
| GM-24 | GM-24-Q22 | NEW: The Explorer Community tab is always empty — hide it or open community to Explorers? | The permanently empty Explorer Community tab can be hidden at launch. |
| GM-24 | GM-24-Q28 | NEW: Public-board role filter has no Explorer option — add it? | Public-board role filter lacking an Explorer option is a filter nicety. |
| GM-24 | GM-24-Q29 | NEW: Daily public-shift limit is 10 per pharmacy per day — keep? | The 10-per-day public-shift limit is a policy cap that can be tuned later. |
| GM-24 | GM-24-Q30 | NEW: Talent view counts — every authenticated view counts, no cap — keep? | Talent view-count inflation is a metrics nicety. |
| GM-24 | CG-03 | Sitemap shift URLs use `?id=`; the share page needs `?token=` — dead links | Small fix; no safety/money/privacy impact identified in the area file. |
| GM-24 | CG-05 | Web/mobile `canRequestBooking` drift (fixed list vs any-non-worker; mobile proceeds without `dedicated_user`) | Small fix; no safety/money/privacy impact identified in the area file. |
| GM-24 | CG-06 | `add_view` counts every authenticated call, no cap | add_view counts every authenticated call; view-count inflation is a metrics nicety. |
| GM-24 | CG-07 | Talent filtering is client-side only (`loadAllTalentPages`, page_size 200 on public page); no backend filter params | Small fix; no safety/money/privacy impact identified in the area file. |
| GM-24 | CG-10 | Explorer Community tab permanently empty with no message (backend membership gate) | Small fix; no safety/money/privacy impact identified in the area file. |
| GM-24 | CG-12 | Daily public-shift limit (10/day) is silent until hit (400 at submit) | Daily public-shift limit is silent until hit; a surfaced message is UX polish. |
| GM-25 | GM25-C10 | Profile progress % does not match Verified (NOT RE-VALIDATED) | Profile progress % mismatch is a display issue; Verified is enforced server-side. NOT RE-VALIDATED. |
| GM-25 | GM25-C17 | What should the heart on a talent card do? (NOT RE-VALIDATED) | Talent-card heart behaviour is UX. NOT RE-VALIDATED. |
| GM-25 | GM25-C18 | Should reservations show a live payment countdown? (NOT RE-VALIDATED) | Live payment countdown is a display aid; the D02 deadline itself is the blocking item. NOT RE-VALIDATED. |
| GM-25 | GM25-Q06 | Navigation and routing parity: one nav model, or one per surface? | Navigation-model parity is UX; each surface can navigate differently if every destination exists. |
| GM-25 | GM25-Q12 | Kiosk: web-only, or does Expo do kiosk too? | Kiosk can be web-only at launch; Expo kiosk is a later surface. |
| GM-25 | GM25-Q14 | Error, retry, and crash UX: one standard across clients? | Error/retry/crash UX standard is polish; the underlying errors are handled per-flow. |
| GM-25 | GM25-Q15 | 'Coming soon' policy: what may ship labelled coming-soon? | 'Coming soon' labelling policy is a launch-honesty detail; the screens themselves are Q05. |
| GM-25 | GM25-Q16 | Web to app install handoff: where does web send phone users? | Web-to-app install handoff is a growth convenience. |
| GM-25 | GM25-Q18 | Twin-drift prevention after launch: who owns parity? | Twin-drift prevention after launch is a process for after launch. |
| GM-25 | CG-3 | Profile progress % not re-validated; progress.py not re-read (NOT RE-VALIDATED) | Profile progress % not re-validated; display issue, Verified is enforced server-side. Evidence NOT RE-VALIDATED. |
| GM-25 | CG-10 | auto_publish_worker_requests: decorative on web, invisible on mobile, never read by backend; help text contradicts R06/R04B | Small fix; no safety/money/privacy impact identified in the area file. |
| GM-25 | CG-15 | Talent-post availability copied once, never syncs | Small fix; no safety/money/privacy impact identified in the area file. |
| GM-26 | GM-26 old questions (from #184) | GM-26 old questions (from #184) | Policy/UX detail; the current behaviour is workable at launch and can be refined after. |
| GM-26 | GM26-Q18 | [P2 · decision] Should urgent-shift alerts need a separate opt-in? | Separate urgent-alert opt-in is a notification preference; NOT RE-VALIDATED. |
| GM-26 | GM26-Q23 | [P2 · decision] How long to appeal, and how fast must support answer? | Appeal window and support response time are process timings; NOT RE-VALIDATED. |
| GM-26 | GM26-Q27 | [P1 · decision] Who can rate, and when? / Should internal roster ratings appear on the public talent board? | Who can rate, and when, is a reviews-policy detail; internal-roster rating display is a display decision. |
| GM-26 | GM-26 new questions (no #184 predecessor | first traced to completion here) | Policy/UX detail; the current behaviour is workable at launch and can be refined after. |
| GM-26 | CG-13 | Native pairing-code downgrade | Small fix; no safety/money/privacy impact identified in the area file. |

## Caveats and evidence limits

- **No CI, device or payment tests were run for this labelling.** Severity for GM-25/GM-26 release items (exact-head CI, staging, physical iOS/Android, pentest GM26-Q43, Senior Package Testing) rests on the *absence* of evidence in the trace files and the audit, not on a test run. Do not treat 'blocking' here as proof a test failed; it is proof the evidence does not exist.
- **NOT RE-VALIDATED items** (GM-02 ON-Q15; GM-05 Q-16/Q-17; GM-22 Q07, Q15 and Q03's cancel half; GM-25 C05, C06, C07, C10, C17, C18; GM-26 Q07, Q12–Q20, Q22–Q26, Q33) were labelled on the subject matter of the question, with the evidence gap flagged in the row. Their severity must be re-confirmed when the re-validation pass runs.
- **GM-18 is incomplete.** Only the 39-line senior-review summary was recovered; the 26 full question records are missing. Its rows here are the senior review's grouped gaps plus a blocking row for the missing trace itself. Reconstruct the trace before the owner interview.
- **PR #257 / #260 / #261 / #262 are not reconciled here.** Later mobile/chat/CI work (220 commits ahead of the traced head) may have fixed or changed some gaps; the audit warns not to claim #249 defects persist or were resolved in #257 without re-reading both. Re-inspection at the current head is required before closing any row.
- **GM-21/GM-22 search-only caveat:** some findings rest on default-branch code search, not exact-head reads; flagged where the area file says so.
- **Marketplace (GM-21) is optional only because LAUNCH-01 defers it.** If the marketplace ever launches, its banned-goods enforcement, identity checks, moderation, payment path and ethical-medicines rules become blocking first.
- **Approved decisions are not re-asked.** R04A/R04C/R06/E01A/D02/D03 are APPROVED + IMPLEMENTATION_GAP. A broken implementation cannot revoke an owner decision; only an explicit new owner decision can supersede one.

## Sources

- 26 per-area trace files (paths in the task brief), traced at PR #249 head `97c4543e`.
- `/tmp/grill267/GRILL_ME_CONSOLIDATED_QUEUE.md.md` (corrected consolidated queue, 524 after 16 merges).
- `/tmp/grill267/OWNER_DECISION_LEDGER.md.md` (binding decisions; R04A/R04C/R06/E01A/D02/D03 IMPLEMENTATION_GAPs).
- `/tmp/grill267/INDEPENDENT_SENIOR_AUDIT_2026-11-21.md.md` (independent senior audit; senior-review passes do not equal production acceptance).
