# TOP_TASKS_MAP.md: per-persona top tasks (TOPTASKS, roadmap step 1)

Source: web nav `frontend_web/src/navigation.tsx` (owner 191-249, org 99-189, admin 260-368, otherstaff 371-445, pharmacist 448-502, explorer 505-540), mobile layouts `frontend_mobile/app/<persona>/_layout.tsx`, `components/ParityToolsCard.tsx:10-61` (the More "tools" group), DD1 §4, roadmap §3.3-3.4, RESEARCH_SHIFTS top 15, and the grill answers.
**How often each task happens is my estimate from the code and the research. No user data backs it.** D5 applies: the tabs and More are ordered by task, not by the web sidebar.

## Rules across all personas
- Chat stays a tab for every persona. Locums do their work in messages (known fact), so DD1's worker bar without Chat is rejected.
- Owner, org and admin keep the hero **Post shift** tab. Posting is the marketplace's core job and the "short-staffed now" moment. DD1's manager "Roster" tab goes to the top of More plus a Home block, because roster only matters to owners with employed staff (see open question Q1).
- Workers get **one rule**: tab 3 follows the workspace switch that already exists (internal shows **Roster** at `/my-roster`, platform shows **Invoices**). Web already swaps the Shift Centre children by workspace (`navigation.tsx:373-384`).
- Home = one next-step card (§3.4 rule 2: one next action), then 2-3 blocks with names and faces first ("Omar is covering Tue 9-5"). The old activity feed and the tools grid on Home go to More.

## 1. Owner (Tom)
**Top jobs**
| Job | Freq | Mobile route |
|---|---|---|
| See who is covering today/this week; fill a gap (e.g. Ben is free) | daily | `/owner/shifts`, `/owner/locums` |
| Review applicants / counter-offers; pay to confirm a reservation (grill: "only verified payment confirms") | daily when a shift is open | `/owner/shifts/[id]/applications` |
| Chat with Sara, Ben, Omar | daily | `/owner/chat` |
| Post a shift | weekly | `/owner/post-shift` |
| Approve timesheets / attendance; check roster | weekly | `/workforce-timesheets`, `/attendance/reviews`, `/manager/roster` |
**Tabs:** Home · Shifts · **Post shift** (hero) · Chat · More. **No change.** Home covers "what needs me", Shifts covers fill status, Post is the core action, Chat is the daily channel.
**Home**
- Next-step card, first match wins: finish setup (onboarding %) → reservation waiting for payment, with a countdown → "N applicants for Sat" → shift <48h unfilled ("Ben and 2 others are free") → "N timesheets need you" → "Post a shift".
  Data: `getOwnerDashboard` (shift_summary), `fetchShiftInterests` / `fetchShiftCounterOffersBatchService`, `attendance.getManagerPending(pharmacyId)`, `workforce.listTimesheets`.
- Block 1, This week: who is covering what, with faces (`getOwnerDashboard().shifts`, `fetchConfirmedShifts`).
- Block 2, Needs you inbox (Deputy pattern): applications, attendance exceptions, timesheets, each with a count.
- Block 3, Pharmacies: one row each (Nadia's store too). The scope pill sits in the header (DD1).
**More (by frequency)**
1. *This week*: Timesheets, Attendance approvals, Roster, Calendar
2. *Pharmacies & people*: Pharmacies (My Chain view inside it, see gaps), Staff, Locums & favourites, Workforce & Payroll (`/workforce-settings`, `/workforce/employment-engagements`), Pharmacy Hub
3. *Money*: Invoices, Finance & BAS (`/finance`), Pills (`/owner/pills`), Subscription
4. *Discover*: Talent Board, Learning (gap), Marketplace, Ethical Marketplace
5. *Account*: Profile, Sign out

## 2. Organization admin (Lina; Grace region admin uses the same shell, scoped)
**Top jobs**
| Job | Freq | Mobile route |
|---|---|---|
| See which pharmacies are short this week | daily | `/organization/shifts`, `/organization/pharmacies` |
| Chat with pharmacy admins and locums | daily | `/organization/chat` |
| Post a shift for a pharmacy | weekly | `/organization/post-shift` |
| Timesheets / attendance across stores | weekly | `/workforce-timesheets`, `/attendance/reviews` (capability-gated) |
| Invite staff / admins | monthly | `/organization/invite` |
**Tabs:** Home · Shifts · **Post shift** (hero) · Chat · More. **No change.** Same reasons as owner, so the two manager shells feel like one product. Pharmacies stays at the top of More (see Q2).
**Home**
- Next-step card: pending admin invitations (`getPendingPharmacyAdminInvitations`) → soonest unfilled shift across stores → "N timesheets need you" → "Post a shift".
- Block 1, Pharmacies needing cover, sorted by gap (`getOrganizationDashboard(orgId)`, `fetchAccessibleOrganizationPharmacies`).
- Block 2, Needs you inbox (as owner, org-wide).
- Block 3, Team: open invites, plus an "Invite staff" link.
**More:** 1. *This week*: Timesheets, Attendance approvals, Roster, Calendar · 2. *Pharmacies & people*: Pharmacies (+ My Chain), Invite staff, Workforce & Payroll, Pharmacy Hub · 3. *Money*: Invoices (mobile route exists but is not on the web org nav, see Q5), Finance, Pills · 4. *Discover*: Talent Hub, Learning (gap), Marketplace, Ethical · 5. *Account*: Profile, Sign out.

## 3. Admin / manager (its own stack shell, e.g. Nadia running Tom's other pharmacy)
**Top jobs**
| Job | Freq | Mobile route |
|---|---|---|
| Today's attendance: exceptions, kiosk reviews | daily | `/attendance/reviews` (**no entry from the admin More**) |
| Shift fill for this pharmacy | daily | `/admin/shifts` |
| Chat | daily | `/admin/chat` |
| Post shift; approve timesheets | weekly | `/admin/[pharmacyId]/post-shift`, `/workforce-timesheets` |
| Roster | weekly | `/manager/roster` (**no entry from the admin More**) |
**Tabs:** Home · Shifts · **Post shift** (hero, **only when MANAGE_ROSTER**, like web `navigation.tsx:344`) · Chat · More. **Change:** the hero is gated. Without it the bar has 4 tabs.
**Home**
- Next-step card: pending attendance at this pharmacy (`attendance.getManagerPending`, `getManagerPendingKioskReviews`) → unfilled shift → timesheets.
- Block 1, Today's roster (`fetchRosterOwnerAssignments`).
- Block 2, Shift fill (`getOwnerDashboard`, which `app/admin/index.tsx:28` already calls).
- Block 3, Pills (`fetchPillBalanceService`).
**More:** 1. *This week*: Attendance approvals, Roster, Timesheets, Calendar · 2. *Pharmacy*: Pharmacies, Workforce & Payroll, Pharmacy Hub · 3. *Money*: Pills · 4. *Account*: Profile, Return to <role> workspace, Sign out. **Add `tools: true`** so the capability-gated roster/attendance tools show up.

## 4. Pharmacist (Sara external locum, platform workspace; Omar employed, internal)
**Top jobs**
| Job | Freq | Mobile route |
|---|---|---|
| Next shift: where, when, clock in | daily on a shift day | `/attendance/clock`, `/pharmacist/shifts/[id]` |
| Chat with pharmacies and agencies | daily | `/pharmacist/chat` |
| Find and apply for shifts (public/community) | daily (Sara) | `/pharmacist/shifts` |
| Invoice a pharmacy (Sara self-invoices) | weekly | `/pharmacist/invoice/new` |
| Roster, cover/swap, leave (Omar) | weekly | `/my-roster`, `/my-leave` (**only reachable inside Profile**) |
| Publish / set availability | weekly | `/pharmacist/publish-availability`, `/availability` |
**Tabs:** Home · Shifts · **Invoices (platform) / Roster (internal)** · Chat · More. **Change:** tab 3 follows the workspace. Sara's money and Omar's roster each sit one tap away.
**Home**
- Now card (Uber Driver pattern): next confirmed shift, countdown, **Clock in**, Directions (`fetchMyConfirmedShifts`, `attendance.getWorkerStatus`).
  Otherwise in order: "Reserved, waiting for the pharmacy to pay", with the deadline (research #1) → profile gaps before applying ("Add your AHPRA number") → "Publish availability".
- Block 1, Shifts for you (`recommended_shifts`, `fetchPublicShifts` / `fetchCommunityShifts`).
- Block 2, Money: unpaid invoices and their total (`invoice_summary`, `getInvoices`). For internal staff this block shows My hours instead.
- Block 3, Requests: cover/swap/leave status (`fetchWorkerShiftRequestsService`, `getLeaveRequests`).
**More:** 1. *This week*: My roster or Invoices (whichever is not the tab), My attendance (`/attendance`), Attendance PIN, My hours, My leave, Calendar · 2. *Find work*: Publish availability, Availability, Memberships, Talent Board · 3. *Money*: Finance (`/finance`), Pill rewards · 4. *Community*: Pharmacy Hub, Learning, Marketplace, Ethical · 5. *Account*: Profile, Interests, My ratings, Sign out.

## 5. Other staff (Ali technician, Mia assistant, Jack intern)
Same jobs as Omar, ranked: clock in (daily) > chat (daily) > roster/cover/leave (weekly) > My hours (weekly) > community shifts (weekly) > invoices (rare; Jack never invoices).
**Tabs:** same worker rule. In practice most of them get **Roster** at tab 3. **Change:** Invoices tab → Roster for internal staff.
**Home:** Now card (next rostered shift + Clock in, `fetchRosterWorkerAssignments`, `attendance.getWorkerStatus`) → My week (roster) → Requests (cover/swap/leave) → Hours this period (`/my-hours`).
**More:** same groups as pharmacist. The profile sub-pages (regulatory, skills, payment) stay inside Profile.

## 6. Explorer (Zoe)
**Top jobs:** browse shifts (weekly, `/explorer/shifts`) · Talent Board posts (weekly, `/explorer/talent-board`) · chat (weekly, `/explorer/chat`) · learning (monthly, **web only: `/dashboard/explorer/learning`**) · profile and interests (once, `/explorer/profile`).
**Tabs:** Home · Shifts · Talent · Chat · More. **No change.** DD1 proposed a "Hub" tab, but Explorer has no Hub on web, so it is rejected.
**Home:** next-step card = finish profile / pick interests → Block 1 Shifts for you (public + community) → Block 2 Talent Board → Block 3 Learning.
**More:** 1. *Plan*: Availability, Calendar · 2. *Grow*: Learning (gap), Marketplace · 3. *Account*: Profile, Interests, My ratings, Pill rewards, Sign out.

## Parity gaps (web feature without a mobile route or entry)
1. **Learning Materials** for owner, org and explorer (web `/dashboard/{owner,organization,explorer}/learning`). The only mobile routes are `pharmacist/learning` and `otherstaff/learning`.
2. **My Chain** (owner; org with `view_all_pharmacies`; web `manage-pharmacies/my-chain`). No mobile screen; a grep for "chain" finds nothing.
3. **Admin shell has no entry to Internal Roster / Attendance Approvals**: the routes exist, but `admin/_layout.tsx:122-150` has no tools group.
4. **Admin gating differs from web.** Mobile shows Post shift (tab) and Timesheets without MANAGE_ROSTER. Web also shows Hub/Calendar for staff/roster/owner admins (`navigation.tsx:295-300`), but mobile shows them only with MANAGE_COMMUNICATIONS (`admin/_layout.tsx:69`). The backend still enforces access, so this is a presentation mismatch.
5. **Worker My Roster / My Leave / Attendance PIN** are reachable only inside Profile (`roles/pharmacist/profile.tsx:117-120`, `roles/otherstaff/profile.tsx:37-40`), so people won't find them.
6. **Not checked:** whether the mobile `shifts/index` screens cover every Shift Centre sub-view on web (active/confirmed/history; roster/community/public).

## Open questions (owner only)
- Q1: Do most launch owners roster employed staff in-app? If yes, Roster becomes the owner's tab 4 and Chat moves to the header.
- Q2: Does Lina post shifts herself, or do her pharmacy admins? If admins do, the org hero becomes **Pharmacies**.
- Q3: Do you accept a worker tab that changes with the workspace switch (Roster ↔ Invoices)? The alternative is a fixed 4th tab.
- Q4: Should owner Pills (`/owner/pills`) and Pill rewards (`/rewards/pills`) be one item?
- Q5: Org Invoices exists on mobile but not on the web org nav. Keep it on mobile?
- Q6: Do the dashboard endpoints return "reserved, waiting for payment" with its deadline? If not, the owner and locum Home cards need a backend field. Routes and payloads are fixed, so this is your call.

