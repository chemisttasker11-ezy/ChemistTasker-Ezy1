# GM-04 — Organisations / chains / regions — Grill Me trace (read-only, documentation only)

> **Corrections against current code (21 Nov 2026 review).** 9 claims checked at `main` `8ccf8f77` and `pr257` `21add924`; 7 hold, 2 below need the correction shown. Where a question below says otherwise, this table wins. Full evidence: [`../followup/claim-check-2026-11-21.md`](../followup/claim-check-2026-11-21.md).

| Where | Claim in this file | Verdict | Correct statement | Evidence |
|---|---|---|---|---|
| Q03 | “`abn_verified` is read at acceptance-time … a fake site is caught” | WRONG for pharmacy ABN verification | The acceptance gate validates the worker’s payment profile, not the pharmacy’s verified ABN status. The pharmacy ABN is copied into terms without that verification gate. | `main:backend/shifts/engagement.py:265`; `pr257:backend/shifts/engagement.py:629`; `:641` |
| Q07 / Q10 | org-tier membership and regional scope undefined | WRONG as an absence claim | Org-tier browsing uses accepted active employed memberships at pharmacies in the same organisation. Admin authority uses organisation matching and explicit scope; a free-text region is not a geographic security boundary. | `pr257:backend/shifts/browse.py:112`; `pr257:backend/users/org_roles.py:265` |

- **Repo:** `chemisttasker11-ezy/ChemistTasker-Ezy1`
- **Issue:** [#250 — Grill Me](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/issues/250) (open), area GM-04 of 26
- **Method:** Issue #250 interview rules + PR #184 format; Web (Vite + Next) and Expo traced together per question, side by side, including parity gaps.
- **Status:** TRACED + RE-VALIDATED AT HEAD. Decision status per question in Part C. No owner decision recorded yet. No code changed in this phase — documentation and decisions only.

## Bases (exact SHAs verified 2026-11-21)

| Source | Ref | SHA / head |
|---|---|---|
| Active PR #249 (revalidation target) | `refs/pull/249/head` | `97c4543e051b43fe30ec7e2e61ad3d69957a918e`, branch `fix/pr248-expo-production-waves-20261104`, open draft |
| Old grill PR #184 | `refs/pull/184/head` | `c786a4b8182ebf9b505d47cd81980eb3b9851ce3`, branch `docs/launch-grill-20261020` |
| PR #249 base | `feat/mobile-merge-sdk` | `c98cf2ef74c6de356cceb8dee3a61dad47b6b843` |

**Head-SHA resolution (recorded this session):** PR #249's body names a "working head `26cae2d6`" — that is the short SHA of the last *implementation commit listed in the body*, not the branch head. The API head is `97c4543e051b43fe30ec7e2e61ad3d69957a918e` (458 commits), identical to the Issue #250 snapshot. Every trace below is at that API head.

**What changed since the Oct 2026 file:** the previous version of this file was an inventory only — file-existence checks at `97c4543…` plus Oct 2026 `#184` evidence, stopped by HTTP 429. This version re-traces line by line at the head: `backend/organizations/models.py` (503 lines), `backend/organizations/views.py` (463 lines), `backend/shifts/interest.py` (300 lines), `backend/shifts/posting.py` (290 lines), `backend/shifts/` directory listing, plus `docs/qa/launch-grill/questions.json` (142 questions, SHA `9b700e31…`) and `AUDIT.md` re-read from `refs/pull/184/head`. `backend/shifts/visibility.py` does **not** exist at this head (re-confirmed); visibility/escalation logic lives in `backend/shifts/escalation.py` / `base.py` / `browse.py`, which were **not** re-read line by line — GM-11 owns that detail (Oct 2026 only). Search-code results (`OrganizationCreate`, `abn_verified`, `auto_publish_worker_requests`) come from GitHub's default-branch index, not from the PR head — flagged where used.

**Adopted verdicts (not re-traced):** GM-01 session findings; GM-18 identity leak LA-Q12 STILL VALID (senior-reviewed); GM-05 roles/membership revalidation (Region Admin role, `MANAGE_ROSTER` capability, R01); GM-25 structural trace.

## How to read this document

- **Plain English first.** An *organisation* = a multi-site pharmacy group (e.g. Chempro) that owns/operates several pharmacies. A *chain* = a named group of pharmacies linked to one owner and/or one organisation, with its own subscription plan — a real model now, not just a visibility tier. A *region* = still no product concept: no Region model, field, API or screen exists at the head.
- **Code gap** = no owner choice needed; just build/fix it. **Decision gap** = the owner must choose first.
- **Decision status values:** `CARRIED — DECIDED` (settled in #184's carried list, do not re-ask), `STILL VALID` (Oct 2026 premise re-checked against current code at the head), `CHANGED` (premise moved since #184 — re-asked with new evidence), `NOT RE-VALIDATED` (not inspected at the head — do not quote as current).

---

## Part A — Current-flow matrix

Columns: Trigger → Actor → Backend / API → Vite web → Next web → Expo mobile → Persisted state → Event / side effect → Recovery / denial path. All backend claims are at head `97c4543…` unless marked Oct 2026.

### F-01 — Platform admin creates an organisation

| Trigger | Actor | Backend / API | Vite | Next | Expo | Persisted state | Event / side effect | Recovery / denial |
|---|---|---|---|---|---|---|---|---|
| Admin creates an org | Platform admin (superuser) | `OrganizationViewSet.create` — `IsAdminUser()` only (`backend/organizations/views.py`). `Organization` = name / slug (auto, unique) / about / cover image only (`backend/organizations/models.py`). No self-serve path, no ORGANIZATION signup role | Dead page `OrganizationCreate.tsx` exists (`frontend_web/src/pages/OrganizationCreate.tsx`) and **no other file references it** (default-branch search, total 1 hit) — still unrouted | UNKNOWN — no Next org-create screen found in the traced material | No org-create screen | Organisation row | Org exists; admins must then be invited (mechanism: `OrganizationMembership`, GM-05) | Non-superuser POST → 403 (DRF `IsAdminUser`). Self-serve attempt → no route/entry point at all |

### F-02 — A group (e.g. Chempro) tries to join / a pharmacy joins an org

| Trigger | Actor | Backend / API | Vite | Next | Expo | Persisted state | Event / side effect | Recovery / denial |
|---|---|---|---|---|---|---|---|---|
| Group wants in; pharmacy links to an org | Group representative / owner | **No self-serve org signup** (F-01). NEW vs Oct 2026: `PharmacyClaim` model exists (`backend/organizations/models.py`): an org claims a pharmacy, status PENDING / ACCEPTED / REJECTED, `requested_by` / `responded_by` / `responded_at`; unique active claim per pharmacy+org, and **at most one ACCEPTED claim per pharmacy**. A pharmacy's `organization` FK is nullable single — one org max. Whether any API/view wires claims up was **not traced** (`backend/organizations/claims.py` not read; no claim endpoints in `views.py`) — UNKNOWN | UNKNOWN — claim screens not traced | UNKNOWN | UNKNOWN | `PharmacyClaim` row; `Pharmacy.organization` FK | Nothing visible until a claim is accepted (mechanism unverified) | Duplicate active claim → DB unique constraint. Second org claiming an already-accepted pharmacy → constraint blocks it |

### F-03 — Pharmacy posts a shift and picks who sees it first

| Trigger | Actor | Backend / API | Vite | Next | Expo | Persisted state | Event / side effect | Recovery / denial |
|---|---|---|---|---|---|---|---|---|
| Owner posts a shift, picks starting tier | Owner / authorised manager | Visibility tiers, carried E01: **Staff → favourites → owner chain → organisation → public**. `backend/shifts/escalation.py` exists at head; `backend/shifts/visibility.py` does **not** exist — the tier/queryset code has moved (GM-11 detail, Oct 2026 only: escalation runs lazily inside `BaseShiftViewSet.get_queryset`, no beat task; escalation notifies nobody; any past interest stops escalation for good). `post_shift` (`backend/shifts/posting.py`, 290 lines, read at head) checks **neither** `Pharmacy.verified` **nor** `abn_verified` — the only "abn" hit is the `payment_preference` default `'ABN'` | Posting wizard, shared `frontend_web/shared/postShift/*` (Oct 2026) | UNKNOWN (Vite vs Next split not re-traced) | Posting wizard, mobile `roles/shared/shifts/PostShift*` (Oct 2026) | Shift `visibility` tier + escalation schedule (E03: owner picks intervals at posting) | Availability-match emails only at posting time and only if posted straight to PLATFORM (Oct 2026, `shifts/announcements.py:463`) | Escalation fires late/never if nobody browses. See GM-04-Q03/Q04 |

### F-04 — A worker in the same chain/org sees a chain/org-tier shift

| Trigger | Actor | Backend / API | Vite | Next | Expo | Persisted state | Event / side effect | Recovery / denial |
|---|---|---|---|---|---|---|---|---|
| Worker browses a chain/org-tier shift | Worker (chain/org member) | Interest gate re-verified at head (`backend/shifts/interest.py`): `require_public_ahpra` runs **only when `visibility == PUBLIC_LEVEL`** and the worker is **not** a "member". Member is now defined in code (`is_public_shift_member_access`): active + accepted staff/favourite membership at that pharmacy + can perform the role + post not anonymous. Chain/org/favourite-tier interest **never** checks Verified or AHPRA — Oct 2026 premise STILL VALID at head | Shift boards (web) | UNKNOWN | Shift boards (mobile); exact parity UNKNOWN | Interest row; offer may follow | A worker can be booked through a direct/chain offer without a Verified/AHPRA check. **Legal/safety risk — see GM-04-Q04** | A worker outside the chain/org must not see the shift (cumulative tiers, E01A). Whether a non-member is actively excluded at query level: NOT re-read at head (GM-11) |

### F-05 — Owner/manager invites staff or locums into a pharmacy/org

| Trigger | Actor | Backend / API | Vite | Next | Expo | Persisted state | Event / side effect | Recovery / denial |
|---|---|---|---|---|---|---|---|---|
| Invite staff/locums | Owner / manager / org admin | `memberships/invites.py` (Oct 2026); invite flow in depth **not re-traced** (GM-05 owns membership; its revalidation covers invite acceptance, 3-pharmacy cap, removal consequences) | Web `PharmacyPage` | UNKNOWN | Mobile `StaffManager` / `LocumManager` | Membership row | Invitee joins pharmacy/org scope; affects shift visibility (F-03/F-04) and roster eligibility (R01: internal roster = employed staff only) | Invite to wrong tenant / revoked / duplicate: NOT re-inspected here — see GM-05 |

### F-06 — Org-level rates / policies applied to a shift

| Trigger | Actor | Backend / API | Vite | Next | Expo | Persisted state | Event / side effect | Recovery / denial |
|---|---|---|---|---|---|---|---|---|
| Org-level rate/policy | Owner / org admin | **No org-level rates or policies exist at head.** `Pharmacy` holds rates per site (`organizations/models.py`: `rate_weekday/saturday/sunday/public_holiday/early_morning/late_night`, `default_rate_type`, `default_fixed_rate`); `Chain` has only a `subscription_plan` string; engagement terms are built per offer/assignment (`shifts/engagement.py`); cancellation policy is driven by *source* (P02), not by an org rate card | UNKNOWN | UNKNOWN | UNKNOWN | Per-pharmacy rates; per-offer frozen terms | None org-wide | N/A — absence of feature. See GM-04-Q06 |

### F-07 — A chain/org-sourced booking is cancelled / worker no-shows

| Trigger | Actor | Backend / API | Vite | Next | Expo | Persisted state | Event / side effect | Recovery / denial |
|---|---|---|---|---|---|---|---|---|
| Cancellation / no-show on a chain/org booking | Owner / worker / platform | Carried P05: **chain and organisation cancellations handled internally. No-show and repeat-cancellation badges can still apply.** P04: platform sanctions workers case by case; managers only report. P02: source drives cancellation policy. Whether a cancel endpoint now exists for confirmed external bookings (SH-01, Oct 2026: none) was **not re-traced** — GM-15 owns cancellation | Cancellation UI: none for a confirmed external booking by either side (SH-01, Oct 2026) | UNKNOWN | Same gap on mobile (Oct 2026) | No cancelled state traced here | Support ends up editing the database (SH-01, Oct 2026) | Recovery = support-only admin action (proposed, not built, Oct 2026). See GM-15 |

### F-08 — Org admin is notified about a shift change / cancellation / cover

| Trigger | Actor | Backend / API | Vite | Next | Expo | Persisted state | Event / side effect | Recovery / denial |
|---|---|---|---|---|---|---|---|---|
| Shift cancelled / covered / replaced | Org admin | AG-Q09 (Oct 2026): notices are per-feature; **no agreed recipient list (D07)**. Nuance found at head: leave notices DO include org-wide admins (`backend/workforce/leave_service.py` `_slot_leave_recipients`: owner + `ORG_WIDE_ADMIN_ROLES` + pharmacy admins) — so org admins are told about leave, but there is still no general recipient list for cancel/cover/replace | UNKNOWN | UNKNOWN | UNKNOWN | — | Org admin may hear about leave but nothing about a cancellation at their site | See GM-04-Q08 |

### F-09 — Worker is sourced via chain/org — which "source" counts for fees/badges?

| Trigger | Actor | Backend / API | Vite | Next | Expo | Persisted state | Event / side effect | Recovery / denial |
|---|---|---|---|---|---|---|---|---|
| System classifies a booking's source at acceptance | System | CX-Q31 (Oct 2026): register says freeze per worker and date at acceptance; **precedence open**. `backend/workforce/assignment_freeze.py` exists at head — **not read**; implementation NOT RE-VALIDATED | UNKNOWN | UNKNOWN | UNKNOWN | Source frozen at acceptance (per register; implementation not verified at head) | Drives P02 cancellation policy, P05 internal handling, P10 incident ladder | Wrong-source freeze → wrong fee/badge treatment. See GM-04-Q09 |

### F-10 — Region-scoped visibility / reporting

| Trigger | Actor | Backend / API | Vite | Next | Expo | Persisted state | Event / side effect | Recovery / denial |
|---|---|---|---|---|---|---|---|---|
| Region-scoped anything | Anyone | **No region concept exists at head.** No `Region` model, field, API, screen or carried decision. The only "region" strings in code: `Pharmacy.public_holiday_region` (a holiday-district label, e.g. `QLD_GOLD_COAST` — about public holidays, not visibility or admin scope) and the `Region Admin` org role (GM-05, adopted). No region scoping rule anywhere | None | None | None | None | None | N/A. See GM-04-Q10 |

### F-11 — Pharmacy verification gates posting (incl. chain/org pharmacies)

| Trigger | Actor | Backend / API | Vite | Next | Expo | Persisted state | Event / side effect | Recovery / denial |
|---|---|---|---|---|---|---|---|---|
| Pharmacy posts a shift | Owner posting a shift | **Re-verified at head:** `shifts/posting.py` (290 lines) checks **neither** `Pharmacy.verified` **nor** `abn_verified`. Both flags exist (`organizations/models.py`: `verified`, `abn`, `abn_entity_name`, `abn_status`, `abn_entity_confirmed`, `abn_verified`, `abn_last_checked`, `abn_gst_registered`). Default-branch search for `abn_verified` (38 hits) shows the flag read in `shifts/engagement.py` and `shifts/candidates.py` (acceptance-time), onboarding, and serializers — **not** in `posting.py`. `Pharmacy.verified` only read by ethical marketplace (Oct 2026, `marketplace/policy.py:100` — not re-read) | Posting wizard does not gate | UNKNOWN | Posting wizard does not gate | `verified` / `abn_verified` flags on Pharmacy | An unverified/fake site can post and be accepted, including to its own chain/org — public workers do not know the site (ON-Q11 rec. D) | See GM-04-Q03 |

### F-12 — Org admin manages pharmacies / hierarchy (add/remove site, promote admin)

| Trigger | Actor | Backend / API | Vite | Next | Expo | Persisted state | Event / side effect | Recovery / denial |
|---|---|---|---|---|---|---|---|---|
| Org admin acts across the org | Org admin / platform admin | Hierarchy re-verified in part at head: **per-pharmacy** admin is fully defined (`PharmacyAdmin`: OWNER / MANAGER / ROSTER_MANAGER / COMMUNICATION_MANAGER, capability matrix via `PharmacyAdminPolicy`, owner cannot be demoted, owner cannot be removed by other admins). **Org-wide** admin exists as `OrganizationMembership` roles (`ORG_WIDE_ADMIN_ROLES`, GM-05 adopted) with capabilities via `users/org_roles.py` (`membership_capabilities`, `membership_visible_pharmacy_ids`, `OrgCapability.VIEW_ALL_PHARMACIES` / `MANAGE_ROSTER` / `MANAGE_STAFF` — seen in use in `organizations/views.py` and `workforce/permissions.py`, but `org_roles.py` itself NOT read line by line here). `ChainViewSet` lets owners and org-wide admins create chains and add/remove pharmacies and users (`add_pharmacy`, `remove_pharmacy`, `add_user`, `remove_user` actions). `PharmacyViewSet`: owners manage own pharmacies; org-wide admins manage their org's pharmacies; delete is guarded by `protect_pharmacy_shift_deletion` | UNKNOWN | UNKNOWN | UNKNOWN | `OrganizationMembership` + `PharmacyAdmin` rows | Org admin can create chains and manage org pharmacies (per the view code); whether they can post shifts, set rates or approve payments for a pharmacy they don't manage: UNKNOWN — see GM-04-Q05 | Wrong-org access: org capability checks are scoped per org (`_org_has_capability` requires `membership_covers_pharmacy`) — seen in `workforce/permissions.py` |

### F-13 — Chain as a thing (new vs Oct 2026)

| Trigger | Actor | Backend / API | Vite | Next | Expo | Persisted state | Event / side effect | Recovery / denial |
|---|---|---|---|---|---|---|---|---|
| Owner/org creates a chain, adds pharmacies | Owner / org-wide admin | `Chain` model (`organizations/models.py`): owner FK (nullable), organization FK (nullable), name, logo, `subscription_plan` (default `"Basic"`), `primary_contact_email`, `is_active`, pharmacies M2M. So a pharmacy can sit in **many chains** but **one organisation**; a chain can belong to an owner, an org, or neither. `ChainViewSet.create`: any `OwnerOnboarding` user or org-wide admin (NOT superuser-only — unlike orgs). List is scoped: owners see own chains, org admins see their org's chains | UNKNOWN | UNKNOWN | UNKNOWN | `Chain` + M2M rows | Chain membership feeds the OWNER_CHAIN visibility tier and the cross-site attendance tiers (GM-08: `Chain.objects.filter(is_active=True, pharmacies=…)` in `attendance/eligibility.py`) | A chain with no owner and no org: creatable in code (both FKs nullable) — who administers it is UNKNOWN |

### Web vs Expo parity gaps (GM-04-specific, re-validated where noted)

| Area | Web | Expo | Gap type |
|---|---|---|---|
| Org create page | Dead, unrouted `OrganizationCreate.tsx` (default-branch search: 1 hit, the file itself) | No org-create screen | Both absent as a working path; web has dead code to delete |
| Post-shift wizard (visibility tier incl. chain/org) | Shared wizard exists | Shared wizard exists (`roles/shared/shifts/PostShift*`, Oct 2026) | Parity claimed in #184 for the wizard; tier behaviour on mobile **not separately verified at head** |
| Staff/locum invites & management | `PharmacyPage` | `StaffManager` / `LocumManager` | Screens named on both; line-by-line comparison **not done** (GM-05 owns) |
| Org admin scope | `PharmacyOverviewContainer.tsx:93` TODO (Oct 2026, not re-checked) | UNKNOWN | Unknown on both |
| Notifications to org admins | Leave notices include org-wide admins (verified at head); cancel/cover notices have no recipient list | Same backend rule | Not a parity gap — a deliberate carried rule (E01B: no org broadcast) plus an un-decided recipient list (Q08) |
| `auto_publish_worker_requests` toggle | Referenced in `PharmacyPage` / `PharmacyPage.model.ts` | Referenced in mobile `PharmacyForm.tsx` (default-branch search) — LA-Q11's "missing on mobile" half is fixed at field level | **Behaviour gap, not a parity gap:** no backend code reads the flag anywhere (see CG-02) — the toggle changes nothing on either client |

### Actors and what each can do today (re-validated at head unless noted)

- **Platform admin (superuser):** only actor who can create an organisation (F-01). Can presumably invite org admins (mechanism: GM-05).
- **Organisation admin (Org Admin / Chief Admin / Region Admin):** roles exist (GM-05, adopted); capabilities are per-org via `membership_capabilities` / `membership_visible_pharmacy_ids`; can create chains, manage org pharmacies, receive leave notices. **Cannot** create an organisation. Whether they can post shifts / set rates / approve payments for a site they don't manage: UNKNOWN (Q05).
- **Pharmacy owner / manager:** posts shifts, picks visibility tier and escalation (E01/E03), invites staff/locums, manages their pharmacy; MANAGER holds all four capabilities (GM-05).
- **Chain member worker:** sees chain-tier shifts; Verified/AHPRA **not** checked on that tier (re-verified at head).
- **Org member worker:** sees org-tier shifts; same unchecked gate (re-verified at head).
- **Public worker:** sees PLATFORM tier only; Verified + AHPRA checked on apply unless a "member" (re-verified at head).

---

## Part B — Old questions re-validated (PR #184 / #204 / shift-lifecycle)

Method: `questions.json` (142 questions, SHA `9b700e31…`) and `AUDIT.md` re-read from `refs/pull/184/head` this session; every GM-04 candidate re-checked against head `97c4543…` as noted per row.

| Old ID | Old question | Verdict | Evidence (current code) |
|---|---|---|---|
| ON-Q14 | How do organisations join? | **STILL VALID** | `OrganizationViewSet.create` is superuser-only (`backend/organizations/views.py`, read at head). No self-serve path. Dead page still exists (default-branch search). NEW nuance: `PharmacyClaim` model exists — a claim/approval path for pharmacies joining an org may be the intended mechanism, but its wiring is UNKNOWN. Carried as GM-04-Q01. |
| ON-Q11 | What must a pharmacy pass before posting? | **STILL VALID** | `shifts/posting.py` (290 lines, read at head) checks neither `verified` nor `abn_verified`. Flags exist; `abn_verified` is read at acceptance-time (`engagement.py`, `candidates.py`), not at posting. Carried as GM-04-Q03. |
| ON-Q03 + LA-P03 | Where must Verified/AHPRA be enforced? | **STILL VALID** (safety-critical) | `shifts/interest.py` (read at head): gate only when `visibility == PUBLIC_LEVEL` and not a member; member now defined in code. Chain/org/favourite interest still skips it. Carried as GM-04-Q04. |
| ON-Q07 / ON-05 | Org create page; admin-scope TODO | **STILL VALID** | Dead page still exists; `PharmacyOverviewContainer.tsx:93` TODO not re-checked at head. Folded into Q01 (code gap CG-01) and Q05. |
| ON-Q01 (worker tracks), ON-Q10 | — | **NOT GM-04 — routed away** | Worker onboarding / engagement terms. No org decision. |
| ON-P01 ("who counts as a member") | Referenced by ON-Q03's rec, not defined in #184 | **CHANGED — now partly defined in code** | `is_public_shift_member_access` (`shifts/interest.py`) now defines "member" for the public-tier exemption: active + accepted staff/favourite membership at that pharmacy + can perform the role + not anonymous. The *org-tier* membership definition is still open — GM-04-Q07. |
| AG-Q09 | Who is told when a shift is cancelled, covered or replaced? | **STILL VALID** (with a nuance) | No recipient list agreed (D07). Nuance: leave notices now include org-wide admins (`leave_service.py`, read at head) — cancel/cover notices still have no list. Carried as GM-04-Q08. |
| CX-Q31 | When is a worker's source frozen, and which wins? | **NOT RE-VALIDATED** | `backend/workforce/assignment_freeze.py` exists at head but was not read. Register says freeze per worker/date at acceptance; precedence open. Carried as GM-04-Q09 with status NOT RE-VALIDATED — do not quote as current. |
| CX-Q27 | Do favourite/chain/org incidents count toward the platform ladder? | **NOT RE-VALIDATED** | Ladder implementation not traced; GM-15 owns cancellation/incidents. Carried as GM-04-Q11 with status NOT RE-VALIDATED. |
| TB-Q01 | Who can see the talent board? | **STILL VALID** (adopted from GM-01) | GM-01 senior-reviewed: any signed-in user can see it; LA-Q12 identity leak STILL VALID at the head. Carried as GM-04-Q12. |
| LA-Q11 | Auto-publish setting contradicts R06/R04B and is missing on mobile | **CHANGED — half fixed, behaviour still dead** | Field still exists with the same help text (`organizations/models.py`, read at head); mobile `PharmacyForm.tsx` now references it (default-branch search) — the "missing on mobile" half is fixed at field level. But **no backend code reads the flag** (default-branch search, 12 hits: models/serializers/clients only) — the toggle changes nothing. Folded into GM-04-Q06 / CG-02 and GM-07-Q06. |
| LA-Q08 | Escalation only runs when someone loads a shift list | **NOT RE-VALIDATED here — GM-11 owns** | `escalation.py` exists at head; `visibility.py` does not. Lazy engine not re-read. Do not quote as current from this file. |
| SH-11 | Auto-publish help text contradicts R06/R04B | **STILL VALID** | Help text unchanged at head ("automatically create and publish a new shift"). |
| E01, E01A, E01B, E03, P02, P05, R01, R04A, D04 (carried, DECIDED) | — | **CARRIED — DECIDED, do not re-ask** | From `questions.json` `carried[]`, re-read this session. E01 tier order; E01A cumulative; E01B no org-wide broadcast; E03 owner picks escalation intervals; P02 source drives cancellation policy; P05 chain/org cancellations handled internally; R01 roster = employed only; R04A cover permission per pharmacy; D04 who can cancel. |

**Old questions NOT carried forward unvalidated:** none — every candidate above was re-checked or is explicitly marked NOT RE-VALIDATED with the reason.

---

## Part C — GM-04 question queue (new + carried, #184 format)

Per-question format: plain-English explanation first, then ACTUAL TODAY with **Web** and **Expo** side by side, RECOMMENDED, ALTERNATIVE A (keep), ALTERNATIVE B/C, Other/defer. Normal case, edge case, retry/concurrency, denied role/wrong tenant, payment/notification side effects, and Web/Expo difference are shown inside each question. Sources are at head `97c4543…` unless noted. Decision status: **OPEN** for all — no owner answer recorded.

### GM-04-Q01 — How do organisations (multi-site groups) join? [ex-#184 ON-Q14] — STILL VALID

**Plain English:** today only a platform superuser can create an organisation. There is no organisation sign-up, and the web create page is not routed. A new model, `PharmacyClaim`, suggests pharmacies may join an org by a claim that someone approves — but nobody has traced whether that claim flow is actually wired up.

**ACTUAL TODAY — Web:** no working org signup; dead `OrganizationCreate.tsx` (unreferenced). **ACTUAL TODAY — Expo:** no org-create screen. **Backend:** `OrganizationViewSet.create` requires `IsAdminUser()`; update/delete by org-wide admins; list/retrieve any authenticated user (`backend/organizations/views.py`). `PharmacyClaim` (PENDING/ACCEPTED/REJECTED, one accepted claim per pharmacy) exists in `models.py`; its API wiring is UNKNOWN.
**RECOMMENDED:** KEEP (sales-led). Rationale: suits the few groups joining at launch; self-serve adds approval/abuse surface for little launch value. Severity: medium. Benefits: human vetting, clean data, no fake orgs. Risks: onboarding bottleneck; a Chempro-sized group waits on a person.
**ALTERNATIVE A — Keep current logic (KEEP):** Sales-led: a platform admin creates the org, then invites its admins (delete the dead page — code gap CG-01). Scenario: Chempro's head office emails the platform; admin creates "Chempro", invites its area manager; that manager adds pharmacies. Trade-off: slowest, safest.
**ALTERNATIVE B — Self-serve, waits for approval:** A group signs up, gets a pending org, admin approves before any pharmacy/shift is visible. Scenario: a 12-site group signs up on a Sunday; admin approves Monday; no shift is posted from an unvetted org in between. Trade-off: faster intake, needs an approval queue + pending-state handling everywhere visibility is computed. (If `PharmacyClaim` is the intended mechanism, B may already be half-built — verify the wiring first.)
**ALTERNATIVE C — Self-serve, instant access:** Group signs up and immediately posts. Scenario: a fake "group" posts public shifts the same day. Trade-off: fastest, highest fraud/brand risk; conflicts with GM-04-Q03.
**Other / defer:** Defer self-serve until after launch; keep sales-led for launch.
**Normal case:** admin creates org → invites org admin → org admin adds pharmacies. **Edge case:** group with pharmacies already on the platform as independents — merge or re-link? `PharmacyClaim` may answer this; wiring UNKNOWN. **Retry/concurrency:** duplicate org creation by two admins — slug auto-uniquifies (`slug-2`, …); duplicate claim → DB unique constraint. **Denied role / wrong tenant:** non-superuser POST to create → 403. **Payment/notification side effects:** none at creation. **Web/Expo difference:** none — no working create screen on either; web has dead code.
**Sources:** `backend/organizations/views.py` (`OrganizationViewSet`), `backend/organizations/models.py` (`Organization`, `PharmacyClaim`), `frontend_web/src/pages/OrganizationCreate.tsx` (default-branch search).
**Decision status:** OPEN.

### GM-04-Q02 — What is an organisation, a chain, and a region — and can one pharmacy belong to more than one? [NEW, refined by code]

**Plain English:** the code now defines two of the three words. An organisation is the legal group (one per pharmacy). A chain is a named set of pharmacies that can belong to an owner, an organisation, or neither — and one pharmacy can be in many chains. A region still means nothing in the product.

**ACTUAL TODAY — Web and Expo (same backend):** `Organization`: name/slug/about/cover only. `Chain`: owner FK (nullable) + organization FK (nullable) + name/logo/`subscription_plan`/`primary_contact_email`/`is_active` + pharmacies M2M. `Pharmacy.organization`: single nullable FK. `Pharmacy.public_holiday_region`: a holiday-district label only. No `Region` model.
**RECOMMENDED:** Write the definitions down before any other GM-04 decision: organisation = the legal group (one per pharmacy); chain = the owner/org-linked set of pharmacies used for the visibility tier and cross-site cover (a pharmacy may sit in several chains); region = dropped as a product concept (a "region" is just a suburb/postcode, or the `Region Admin` role's scope — see Q10). Severity: high — every later question depends on these words meaning one thing.
**ALTERNATIVE A — Keep current logic:** leave chain and org as two tiers with no written definition. Scenario: Chempro posts to "chain" and separately to "organisation" and the same workers see it twice — harmless but confusing. Trade-off: no work, permanent ambiguity.
**ALTERNATIVE B — One concept:** merge chain into organisation (one tier). Scenario: an owner with 3 independent pharmacies and a Chempro franchisee — merged tier shows the franchisee's shifts to the owner's other pharmacies' staff, which the owner may not want. Trade-off: simpler UI, loses a real distinction E01 deliberately kept — and now a real model distinction (chain has its own subscription plan).
**ALTERNATIVE C — Organisation + optional region, chain retired as a tier:** chain becomes just a label on the org. Scenario: a national group wants "QLD only" visibility — needs regions (see Q10). Trade-off: biggest change; needs migration of existing tier values.
**Other / defer:** Defer the definition; decide Q01/Q04 first.
**Normal case:** one pharmacy, one org, one or more chains. **Edge case:** a pharmacy changes groups (sold, rebrands from Chempro to independent) — its `organization` FK moves, its chain memberships do not automatically; history/favourites/source labels: UNKNOWN. **Retry/concurrency:** two admins adding the same pharmacy to different orgs — the FK is single, last write wins; two claims → unique constraint blocks the second. **Denied role / wrong tenant:** an org admin adding a pharmacy they don't own — `ChainViewSet.add_pharmacy` scoping not line-traced (UNKNOWN). **Payment/notification:** none directly; chain `subscription_plan` may feed billing (GM-16 — not traced). **Web/Expo:** definitions must appear identically in both posting wizards.
**Sources:** `backend/organizations/models.py` (`Organization`, `Chain`, `Pharmacy.organization`, `Pharmacy.public_holiday_region`), `backend/organizations/views.py` (`ChainViewSet`).
**Decision status:** OPEN.

### GM-04-Q03 — What must a pharmacy pass before posting to outside workers (including its own chain/org)? [ex-#184 ON-Q11] — STILL VALID

**Plain English:** today a pharmacy needs to pass nothing before it posts — not an ABN check, not an admin check. The flags exist on the pharmacy, but the posting code never looks at them.

**ACTUAL TODAY — Web and Expo (same backend):** `shifts/posting.py` (290 lines, read at head) checks neither `Pharmacy.verified` nor `abn_verified`. Both flags exist with full ABN detail fields (`abn`, `abn_entity_name`, `abn_status`, `abn_entity_confirmed`, `abn_verified`, `abn_last_checked`, `abn_gst_registered`). `abn_verified` is read at acceptance-time (`shifts/engagement.py`, `candidates.py`) — a fake site is caught, if at all, after a worker has already been offered the shift.
**RECOMMENDED: D — ABN-verified for chain/org tiers, ABN-verified plus admin-verified before PLATFORM.** Rationale: chain/org workers already know the site, public workers don't — the risk is asymmetric. Severity: high (trust/safety). Benefits: public workers get a real trust signal; chain/org posting stays fast. Risks: admin verification becomes a bottleneck for public posting; ABN lookup can fail on legitimate new entities.
**ALTERNATIVE A — Keep current logic (KEEP):** nothing required. Scenario: a newly registered pharmacy posts publicly on day one and a locum accepts; if the site is fake, the worker finds out at the door. Trade-off: fastest onboarding, all trust risk on the worker.
**ALTERNATIVE B — ABN verified for any outside post:** chain/org and public alike. Scenario: a real Chempro site with an ABN typo is blocked from posting to its own staff until fixed. Trade-off: uniform, but blocks internal-adjacent posting.
**ALTERNATIVE C — ABN plus admin check before public:** as recommended, but without the chain/org distinction in B.
**Other / defer:** Defer the admin-check half until a human verification process exists.
**Normal case:** verified pharmacy posts; workers see it. **Edge case:** ABN verified but admin check pending — can it post to chain but not public? That's exactly option D. **Retry/concurrency:** ABN lookup fails transiently at posting time — retry or block? UNKNOWN. **Denied role / wrong tenant:** an unverified pharmacy's manager attempts a public post — must be blocked with a clear reason, not a silent failure; exact UX UNKNOWN. **Payment/notification:** a blocked post means no booking fee, no worker notification. **Web/Expo:** gate must be enforced backend-side (both clients share it) and *shown* in both wizards.
**Sources:** `backend/shifts/posting.py` (full read at head), `backend/organizations/models.py` (`Pharmacy.verified`, `abn_*`), `backend/shifts/engagement.py` / `candidates.py` (default-branch search hits for `abn_verified`).
**Decision status:** OPEN.

### GM-04-Q04 — Verification for chain and organisation bookings (ON-Q03 / LA-P03)

**Decision status:** Answered: B, check every outside booking, launch grill, 23 Oct 2026 - see VERIFY-GATE-01. Engineering: see BL-01.

**Actual today:** The shared guard skips non-public shifts, including chain and organisation shifts (`pr257:backend/onboarding/verification/state.py:174`). ON-P01 defines the employee exemption. See GM-04-Q07 for the separate organisation-tier membership question.

### GM-04-Q05 — What can an organisation admin do? (hierarchy, pharmacies, members, shifts) [NEW, refined]

**Plain English:** the per-pharmacy admin ladder is fully defined in code, and org-wide admin roles exist — but nobody has written down what an org admin may actually do at a pharmacy they don't personally manage.

**ACTUAL TODAY — Web and Expo (same backend):** Per-pharmacy: `PharmacyAdmin` OWNER / MANAGER / ROSTER_MANAGER / COMMUNICATION_MANAGER with a capability matrix; MANAGER = OWNER in powers except touching the owner record (GM-05, adopted). Org-wide: `OrganizationMembership` roles (Org Admin / Chief Admin / Region Admin, GM-05) with capabilities via `users/org_roles.py` — seen in use (`VIEW_ALL_PHARMACIES`, `MANAGE_ROSTER`, `MANAGE_STAFF`, scoped per pharmacy by `membership_covers_pharmacy`), but `org_roles.py` itself was NOT read line by line here. Org admins can create chains and add/remove pharmacies and users (`ChainViewSet`), manage org pharmacies (`PharmacyViewSet`), and receive leave notices. Whether they can post shifts, set rates, or approve payments for a site they don't manage: UNKNOWN.
**RECOMMENDED:** Org admin can see all pharmacies in their org, manage org membership, and see (not edit) shifts across the org; they cannot post shifts, set rates, or approve payments for a pharmacy they don't manage, and cannot see other orgs. Severity: high — without this, "org admin" is a label with unknown power, and wrong-tenant access is a privacy risk.
**ALTERNATIVE A — Keep current logic:** leave org-admin powers as whatever the code happens to allow today (partly UNKNOWN). Scenario: an org admin opens another pharmacy's shift and edits its rate — if the code allows it, nobody decided it should. Trade-off: no work, undefined access.
**ALTERNATIVE B — Org admin = owner of every pharmacy in the org:** full owner powers everywhere. Scenario: area manager cancels a shift at a site they don't run, and the site owner disputes it. Trade-off: simple, over-broad.
**ALTERNATIVE C — Read-only org admin + per-pharmacy delegation:** org admin sees everything, acts only where explicitly delegated per pharmacy. Scenario: head office monitors staffing across 20 sites but each site owner keeps control. Trade-off: most code (delegation model), cleanest governance.
**Other / defer:** Defer until Q01/Q02 settle who an org admin is.
**Normal case:** org admin views org dashboard. **Edge case:** org admin is also an owner of one pharmacy — powers must union cleanly, not leak across sites. **Retry/concurrency:** two admins editing the same membership — last-write-wins vs conflict error UNKNOWN. **Denied role / wrong tenant:** org admin of Chempro requests Org B's data → must be 403 + audit log (actual behaviour UNKNOWN — capability scoping is per-org in the code seen, but not end-to-end verified). **Payment/notification:** org-admin actions must not trigger payments; whether they trigger notices is Q08. **Web/Expo:** org screens must exist on both or be declared web-only with a reason (GM-25 parity).
**Sources:** `backend/organizations/models.py` (`PharmacyAdmin`, capability matrix via `PharmacyAdminPolicy`), `backend/organizations/views.py` (`ChainViewSet`, `PharmacyViewSet`), `backend/workforce/permissions.py` (`_org_has_capability`), GM-05 adopted revalidation.
**Decision status:** OPEN.

### GM-04-Q06 — Are there org-level rates, policies or defaults (or is everything per pharmacy)? [NEW]

**Plain English:** today everything about money is per pharmacy or per offer. There is no place to set a rate or a rule once for a whole group — a 20-site group types the same rate 20 times.

**ACTUAL TODAY — Web and Expo (same backend):** No org-level rates/policies model at head. Rates live per pharmacy (`Pharmacy.rate_*`, `default_fixed_rate`); `Chain.subscription_plan` is a bare string; engagement terms per offer; cover permission per pharmacy (R04A — but see GM-07-Q06: the only candidate setting, `auto_publish_worker_requests`, is read by no backend code); `Pharmacy.auto_publish_worker_requests` help text still says worker swap/cover requests will "automatically create and publish a new shift".
**RECOMMENDED:** Keep per-pharmacy as the authority at launch; allow an org to set *defaults* that a pharmacy can override (rates, cover permission, auto-publish). Severity: medium. Benefits: a 20-site group doesn't retype the same rate 20 times; site owners keep control. Risks: override logic is a real feature (precedence, audit) — don't half-build it.
**ALTERNATIVE A — Keep current logic:** per-pharmacy only, no org defaults. Scenario: Chempro sets the same rate at 20 sites by hand; one site drifts and nobody notices. Trade-off: no new code, manual drift.
**ALTERNATIVE B — Org rates override pharmacy rates:** head office sets the rate; sites cannot change it. Scenario: a remote site can't pay more to attract a locum for an urgent shift. Trade-off: control for head office, inflexible at the site.
**ALTERNATIVE C — Org policies only (no rates):** org sets policies (e.g. cover rules, cancellation handling per P05) but rates stay per site. Trade-off: middle ground; still needs a policy model.
**Other / defer:** Defer org defaults until after launch; per-pharmacy works today.
**Normal case:** org default rate copied into a new pharmacy's rate. **Edge case:** org default changes after shifts are posted — posted/frozen terms must not change. **Retry/concurrency:** two admins changing the org default simultaneously — UNKNOWN. **Denied role / wrong tenant:** a pharmacy manager changing the org default → denied. **Payment/notification:** rate changes affect future offers only, never frozen terms or payments already made. **Web/Expo:** defaults UI on both or declared web-only.
**Sources:** `backend/organizations/models.py` (`Pharmacy.rate_*`, `Chain.subscription_plan`, `auto_publish_worker_requests`), `backend/shifts/engagement.py` (per-offer terms, Oct 2026).
**Decision status:** OPEN.

### GM-04-Q07 — How does org membership affect shift visibility and booking? (who counts as "in the org"?) [ex-#184 ON-Q03 context + E01/E01A] — CHANGED (member now partly defined)

**Plain English:** the org tier sits between chain and public, and earlier audiences keep access. What changed: the code now defines "member" for one purpose — getting into a *public* shift without the Verified check. It still doesn't define who counts as an org member for seeing org-tier shifts or for booking without the check.

**ACTUAL TODAY — Web and Expo (same backend):** Org tier between chain and public (E01, carried). Earlier audiences keep access (E01A, carried). "Member" for the public-tier exemption = active + accepted staff/favourite membership at that pharmacy + can perform the role + not anonymous (`shifts/interest.py`). Who is an "org member" for visibility — employee, favourite, locum on retainer, any user linked to a pharmacy in the org — is **not defined in the traced material**. The visibility queryset itself was not re-read at head (GM-11).
**RECOMMENDED:** Org membership for *visibility* = employed staff of any pharmacy in the org + workers explicitly favourited/invited by the org; for *booking without the Verified/AHPRA gate*, only employed staff (see Q04-B). Severity: high — this is the definition that decides who sees a shift and who can be booked unchecked.
**ALTERNATIVE A — Keep current logic:** org tier = whoever the current query returns (UNKNOWN definition). Scenario: a locum who did one shift for one Chempro site last year still sees every Chempro org-tier shift. Trade-off: no work, silent over-sharing.
**ALTERNATIVE B — Org visibility = employed staff only:** locums/favourites see chain tier only if separately eligible. Scenario: a trusted regular locum misses org-tier shifts until favourited. Trade-off: tightest, may starve org shifts of applicants.
**ALTERNATIVE C — Org visibility = staff + favourites + anyone who has worked for the org:** Scenario: a locum who worked once gets org visibility forever — needs an expiry, or it becomes A in practice. Trade-off: generous, needs a recency rule.
**Other / defer:** Defer the "worked before" limb; decide staff + favourites now.
**Normal case:** employed pharmacist sees org-tier shift and applies. **Edge case:** worker employed at Site A, shift at Site B in the same org — visible (org tier) but is travel/credentialing the same? UNKNOWN. **Retry/concurrency:** membership revoked while an offer is pending — offer must be re-checked at acceptance (UNKNOWN whether it is). **Denied role / wrong tenant:** ex-employee still seeing org shifts after leaving — must lose access on removal; timing UNKNOWN (GM-05 Q-09 covers removal consequences). **Payment/notification:** visibility alone triggers no payment; availability-match emails only fire for PLATFORM posts, so org-tier shifts get no match emails today (Oct 2026). **Web/Expo:** same backend query; both boards must show the same set.
**Sources:** `backend/shifts/interest.py` (`is_public_shift_member_access`), carried E01/E01A/R01.
**Decision status:** OPEN.

### GM-04-Q08 — Who is told when a shift is cancelled, covered or replaced — are org admins told? [ex-#184 AG-Q09] — STILL VALID

**Plain English:** today each feature picks its own recipients; there is no agreed list of who must be told. One new fact: org-wide admins *are* told about leave requests. They are still not in any agreed list for cancellations, cover, or replacements.

**ACTUAL TODAY — Web and Expo (same backend):** Existing notices are per feature. No recipient list is agreed (D07). Leave notices go to the owner + org-wide admins + pharmacy admins (`backend/workforce/leave_service.py`, read at head). Edits reach every past applicant (per #184 rec. — leaks activity, adds noise).
**RECOMMENDED: A — affected workers, owner, shift's managers.** Rationale (per #184): telling only the people who must act keeps names private. Severity: medium. Benefits: less noise, better privacy. Risks: org admins/head office are blind to cancellations at their sites unless they check.
**ALTERNATIVE A — (recommended above)** Affected workers, owner, shift's managers.
**ALTERNATIVE B — A plus organisation admins:** head office sees every cancellation/cover/replacement in its org. Scenario: Chempro area manager spots a site cancelling repeatedly and intervenes — impossible under A. Trade-off: more mail, real oversight; needs an opt-out or digest or it becomes noise. (Leave already does B — consistency argues for B here too.)
**ALTERNATIVE C — A plus anyone watching:** anyone who viewed/followed the shift. Scenario: a locum who merely browsed gets cancellation mail for a shift they never applied to. Trade-off: noisy, privacy-poor.
**Other / defer:** Keep per-feature notices (KEEP) until D07 is settled platform-wide; do not add org-admin notices piecemeal.
**Normal case:** shift cancelled → worker + owner + managers notified. **Edge case:** cancellation at 2am for a 7am shift — org admin (B) woken by mail they can't act on; digest vs instant matters. **Retry/concurrency:** notice sent twice after a retry — idempotency UNKNOWN. **Denied role / wrong tenant:** a notice must never reveal another org's shift details to an org admin (B must be scoped per org). **Payment/notification side effects:** notices themselves are the side effect; cancellation fees (P09) are shown/charged separately and are not enforceable without disclosure (SH-09). **Web/Expo:** notices are backend/email/push; both clients show the same in-app notice list (parity UNKNOWN).
**Sources:** `docs/qa/launch-grill/questions.json` AG-Q09 (re-read this session); `backend/workforce/leave_service.py` (`_slot_leave_recipients`, read at head).
**Decision status:** OPEN.

### GM-04-Q09 — When is a worker's source (favourite, chain, org, public) frozen, and which wins if several apply? [ex-#184 CX-Q31] — NOT RE-VALIDATED

**Plain English:** the rulebook says a worker's "source" — favourite, chain, org, or public — is frozen when they accept, and that it decides which cancellation policy and which incident treatment apply. But which source wins when a worker is several things at once was never decided, and the code that does the freezing was not read in this pass.

**ACTUAL TODAY:** Per the register (Oct 2026): freeze per worker and date at acceptance; precedence open. `backend/workforce/assignment_freeze.py` exists at head — **not read**. A favourite who sees a public shift can be misclassified by visibility tier (Oct 2026). Implementation at head NOT VERIFIED — do not quote as current.
**RECOMMENDED: A — freeze at accept; closest relationship wins.** Rationale: the relationship is the truth (a favourite is a favourite even if they happened to see the public card); the channel seen is an accident of browsing. Severity: high — source drives P02 cancellation policy, P05 internal handling, and the P10 ladder.
**ALTERNATIVE A — (recommended above)** Freeze at accept; closest relationship wins.
**ALTERNATIVE B — Freeze at accept; channel seen wins:** the tier the worker actually saw decides. Scenario: a favourite applies via the public board because they missed the chain notice — treated as public, with public cancellation rules. Trade-off: simple to implement (tier is on the shift), unfair in edge cases.
**ALTERNATIVE C — Freeze at payment:** source decided when the booking is paid/confirmed, not at acceptance. Scenario: acceptance and payment are hours apart and the worker becomes a favourite in between — source flips. Trade-off: matches the money, but the worker's terms were frozen at acceptance, so the source would disagree with the terms.
**Other / defer:** Keep current logic (KEEP in #184) — i.e. whatever the code does today, unexamined. Not recommended: the code's behaviour here is unverified.
**Normal case:** favourite accepts a chain-tier shift → source = favourite. **Edge case:** worker is both a favourite of Site A and employed by Site B in the same org — which wins? Needs the precedence order. **Retry/concurrency:** acceptance retried after a network drop — freeze must be idempotent (same source, not recomputed). **Denied role / wrong tenant:** source must be computed from *that* pharmacy's relationships, never another org's. **Payment/notification:** source affects cancellation fees (P09/FEES) and badge/ladder treatment, not the booking fee itself. **Web/Expo:** source is backend-computed; both clients display the same frozen source (display UNKNOWN).
**Sources:** `docs/qa/launch-grill/questions.json` CX-Q31 (re-read this session); `backend/workforce/assignment_freeze.py` (existence only at head).
**Decision status:** OPEN — NOT RE-VALIDATED.

### GM-04-Q10 — Do regions exist as a product concept, and if so what do they scope? [NEW] — CHANGED (role exists, geography still doesn't)

**Plain English:** regions still don't exist as a thing in the product — no model, no field, no screen. Two near-misses turned up: a `Region Admin` *role* (a person, not a place) and a `public_holiday_region` label on each pharmacy that only says which holiday district it is in.

**ACTUAL TODAY:** No Region model/field/API/screen at head (`backend/organizations/models.py`, full read). `Pharmacy.public_holiday_region` is a free string (e.g. `QLD_GOLD_COAST`) used for public holidays. `Region Admin` is an org-wide admin role (GM-05, adopted) — its scope is pharmacies assigned to that membership, not a geographic region object.
**RECOMMENDED:** Drop regions from launch scope unless the owner names a concrete use (e.g. "QLD-only visibility" or "regional manager"). If a use is named, define region as a *label on a pharmacy* (state/area), not as a permission boundary — visibility stays with staff/favourite/chain/org/public (E01). Severity: low if dropped; high if adopted without definition.
**ALTERNATIVE A — Keep current logic (no regions):** regions don't exist; a "region" is just a suburb/postcode on the pharmacy. Scenario: Chempro QLD manager wants all QLD shifts — they filter by pharmacy, not by region. Trade-off: no work, manual filtering.
**ALTERNATIVE B — Region as a visibility tier:** add "region" between org and public in E01 (needs a new carried-decision change). Scenario: a shift is visible to every worker in SEQ before going public. Trade-off: new tier, new escalation, new notices; reopens E01.
**ALTERNATIVE C — Region as an admin scope only:** regional managers see/report on pharmacies in their region but visibility is unchanged. Scenario: QLD manager sees QLD sites' staffing without seeing NSW pay details. Trade-off: reporting feature, not a marketplace change. (Closest to what `Region Admin` already implies — verify what that role can actually see before building C.)
**Other / defer:** Defer; revisit if a group asks for it.
**Normal case:** n/a (no regions). **Edge case:** a pharmacy sits on a region border (e.g. Gold Coast / NSW) — which region? Shows why a label needs a rule. **Retry/concurrency:** n/a. **Denied role / wrong tenant:** a regional manager must not see other regions (if C). **Payment/notification:** none. **Web/Expo:** n/a until defined.
**Sources:** `backend/organizations/models.py` (full read — no Region class; `public_holiday_region` only); GM-05 adopted revalidation (`Region Admin` role).
**Decision status:** OPEN.

### GM-04-Q11 — Do favourite, chain and organisation incidents count toward the platform ladder? [ex-#184 CX-Q27] — NOT RE-VALIDATED

**Plain English:** the rulebook says public-source incidents go on the platform ladder and chain/org incidents are handled inside the group — but nobody has checked whether the ladder itself is built, or what it counts.

**ACTUAL TODAY (Oct 2026):** No source-specific platform incident ladder or badge rule is implemented (per #184 rec.). Ladder implementation at head NOT VERIFIED — GM-15 owns cancellation/incidents.
**RECOMMENDED: A — public-sourced only; others badge only.** Rationale: keep public-source sanctions separate from internally handled relationships (P04/P05). Severity: medium. Benefits: a chain pharmacist isn't platform-banned for an internal rostering dispute; badges still signal repeat behaviour. Risks: a worker who repeatedly no-shows for chain shifts escapes the ladder by never working publicly.
**ALTERNATIVE A — (recommended above)** Public-sourced only; others badge only.
**ALTERNATIVE B — All outside sources count:** chain/org/favourite incidents count toward the P10 ladder (1st warning, 2nd 14 days, 3rd 28 days + badge, 4th 56 days, 5th permanent after human review). Scenario: a Chempro locum cancels late twice for chain shifts and is blocked from *public* shifts too. Trade-off: consistent, but the platform overrules an internal relationship.
**Other / defer:** Defer until P10 ladder is implemented and tested on public source first.
**Normal case:** public worker no-shows → ladder step. **Edge case:** same incident, two sources (Q09 freeze decides the source first — Q09 must be answered before Q11 can be applied). **Retry/concurrency:** duplicate incident reports for one no-show — must not double-count (UNKNOWN). **Denied role / wrong tenant:** only the platform sanctions (P04: managers only report); an org admin must not be able to ladder a worker. **Payment/notification:** ladder steps restrict applying (no payment); badge display is public on talent cards (SH-10 context). **Web/Expo:** ladder/badge display must match on both.
**Sources:** `docs/qa/launch-grill/questions.json` CX-Q27 (re-read this session); carried P04/P05/P10.
**Decision status:** OPEN — NOT RE-VALIDATED.

### GM-04-Q12 — Who can see the talent board, and does "organisation" count as an employer there? [ex-#184 TB-Q01] — STILL VALID (adopted from GM-01)

**Plain English:** today anyone who is signed in can see the talent board — including competing workers. Only people who are *not* signed in get the masked version. The anonymity promise is broken for every logged-in user (LA-Q12, senior-reviewed, still valid at the head).

**ACTUAL TODAY — Web and Expo (same backend):** Any authenticated user can see the talent board, including competing workers; public sees anonymous cards. Authenticated `list` / `retrieve` / `feed` / `by_profile` return `author_user_id`, `explorer_user_id`, `explorer_name` via unmasked `ExplorerPostReadSerializer`; only `public_feed` (AllowAny) uses `PublicExplorerPostReadSerializer` (GM-01, re-verified at `main` and PR #249 head).
**RECOMMENDED: B — employers and own post, plus public masked.** Rationale (per #184): worker-to-worker access defeats anonymity; restrict authenticated discovery to authorised hiring roles (owners, managers, organisations) and each author; keep public discovery only if masking is enforced server-side. Severity: high (privacy).
**ALTERNATIVE A — Keep current logic (KEEP):** all accounts see identities; public sees masked cards. Scenario: a pharmacist browses a rival's talent post and sees their name, rate and availability. Trade-off: maximum discovery, no privacy.
**ALTERNATIVE B — (recommended above)** Employers + own post, plus public masked.
**Other / defer:** Defer public masked cards; restrict authenticated board first.
**Normal case:** org admin browses talent to hire for a site. **Edge case:** an org admin who is also a worker — which hat decides access? UNKNOWN. **Retry/concurrency:** n/a. **Denied role / wrong tenant:** a worker account requesting another worker's identity → denied/redacted. **Payment/notification:** none. **Web/Expo:** board exists on both (`pages/dashboard/sidebar/TalentBoard/*` web; `roles/shared/talent-board/*` mobile, Oct 2026); the access rule must be enforced backend-side, not per client.
**Sources:** GM-01 Part B/C (LA-Q12, re-verified at head `97c4543…`); `backend/talent/serializers/explorer.py`, `backend/talent/views/explorer.py`.
**Decision status:** OPEN (carried from LA-Q12).

### Questions considered and NOT carried into GM-04

| #184 question | Why not a GM-04 question |
|---|---|
| ON-Q01 (worker tracks), ON-Q10 (super on ABN terms) | Worker onboarding / engagement terms, not orgs — matched only on the word "organisation" in passing. |
| PO-Q11 (anonymous public post — what is hidden) | Posting anonymity; org relevance is only via E01B note. No org decision. |
| CX-Q34 (who can rate, and when) | Ratings; org relevance is only that internal-roster ratings may leak onto public talent cards (SH-10). Belongs to GM-15, not GM-04. |
| LA-Q03 (mobile dead-ends) | Code-fix timing; the unrouted web org page is noted under Q01 as code gap CG-01, not a separate decision. |
| LA-R01 (GST/tax invoice) | Billing/tax; no org content. |
| LA-Q08 (escalation lazy engine) | GM-11 owns escalation; noted in F-03, not re-asked here. |

---

## Part D — SINGLE first decision question

### GM-04-Q01 — How do organisations (multi-site groups) join?

**Ask this first because:** the setup path affects Q02 (definitions), Q05 (org-admin powers) and Q07 (membership). Tom can also decide whether pharmacy claims are the join mechanism (CG-08). Verification scope is answered in Q04 and tracked in the central BL-01.

**Question (plain English):** A pharmacy group like Chempro wants to join ChemistTasker with all its sites. How should that happen?

**Options:**

- **A — Keep current logic (RECOMMENDED): sales-led.** A platform admin creates the organisation, then invites its admins. The dead web create page is deleted (a cleanup, not a logic change). *What happens:* Chempro emails the platform; admin creates "Chempro", invites its area manager; the manager adds pharmacies. *Trade-off:* slowest, safest; groups wait on a person.
- **B — Self-serve, waits for approval.** A group signs up and gets a pending organisation; a platform admin approves before any pharmacy or shift is visible. *What happens:* a 12-site group signs up on a Sunday, approved Monday, nothing posts from an unvetted org in between. *Trade-off:* faster intake, needs an approval queue and pending-state handling in every visibility check.
- **C — Self-serve, instant access.** A group signs up and immediately posts shifts. *What happens:* a fake "group" can post public shifts the same day. *Trade-off:* fastest, highest fraud risk; conflicts with GM-04-Q03 (pharmacy verification).
- **Other (describe) / defer:** e.g. self-serve for groups referred by an existing owner, sales-led for cold approaches; or defer self-serve until after launch (which is option A for launch).

**What the owner should also say in the same answer (so Q02/Q05 don't stall):** who the first org admin is (a named person per org, or a role?), whether a group with pharmacies already on the platform as independents gets merged or re-linked, and whether `PharmacyClaim` (org claims a pharmacy, someone approves) is the intended join path.

**Evidence:** `backend/organizations/views.py` (`OrganizationViewSet.create` — superuser-only), `backend/organizations/models.py` (`Organization`, `PharmacyClaim`), `frontend_web/src/pages/OrganizationCreate.tsx` (dead, unreferenced).

**Second question after this one:** GM-04-Q04 (Verified/AHPRA gate on chain/org tiers — safety-critical).

**Decision status:** OPEN.

---

## Part E — Gaps: code gaps vs decision gaps

### Code gaps (no owner decision needed — build/fix once confirmed; still NO code in this phase)

| # | Gap | Code to touch | Notes |
|---|---|---|---|
| CG-01 | Web `OrganizationCreate.tsx` is not routed anywhere — dead page | `frontend_web/src/pages/OrganizationCreate.tsx` | Delete it if Q01 = sales-led; route it only if Q01 = self-serve. Existence confirmed by default-branch search (1 hit, the file itself); routing not re-verified at head |
| CG-02 | `auto_publish_worker_requests` is read by NO backend code — the toggle changes nothing | `backend/organizations/models.py` (field + help text), `backend/workforce/roster/worker_actions.py` / `backend/shifts/*` (where a read should live) | Field exists at head; mobile `PharmacyForm.tsx` now references it (LA-Q11 half fixed). The help text still contradicts R06/R04B (SH-11, still valid). See GM-07-Q06 |
| CG-03 | `PharmacyOverviewContainer.tsx:93` TODO for admin scope | `frontend_web/src/pages/dashboard/sidebar/PharmacyOverviewContainer.tsx:93` | Needed for Q05, whatever the owner decides (Oct 2026; not re-checked at head) |
| CG-04 | Escalation only runs on shift-list load; no beat task; escalation notifies nobody | `backend/shifts/escalation.py`, `backend/shifts/base.py` | GM-11 owns; `backend/shifts/visibility.py` does not exist at head — visibility code has moved. Not re-read here |
| CG-05 | Talent-board anonymity leak: `list`/`retrieve` return full name/IDs; only `public_feed` redacts | `backend/talent/serializers/explorer.py`, `backend/talent/views/explorer.py` | Adopted from GM-01 (LA-Q12, still valid at head). Q12's "public masked" option depends on this fix |
| CG-06 | AHPRA expiry never enforced at apply/accept; no scheduled re-check; Verified stays true after lapse | `backend/onboarding/verification/ahpra.py` (Oct 2026) | Q04's edge case (expiry between acceptance and start). Not re-traced at head |
| CG-07 | Membership invite flow not traced in depth; staff/locum manager screens not compared line-by-line (web vs Expo) | `backend/memberships/invites.py`, `PharmacyPage`, `StaffManager`/`LocumManager` | Q05/Q07 depend on this trace (GM-05 owns membership) |
| CG-08 | `PharmacyClaim` model exists but its API wiring is UNKNOWN — no claim endpoints in `organizations/views.py` | `backend/organizations/claims.py` (not read), `backend/organizations/urls.py` (not read) | If claims are the intended org-join path, wire + test them; if not, say so and Q01-B changes shape |

### Decision gaps (owner must choose first — do not build until answered)

GM-04-Q01 (how orgs join) · Q02 (chain vs org vs region definitions) · Q03 (pharmacy verification before posting) · Q05 (org-admin powers) · Q06 (org-level rates/policies) · Q07 (who counts as org member) · Q08 (org admins in cancellation notices?) · Q09 (source freeze/precedence — NOT RE-VALIDATED, read `assignment_freeze.py` first) · Q10 (regions: exist or not) · Q11 (chain/org incidents on the platform ladder? — NOT RE-VALIDATED, GM-15 owns) · Q12 (talent-board access for orgs).

**Order to ask (after revalidation):** Q01 → Q02 → Q07 → Q09 → Q03 → Q05 → Q08 → Q06 → Q12 → Q11 → Q10.

---

## Part F — Implementation backlog (SEPARATE — FROZEN until the owner answers)

**Do not start any item below until its owner decision is recorded in Part C.** This backlog exists so that, once decisions land, implementation starts from a clear spec with exact files. No branch, no PR, no code change was made in this phase.

| Backlog item | Depends on (owner decision) | Files / functions to touch | Tests to add / update |
|---|---|---|---|
| BL-01 Org onboarding path as decided (delete dead page, or build self-serve + approval queue; wire or drop `PharmacyClaim`) | Q01 | `backend/organizations/views.py`, `backend/organizations/claims.py`, `frontend_web/src/pages/OrganizationCreate.tsx` | Positive/negative role tests: superuser-only vs self-serve; duplicate org; pending org invisible |
| BL-02 Encode chain/org/region definitions in model + UI copy (Vite, Next, Expo identically) | Q02 | `backend/organizations/models.py`, posting wizards (web + Expo) | One pharmacy, one org; many chains; group-change history; wrong-tenant denial |
| BL-03 Pharmacy verification gate at posting, per tier | Q03 | `backend/shifts/posting.py` (`post_shift`), both posting wizards | Unverified pharmacy blocked from public (and chain/org if decided); clear denial message on web + Expo |
| BL-04 Extend verification to outside bookings across tiers | ON-Q03, answered | Engineering: see the central BL-01 | Preserve public coverage and apply the outside-booking scope to chain/org routes |
| BL-05 Org-admin permission set + hierarchy | Q05 | `backend/users/org_roles.py`, `backend/organizations/views.py`, `backend/workforce/permissions.py` | Org admin sees own org only; cannot act on other orgs; union with owner role correct |
| BL-06 Org defaults (rates/policies) if decided, with override + audit | Q06 | New org-default model + `backend/organizations/models.py` (`Pharmacy.rate_*`), offer/engagement terms | Default copied to new pharmacy; change never alters frozen terms |
| BL-07 Membership definition in visibility query + revocation handling | Q07 | Visibility queryset (`backend/shifts/escalation.py` / `base.py` / `browse.py`), `backend/shifts/interest.py` | Ex-employee loses org visibility; pending offer re-checked at acceptance |
| BL-08 Recipient list for cancel/cover/replace notices incl. org admins if decided | Q08 | `backend/shifts/notifications.py`, `backend/shifts/emails.py` | Scoped per org; no cross-org leakage; no duplicate sends on retry |
| BL-09 Source freeze at acceptance + precedence order | Q09 (after reading `assignment_freeze.py`) | `backend/workforce/assignment_freeze.py`, `backend/shifts/assignment.py` | Favourite-via-public classified as favourite; idempotent on retry |
| BL-10 Regions, only if adopted (label vs tier vs admin scope) | Q10 | `backend/organizations/models.py` (+ new Region model if a tier/scope) | Border-pharmacy rule; regional manager scope |
| BL-11 Source-specific ladder/badge application | Q11 (GM-15 owns the ladder) | Incident/ladder code (GM-15) | Chain/org incidents badge-only or counted, per decision; no double-count |
| BL-12 Talent-board access rule + server-side masking fix (CG-05) | Q12 | `backend/talent/serializers/explorer.py`, `backend/talent/views/explorer.py` (`get_serializer_class`) | Worker cannot read another worker's identity; org hiring roles can; public masked |
| BL-13 Code gaps CG-01–CG-08, timed by owner (before launch / soon after / not needed — timing not decided here) | Q01/Q05/Q06/Q12 as noted | As per Part E | Each with web + Expo verification |

**Revalidation still open before any backlog item is scoped:** read `backend/workforce/assignment_freeze.py` (Q09), `backend/users/org_roles.py` (Q05/Q10 — `Region Admin` scope), the visibility queryset (Q07 — GM-11), and confirm `OrganizationCreate.tsx` + `PharmacyOverviewContainer.tsx:93` at the then-current head.

---

## Appendix — Evidence index (per-question source links)

- Head: PR #249 `get` — head `97c4543e051b43fe30ec7e2e61ad3d69957a918e`, branch `fix/pr248-expo-production-waves-20261104`, base `feat/mobile-merge-sdk` (`c98cf2ef…`); body "working head `26cae2d6`" is the last implementation commit's short SHA, not the branch head.
- Old grill: PR #184 `get` + `get_files` — head `c786a4b8…`, 130 questions, 8 files; `docs/qa/launch-grill/questions.json` (SHA `9b700e31…`, 142 questions, 30 carried decisions) and `AUDIT.md` read from `refs/pull/184/head`.
- Issue #250 `get` — 26 areas, scope freeze (existing QR scanning unchanged unless separately approved), progress labels, method (#204, reuse #184's 142 questions + 30 decisions, revalidate against #249).
- Files read line by line at head `97c4543…`: `backend/organizations/models.py` (503 lines), `backend/organizations/views.py` (463 lines), `backend/shifts/interest.py` (300 lines), `backend/shifts/posting.py` (290 lines), `backend/shifts/` directory listing (`escalation.py` exists, `visibility.py` does not), `backend/workforce/leave_service.py` (`_slot_leave_recipients`), `backend/workforce/permissions.py` (`_org_has_capability`).
- Default-branch search index (NOT head — flagged in text): `OrganizationCreate` (1 hit), `abn_verified` (38 hits, incl. `shifts/engagement.py`, `candidates.py`), `auto_publish_worker_requests` (12 hits, no backend reader).
- Adopted without re-trace: GM-01 (LA-Q12 identity leak, session findings), GM-05 (org roles, R01, manager capabilities), GM-25 (structural trace).

*End of GM-04 documentation. No code was changed. No branch or PR was created.*
