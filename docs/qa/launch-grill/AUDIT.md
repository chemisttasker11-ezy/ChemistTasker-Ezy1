# ChemistTasker launch-gap audit: onboarding, shifts, talent board, availability

Repo: `C:\dev\worktrees\chemisttasker-pr182` (PR #182 head). Read-only code audit, 2026-10-20.
I left out anything that OWNER_DECISION_REGISTER.md or GRILL.md already settles (D01–D05, R01/R04/R06, E01/E03,
P02–P12, F01/F04, the cumulative ORG_CHAIN visibility fix). Where a gap touches a decision those files list as still
open (D06–D15), I name that ID rather than asking it again.
**Code gap** = no decision needed, just build or fix. **Decision gap** = the owner must choose first.
Paths are relative to the repo root.

---

## 1. Onboarding (workers, owners, organisations)

**What exists**
- Self-signup roles OWNER / PHARMACIST / OTHER_STAFF / EXPLORER, the same on web and mobile (`users/models.py:50`, `frontend_web/src/pages/register.tsx`, `frontend_mobile/app/register.tsx`).
- One "Verified" rule: email + mobile, plus AHPRA for pharmacists and interns; ID for overseas explorers (`backend/onboarding/verification/policy.py`).
- AHPRA lookup by scraping (`onboarding/verification/ahpra.py`), ID and certificates by Azure OCR (`verification/documents.py`), referee flow, and ABN lookup with entity confirmation.
- Profile tabs match on web and mobile. Pharmacist: basic, identity, payment, profile, rates, referees, skills. Other staff: the same plus regulatory. Explorer: basic, identity, interests, profile, referees (`frontend_web/src/pages/onboarding/*`, `frontend_mobile/app/{pharmacist,otherstaff,explorer}/profile-*.tsx`).
- ABN/TFN readiness is checked when an external offer is accepted (`backend/shifts/engagement.py:179,245`). TFN payroll details can be added after acceptance.
- Owner setup gate (onboarding, then pharmacies, skippable) on both platforms (`frontend_web/src/utils/ownerSetup.ts`, `frontend_mobile/utils/ownerSetup.ts`).
- Pharmacy model holds site details, hours, ABN checks, documents, rates and payroll opt-in (`organizations/models.py:95-235`). Staff and locum invites are in `memberships/invites.py`, web PharmacyPage, and mobile StaffManager/LocumManager.

**Gaps**
- **ON-01 · decision gap. The Verified/AHPRA check only applies to applying for public shifts.**
  `shifts/interest.py:71` checks Verified only when `visibility == PLATFORM`. Accepting an offer (`offers.py`), dedicated offers (`assignment.py:231`), and chain/org/favourite-tier interest never check Verified or AHPRA.
  Talent-board "Request booking" creates a dedicated offer for any user id (`TalentBoard/index.tsx:358`).
  *Why it matters:* an unverified or unregistered "pharmacist" can be booked through a direct offer or a chain-tier shift.
  *Question:* where must Verified (plus current AHPRA) be enforced?
  A) only when applying for public shifts (today) · B) at every external acceptance (offer accept, claim, dedicated offer) · C) B plus rostering into pharmacist or intern roles.
- **ON-02 · code gap. AHPRA expiry is never enforced at apply or accept.**
  `ahpra_expiry_date` is saved (`ahpra.py:136`) but only checked for talent posts (`talent/views/explorer.py:154`) and ops tasks (`team_calendar/operations_rules.py:114`).
  There is no scheduled re-check, and Verified stays true after the registration lapses.
  *Why it matters:* the pharmacist register is the core legal trust signal.
- **ON-03 · decision gap. Professional indemnity insurance is not captured anywhere.**
  There is no field or upload; the only trace is a comment in `onboarding/services/skills.py:61`.
  *Question:* A) not required (pharmacy's responsibility) · B) required upload for ABN pharmacists, blocks acceptance · C) required for every ABN worker · D) shown as a badge only.
- **ON-04 · code gap. The mobile "add personal profile" flow for pharmacy managers is broken.**
  `frontend_mobile/components/ChooseAccountTypeCard.tsx:10` sends Pharmacist to the legacy `roles/pharmacist/onboarding.tsx`. That screen posts `bsb`, `account_number`, `bank_account_name`, `preferred_hourly_rate`, `minimum_rate`, `overtime_multiplier` and `weekend_premium`; none of these exist on the backend, so they are silently dropped.
  Intern, technician, assistant and student go to `/otherstaff/onboarding`, which has no file in `app/`, so they land on not-found.
  *Why it matters:* every manager who upgrades on mobile hits a dead end or loses their data.
- **ON-05 · code gap. Dead or half-built mobile screens.**
  - `app/owner/onboarding/step1-3,review.tsx`: only link to each other; the live flow is `setup/owner/onboarding`.
  - `roles/owner/shifts/create.tsx`: a hidden route that posts `hourly_rate`, which is not a backend field.
  - `roles/explorer/shifts.tsx`: just the text "Shifts". Web explorers get Public/Community shifts (`navigation.tsx:510`).
  - `roles/owner/hub.tsx` and `shared/hub/HubPlaceholder.tsx`: "coming soon".
  - `PharmacyOverviewContainer.tsx:93`: TODO for admin scope.
  - Web: `OrganizationCreate.tsx` is not routed anywhere.
- **ON-06 · decision gap. Pharmacy verification does not gate posting.**
  `Pharmacy.verified` is only read by the ethical marketplace (`marketplace/policy.py:100`). `shifts/posting.py:62` checks neither it nor `abn_verified`.
  *Why it matters:* workers see and accept shifts from unverified or fake sites.
  *Question:* A) nothing required (today) · B) ABN verified before any external posting · C) ABN verified plus admin-verified before PLATFORM tier · D) B for chain/org tiers, C for public.
- **ON-07 · decision gap. Organisations cannot sign up themselves.**
  `OrganizationViewSet.create` requires a platform admin (`organizations/views.py:63`), there is no ORGANIZATION signup role, and the web create page is dead (ON-05).
  *Question:* A) sales-led: a platform admin creates the org, then invites its admins (delete the dead page) · B) self-serve signup that waits for admin approval · C) self-serve with immediate access.
- **ON-08 · decision gap. No saved payment method at pharmacy setup.**
  Every booking opens a new Stripe Checkout (`billing/views.py:703`); nothing stores a card.
  With D02, a shift that starts in under 2 hours gives the owner 30 minutes to finish checkout.
  *Question:* A) keep one checkout per booking · B) save a card during pharmacy setup and charge automatically when the reservation is accepted · C) B for subscribers, A for others.
- **ON-09 · decision gap. What can explorers ("new to pharmacy") do with shifts?**
  - Web shows them shift boards, but the interest gate has no EXPLORER branch, so explorers get no verification check (`interest.py:38-62`).
  - `engagement.worker_onboarding()` looks explorers up in OtherStaffOnboarding (`engagement.py:25`), so they can never accept.
  - There is no explorer payment tab on either platform.

  *Question:* A) no shifts: hide boards and apply for explorers · B) unpaid shadowing/volunteer posts only · C) paid shifts only after upgrading to a staff role (UpgradeAccountCard exists).
- **ON-10 · code gap. The progress % does not match what Verified needs.**
  `onboarding/services/progress.py` counts resume, bio, rates, referees and ID, while Verified needs email + mobile + AHPRA.
  A worker can show 90% and still be blocked, or 40% and already be Verified. Drive the UI from `verification_summary().missing` instead.
- **ON-11 · code gap. Payment readiness only shows up at the moment of acceptance.**
  `worker_payment_profile_status` (`engagement.py:179`) is only exposed to managers (`memberships/serializers.py:336`).
  The worker learns "ABN must be verified" or "confirm ABN entity" only when accepting. Show it on the apply and offer screens.

## 2. Shifts (post → apply → reserve/pay → agreement → cancel/cover → timesheet → rate)

**What exists**
- One shared posting wizard: web `frontend_web/shared/postShift/*`, mobile `roles/shared/shifts/PostShift*`. Both cover role, rates, slots/recurring, single-user, urgent, travel/accommodation, must/nice-to-have, visibility tier, escalation times, notify flags, anonymous and dedicated user.
- Interest, offers, counter-offers, decline, reveal and buzz (`shifts/interest.py`, `offers.py`, `counter_offers.py`, `base.py`).
- D01–D03 reservations and deadlines, with expiry scheduled every 60s (`shifts/reservations.py`, `core/settings.py:281`). Stripe fulfilment checkout and an idempotent webhook (`billing/views.py:556,860`).
- Engagement terms (TFN casual/Award floor vs ABN contractor) are built, accepted and frozen per offer and assignment (`shifts/engagement.py:523-701`).
- Roster cover/swap/leave requests (`shifts/worker_requests.py`, `workforce/roster/worker_actions.py`) on web `RosterWorkerPage` and mobile `app/my-roster.tsx`. Manager approvals on both.
- Deletion is blocked once anyone has engaged (`shifts/deletion.py`). P09 fee calculator with no side effects (`shifts/cancellation_policy.py`). Timesheets route to payroll or invoicing (`workforce/timesheet_transitions.py`). Ratings (`ratings/views.py`).

**Gaps**
- **SH-01 · decision gap (D04 detail / D07 / D13). A confirmed external booking cannot be cancelled by either side.**
  - Shift and ShiftSlotAssignment have no cancelled, no-show or completed state (`shifts/models.py:463-530`).
  - DELETE is blocked once anyone has engaged. No cancel endpoint exists.
  - `WorkerShiftRequest` covers roster work only: its emails link to the roster, and the UI is only on the roster screens. Marketplace locums have no "can't make it" button on web or mobile.

  *Why it matters:* this will happen in week one, and support will end up editing the database.
  *Question (launch scope):* A) support-only cancellation: admin action with reason and audit, no fees · B) owner cancel plus worker cancel-request (R04D manager approval), with notices, fee shown but not charged · C) hold launch until fees are enforceable.
- **SH-02 · code gap. The legacy penalty route is still live.**
  `billing/urls.py:11` `charge-penalty/` (10%/20%) is still routed and exported from `shared-core/src/domains/billing/api.ts`, although no UI calls it. The register says to suspend it; remove the route.
- **SH-03 · code gap. Fulfilment fee bugs.**
  - `is_subscriber` is computed (`billing/views.py:677`) but never used, so subscribers pay the full $30/$80 instead of $15/$40.
  - Price IDs are hard-coded (`:691`), so test and live mode cannot differ.
  - The fee is per offer, whatever the number of hours or days.
- **SH-04 · decision gap. Billing is already live, with no trial.**
  `BILLING_LIVE_DATE = 2025-06-01`, but its comment says "June 1, 2026" (`core/settings.py:655`), and `FREE_TRIAL_DAYS = 0`. So every external booking needs a paid checkout today.
  *Question:* A) charge from launch day · B) free until a set date · C) an N-day trial per new pharmacy.
- **SH-05 · code gap. Scheduled escalation only runs when someone loads a shift list.**
  `auto_escalate_due_shifts` runs inside `BaseShiftViewSet.get_queryset` (`shifts/base.py:163-173`) on every list or detail request. There is no beat task; `celery.py` schedules only the goods marketplaces.
  E03 schedules fire late or never when nobody is browsing, and every request scans every due shift.
- **SH-06 · decision gap. Escalation never notifies the newly eligible audience, and any interest stops it for good.**
  `escalation.py` sends nothing. Availability-match emails only go out at posting time, and only if the shift is posted straight to PLATFORM (`announcements.py:463`).
  Auto-escalation skips any shift that has ever had interest (`escalation.py:91`), even if that worker later declined.
  *Question:* A) notify each new tier (and availability matches) when a shift escalates; keep escalating until reserved · B) notify only on reaching PLATFORM; stop on first interest (today's stop rule) · C) owner chooses per shift.
- **SH-07 · code gap (fallback is D06). Pending offers can outlive the shift.**
  Offers expire after a flat 48h (`assignment.py:22`), not capped at shift start, and expiry is only applied lazily (`offers.py:177`).
  An urgent offer made 2 hours before start stays "pending" after the shift has begun. Cap it at start, as D02 does for payment.
- **SH-08 · decision gap (D09). Shift edits are still allowed after acceptance.**
  `revise_shift` (`posting.py:142`) locks slots once anyone has engaged but still lets the manager change the rate, role, payment preference, description and travel on a shift with accepted or reserved offers.
  The frozen terms keep the old values while the shift card shows the new ones.
  *Interim question:* A) lock rate, role and payment fields after the first acceptance · B) allow, with worker re-consent · C) allow, with a notice only.
- **SH-09 · code gap. The accepted terms do not disclose the cancellation policy.**
  The terms snapshot (`engagement.py:587-601`) has no cancellation band table, platform terms version or pharmacy-side acceptance.
  The register's legal note says the P09 fees need clear disclosure before acceptance before they can ever be charged.
- **SH-10 · decision gap (D15). Rating eligibility is too loose.**
  Ratings are allowed for any assignment ever (`ratings/views.py:79,88`), including future, unworked and internal-employee shifts.
  Owner-to-worker ratings are averaged publicly on talent cards (`talent/views/explorer.py:59`).
  *Question:* who can rate, and when? A) after an approved timesheet or clock-out only · B) after the shift's end time · C) any assignment (today).
  *Also:* should employee ratings from internal rosters appear on the public talent board? Yes / No.
- **SH-11 · code gap (register item 3). The auto-publish setting contradicts R06/R04B and is missing on mobile.**
  `Pharmacy.auto_publish_worker_requests` has the help text "automatically create and publish a new shift" (`organizations/models.py:223`), which contradicts R06 and R04B.
  The toggle exists only on web (`PharmacyPage.tsx:1589`), not in mobile `PharmacyForm`. Re-point it to the R04A per-pharmacy permission on both platforms.

## 3. Talent board

**What exists**
- ExplorerPost with feed, public feed, like/unlike and view count (`backend/talent/views/explorer.py`). You must be Verified to post or edit (`:141`). Newcomers get one post and a 7-day re-post rule.
- Under-18 authors show their first name only. Badges come from `verification_summary` (`talent/serializers/explorer.py`).
- Web `pages/dashboard/sidebar/TalentBoard/*` and mobile `roles/shared/talent-board/*` match: filters, pitch dialog, availability sidebar, and "Request booking" that opens post-shift with `dedicated_user`. There is a public web page (`PublicTalentBoardPage.tsx`).

**Gaps**
- **TB-01 · code gap (privacy). Anonymous posts are only anonymous to logged-out visitors.**
  `feed`, `list` and `retrieve` use `ExplorerPostReadSerializer`, which returns the full `explorer_name`, `author_user_id` and `explorer_user_id`. Only `public_feed` redacts them (`serializers/explorer.py:187`).
  Anyone can sign up as an Explorer and read every name. The UI shows a reference code, but the API leaks the identity.
- **TB-02 · decision gap. Who can see the talent board, and when is identity revealed?**
  Today any authenticated user can, including competing workers, plus public anonymous cards.
  *Question 1 (who sees it):* A) employers only (owner/admin/org) plus your own post · B) employers plus public anonymous cards · C) everyone (today).
  *Question 2 (when an anonymous candidate is revealed):* A) when they accept a booking request · B) when they reply in chat · C) only when an offer is accepted.
- **TB-03 · code gap. Hidden and stale posts can still be read.**
  The default `list` and `retrieve` skip `_visible_posts` (`explorer.py:169`), so posts hidden by moderation (`hidden_at`) or past their dates are still readable.
  Visibility is not re-checked when Verified is revoked or AHPRA lapses after posting.
- **TB-04 · code gap (scale). All filtering happens in the client.**
  The backend has no filter parameters. Clients download every page (`hooks/loadAllTalentPages.ts`), and `_visible_posts` loops over the whole table in Python.
  There is no distance-from-pharmacy filter, although posts store postcode and radius. This breaks at a few thousand posts.
- **TB-05 · decision gap. The heart is not pharmacy favourites.**
  The heart only "likes" a post. Pharmacy favourites (Membership LOCUM/SHIFT_HERO, used by the favourites notifications and community tier) cannot be added from a talent card.
  *Question:* A) the heart adds the worker to the pharmacy's favourites (with worker consent) · B) keep the like, and add an "Invite to favourites" action that sends a membership invite · C) leave as is.
- **TB-06 · decision gap. Is "Request booking" a firm offer or an enquiry?**
  It posts a dedicated shift and immediately creates firm offers with a 48h expiry (`assignment.py:231`). The worker cannot ask questions first.
  *Question:* A) firm offer (today) · B) enquiry or chat first, then an offer · C) owner chooses each time.
- **TB-07 · code gap (drift).**
  - Who can request a booking: web uses a fixed role list plus `isAdminUser` (`TalentBoard/index.tsx:312`); mobile allows any non-worker role, including PHARMACY_MANAGER (`talent-board/index.tsx:313`).
  - Mobile worker `publish-availability.tsx` passes `postShiftRoute="/owner/post-shift"`.
  - Mobile has two copies of `useTalentFeed.ts` (`talent-board/` and `talent-board/hooks/`).
  - `add_view` counts every authenticated call with no limit (`explorer.py:208`).

## 4. Availability

**What exists**
- `UserAvailability` stores date, time window or all-day, recurring weekdays with an optional end date, `notify_new_shifts` and notes (`talent/models.py:150`). The CRUD API is limited to the worker's own rows (`talent/views/availability.py`).
- Web `SetAvailabilityPage.tsx` and mobile `roles/shared/availability/SetAvailabilityScreen.tsx` (pharmacist, other staff, explorer) both preview recurring dates.
- It is used for:
  - match emails when a shift is first posted to PLATFORM (`shifts/announcements.py:460`);
  - dashboard recommendations (`announcements.py:284`);
  - roster "outside declared availability" warnings (`workforce/roster/validation.py:70`);
  - a one-time copy into a new talent post (`TalentBoard/index.tsx:498`).

**Gaps**
- **AV-01 · code gap. Availability lives in two places that don't sync.**
  A talent post's `availability_days` is copied once, when the pitch is written. Later calendar edits never update the post.
  Posts with no dates, and full-time posts, stay visible forever (`talent/models.py:119-127`).
- **AV-02 · decision gap. Nothing ever expires.**
  Old rows never expire and nobody is asked to refresh them. The backend accepts open-ended recurrences (no end date), while both UIs only preview when an end date is set.
  *Question 1:* A) hide talent posts not updated in N days (e.g. 30) and nudge the worker · B) hide once the last listed date passes (partly true today) · C) never.
  *Question 2:* recurrence horizon: A) end date required, max 3 months · B) open-ended, with a quarterly reconfirm prompt.
- **AV-03 · decision gap. Notifications and the roster use different matching rules.**
  Notifications match any overlap (`announcements.py:229`): available 9–10 matches a 9–17 shift. Roster validation needs the shift fully inside the availability (`validation.py:76`).
  *Question:* A) shift fully inside the availability · B) overlap of at least X% · C) any overlap (today, notifications only).
- **AV-04 · code gap. Match emails miss escalated shifts and reach unverified workers.**
  - They go out only at posting time, for shifts posted straight to PLATFORM (`announcements.py:463`), so shifts that later escalate to PLATFORM never notify available workers.
  - Recipients are not filtered by Verified, so unverified workers are emailed shifts they are then blocked from applying to (`interest.py:46`).
- **AV-05 · code gap. No input validation.**
  `UserAvailabilitySerializer` (`talent/serializers/availability.py`) does not check start < end, weekdays 0–6, that recurring rows have days, past dates or duplicates.
- **AV-06 · decision gap. Availability doesn't help hiring.**
  It isn't used to rank applicants or search the talent board, and pharmacies only see what was copied into a talent post.
  *Question:* A) keep it private (notifications and recommendations only) · B) show it to pharmacies where the worker is staff or a favourite · C) show it on the talent card when the worker opts in.

---

## Most launch-critical (in order)
1. **SH-01**: a confirmed external booking cannot be cancelled by anyone.
2. **ON-01 + ON-02**: direct offers and chain-tier acceptances skip Verified/AHPRA, and lapsed registrations stay Verified.
3. **TB-01**: anonymous talent posts expose full names to any logged-in account.
4. **SH-03 + SH-04**: billing is live with no trial, and subscribers are overcharged because their price is never applied.
5. **SH-05 + SH-06**: scheduled escalation depends on page views and never notifies the new audience.

## Not checked
- I ran nothing: no builds, tests or browser runs. Findings come from reading source only.
- Membership invite flow in depth, chat, invoice/payroll internals, attendance/no-show detail (D13/D14 stay with the register), and the web/mobile staff-manager screens line by line.
