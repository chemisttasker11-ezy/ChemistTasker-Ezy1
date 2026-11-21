# GM-05 Roles / Membership / Invites — Traced Flow, Validated Question Queue, Decision Status

> **Corrections against current code (21 Nov 2026 review).** 12 claims checked at `main` `8ccf8f77` and `pr257` `21add924`; 8 hold, 4 below need the correction shown. Where a question below says otherwise, this table wins. Full evidence: [`../followup/claim-check-2026-11-21.md`](../followup/claim-check-2026-11-21.md).

| Where | Claim in this file | Verdict | Correct statement | Evidence |
|---|---|---|---|---|
| Q05 | “manager … has no undo” for a pending invitation | WRONG | Direct invitations have no expiry field, but an authorised manager can delete the pending membership through the ordinary membership endpoint. | GUARDED removal: `main:backend/memberships/views.py:112`; `pr257:backend/memberships/views.py:113`; permission: `pr257:backend/memberships/access.py:45` |
| Q08 | invite links have “no default expiry” | WRONG | The creation endpoint defaults links to 14 days and checks invitation authority. Deletion deactivates a link while preserving its applications. | `main:backend/memberships/views.py:194`; `pr257:backend/memberships/views.py:195`; `:209` |
| Q11 / Q16 | one-time manager conversion is unverified or broken | WRONG as a current premise | Conversion is enforced once under a user lock and updates the selected CONTACT membership plus its admin staff role. Current mobile destinations use the basic-profile screens. | `pr257:backend/memberships/account_management.py:10`; `:44`; `pr257:frontend_mobile/components/ChooseAccountTypeCard.tsx:14` |
| W02 | “Explorers can never hold an admin role” | MAIN-ONLY, reversed: candidate enforcement (already fixed in the W question text) | pr257 blocks new Explorer admin grants and access expansion while allowing maintenance or revocation of historical assignments. Do not describe this candidate protection as deployed main behaviour. | `pr257:backend/access_control/admin_roles.py:6`; `pr257:backend/organizations/models.py:443`; `pr257:backend/users/models.py:128`; main lacks this shared guard |

**Repo:** `chemisttasker11-ezy/ChemistTasker-Ezy1`
**Area:** GM-05 Roles/membership/invites (Issue #250, method of PR #184 / Issue #250)
**Snapshot verified:** PR #249 head **`97c4543e051b43fe30ec7e2e61ad3d69957a918e`** — confirmed live via `pull_request_read` get on 2026-11-21; unchanged from the #250 snapshot. PR #249 is DRAFT, stacked on #248 (head `25939534a1c5543454a8e770571e4dff46380d96`), not merged, not deployed.
**Status of this document:** DOCUMENTATION AND DECISIONS ONLY. No code changes. No implementation is decided. The implementation backlog at the end is explicitly **not approved to build** until the owner answers the questions it hangs from.
**Read-only method:** GitHub connector `call-read-tool` only. No code modified, no PRs/issues/comments created.

## Web and Expo today, side by side (pr257 `21add924`)

Source for both web and Expo is `origin/agent/pr257-int` `21add924` (what merges to main). Read-only code check by agy, 21 Nov 2026; every cited file:line was checked to exist at that commit. "Parity question" = a choice for the owner, asked in this area's rounds. "Possible defect (to verify)" = drift that looks unintended; it is confirmed in code before it goes to the engineering backlog, never asked as a question. The Platforms table says which platforms each question applies to.

| Flow | Web (Vite + Next) | Expo | Same? | If different |
|---|---|---|---|---|
| Direct email staff invite | Manager opens invite modal to send direct email invitation to staff (`frontend_web/src/pages/dashboard/sidebar/owner/InviteStaffModal.tsx:25`). | Manager sends invitation via staff management screen (`frontend_mobile/roles/shared/pharmacies/StaffManager.tsx:41`). | Yes | — |
| Shareable invite links | Manager generates shareable join link with role presets (`frontend_web/src/pages/dashboard/sidebar/owner/StaffManager.tsx:339`). | Mobile app surfaces admin invitations screen to generate join links (`frontend_mobile/app/admin-invitations.tsx:1`). | Yes | — |
| Promote staff to pharmacy manager | Owner promotes member to pharmacy admin/manager in staff list (`frontend_web/src/pages/dashboard/sidebar/owner/PharmacyAdmins.tsx:165`). | Manager assigns permissions on staff member profile (`frontend_mobile/app/manager/roster/staff.tsx:1`). | Yes | — |
| Remove member from pharmacy | Owner deletes pharmacy admin or staff membership (`frontend_web/src/pages/dashboard/sidebar/owner/PharmacyAdmins.tsx:192`). | Manager removes staff member from roster directory (`frontend_mobile/app/admin/pharmacies/[id]/staff.tsx:1`). | Yes | — |
| Locum & staff directory | Owner manages active pharmacy staff and locum memberships (`frontend_web/src/pages/dashboard/sidebar/owner/StaffManager.tsx:144`). | Manager views pharmacy staff roster directory (`frontend_mobile/roles/shared/pharmacies/StaffManager.tsx:502`). | Yes | — |

### Platforms per question
| Question id | Platforms |
|---|---|
| Q-01 | Web + Expo |
| Q-02 | Web + Expo |
| Q-03 | Web + Expo (asked in GM-02: ON-Q05) |
| Q-04 | Web + Expo |
| Q-05 | Web + Expo |
| Q-06 | Web + Expo |
| Q-07 | Web + Expo |
| Q-08 | Web + Expo |
| Q-09 | Web + Expo |
| Q-10 | Web + Expo |
| Q-11 | Web + Expo |
| Q-12 | Web + Expo |
| Q-13 | Web + Expo (asked in GM-02: ON-Q14) |
| Q-14 | Web + Expo (asked in GM-18: GM-18-Q08) |
| Q-15 | Web + Expo (asked in GM-02: ON-Q08) |
| Q-16 | Expo only (asked in GM-01: GM01-Q10) |
| Q-17 | Web + Expo (asked in GM-18: GM-18-Q15) |
| Q-18 | Web + Expo |
| Q-19 | Web + Expo |
| GM-05-OD-03 — Attendance approvals and the roster need both staff and roster rights | Web + Expo |
| GM-05-OD-04 — Organisation tabs are hidden when Lina lacks the right | Web + Expo |
| GM-05-OD-05 — A new invitee with no name shows as their email address | Web + Expo |
| GM-05-OD-06 — When Ali is removed, what happens to his future roster shifts? | Web + Expo |
| GM-05-W01 — Is a brand-new invitee an active team member before they set a password? | Web + Expo |
| GM-05-W02 — Explorers can never hold an admin role: answered (D96) | Web + Expo |

## ⚠️ Verification limits (read this first)

1. **GitHub returned HTTP 429 (too many requests) part-way through fetching files at the #249 head.** Per the rate-limit rule this stopped further GitHub reads in this pass. The following were **NOT inspected at the #249 head** and are marked **NOT INSPECTED** wherever they matter — nothing about them is asserted as current fact:
   - `backend/memberships/views.py`, `backend/users/org_roles.py`, `backend/shifts/access.py`
   - `backend/shifts/offers.py`, `backend/shifts/assignment.py` (offer-accept / dedicated-offer AHPRA gates)
   - All Vite web, Next web and Expo frontend files at the #249 head (register pages, `PharmacyPage`, `StaffManager`/`LocumManager`, `ChooseAccountTypeCard`, `roles/*/onboarding`, `roles/explorer/shifts`, Talent Board booking gates, membership screens, account-upgrade screens)
   - The PHARMACY_MANAGER one-time account-type switch endpoint, the PharmacyAdmin invite accept/reject operations (`membership_operations`), and `core/settings.py` (`PASSWORD_RESET_TIMEOUT`, `AHPRA_ENFORCEMENT_ENABLED`, `VERIFICATION_EXTRA_REQUIREMENTS` / grace settings).
2. **Web/Expo statements below therefore have two sources, kept distinct:** (a) **revalidated at #249 head** (backend files actually read — cited with file + function), and (b) **#184 October 2026 statements only** (from `docs/qa/launch-grill/questions.json` + `AUDIT.md` on `refs/pull/184/head`, SHA `9b700e31…`), labelled **"per #184, NOT revalidated at #249 head"**. Where a main-branch `search_code` hit contradicts #184 (e.g. the Explorer shifts tab), that is flagged as a lead to check, not a verified fact.
3. **Search results are main-branch refs, not #249 head.** `search_code` returned `ref=8ccf8f778f725fa215465c352a1aa0b61a89b714` (main). Only `get_file_contents` with `ref=refs/pull/249/head` counts as #249-head evidence here.

## 0. Plain-English summary

ChemistTasker has **two different "role" systems that must not be confused**:

1. **Account role** — one per person, set at sign-up: Owner, Pharmacist, Pharmacy team (Other Staff), Organisation Staff, Explorer ("new to pharmacy"), and Pharmacy Manager (invite-only). This decides which onboarding track you get and, roughly, what you may do.
2. **Pharmacy membership** — your job *at one particular pharmacy*: Pharmacist, Intern, Technician, Assistant, Student, or Contact, plus an employment type (full-time / part-time / casual = employed staff; locum / Shift Hero = "favourite" outside workers). The same person can be a member of up to **3 pharmacies at once**. A separate **pharmacy admin** ladder (Owner / Manager / Roster Manager / Communication Manager) decides who can manage staff, rosters and messages at that pharmacy. A separate **organisation membership** (Org Admin / Chief Admin / Region Admin) covers multi-site groups.

**The three biggest things that changed since the October 2026 #184 questions:**
- There is now a **Pharmacy Manager account role**, created only when an organisation invites a pharmacy by email. That person manages the pharmacy, and may **once** switch to a personal Pharmacist or Pharmacy-team account — never to Owner.
- A **multi-use invite link + application** flow now exists alongside direct email invites: an admin generates a link, candidates fill in a short form, the owner approves or rejects.
- **New-account direct invites activate the membership before the invitee sets a password.** Ask once at GM-05-W01.

**The biggest thing that has NOT changed:** on a pharmacy's public shifts, **employed staff and favourite locums skip the Verified/AHPRA check entirely** — including a favourite whose AHPRA registration is suspended, who keeps booking that pharmacy's shifts. That was already flagged in #184 (ON-P01) and is still the live code.

---

## 1. Current-flow matrix

Legend: **✔ R** = revalidated at #249 head (file/function cited). **~ #184** = October 2026 statement only, NOT revalidated at #249 head. **✘ NI** = not inspected (429 block or never fetched). "—" = no such step exists in code inspected.

### 1A. Account roles and sign-up

| # | Trigger | Actor | Backend / API ✔ R | Vite / Next web | Expo mobile | Persisted state | Event / side effect | Recovery / denial path |
|---|---|---|---|---|---|---|---|---|
| F1 | Person registers | New user | `users/models.py` `User.ROLE_CHOICES` — OWNER, PHARMACIST, OTHER_STAFF, ORG_STAFF, EXPLORER, PHARMACY_MANAGER; `SELF_REGISTRATION_ROLES = (OWNER, PHARMACIST, OTHER_STAFF, EXPLORER)` ✔ R | ~ #184: `frontend_web/src/pages/register.tsx` offers the same 4 self-registration roles | ~ #184: `frontend_mobile/app/register.tsx` same | `User.role`, `is_otp_verified=False`, `is_mobile_verified=False` | Email OTP login code (GM-01) | Role is a single fixed field; no self-service role change inspected ✘ NI |
| F2 | Organisation onboards a pharmacy by email | Org admin / platform admin | `users/models.py` — PHARMACY_MANAGER "Created only when an organisation onboards a pharmacy by email… may later choose PHARMACIST or OTHER_STAFF once" ✔ R; `CHOOSABLE_ACCOUNT_TYPES = (PHARMACIST, OTHER_STAFF)` ✔ R | ~ #184: no org signup; org created by platform admin only | ✘ NI | `User.role=PHARMACY_MANAGER` + pharmacy-admin MANAGER assignment | Contact manages that pharmacy through the admin assignment | Switch endpoint ✘ NI — what happens to the admin assignment after switching is **unknown** |
| F3 | Pharmacy Manager picks a personal account type | PHARMACY_MANAGER user | `users/models.py` comment: "may switch to once. Ownership is never acquired… MANAGER remains the highest delegated pharmacy-admin level" ✔ R | ✘ NI | ✘ NI (per #184 ON-04 this flow was broken on mobile: pharmacist data dropped, other-staff route not-found — **NOT revalidated at #249 head**) | `User.role` → PHARMACIST / OTHER_STAFF (once only, per comment) | Presumably starts that role's onboarding | ✘ NI: is the switch reversible? enforced once? what if onboarding incomplete? |
| F4 | ORG_STAFF account created | ? | `User.ROLE_CHOICES` includes ORG_STAFF ✔ R; **not** in `SELF_REGISTRATION_ROLES` ✔ R | ✘ NI | ✘ NI | `User.role=ORG_STAFF` | Unknown | **Unknown:** no creation path inspected — who creates ORG_STAFF accounts, and how do they get an `OrganizationMembership`? See Q-GM05-08 |
| F5 | Platform admin (Django staff/superuser) | Platform operator | `users/models.py` `CustomUserManager.create_superuser` sets `is_staff=True, is_superuser=True` ✔ R; `organizations/views.py` `OrganizationViewSet.create` requires `IsAdminUser()` (superuser only) ✔ R | Django admin (assumed, ✘ NI) | — | `User.is_staff / is_superuser` | Full Django admin access (assumed) | ✘ NI: no documented grant/revoke process inspected |

### 1B. Pharmacy memberships and invites (direct email invite)

| # | Trigger | Actor | Backend / API ✔ R | Vite / Next web | Expo mobile | Persisted state | Event / side effect | Recovery / denial path |
|---|---|---|---|---|---|---|---|---|
| F6 | Invite a worker to a pharmacy (single) | Owner, pharmacy admin with MANAGE_STAFF, org member with INVITE_STAFF/MANAGE_STAFF/MANAGE_ADMINS scoped to that pharmacy, or platform staff/superuser | `memberships/invites.py` `create_membership_invite()` ✔ R; permission gate `memberships/access.py` `user_can_invite_members_to_pharmacy()` ✔ R | ~ #184: web `PharmacyPage` staff/locum invite UI | ~ #184: mobile `StaffManager` / `LocumManager` | `Membership` row (see F7/F8) + `invited_by` | Email + in-app notification (existing user); magic password-set link (new user) | Refusals returned as plain error strings, e.g. "Pharmacy not found", "already has a pending invitation", role mismatch (see F9) |
| F7 | Invitee has **no account yet** | Inviter (F6) | `create_membership_invite()` ✔ R: creates `User` with random 12-char password, `role` mapped from membership role (PHARMACIST→PHARMACIST; INTERN/STUDENT/ASSISTANT/TECHNICIAN→OTHER_STAFF; anything else→**EXPLORER**), `is_otp_verified=False`; membership created **ACCEPTED + `is_active=True` immediately** (`if user_created or activate_immediately`) | ~ #184: same flow described | ~ #184: same | `User` (unverified, random password) + `Membership(status=ACCEPTED, is_active=True)` | Email via `emails/pharmacy_invite_new_user.html`, magic link `{base}/reset-password/{uid}/{token}/` using Django `default_token_generator` (expiry = `PASSWORD_RESET_TIMEOUT`, ✘ NI — Django default is 3 days if unset) | **No accept step, no expiry on the membership itself.** If the person never clicks the link, an active membership for an unverified stranger sits on the pharmacy. No revocation/expiry inspected. See Q-GM05-04 (first-question candidate) |
| F8 | Invitee **already has an account** | Inviter (F6) | `create_membership_invite()` ✔ R: `membership_role_refusal()` checked first (F9); membership created **PENDING + `is_active=False`** unless `activate_immediately=true` in the request (then ACCEPTED + active, no accept step) | ~ #184: worker sees invite under Manage Memberships | ~ #184: same | `Membership(status=PENDING, is_active=False)` | Email `emails/pharmacy_invite_existing_user.html` + `Notification` type ALERT ("Accept or reject the invitation from Manage Memberships", `action_url` = `/dashboard/{pharmacist\|otherstaff}/memberships`) | Invitee accepts/rejects via membership endpoints (views ✘ NI — accept/reject handlers not inspected at #249 head). `activate_immediately` bypasses consent entirely — who can pass it, and is it exposed in UI? ✘ NI |
| F9 | Invitee's account role does not fit the membership role | System (automatic) | `memberships/role_resolution.py` `membership_role_refusal()` ✔ R — **owner decision 2026-10-14 recorded in code**: ASSISTANT/TECHNICIAN/STUDENT memberships are "flexible": any PHARMACIST or OTHER_STAFF account may hold them; PHARMACIST membership needs a PHARMACIST account; INTERN needs an intern profile (`personal_pharmacy_role()`). CONTACT role has no refusal rule inspected. | ✘ NI | ✘ NI | No row written; error string returned, e.g. "Only a registered pharmacist account can be added as a pharmacist." | Invite blocked before any write | Atomic rollback: `create_membership_invite` runs in `@transaction.atomic`; a failure after a write rolls that invite back (PR #110) ✔ R |
| F10 | Same person invited to a second/third pharmacy | Inviter | `memberships/serializers.py` `MAX_ACTIVE_PHARMACY_MEMBERSHIPS = 3` ✔ R; `_count_active_memberships()` counts ACCEPTED + active memberships ✔ R; enforced in `create_membership_invite()` ("already a member in 3 pharmacies") and in `MembershipSerializer.validate()` ✔ R | ✘ NI (is the cap shown in UI? unknown) | ✘ NI | Blocked at 3 | Error string returned | **Edge:** cap counts only ACCEPTED+active; PENDING invites do not count, so a person can hold many pending invites. Concurrent invites to different pharmacies are serialised on the worker row (`select_for_update()` on the `User` row) ✔ R |
| F11 | Duplicate invite / duplicate pending application | Inviter | `create_membership_invite()` ✔ R: existing PENDING membership → "already has a pending invitation"; existing ACCEPTED+active → "already a member"; a PENDING `MembershipApplication` for the same email+pharmacy blocks a new invite ("Review that application instead") ✔ R; `Membership` has `unique_together = (user, pharmacy)` ✔ R | ✘ NI | ✘ NI | No duplicate row | Error string; inviter directed to the existing application | Re-inviting after a REJECTED/LEFT membership reuses the row (`serializer_kwargs['instance'] = existing_membership`) and **revokes that user's admin access** (`membership.revoke_admin_access()`) ✔ R |
| F12 | Bulk invite (many rows) | Inviter | `memberships/invites.py` `bulk_invite()` ✔ R: each row validated separately; per-row permission check (`user_can_invite_members_to_pharmacy`); PHARMACY_ADMIN role rejected per row ("must use the admin management endpoint"); results + errors returned with **1-based line numbers** | ✘ NI | ✘ NI | One `Membership` per successful row; each in its own atomic block | Partial success is normal: successes listed, failures listed per line | A failed row does not roll back earlier rows |
| F13 | Change a membership (role, employment type, classifications) | Owner, scoped org manager, or pharmacy admin with MANAGE_STAFF | `memberships/access.py` `user_can_change_membership()` ✔ R: **the pharmacy owner's own derived OWNER membership is immutable** through the generic endpoint (returns False); owner / scoped org / MANAGE_STAFF admin may change ordinary memberships | ✘ NI | ✘ NI | `Membership` updated via `MembershipSerializer.update()` | ✘ NI (notifications on change not inspected) | **Asymmetry (code gap CG-3):** `user_can_change_membership` has **no** `is_staff`/`is_superuser` branch, while the invite helper grants platform staff full invite rights. Whether platform staff can change memberships is therefore unclear — verify in `memberships/views.py` ✘ NI |
| F14 | Remove a member | Owner / admin (exact actor set ✘ NI — views not inspected) | `memberships/models.py` `Membership.remove()` ✔ R: revokes admin access, **deletes the member's chat participations** (messages themselves preserved), then deletes the row; if employment history PROTECTs the row, it is **deactivated instead** (`is_active=False`) | ✘ NI | ✘ NI | Row deleted or deactivated | Chat access goes immediately | **Unknown:** what happens to the removed person's future/confirmed bookings, roster entries, or pending offers? Not inspected. See Q-GM05-09 |

### 1C. Invite links and applications (the newer flow)

| # | Trigger | Actor | Backend / API ✔ R | Vite / Next web | Expo mobile | Persisted state | Event / side effect | Recovery / denial path |
|---|---|---|---|---|---|---|---|---|
| F15 | Generate a multi-use invite link for a pharmacy + category | Owner / Org Admin / Pharmacy Admin (per model docstring) | `memberships/models.py` `MembershipInviteLink` ✔ R: `pharmacy`, `created_by`, `category` (FULL_PART_TIME or LOCUM_CASUAL), `token` (UUID), `expires_at`, `is_active`; `is_valid()` = active + now < `expires_at` | ✘ NI | ✘ NI | `MembershipInviteLink` row | Link can be shared (multi-use) | **Code gap CG-4:** `expires_at` has **no default** and the serializer (`MembershipInviteLinkSerializer.create`) sets no default either — who chooses the expiry, and what happens if none is supplied? ✘ NI (views not inspected) |
| F16 | Candidate applies from the link | Candidate (may or may not have an account) | `memberships/models.py` `MembershipApplication` ✔ R: role, name, mobile, date of birth (used for Award rates + identity matching), job title, award/classification fields, email; `pending_identity_key` (unique, dedupes identity); `submitted_snapshot` + `review_changes` audit fields; status PENDING | ✘ NI | ✘ NI | `MembershipApplication(status=PENDING)` | ✘ NI (notification to owner not inspected) | Duplicate identity blocked by unique `pending_identity_key` (exact dedupe rule ✘ NI) |
| F17 | Owner approves / rejects an application | Owner, MANAGE_STAFF admin, or scoped org manager | `memberships/access.py` `user_can_decide_applications()` ✔ R (same authority as F13 minus the owner-immutability rule); `MembershipApplicationReviewSerializer` exists (`serializers.py:553`) ✔ R | ✘ NI | ✘ NI | On approve: Membership created/attached (`approved_membership` FK) "and use your existing invite email flow" (model docstring) ✔ R | Approval reuses the F7/F8 invite email flow | Review/approve/reject handlers live in `memberships/views.py` ✘ NI — approve-then-email failure handling, and whether rejection notifies the candidate, are **unknown** |

### 1D. Pharmacy admins and organisation memberships

| # | Trigger | Actor | Backend / API ✔ R | Vite / Next web | Expo mobile | Persisted state | Event / side effect | Recovery / denial path |
|---|---|---|---|---|---|---|---|---|
| F18 | Invite/appoint a pharmacy admin | Owner / MANAGER-level admin (see F19) | `organizations/models.py` `PharmacyAdmin` ✔ R: `user`, `pharmacy`, `membership` (OneToOne, nullable), `admin_level`, `staff_role` (PHARMACIST/INTERN/TECHNICIAN/ASSISTANT/STUDENT), `job_title`, `created_by`, `is_active`; `unique_together = (user, pharmacy)`; direct membership invites with role PHARMACY_ADMIN are **rejected** in `create_membership_invite()` ("Use the pharmacy admin management endpoint") ✔ R | ✘ NI | ✘ NI | `PharmacyAdmin` row (+ linked `Membership` where applicable) | Admin invite accept/reject endpoints exist: `organizations/views.py` `PharmacyAdminViewSet.my_pending_invitations / accept_invitation / reject_invitation` ✔ R (delegated to `membership_operations()` — **not inspected**) | Owner record can never be demoted (`PharmacyAdmin.clean()` raises if the pharmacy owner's level ≠ OWNER) ✔ R; owners cannot be removed by other admins; MANAGER/OWNER with MANAGE_ADMINS can remove non-owner admins (`can_be_removed_by()`) ✔ R |
| F19 | Admin acts (manage staff / roster / comms / admins) | PharmacyAdmin | `access_control/pharmacy_roles.py` `PharmacyAdminPolicy.CAPABILITY_MATRIX` ✔ R: **OWNER and MANAGER have identical capabilities** — MANAGE_ADMINS + MANAGE_STAFF + MANAGE_ROSTER + MANAGE_COMMUNICATIONS. ROSTER_MANAGER: roster + comms only. COMMUNICATION_MANAGER: comms only. `capabilities` / `has_capability()` on the model ✔ R | ✘ NI | ✘ NI | `PharmacyAdmin.is_active`, `admin_level` | Capability checks via `organizations/access.py` `has_admin_capability()` (referenced, ✘ NI for exact semantics) | Denied action → permission error (exact response ✘ NI). **Decision point:** a MANAGER can manage admins — including, apparently, other MANAGERs — with the same power as the owner except removing the owner. See Q-GM05-05 |
| F20 | Organisation created | Platform superuser only | `organizations/views.py` `OrganizationViewSet` ✔ R: CREATE requires `IsAdminUser()`; LIST/RETRIEVE any authenticated user; UPDATE/DELETE only org-wide admins (Org Admin / Chief Admin). `Organization` auto-slugifies its name ✔ R | ~ #184: web `OrganizationCreate.tsx` exists but is **not routed anywhere** (ON-05) — NOT revalidated | ✘ NI | `Organization` row | — | Non-superuser create → 403 (IsAdminUser) |
| F21 | Person given an organisation role | Org admin / platform admin (exact actor ✘ NI) | `users/models.py` `OrganizationMembership` ✔ R: `role` in (ORG_ADMIN, CHIEF_ADMIN, REGION_ADMIN), `region` (free text, nullable), `job_title`, `admin_level` (defaults to MANAGER from `PharmacyAdminPolicy`), `pharmacies` M2M (scope); `unique_together = (user, organization)` | ✘ NI | ✘ NI | `OrganizationMembership` row | Capabilities derived via `users/org_roles.py` `membership_capabilities()` + `membership_covers_pharmacy()` — **✘ NI (file not fetched, 429)** | Region scoping semantics (does REGION_ADMIN only see their region's pharmacies?) **unknown** — see Q-GM05-08 |
| F22 | Pharmacy claimed by an organisation | Org admin (request) + pharmacy side (accept) | `organizations/models.py` `PharmacyClaim` ✔ R: PENDING → ACCEPTED/REJECTED, `mark_accepted/mark_rejected` record responder + time; unique active claim per (pharmacy, org); only **one ACCEPTED claim per pharmacy** ever (DB constraint) | ✘ NI | ✘ NI | `PharmacyClaim` + `Pharmacy.organization` FK | ✘ NI (notifications on claim decision not inspected) | Rejected claim frees the pharmacy to be claimed again; accepted claim is exclusive |

### 1E. Verification gates where roles and memberships collide (GM-05 boundary with GM-01/GM-02)

| # | Trigger | Actor | Backend / API ✔ R | Vite / Next web | Expo mobile | Persisted state | Event / side effect | Recovery / denial path |
|---|---|---|---|---|---|---|---|---|
| F23 | Worker applies for a **public** shift | Worker | `shifts/interest.py` `express_interest()` ✔ R: role must cover the shift (`_user_can_perform_shift_role`, else "Your role does not cover this shift"); if visibility is PLATFORM and the worker is **not** a member (F24), `require_public_ahpra()` runs (`onboarding/verification/state.py:171`) — Verified + latest AHPRA result, with a re-check queued on commit | ~ #184: both apps show boards; apply buttons gated by the same backend | ~ #184: same | `ShiftInterest` row (get_or_create per slot; single-user shifts use slot=None) | Managers notified by in-app notification + email (`shift_interest.html` / `shift_member_interest.html`) | Refusal raises `ShiftActionRefused` (403/400 with a plain message, e.g. "Verify your profile before applying for public shifts"). Duplicate interest is a no-op (get_or_create) |
| F24 | Member shortcut on public shifts | Staff or favourite member | `shifts/interest.py` `is_public_shift_member_access()` ✔ R: **skips the AHPRA/Verified gate entirely** when: visibility is PLATFORM, **not** anonymous, role covers the shift, and an ACCEPTED + active Membership exists with employment type in FULL_TIME/PART_TIME/CASUAL **or** LOCUM/SHIFT_HERO. Anonymous posts are explicitly excluded — members get no shortcut there. | ✘ NI | ✘ NI | No state change (read-only check) | Member applies with no verification check | See Q-ON-P01 (first question). **Edge:** a suspended favourite keeps this shortcut (F25) |
| F25 | AHPRA register shows Suspended / Cancelled / Surrendered | System (re-check) | `onboarding/verification/state.py` ✔ R: `ADVERSE_STATUSES = {suspended, cancelled, surrendered}`; `apply_state_transition()` cancels future public bookings and notifies pharmacies; **members are NOT paused** — `ahpra_frozen()` returns True only for suspended non-owners **with** an accepted membership, and the member path sends a "member suspension" note instead of pausing (`announce_member_suspension`, `member_suspension_note`); pharmacist **owners become Pharmacy Managers** on suspension; admins emailed; no fee/refund rule runs (per #184 ON-P02, still the code's position) | ~ #184: both apps show register status | ~ #184: same | Profile `verified` flag / suspension state; bookings cancelled; chat sockets closed (`close_chat_sockets`, `ahpra.suspended` event) | Owner + managers notified per membership pharmacy | Non-General pharmacist result cancels bookings without pausing (per #184 ON-P02). Non-member suspended workers are paused account-wide |
| F26 | Explorer applies for a public shift | Explorer | `shifts/interest.py` `_require_public_shift_onboarding()` ✔ R: EXPLORER needs a **verified** `ExplorerOnboarding` or 403 ("Verify your profile before applying"); `engagement.worker_onboarding()` (per #184 ON-09) looks explorers up in `OtherStaffOnboarding`, so they can **never accept** an offer — **not revalidated at #249 head** (engagement.py ✘ NI) | ~ #184: web shows explorers the public/community boards and lets them apply; no Explorer payment tab | ~ #184: mobile Explorer shifts tab was a blank placeholder ("Shifts") — **main-branch search now shows `frontend_mobile/app/explorer/shifts.tsx` re-exporting `@/roles/explorer/shifts`, suggesting the placeholder may have been replaced; NOT verified at #249 head** | `ShiftInterest` row may be created for a shift the explorer can never accept | Wasted pharmacy time (the #184 concern) | See Q-ON-Q05 |
| F27 | Verified flag itself | System | `onboarding/verification/policy.py` ✔ R: Verified = email + mobile, **plus AHPRA for pharmacists/interns**; overseas explorers may substitute verified photo ID for mobile (`mobile_check_skipped` on User); everything else (ID, referees, certificates) is a badge, never blocking, unless the owner lists it in `VERIFICATION_EXTRA_REQUIREMENTS` (setting ✘ NI); already-verified profiles keep Verified through a grace period when rules tighten (`VERIFICATION_GRACE_UNTIL`, `reevaluate_verification`); Verified is removed **only when evidence it relies on changes** — owner decision 2026-10-14, recorded in `policy.py:117-121` (`revoke_for_changed_evidence`) | ✘ NI | ✘ NI | `*.verified` flags on onboarding profiles | Badges shown via `verification_summary()` / `badges()` | AHPRA expiry date is saved but **not enforced at apply/accept** (audit ON-02, not revalidated — `ahpra.py` ✘ NI) |

### 1F. Favourites / dedicated workers

| # | Trigger | Actor | Backend / API ✔ R | Vite / Next web | Expo mobile | Persisted state | Event / side effect | Recovery / denial path |
|---|---|---|---|---|---|---|---|---|
| F28 | Worker becomes a "favourite" | Pharmacy admin/owner (invite with employment type LOCUM or SHIFT_HERO) | `memberships/models.py` ✔ R: `FAVORITE_STAFF_EMPLOYMENT_TYPES = (LOCUM, SHIFT_HERO)`; `Membership.staff_category` derives FAVORITE_STAFF from those types; favourites are ordinary `Membership` rows — **there is no separate favourites table** | ~ #184: web PharmacyPage locum manager | ~ #184: mobile LocumManager | `Membership(employment_type=LOCUM\|SHIFT_HERO, status=ACCEPTED, is_active=True)` | Favourite gets member shortcut on public shifts (F24), staff-tier shift visibility, and is exempt from AHPRA gates | Removing the membership removes favourite status (F14) |
| F29 | Heart / like on a talent-board card | Any user browsing talent board | Per #184 TB-Q08: the heart **only likes/unlikes the post** and changes its like count on both apps; it creates **no** favourites membership, and cards have **no** "Invite to favourites" action — **NOT revalidated at #249 head** | ~ #184: same | ~ #184: same | Like row + count | None (no membership, no notification inspected) | See Q-TB-Q08 |
| F30 | Dedicated offer / "Request booking" from a talent card | Pharmacy manager/owner | Per #184: creates a dedicated offer for any user id; per audit ON-01, dedicated offers never check Verified/AHPRA — **NOT revalidated at #249 head** (`offers.py` / `assignment.py` ✘ NI) | ~ #184: web TalentBoard "Request booking" opens post-shift with `dedicated_user` | ~ #184: mobile same | Offer row | Worker notified (assumed) | See Q-ON-Q03 |

---

## 2. What the #184 questions say now — validation table

**Statuses:** `REVALIDATED — still valid` (checked against #249-head code) · `REVALIDATED — changed` (checked; the facts moved) · `STILL VALID — not revalidated` (no contradicting evidence, but not checked at #249 head) · `NOT VERIFIED` (could not be checked; 429 block) · `CARRIED DECISION` (already decided; confirm, don't re-ask from scratch).

| #184 ID | Question (short) | Status at #249 head | What changed / evidence |
|---|---|---|---|
| ON-Q01 | Which sign-up tracks at launch? | **REVALIDATED — changed** | Still 3 worker tracks + Owner, but the role list grew: ORG_STAFF and PHARMACY_MANAGER now exist (`users/models.py` ✔ R). Self-registration is still exactly the same 4 roles. New sub-question: how are the 2 non-self-registrable roles created? (Q-GM05-08) |
| ON-Q02 | What can a worker do before Verified? | **REVALIDATED — changed** | Browsing vs applying split still stands; enforcement now runs through `require_public_ahpra()` + `lock_public_ahpra()` inside the booking transaction (`state.py:171-195` ✔ R), which did not exist in this form in Oct. Member exemption confirmed (F24). Front-end browse behaviour **not revalidated**. |
| ON-Q03 | Where must verification be enforced? | **REVALIDATED — changed, partially** | Public apply confirmed gated (F23). Offer-accept / counter-offer / dedicated-offer gating **NOT revalidated** (`offers.py`, `assignment.py` ✘ NI). The #184 claim "PR #183 gates public accept/counter-offer" could not be confirmed at #249 head. |
| ON-P01 | AHPRA exemption | Answered: A, employees are exempt and favourites are checked, launch grill, 23 Oct 2026 - see AHPRA-FAV-01 | The public gate currently exempts eligible staff and favourites; engineering follows BL-02. |
| ON-Q05 | What can Explorers do with shifts? | **REVALIDATED — changed, partially** | Backend: explorer still needs verified `ExplorerOnboarding` to apply (F26 ✔ R). Mobile placeholder: main-branch search shows `app/explorer/shifts.tsx` now re-exports `@/roles/explorer/shifts` — the "blank placeholder" may be fixed, **not verified at #249 head**. Whether explorers can accept (engagement lookup) **not revalidated**. |
| ON-Q08 | Who must pass an ID check? | **REVALIDATED — still valid** | `policy.py` ✔ R: gov ID only required for overseas explorers (mobile substitute); ID otherwise a badge; owner can extend via `VERIFICATION_EXTRA_REQUIREMENTS` (setting ✘ NI). |
| ON-Q14 | How do organisations join? | **REVALIDATED — still valid** | `OrganizationViewSet.create` still superuser-only (`organizations/views.py:59-65` ✔ R). No org signup role. Web create page routing **not revalidated**. |
| ON-Q15 / LA-Q02 / LA-Q03 | Must onboarding work fully on mobile? / Fix the broken manager "add personal profile" flow? | **NOT VERIFIED** | The #184 breakage (pharmacist fields dropped; other-staff route not-found) could not be re-checked — frontend files ✘ NI (429). The new PHARMACY_MANAGER one-time switch (F3) makes this question **bigger**, not smaller. Must be re-checked before the owner is asked to decide it. |
| ON-P02 | Register shows Suspended/Cancelled — what happens? | **REVALIDATED — still valid** | `state.py` `apply_state_transition()` / `announce_suspension()` / `announce_member_suspension()` ✔ R match #184: future public bookings cancelled, non-members paused, members kept with a note, pharmacist owners become Pharmacy Managers, admins emailed, no fee/refund rule. |
| ON-P03 | Which AHPRA lookup runs at launch? | **STILL VALID — not revalidated** | Desktop verifier vs ScrapingBee; `state.py` references `onboarding.verification.desktop.enqueue_check` ✔ R (the desktop path exists in code), but which source is default/enabled at launch was not inspected. |
| TB-Q08 | What should the heart on a talent card do? | **STILL VALID — not revalidated** | No contradicting evidence at #249 head; talent-board frontend ✘ NI. |
| LA-Q15 | Fix web/mobile disagreement on talent-board booking permissions? | **NOT VERIFIED** | Frontend permission lists ✘ NI; backend authority (`offers.py`/`assignment.py`) ✘ NI. Carried forward untouched. |
| LA-Q11 / SH-11 | Auto-publish setting contradicts R06/R04B; web-only toggle | **REVALIDATED — still valid (code gap)** | `organizations/models.py` `auto_publish_worker_requests` help text **still** says "automatically create and publish a new shift" at #249 head ✔ R — the contradiction noted in Oct is still live code. Whether handlers now consult it: **not revalidated**. |
| Carried R01 | Roster = employed staff only | **REVALIDATED — still valid** | `PHARMACY_STAFF_EMPLOYMENT_TYPES = (FULL_TIME, PART_TIME, CASUAL)` ✔ R; favourites go through offers, consistent. |
| Carried R04A/B/C | Cover permission per pharmacy; named colleagues; replacement fulfilled on accept + checks + manager approval | **STILL VALID — not revalidated** | Backend cover/swap handlers ✘ NI in this pass; the R04A flag itself is still mis-described (see LA-Q11 above). |
| Carried D01–D05, E01, P02–P12, F01/F04 | Shift lifecycle / cancellation decisions | **Out of GM-05 scope** | Not re-traced here; they constrain GM-05 questions (e.g. P04/P05 on who sanctions whom) and are cited where relevant. |
| Audit ON-02 | AHPRA expiry never enforced at apply/accept | **STILL VALID — not revalidated** | `ahpra.py` ✘ NI; no expiry check seen in the files read (`interest.py`, `state.py` check *status*, not expiry). |
| Audit ON-03 | Professional indemnity insurance not captured | **STILL VALID — not revalidated** | No insurance field seen in files read; `onboarding/services/skills.py` ✘ NI. |
| Audit ON-10 | Progress % ≠ Verified needs | **STILL VALID — not revalidated** | `progress.py` ✘ NI. |
| Audit ON-11 | Payment readiness only visible at acceptance | **REVALIDATED — changed, partially** | `serializers.py:334-353` `_application_payment_profile_status()` ✔ R now exposes `worker_payment_profile_status` on membership *applications* (manager-facing); whether workers see an early checklist in either app is **not revalidated**. |

**Counts:** 142 legacy #184 questions + 30 carried decisions were to be reused, not silently re-asked (Issue #250). Of the GM-05-relevant subset (14 questions + 3 carried-decision groups + 4 audit items = 21 rows in the §2 table): **11 revalidated** — 6 still valid (ON-P01, ON-Q08, ON-Q14, ON-P02, LA-Q11/SH-11, R01) and 5 changed (ON-Q01, ON-Q02, ON-Q03, ON-Q05, ON-11); **7 not revalidated** (ON-P03, TB-Q08, LA-Q15, R04A/B/C, ON-02, ON-03, ON-10); **3 not verified** (ON-Q15/LA-Q02/LA-Q03) — those three must be re-checked against #249-head frontend code before they are put to the owner. (Senior-review correction: the earlier counts "9 (5+4), 5, 3" = 17 did not add up to the 21 table rows; corrected to 11 + 7 + 3 = 21.)

---

## 3. Validated question queue (PR #184 format)

Format per question: **ACTUAL TODAY** (with source links) → **RECOMMENDED** (keep/change, rationale, severity, benefits, risks, legal/financial impact) → **ALTERNATIVE A** (keep existing policy where possible, scenario + trade-offs) → **ALTERNATIVE B/C** (realistic alternatives with concrete worker/pharmacy/platform scenarios + consequences) → **Other / defer**. Each option is read against: normal case, edge case, retry/concurrency, denied role / wrong tenant, payment/notification side effects, web/Expo difference. Plain English first.
**Decision status** is shown per question: `OPEN` (owner has not decided) · `CARRIED — confirm only` (already decided; ask only to confirm it still stands) · `NOT VERIFIED` (do not ask until re-checked).

### Q-01 — ON-P01: AHPRA exemption for favourites
- **Status:** Answered: A, employees are exempt and favourites are checked, launch grill, 23 Oct 2026 - see AHPRA-FAV-01.
- **Actual today:** Eligible favourites and employees skip the check on named public shifts at that pharmacy. Engineering: see BL-02.

### Q-02 — ON-Q03: Verification on outside bookings
- **Status:** Answered: B, check every outside booking, launch grill, 23 Oct 2026 - see VERIFY-GATE-01.
- **Actual today:** The shared guard skips non-public shifts. Engineering: see BL-01.

### Q-03 — [ON-Q05] What can Explorers (new to pharmacy) do with shifts?

> **Merged 22 Nov: asked once, as ON-Q05 in GM-02.** Answer it there; this copy stays for its own evidence and is not asked again.
- **Status:** OPEN — REVALIDATED changed, partially (backend confirmed; mobile screen not verified).
- **Sources:** `backend/shifts/interest.py` `_require_public_shift_onboarding()`; `backend/users/models.py` `User.ROLE_CHOICES`; `frontend_mobile/app/explorer/shifts.tsx` — main-branch search only, NOT #249 head.
- **ACTUAL TODAY:** An Explorer needs a *verified* Explorer onboarding profile to apply for a public shift (403 otherwise). But per #184, an Explorer can never *accept* an offer (the engagement lookup expects a staff profile) and has no payment tab — so today an Explorer can create interest a pharmacy cannot convert. On mobile the Explorer shifts tab was a blank placeholder in Oct; it may now have a real screen (main-branch search shows a re-export to `@/roles/explorer/shifts`) — **not verified at #249 head**.
- **RECOMMENDED — C (paid shifts only after upgrading to a staff role). Severity: MEDIUM.** Keep the existing upgrade card/path; stop Explorers applying to shifts they cannot take. Benefits: no wasted pharmacy time, no false hope; the upgrade path already exists. Risks: fewer applicants visible to pharmacies in the short term. Legal/financial: none — Explorers are not paid workers until they hold a real role.
- **ALTERNATIVE A — Keep current logic (boards visible, can apply, cannot accept).** Scenario: an Explorer applies to 6 shifts, 2 pharmacies offer, both offers die silently. Trade-off: maximal visibility; every acceptance attempt fails and pharmacies learn to ignore Explorer applicants.
- **ALTERNATIVE B — No shifts; hide the boards (A in #184).** Scenario: an Explorer sees no shifts at all until they upgrade. Trade-off: cleanest, but removes the browsing that may motivate someone to join pharmacy.
- **ALTERNATIVE C — Unpaid shadowing / volunteer posts only (B in #184).** Scenario: a pharmacy posts a shadowing day and an Explorer books it. Trade-off: gives Explorers a real use, but needs a new post type, insurance/volunteer rules, and a payment rule (unpaid) — a bigger build than C.
- **Other / defer.** Edge: an Explorer mid-upgrade (account type changed, onboarding incomplete) — what do they see? Unknown; define. Web/Expo difference: web shows boards today; mobile may or may not — verify before launch (see NOT VERIFIED note).

### Q-04 — [NEW] When a pharmacy invites someone with no account, should they become an active member immediately?
- **Status:** Merged into GM-05-W01. Ask there once.
- **Sources:** `backend/memberships/invites.py` `create_membership_invite()` (the `if user_created or activate_immediately` branch); `backend/memberships/models.py` `Membership.Status`.
- **ACTUAL TODAY:** Yes — today a brand-new person is created with a random password and their membership is **ACCEPTED and active at once**, before they have logged in, verified email or mobile, or proved anything about themselves. They get a password-set magic link by email. Separately, an existing user who is invited stays **PENDING** until they accept — unless the inviter passes `activate_immediately=true`, which also skips consent.
- **RECOMMENDED — Change: pending until the person accepts (and verifies email). Severity: HIGH.** A membership is a trust relationship: it unlocks the AHPRA exemption (Q-01), staff-tier shift visibility, and internal access. Granting it to an unverified email address — including a mistyped address, which would hand a stranger membership of a real pharmacy — is the wrong default. Benefits: no stranger-members; the invite flow matches what the worker sees (accept/reject). Risks: one extra click before a new starter can be rostered; managers must chase acceptance. Legal: reduces impersonation / wrongful-access exposure. Financial: none.
- **ALTERNATIVE A — Keep current logic (immediate activation for new accounts).** Scenario: a manager invites a locum who has never used the platform; the locum clicks the magic link, sets a password, and is already on the roster for tomorrow. Trade-off: fastest onboarding for genuine starters; but a typo'd email activates a stranger, and the "member" has passed no check at all.
- **ALTERNATIVE B — Immediate activation, but limited until first login + email verification.** Scenario: as in A, but the membership is active for rostering only after the magic link is used and email verified; until then it shows as "invited — not yet active". Trade-off: keeps speed, closes the stranger problem; needs a new intermediate state or a flag.
- **ALTERNATIVE C — Immediate activation only for staff (FULL_TIME/PART_TIME/CASUAL), pending for favourites.** Scenario: a new full-time hire is active at once; a new favourite locum must accept first. Trade-off: matches the trust difference between employee and contractor; two rules to explain.
- **Other / defer.** Edge cases: the magic link expires (Django token timeout — exact value **not inspected** in settings) while the membership stays active forever — define link expiry vs membership expiry separately. Retry/concurrency: re-inviting the same email is blocked while PENDING, but a *created-but-never-logged-in* account is ACCEPTED, so a second invite says "already a member". Denied role: the new account's role is *derived* from the membership role (PHARMACIST→PHARMACIST, INTERN/STUDENT/ASSISTANT/TECHNICIAN→OTHER_STAFF, anything else→**EXPLORER**) — a CONTACT invite silently creates an Explorer. Payment/notification: the new-user email is the only notice; no in-app notification exists until the account is used.

### Q-05 — [NEW] Should a direct email invite ever expire, and can it be revoked?
- **Status:** OPEN — REVALIDATED (new since #184).
- **Sources:** `backend/memberships/models.py` `Membership` (no expiry field), `MembershipInviteLink` (`expires_at`, `is_valid()`); `backend/memberships/invites.py` `create_membership_invite()`.
- **ACTUAL TODAY:** A direct email invite (PENDING membership) **never expires** and no revoke/withdraw action was found in the files inspected. The *other* invite mechanism — multi-use invite links — **does** expire (`expires_at` + `is_valid()`), but its expiry has no default (see Q-08). So today a forgotten invite from months ago can still be accepted, and a manager who invited the wrong person has no "undo" except removing the membership afterwards (Q-09).
- **RECOMMENDED — Add a 7-day expiry + a revoke action. Severity: MEDIUM.** Benefits: stale invites cannot be accepted after the pharmacy has moved on; a wrong-email invite stops being a live door. Risks: genuine slow responders must be re-invited; a small amount of build. Legal/financial: minimal; reduces unauthorised-access window.
- **ALTERNATIVE A — Keep current logic (never expires, no revoke).** Scenario: a locum accepts an invite sent 4 months ago for a pharmacy that has since changed hands. Trade-off: zero build; the risk above stays.
- **ALTERNATIVE B — 30-day expiry, no revoke.** Scenario: as above, but only within a month. Trade-off: less build than a revoke action; a wrong invite still lives for a month.
- **ALTERNATIVE C — Expiry matches the invite-link default (whatever Q-08 decides), plus revoke.** Scenario: one expiry rule for both invite mechanisms. Trade-off: most consistent; ties this decision to Q-08.
- **Other / defer.** Edge: what happens to an invite accepted *after* the pharmacy's circumstances changed (e.g. ownership)? Retry: re-inviting after expiry must create a fresh invite, not resurrect the old one. Notification: expiry should notify the inviter (or not — decide). Web/Expo: both show the same membership list, so expiry must be enforced backend-side.

### Q-06 — [NEW] Who can create ORG_STAFF accounts and organisation memberships, and what does REGION_ADMIN actually scope?
- **Status:** OPEN — REVALIDATED (new since #184; org-role mechanics partly not inspected).
- **Sources:** `backend/users/models.py` `User.ROLE_CHOICES`, `OrganizationMembership`; `backend/memberships/access.py` `user_can_invite_members_to_pharmacy()` (org capability checks); `backend/users/org_roles.py` — **NOT INSPECTED**.
- **ACTUAL TODAY:** ORG_STAFF is a real account role but **not self-registrable**. Organisation memberships carry one of ORG_ADMIN / CHIEF_ADMIN / REGION_ADMIN, a free-text `region`, a pharmacy `admin_level` (default MANAGER), and an M2M list of scoped pharmacies. Invite/change/decide authority for a pharmacy checks org capabilities (`INVITE_STAFF` / `MANAGE_STAFF` / `MANAGE_ADMINS`) *and* whether the membership "covers" that pharmacy. But **who creates the ORG_STAFF account, who grants the org role, and what REGION_ADMIN's region limits** were not found in the files inspected.
- **RECOMMENDED — Define it before launch: org admins create ORG_STAFF accounts by invite; REGION_ADMIN is scoped to pharmacies in their named region only; CHIEF_ADMIN is org-wide and is the only org role that can grant org roles. Severity: MEDIUM.** Rationale: today the power exists in code with no visible front door, which means it will be done by support/DB or not at all. Benefits: groups can actually run themselves; scoping prevents a region admin acting org-wide. Risks: if the region is free text, scoping is unenforceable — regions need a controlled list. Legal/financial: org admins acting outside their scope could invite staff to pharmacies they don't run.
- **ALTERNATIVE A — Keep current logic (undefined / platform-admin-led).** Scenario: a chain asks for a regional manager account; support creates it manually. Trade-off: works for the few groups at launch (consistent with ON-Q14's sales-led org setup); does not scale and leaves the capability checks as dead code.
- **ALTERNATIVE B — Self-serve org signup with admin approval (mirrors ON-Q14 option B).** Trade-off: consistent with a future self-serve org story; more build and approval workflow.
- **Other / defer.** Edge: an org member whose `pharmacies` M2M list is empty — covers nothing, or everything? (The `membership_covers_pharmacy()` semantics are **not inspected** — this must be answered from code before the owner decides.) Denied role / wrong tenant: an org admin of Chain X inviting into a pharmacy of Chain Y must be denied — the code checks `organization_id` match, but the exact denial response was not inspected.

### Q-07 — [NEW] A Manager has exactly the same powers as the Owner. Keep that?
- **Status:** OPEN — REVALIDATED.
- **Sources:** `backend/access_control/pharmacy_roles.py` `PharmacyAdminPolicy.CAPABILITY_MATRIX`; `backend/organizations/models.py` `PharmacyAdmin.can_be_removed_by()`, `clean()`.
- **ACTUAL TODAY:** MANAGER holds **all four** capabilities — MANAGE_ADMINS, MANAGE_STAFF, MANAGE_ROSTER, MANAGE_COMMUNICATIONS — identical to OWNER. The only owner protections are: the owner's own admin record cannot be demoted, and owners cannot be removed by other admins. So a Manager can appoint/remove other Managers and Roster/Communication Managers, manage all staff, and run the roster — everything except touching the owner's own record.
- **RECOMMENDED — Change: MANAGER keeps staff + roster + comms, but loses MANAGE_ADMINS (or can manage only ROSTER/COMMUNICATION managers, never other MANAGERs). Severity: MEDIUM-HIGH.** Rationale: "manager" that can mint other managers is effectively a co-owner with no ownership accountability; a disgruntled or mistaken Manager can lock the owner out of their own admin team (not the pharmacy — the owner record is protected — but the team around it). Benefits: least-privilege, matches the plain meaning of the words. Risks: owners who genuinely run a pharmacy through a Manager must do admin appointments themselves; a small workflow cost. Legal/financial: reduces insider-risk exposure.
- **ALTERNATIVE A — Keep current logic (MANAGER = OWNER in powers).** Scenario: an owner on leave leaves a Manager fully in charge, including appointing a weekend Roster Manager. Trade-off: maximum delegation; the owner must trust the Manager completely, because the system does.
- **ALTERNATIVE B — Add a distinct "Owner-delegate" level and demote MANAGER to staff+roster+comms.** Scenario: as in A, but only a named delegate gets admin powers. Trade-off: clearest, but a new level to build and explain.
- **Other / defer.** Edge: two Managers disagreeing — today either can remove the other (first mover wins); under the recommendation, neither can. Concurrency: simultaneous admin changes are not serialised in the code inspected — check `membership_operations` (✘ NI). Denied role: ROSTER_MANAGER and COMMUNICATION_MANAGER correctly lack staff/admin powers today. Web/Expo: admin screens must hide what the capability matrix denies — both apps must read the same matrix.

### Q-08 — [NEW] Invite links: who can generate them, how long do they live, and what stops abuse?
- **Status:** OPEN — REVALIDATED (new flow; views not inspected).
- **Sources:** `backend/memberships/models.py` `MembershipInviteLink`, `MembershipApplication`; `backend/memberships/serializers.py` `MembershipInviteLinkSerializer`, `MembershipApplicationSerializer`, `MembershipApplicationReviewSerializer`.
- **ACTUAL TODAY:** An Owner/Org Admin/Pharmacy Admin can generate a **multi-use** magic link per pharmacy per category (full/part-time vs locum/casual). Candidates submit name, mobile, date of birth, role and award details; each submission is an application the owner approves/rejects; approval creates the membership via the normal invite email flow. The link has an `expires_at` and an `is_active` flag — but **no default expiry is set anywhere inspected**, and who may generate/revoke a link (which endpoint, which permission) was not inspected (views ✘ NI).
- **RECOMMENDED — Default 14-day expiry, one link per pharmacy+category at a time (regenerating invalidates the old one), owner/admin-only generation, revoke action. Severity: MEDIUM.** Benefits: a shared link cannot circulate forever; one live link is auditable. Risks: a link shared in a group chat still admits anyone who applies — approval is the real gate, so the risk is spam applications, not unauthorised membership. Legal/financial: applications collect date of birth — retention/privacy handling must be defined (GM-26), and rejected applications should not keep personal data indefinitely.
- **ALTERNATIVE A — Keep current logic (expiry as supplied, multi-use, no stated default).** Scenario: a link posted in a staff Facebook group in January is still accepting applications in June. Trade-off: zero build; the exposure above stays.
- **ALTERNATIVE B — Single-use links.** Scenario: each candidate gets their own link. Trade-off: kills the "share one link" convenience that justifies the feature; use direct invites instead.
- **Other / defer.** Edge: duplicate applications from the same person (unique `pending_identity_key` dedupes by identity — exact fields ✘ NI). Retry: re-applying after rejection — allowed? Unknown. Notification: owner notified of a new application? ✘ NI. Web/Expo: the application form is a public (signed-out?) page — confirm auth requirements before launch.

### Q-09 — [NEW] What happens when a member is removed — bookings, roster, history?
- **Status:** OPEN — REVALIDATED (removal mechanics confirmed; downstream effects not inspected).
- **Sources:** `backend/memberships/models.py` `Membership.remove()`, `revoke_admin_access()`; `backend/memberships/access.py` `user_can_change_membership()`.
- **ACTUAL TODAY:** Removing a member revokes their admin access, **deletes their chat participations** (messages preserved), and deletes the membership row — or deactivates it if employment history protects the row. What happens to their **future confirmed bookings, roster entries, pending offers, or favourite status** was not found in the files inspected. The owner's own membership cannot be changed/removed through the generic endpoint.
- **RECOMMENDED — Removal blocks new bookings immediately, keeps history, and forces a decision on future confirmed bookings (cancel with notice, or keep with a warning). Severity: MEDIUM.** Rationale: silently keeping a removed person's confirmed shifts is worse than either clean option. Benefits: no ghost workers on the roster; audit trail intact. Risks: requires a booking-cancellation path that interacts with the cancellation-fee decisions (P09) — do not invent fees here. Legal/financial: a removed employee's future shifts are a pay/cover problem, not a membership problem — surface it, don't hide it.
- **ALTERNATIVE A — Keep current logic (remove only; downstream effects as the code happens to do).** Scenario: a dismissed casual is removed on Friday; she still holds a confirmed Saturday locum shift at the same pharmacy. Trade-off: zero build; the Saturday surprise is the cost.
- **ALTERNATIVE B — Removal is blocked while future confirmed bookings exist (manager must cancel/reassign first).** Scenario: as above, but removal refuses until the Saturday shift is dealt with. Trade-off: safest, but a manager in a hurry cannot remove someone quickly.
- **Other / defer.** Edge: the member is mid-shift when removed (attendance/kiosk — GM-08). Concurrency: removal racing an acceptance — the acceptance should fail if the membership is gone (verify in `offers.py` ✘ NI). Notification: removed member told? ✘ NI.

### Q-10 — ON-Q01: Worker sign-up tracks
- **Status:** Answered: KEEP the existing sign-up tracks, launch grill, 23 Oct 2026 - see ON-Q01.
- **Actual today:** Pharmacist, Other Staff and Explorer are the worker tracks. Owner has a separate sign-up track. The organisation and pharmacy-manager roles are created through other flows.

### Q-11 — [NEW] The Pharmacy Manager one-time switch: what exactly happens, and is once really once?
- **Status:** OPEN — REVALIDATED (model comment only; endpoint not inspected).
- **Sources:** `backend/users/models.py` `User.ROLE_CHOICES` (PHARMACY_MANAGER comment), `CHOOSABLE_ACCOUNT_TYPES`.
- **ACTUAL TODAY (from the model only):** A Pharmacy Manager — created when an organisation onboards a pharmacy by email — manages that pharmacy through a MANAGER admin assignment, and "may later choose PHARMACIST or OTHER_STAFF once". Ownership is never acquired this way; MANAGER "remains the highest delegated pharmacy-admin level". The endpoint that performs the switch, whether it is enforced once, what happens to the admin assignment and to any personal onboarding already done, and what the mobile flow does (per #184 ON-04 it was broken) are all **not inspected**.
- **RECOMMENDED — Keep the rule, but define and enforce it before launch: one switch, only to PHARMACIST or OTHER_STAFF, admin assignment survives the switch, and the switch requires completing that role's onboarding before the person can apply for shifts. Severity: MEDIUM.** Benefits: a real person who both manages a pharmacy and works shifts gets one account, not two. Risks: if the switch is not enforced once, role-hopping becomes a way to dodge verification; if the admin assignment is dropped, the pharmacy loses its manager.
- **ALTERNATIVE A — Keep current logic as written in the model comment (switch once; details undefined).** Scenario: a manager switches to Pharmacist, keeps managing, works shifts. Trade-off: the happy path works; the edge cases (double-switch, dropped admin rights, half-onboarded switcher applying for shifts) are undefined.
- **ALTERNATIVE B — No switch: a manager who wants to work shifts creates a second account.** Trade-off: simplest to reason about; two logins, two identities for one person, and the membership/AHPRA logic must cope with that.
- **Other / defer.** Edge: a PHARMACY_MANAGER who is also the pharmacy's *owner-side* contact — switching must never confer ownership. Denied role: switching to OWNER or ORG_STAFF or EXPLORER must be refused. Web/Expo: the #184 mobile breakage (ON-04) must be re-verified at #249 head before this is asked as a launch question.

### Q-12 — ON-Q02 / ON-11: Browse access and payment readiness
- **Status:** Answered: KEEP, launch grill, 23 Oct 2026 - see GM01-Q04 for the single re-confirmation.
- **Payment-readiness status:** Answered: B, tell the worker early and require pay details before acceptance, launch grill, 23 Oct 2026 - see ON-Q04. Engineering: see BL-03.

### Q-13 — [ON-Q14] How do organisations (multi-site groups) join? (revalidated)

> **Merged 22 Nov: asked once, as ON-Q14 in GM-02.** Answer it there; this copy stays for its own evidence and is not asked again.
- **Status:** OPEN — REVALIDATED still valid.
- **Sources:** `backend/organizations/views.py` `OrganizationViewSet` (create = `IsAdminUser()`); `backend/organizations/models.py` `Organization`, `PharmacyClaim`.
- **ACTUAL TODAY:** Only a platform superuser can create an organisation; there is no organisation sign-up and no ORGANIZATION signup role. Organisations then claim or invite pharmacies by email (`PharmacyClaim`, one accepted claim per pharmacy). The web create page exists but was not routed in Oct (not revalidated).
- **RECOMMENDED — KEEP (sales-led: platform admin creates the org, then invites its admins; delete the dead page). Severity: LOW.** Suits the few groups joining at launch; matches the #184 recommendation and the Patchwork pattern cited there. Benefits: no new approval workflow. Risks: every group onboarding needs a staff touch — acceptable at launch volume.
- **ALTERNATIVE A — Keep current logic.** (Same as recommended.)
- **ALTERNATIVE B — Self-serve signup that waits for admin approval.** Scenario: a 12-site group signs up on a Sunday and waits. Trade-off: scales, but needs approval tooling and a pending state.
- **ALTERNATIVE C — Self-serve with immediate access.** Scenario: as above, instant. Trade-off: fastest, but an unverified group could claim pharmacies before anyone checks them — and claims are exclusive (one accepted claim per pharmacy), so a bad claim blocks the real group.
- **Other / defer.** Edge: a pharmacy already claimed by one org being claimed by another — blocked by the unique-accepted-claim constraint; the *pending* claim queue behaviour was not inspected.

### Q-14 — [TB-Q08] What should the heart on a talent card do?

> **Merged 22 Nov: asked once, as GM-18-Q08 in GM-18.** Answer it there; this copy stays for its own evidence and is not asked again.
- **Status:** OPEN — STILL VALID, not revalidated.
- **Sources:** #184 `questions.json` TB-Q08; `backend/memberships/models.py` (favourites are `Membership` rows — no separate favourites table ✔ R).
- **ACTUAL TODAY (per #184):** The heart only likes/unlikes a post and changes its like count on both apps. It creates no favourites membership, and talent cards have no "Invite to favourites" action.
- **RECOMMENDED — B (keep like; add an explicit consent-based "Invite to favourites"). Severity: MEDIUM.** A like is a reaction, not consent to a working relationship; favourites carry real consequences (AHPRA exemption — Q-01 — and staff-tier visibility). Benefits: pharmacies can build their trusted pool from the board without pretending a like is consent; the worker explicitly accepts. Risks: one more flow to build on both apps.
- **ALTERNATIVE A — Keep current logic (heart is only a like).** Scenario: a pharmacy likes 20 talent posts and still has no favourites to book from. Trade-off: zero build; favourites can only be built through the staff/locum manager.
- **ALTERNATIVE B — Heart adds to favourites, with consent (A in #184).** Scenario: tapping the heart sends a favourite request the worker accepts. Trade-off: fastest path to a pool, but conflates a casual reaction with a working relationship — a worker could be favourited by dozens of pharmacies from one tap each.
- **Other / defer.** Edge: the worker is already a member — the card should not offer a duplicate invite (duplicate rules F11 apply). Notification: a favourite invite should notify the worker (the direct-invite notification exists for memberships — reuse it). Web/Expo: both apps must offer the same action.

### Q-15 — [ON-Q08] Who must pass an ID check?

> **Merged 22 Nov: asked once, as ON-Q08 in GM-02.** Answer it there; this copy stays for its own evidence and is not asked again.
- **Status:** OPEN — REVALIDATED still valid.
- **Sources:** `backend/onboarding/verification/policy.py` `requirements()`; `backend/users/models.py` `mobile_check_skipped`.
- **ACTUAL TODAY:** ID is only *required* for overseas Explorers who skip the mobile check (verified photo ID substitutes for mobile). A setting (`VERIFICATION_EXTRA_REQUIREMENTS`) can add ID to Verified for everyone, but it is off by default (per #184; setting value ✘ NI). ID reading (OCR) already works for everyone; otherwise ID is a badge, never blocking.
- **RECOMMENDED — A (every worker before first booking). Severity: MEDIUM.** Most workers are never ID-checked today, yet they are booked into pharmacies handling controlled drugs. The OCR tooling exists, so this is a gate change, not new tooling. Benefits: identity assurance matches the trust the platform claims; helps with the stranger-member risk in Q-04. Risks: friction at first booking; overseas/ID edge cases need a fallback. Legal: identity verification supports the platform's duty of care; it is not a substitute for AHPRA. Financial: OCR costs per check (if any) — confirm.
- **ALTERNATIVE A — Keep current logic (ID only for overseas Explorers).** Scenario: a pharmacist with a verified email, mobile and AHPRA works shifts with no photo ID ever seen. Trade-off: least friction; identity rests on email+mobile.
- **ALTERNATIVE B — Pharmacists and ABN workers only (C in #184).** Scenario: as above, but ABN contractors (who invoice) are ID-checked while employed casuals are not. Trade-off: targets the money flow; leaves employed staff unchecked.
- **Other / defer.** Edge: a worker whose ID fails OCR — manual review path needed (GM-26). Web/Expo: the ID upload flow must work identically on both.

### Q-16 — [ON-Q15 / LA-Q02 / LA-Q03] Must onboarding and account upgrades work fully on mobile at launch?

> **Merged 22 Nov: asked once, as GM01-Q10 in GM-01.** Answer it there; this copy stays for its own evidence and is not asked again.
- **Status:** NOT VERIFIED — do not put to the owner until re-checked at #249 head.
- **Sources:** #184 ON-Q15, LA-Q02, LA-Q03 (Oct 2026 breakage); `backend/users/models.py` PHARMACY_MANAGER switch (new); frontend files — **NOT INSPECTED (429)**.
- **ACTUAL TODAY (per #184, stale):** Profile tabs matched, but the mobile "add personal profile" flow for managers was broken: the pharmacist screen posted bank/rate fields the backend silently drops, and intern/technician/assistant/student went to a missing route (`/otherstaff/onboarding` had no file). Reachable mobile screens could dead-end; Explorer Shifts and some hubs were placeholders.
- **RECOMMENDED — A (full parity on web and mobile) — provisional, pending re-verification.** The #184 recommendation stands *if* the breakage is still there; the #248/#249 Expo waves (W1 auth/onboarding redesign, W2 persona home screens) may have fixed some or all of it. **Do not ask the owner to decide "fix before launch" until the #249-head mobile code is actually read.** If fixed, this question collapses to a verification note; if still broken, it is launch-gating.
- **ALTERNATIVE A — Keep current logic.** (Only meaningful if the flow is already fixed.)
- **ALTERNATIVE B — Mobile basics, rest links to web (B in #184).** Scenario: a manager on mobile is sent to the web flow for the personal-profile step. Trade-off: ships faster, but a mobile-first workforce gets a broken-feeling handoff.
- **Other / defer.** This question is parked as NOT VERIFIED, not dropped.

### Q-17 — [LA-Q15] Web and mobile disagree on talent-board booking permissions — fix before launch?

> **Merged 22 Nov: asked once, as GM-18-Q15 in GM-18.** Answer it there; this copy stays for its own evidence and is not asked again.
- **Status:** NOT VERIFIED — do not put to the owner until re-checked at #249 head.
- **Sources:** #184 LA-Q15; `backend/shifts/offers.py`, `backend/shifts/assignment.py` — **NOT INSPECTED**; frontend Talent Board files — **NOT INSPECTED**.
- **ACTUAL TODAY (per #184, stale):** Mobile allowed any non-worker role to request bookings; web used a narrower allow-list. The backend must be the authority.
- **RECOMMENDED — A (one backend hiring-role policy, mirrored in both clients, before launch) — provisional.** The principle is sound and unchanged; the facts (which roles each client allows today) must be re-read at #249 head first.
- **Other / defer.** Parked as NOT VERIFIED.

### Q-18 — [NEW] The 3-pharmacy membership cap: keep it, raise it, or scope it?
- **Status:** OPEN — REVALIDATED (new since #184 — no cap was mentioned in Oct).
- **Sources:** `backend/memberships/serializers.py` `MAX_ACTIVE_PHARMACY_MEMBERSHIPS = 3`, `_count_active_memberships()`; `backend/memberships/invites.py` `create_membership_invite()`.
- **ACTUAL TODAY:** One person may hold at most **3 active** (ACCEPTED + active) pharmacy memberships. PENDING invites don't count. The cap is enforced on invite and on serializer validation, with a plain error message. There is no per-role or per-type distinction — a pharmacist working across a 5-site group hits the same cap as a casual at 3 independents.
- **RECOMMENDED — KEEP 3 for favourites/locums; exempt or raise for employed staff of one organisation's pharmacies. Severity: LOW-MEDIUM.** Rationale: the cap exists to stop membership sprawl, but a real employee of a 5-site group is not "sprawling" — and the org-membership scoping (Q-06) already governs group staff. Benefits: groups can staff all their sites; the anti-sprawl protection stays for the marketplace side. Risks: two rules to explain; the exemption must be tied to the org, not to the person asserting it.
- **ALTERNATIVE A — Keep current logic (flat cap of 3 for everyone).** Scenario: a pharmacist employed by a 4-site group cannot be a member of the fourth site and must be booked as an outsider there. Trade-off: simplest; the group workaround (book as public) defeats the membership model.
- **ALTERNATIVE B — Raise the flat cap (e.g. 5 or 10).** Scenario: as above, solved for most groups. Trade-off: one number, but a locum could then be a "member" of 10 pharmacies and collect the AHPRA exemption (Q-01) at all of them.
- **Other / defer.** Edge: concurrency — simultaneous invites to different pharmacies are serialised on the user row, so the cap cannot be raced past (✔ R). Edge: a member who *leaves* one pharmacy frees a slot only when the row is deactivated/deleted (F14). Notification: the inviter sees a plain error; the worker is never told they hit a cap.

### Q-19 — [NEW] Should the owner's own membership really be untouchable through the normal membership screen?
- **Status:** CODE INVARIANT — confirm only (not a #184 carried decision). Senior-review correction: this is a code invariant (`user_can_change_membership()` returns False for the owner's derived membership), not one of #184's carried owner decisions (D01–D05, R01/R04/R06, E01/E03, P02–P12, F01/F04). Recorded here for the ledger, not a fresh decision.
- **Sources:** `backend/memberships/access.py` `user_can_change_membership()` ("The pharmacy owner's derived OWNER membership is a system/control-plane invariant and is not mutable through the generic membership endpoint").
- **ACTUAL TODAY:** The owner's membership of their own pharmacy cannot be changed through the generic membership endpoint — `user_can_change_membership()` returns False for it. Separately, the owner's admin record cannot be demoted or removed (`PharmacyAdmin.clean()`, `can_be_removed_by()`).
- **RECOMMENDED — KEEP, and confirm with the owner that this matches their intent.** It protects against an admin accidentally (or deliberately) removing the owner from their own pharmacy. The open part is only: what *is* the path when ownership genuinely transfers (sale of pharmacy)? That belongs to GM-03/GM-04, not GM-05 — flagged here so it is not lost.
- **Other / defer.** If ownership transfer needs a path, it should be a platform-admin action with an audit record, not a membership edit.

---

## 4. The SINGLE first decision question

**First owner question:** GM-05-W01, whether Mia is active before she sets her password. Safety work from the recorded ON-Q03 and ON-P01 answers is tracked in BL-01 and BL-02.

---

## 5. Code gaps vs decision gaps

### Code gaps — no owner decision needed; build/fix once the relevant decision (if any) is made
| ID | Gap | Evidence | Blocks |
|---|---|---|---|
| CG-1 | `auto_publish_worker_requests` help text still promises "automatically create and publish a new shift", contradicting carried decisions R06/R04B (it is a per-pharmacy *permission*, not a publisher). | `backend/organizations/models.py` ✔ R | Q-16 area; correct copy + enforce the flag (handlers not verified to consult it) |
| CG-2 | AHPRA **expiry** is saved but never enforced at apply/accept (audit ON-02); only register *status* is checked. | `backend/shifts/interest.py`, `backend/onboarding/verification/state.py` ✔ R (status only); `ahpra.py` ✘ NI | Q-01/Q-02 — a lapsed-but-not-suspended registration passes today |
| CG-3 | Platform staff (`is_staff`/`is_superuser`) can **invite** to any pharmacy but `user_can_change_membership()` gives them **no** change rights — asymmetric, probably unintentional. | `backend/memberships/access.py` ✔ R | Verify in `memberships/views.py` (✘ NI) before treating either as policy |
| CG-4 | `MembershipInviteLink.expires_at` has **no default** anywhere inspected; a link created without an expiry may fail validation or live forever, depending on the view. | `backend/memberships/models.py`, `backend/memberships/serializers.py` ✔ R; views ✘ NI | Q-08 |
| CG-5 | Profile progress % counts optional fields while Verified needs email+mobile+AHPRA (audit ON-10) — drive UI from `verification_summary().missing`. | `backend/onboarding/verification/policy.py` `missing_requirements()` ✔ R; `progress.py` ✘ NI | Q-12 |
| CG-6 | `Membership.remove()` deletes chat participations and deactivates-or-deletes the row, but nothing inspected handles the removed person's future bookings/roster/offers. | `backend/memberships/models.py` `remove()` ✔ R | Q-09 |
| CG-7 | New-user invite magic link uses Django's default token (expiry = `PASSWORD_RESET_TIMEOUT`, value not inspected) while the membership it activates **never expires**. | `backend/memberships/invites.py` ✔ R; `core/settings.py` ✘ NI | Q-04/Q-05 |
| CG-8 | Invite `activate_immediately` flag can bypass the accept step for existing users; who can pass it and whether any UI exposes it was not inspected. | `backend/memberships/invites.py` ✔ R; views/UI ✘ NI | Q-04 |
| CG-9 | `membership_covers_pharmacy()` semantics (does an org member with an empty pharmacy list cover nothing or everything?) not inspected — the region/org scoping rule is unverified. | `backend/users/org_roles.py` ✘ NI (429) | Q-06 |
| CG-10 | Frontend re-verification outstanding (429 block): mobile "add personal profile" (ON-04), Explorer shifts tab, Talent Board booking allow-lists, membership/invite screens on Vite/Next/Expo. | — | Q-16, Q-17, Q-03 (mobile part) |

### Decision gaps — the owner must choose first; do not build until answered
| ID | Gap | Question |
|---|---|---|
| DG-1 | Favourite locums exempt from AHPRA on public shifts; suspended members never paused | Q-01 ★ first |
| DG-2 | Verification enforcement scope: public apply only, or every outside acceptance (offer/counter/dedicated)? | Q-02 |
| DG-3 | What Explorers may do with shifts | Q-03 |
| DG-4 | New-account invites auto-activate before any verification | Q-04 |
| DG-5 | Direct invites never expire; no revoke | Q-05 |
| DG-6 | ORG_STAFF creation + REGION_ADMIN scoping undefined | Q-06 |
| DG-7 | MANAGER = OWNER in capabilities | Q-07 |
| DG-8 | Invite-link expiry default, single live link, revocation | Q-08 |
| DG-9 | Removal's effect on future bookings/roster | Q-09 |
| DG-10 | PHARMACY_MANAGER one-time switch rules | Q-11 |
| DG-11 | ID check for every worker before first booking? | Q-15 |
| DG-12 | Membership cap of 3 — flat or scoped? | Q-18 |
| DG-13 | Organisations: sales-led vs self-serve (re-confirm; code unchanged) | Q-13 |

---

## 6. Implementation backlog — NOT DECIDED, DO NOT BUILD YET

**This backlog exists only so that, when the owner answers, the work is already scoped. Nothing here is approved. No item may be started, estimated as committed work, or merged on the basis of this document. Each item is gated on the question shown.**

| # | Backlog item (only after the owner answers) | Gated on | Notes / acceptance shape |
|---|---|---|---|
| B-01 | Enforce the decided AHPRA rule for favourites on public shifts (member-check + suspension handling) | Q-01 | Positive/negative tests: favourite suspended → blocked; employed staff → still exempt (if A); anonymous posts unchanged. Web + Expo verified separately. |
| B-02 | Extend the Verified/AHPRA gate to offer accept / counter-offer / dedicated offer (or deliberately leave the bypass, if the owner so decides) | Q-02 | Reuse `lock_public_ahpra()` inside the booking transaction; surface refusal messages in both apps. |
| B-03 | Explorer shift access: hide boards / block apply / route to upgrade, per decision | Q-03 | Verify the mobile Explorer tab first (CG-10); do not build on the Oct placeholder description. |
| B-04 | Invite activation: pending-until-accept for new accounts (or the decided variant), incl. magic-link vs membership expiry separation | Q-04, Q-05 | Migration/state consideration: existing auto-activated memberships created before the change need a grandfathering rule — ask the owner, do not assume. |
| B-05 | Invite expiry + revoke action for direct invites | Q-05 | Backend expiry enforcement + both apps' membership lists; expiry notification (or explicit no-notification) per decision. |
| B-06 | ORG_STAFF creation path + REGION_ADMIN scoping (controlled region list if decided) | Q-06 | Depends on `membership_covers_pharmacy()` code truth (CG-9) — read it first. |
| B-07 | MANAGER capability change (if decided) + admin-screen gating in both apps | Q-07 | Migration: existing MANAGERs keep or lose MANAGE_ADMINS per decision; audit existing admin appointments. |
| B-08 | Invite-link defaults (expiry, single live link, revoke) + application data retention rule | Q-08 | Privacy: rejected-application personal data (incl. DOB) retention — needs GM-26 input. |
| B-09 | Membership-removal consequences for future bookings/roster/offers + removal notification | Q-09 | Interacts with cancellation-fee decisions (P09) — no fees invented here. |
| B-10 | PHARMACY_MANAGER switch endpoint: enforce once, preserve admin assignment, require onboarding | Q-11 | Depends on re-verifying the mobile flow (CG-10). |
| B-11 | Worker verification + payment-readiness checklist on profile/apply/offer screens (both apps) | Q-12 | Drive from `verification_summary().missing` (CG-5), not progress %. |
| B-12 | Talent-board "Invite to favourites" (consent-based) | Q-14 | Reuse the membership-invite notification; dedupe against existing membership (F11). |
| B-13 | ID check gate for first booking (if decided) + manual-review fallback | Q-15 | OCR exists; gate change only if A/B decided. |
| B-14 | Membership-cap rule change (scoped exemption or new number) | Q-18 | Keep the concurrency-safe counting (`select_for_update` on the user row). |
| B-15 | Copy fix for `auto_publish_worker_requests` + enforce the R04A permission in handlers | CG-1 | Copy fix needs no decision; handler enforcement follows the carried R04A decision — confirm R04A still stands. |
| B-16 | AHPRA expiry enforcement at apply/accept + scheduled re-check | CG-2 | Code gap, but the *policy* (block vs warn vs grace) is a decision — fold into Q-02's answer; do not build a policy silently. |
| B-17 | Re-verification pass at #249 head for everything marked NOT INSPECTED / NOT VERIFIED (frontend files, `memberships/views.py`, `users/org_roles.py`, `shifts/access.py`, `offers.py`, `assignment.py`, settings) | — (documentation) | **This is the immediate next step, before any build.** The 429 block cut this pass short; a short follow-up read pass closes it. |
| B-18 | Delete or route the unrouted web `OrganizationCreate` page (if still unrouted at #249 head) | CG-10 / Q-13 | Confirm routing first; deletion is cleanup, not a product decision. |

---

## 7. Per-question source links (consolidated)

Base for all links: `https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/97c4543e051b43fe30ec7e2e61ad3d69957a918e/` (PR #249 head). #184 sources are on `refs/pull/184/head` (`questions.json` SHA `9b700e31…`, `AUDIT.md` SHA `41f77580…`).

| File | What it proves |
|---|---|
| `backend/users/models.py` — `User.ROLE_CHOICES`, `SELF_REGISTRATION_ROLES`, `CHOOSABLE_ACCOUNT_TYPES`, `OrganizationMembership` | 6 account roles; 4 self-registrable; PHARMACY_MANAGER one-time switch; org roles ORG_ADMIN/CHIEF_ADMIN/REGION_ADMIN |
| `backend/memberships/models.py` — `Membership`, `MembershipInviteLink`, `MembershipApplication`, `MAX`… | Membership roles/employment types; favourites = LOCUM/SHIFT_HERO; 3-state + LEFT; invite-link expiry; application fields + DOB; `remove()` |
| `backend/memberships/invites.py` — `create_membership_invite()`, `bulk_invite()` | Auto-activation for new users; PENDING for existing; `activate_immediately`; role mapping incl. fallback to EXPLORER; atomic rollback; per-line bulk errors |
| `backend/memberships/access.py` — `user_can_invite_members_to_pharmacy()`, `user_can_change_membership()`, `user_can_decide_applications()` | Who may invite/change/decide; owner membership immutable; no `is_staff` branch on change |
| `backend/memberships/role_resolution.py` — `membership_role_refusal()`, `personal_pharmacy_role()` | Owner decision 2026-10-14: flexible ASSISTANT/TECHNICIAN/STUDENT; PHARMACIST/INTERN need matching profile |
| `backend/memberships/serializers.py` — `MAX_ACTIVE_PHARMACY_MEMBERSHIPS = 3`, `ROLE_REQUIRED_USER_ROLE`, `_application_payment_profile_status()` | 3-pharmacy cap; role→account mapping; payment readiness on applications |
| `backend/access_control/pharmacy_roles.py` — `PharmacyAdminPolicy.CAPABILITY_MATRIX` | MANAGER = OWNER in capabilities |
| `backend/organizations/models.py` — `Organization`, `Pharmacy`, `PharmacyClaim`, `PharmacyAdmin`, `auto_publish_worker_requests` | Org/pharmacy/claim/admin models; owner protections; still-misleading auto-publish help text |
| `backend/organizations/views.py` — `OrganizationViewSet`, `PharmacyViewSet`, `PharmacyAdminViewSet` | Org create = superuser only; admin invite accept/reject endpoints exist (ops not inspected) |
| `backend/shifts/interest.py` — `express_interest()`, `is_public_shift_member_access()`, `_require_public_shift_onboarding()` | Public-apply gate; member exemption incl. anonymous exclusion; Explorer verified-profile requirement |
| `backend/onboarding/verification/policy.py` — `requirements()`, `evaluate()`, `revoke_for_changed_evidence()` | Verified = email+mobile+AHPRA; owner decision 2026-10-14 (revoke only on changed evidence); grace on tightening |
| `backend/onboarding/verification/state.py` — `require_public_ahpra()`, `lock_public_ahpra()`, `apply_state_transition()`, `ahpra_frozen()`, `announce_member_suspension()` | AHPRA suspension cascade; members never paused; owners become Pharmacy Managers |
| PR #184 `docs/qa/launch-grill/questions.json` + `AUDIT.md` (`refs/pull/184/head`) | The 142 legacy questions / 30 carried decisions and the Oct 2026 "current" statements reused here |
| Issue #250 | 26-area scope; revalidate against active #249; one-question-at-a-time rule |
| PR #249 / PR #248 | Snapshot heads; draft, unmerged, not deployed |

## 8. Decision status summary (ledger-ready)

| Question | Status | Owner decision |
|---|---|---|
| Q-01 ON-P01 favourites AHPRA exemption | Answered: A, employees are exempt and favourites are checked, launch grill, 23 Oct 2026 - see AHPRA-FAV-01 | Engineering: see BL-02 |
| Q-02 ON-Q03 verification enforcement scope | Answered: B, check every outside booking, launch grill, 23 Oct 2026 - see VERIFY-GATE-01 | Engineering: see BL-01 |
| Q-03 ON-Q05 Explorers | OPEN | — |
| Q-04 NEW new-account invite auto-activation | Merged into GM-05-W01 | Ask once at GM-05-W01 |
| Q-05 NEW invite expiry / revoke | OPEN | — |
| Q-06 NEW ORG_STAFF creation / REGION_ADMIN scope | OPEN | — |
| Q-07 NEW MANAGER = OWNER powers | OPEN | — |
| Q-08 NEW invite-link rules | OPEN | — |
| Q-09 NEW removal consequences | OPEN | — |
| Q-10 ON-Q01 sign-up tracks | Answered: KEEP the existing sign-up tracks, launch grill, 23 Oct 2026 - see ON-Q01 | — |
| Q-11 NEW Pharmacy Manager switch | OPEN | — |
| Q-12 ON-Q02 + ON-11 browse/gate + payment checklist | Answered: KEEP, launch grill, 23 Oct 2026 - see GM01-Q04 for the single re-confirmation | Pay details answered by ON-Q04; engineering follows BL-03 |
| Q-13 ON-Q14 org joining | OPEN (recommend KEEP) | — |
| Q-14 TB-Q08 talent-board heart | OPEN | — |
| Q-15 ON-Q08 ID check | OPEN | — |
| Q-16 ON-Q15/LA-Q02/LA-Q03 mobile onboarding parity | **NOT VERIFIED — do not ask yet** | — |
| Q-17 LA-Q15 talent-board booking permissions parity | **NOT VERIFIED — do not ask yet** | — |
| Q-18 NEW 3-pharmacy cap | OPEN | — |
| GM-05-W01 Active membership before password setup | OPEN | Canonical question for Q-04 |
| Q-19 owner membership immutable | **CODE INVARIANT — confirm only (not a #184 carried decision)** | Invariant in code; ownership-transfer path belongs to GM-03/GM-04 |
| Carried R01, R04A/B/C, D01–D05, E01, P02–P12, F01/F04 | **CARRIED — not re-asked** | As recorded in #184 `questions.json` "carried" list |

*End of GM-05 trace. The remaining re-verification work is in B-17. For the first owner question, see GM-05-W01.*


---

## Added 2026-11-21: waiting owner decisions (review of PR #267)

Evidence refs: `pr257:` = `origin/agent/pr257-int` at `21add924` (Expo app + newest backend), `main:` = `origin/main` at `8ccf8f77` (web as deployed). Each question is asked once, recommendation first. Source: the orchestrator's waiting-decision list of 21 Nov (items W-01 to W-17, mapped in [`../OWNER_GRILL.md`](../OWNER_GRILL.md) section 3).

### GM-05-W01: Is a brand-new invitee an active team member before they set a password? (W-03, D156)
**Scenario:** Tom invites Mia by email. Mia has no ChemistTasker account yet and hasn't opened the email.
**What happens today:** Mia's new account gets an active, accepted membership and a set-password link. Tom can roster her before she signs in. With an ordinary direct invite, an existing account stays pending until it accepts. An approved invite-link application can activate an existing account immediately too (`pr257:backend/memberships/invites.py:149`, `pr257:backend/memberships/applications.py:122`).
**Recommendation first: A.** Mia shows as "Invited" until she sets her password. Tom can still pre-roster her, but she gets no chat messages or shift offers until she joins.
- **A (recommended):** active only after she sets a password; Tom can roster her as "Invited".
- **KEEP:** active at once, as today.
- **B:** active at once, but hidden from chat until she signs in.
- **DEFER**

**Status:** OPEN

### GM-05-W02: Explorers can never hold an admin role: answered (D96)
**Answered:** owner, 13 Nov (D96): "block explorer be an admin". Built as one shared guard, `pr257:backend/access_control/admin_roles.py`, on every grant path (D107, D114). It blocks new grants and widening of access; ending or maintaining a historical assignment is still allowed. **On the Expo branch only:** deployed main (`8ccf8f77`) doesn't have the guard yet; it ships with the PR #257 release. Not re-asked. The production clean-up question is GM-24-W01.

## Added 2026-11-22: decisions the orchestrator made for you
From the orchestrator's decision logs (`DECISIONS_FOR_OWNER.md`, `DECISIONS_2026-11-11.md`, `DECISIONS_2026-11-12.md`). Code: `origin/agent/pr257-int` `47506e67`. "Yes" keeps the recommendation. Nothing is built from your answer until the whole grill ends.

### GM-05-OD-03: Attendance approvals and the roster need both staff and roster rights (OD-03, decisions-for-owner 6h)
**Platforms:** Web + Expo
**What happens today:** On Expo, as on web, an admin sees attendance approvals and the roster only with both staff and roster rights. Argon suggested roster rights alone; I kept the web rule.
**Already implemented:** pr257, same rule as web
**Recommendation:** Keep the web rule.
**Other option:** Roster rights alone are enough.
**Status:** OPEN, confirm or change.

### GM-05-OD-04: Organisation tabs are hidden when Lina lacks the right (OD-04, decisions-for-owner 6g)
**Platforms:** Web + Expo
**What happens today:** An organisation tab Lina may not use is hidden (as on web), not shown with a "not allowed" message.
**Already implemented:** pr257
**Recommendation:** Keep.
**Other option:** Show the tab with a "not allowed" note.
**Status:** OPEN, confirm or change.

### GM-05-OD-05: A new invitee with no name shows as their email address (OD-05, D162)
**Platforms:** Web + Expo
**What happens today:** An invite to a new email creates an account with no name. Rosters, leave and timesheets used to crash on that (HTTP 500 for the whole roster). They now show the email address until the person sets a name.
**Already implemented:** commit 7855bbd8
**Recommendation:** Keep.
**Other option:** Require a name when inviting.
**Status:** OPEN, confirm or change.

### GM-05-OD-06: When Ali is removed, what happens to his future roster shifts? (OD-06, D181 (five-user run A6), extends Q-09)
**Platforms:** Web + Expo
**What happens today:** After removal Ali can no longer clock in or open the workspace roster, but his own roster still lists a future Southport shift (24 Nov), and that slot still counts as filled.
**Code:** not a choice I made: found in the five-user run
**Recommendation:** Take him off future roster shifts at removal and tell the manager those shifts need cover.
**Other option:** Hide them from Ali only, leaving the slots for the manager to fix; or leave them as they are.
**Status:** OPEN, confirm or change.
