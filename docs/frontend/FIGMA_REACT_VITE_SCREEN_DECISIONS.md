# ChemistTasker Figma → React/Vite screen decision ledger

> **Source reviewed:** live Figma `t32C9hNvsDdQ4wzUKVJx9O` on 2026-10-09; current repository `main` SHA `a4fb05bd5caa3a68a639544729c419eea868015a`. **This is an inventory and implementation decision register, not a claim every frame is already coded or tested.**

## Scope, precedence, and what to keep

- **Keep:** working React Router paths, URL deep links, correct persona/pharmacy context, API contracts, MUI dark mode, established React hooks and shared-core data, backend billing scope, onboarding verification, roster/attendance workflow states.
- **Adapt:** Figma colour hierarchy, responsive grids, component spacing, semantic status chips, icons, cards, forms and loading/error/empty states using the existing MUI and project components. Correct Figma's text-overlap/fixed-position defects.
- **Reject/avoid:** copying Figma-exported absolute-position JSX, decorative 8–11 px operational text, dummy screenshot data, hardcoded user/profile names, duplicating frontend routes or components, fabricated access/capabilities, replacement of actual media with placeholders, or a global font migration without approval.
- **Figma token sources:** `CT Primitives`, `CT Ezy Auth Web`, `CT Ezy Dimensions` exist as variable collections. Auth Web `#063BDA` / `#6D28D9` / `#F7F9FD` / `#E5ECF7`; spacing 4/8/12/16/24/32; radius 8/12/18/full. Figma also has separate PUBLIC and MOBILE token systems: avoid applying one palette indiscriminately.
- **Keep the existing DM Sans application font:** Figma mixes DM Sans, Inter and Outfit by design area. Fonts may only change through a separately verified accessibility/design decision. Figma static screenshots are not the font-loading/runtime authority.
- **Source-of-truth functional hierarchy:** actual main React Router and permission/auth checks > tested current screens/shared core > UX handbook > visual Figma. Figma `?step=`, `?state=`, `?tool=` and `source:` labels do not by themselves define a new route.
- **Scope exclusions:** `10 — Web · Public` and `20 — Mobile Web · Responsive Public` are handled by **Next.js** and PR #155, not duplicated in Vite. `21–29` Expo frames are native/mobile scope, and `29` includes explicitly PROPOSED gaps, not existing routes. `00/01` foundations and components are *referenced and composed into existing React/MUI*; do not create a second component library.

## Where each React area belongs

| Figma page | Current application authority | UX choice |
| --- | --- | --- |
| 11 Access & Shared | Next public/Auth pages and PublicRouteBridge; `/kiosk` in Vite | KEEP public route ownership; visually harmonise later at actual owner |
| 12 Authenticated | `frontend_web/src/main.tsx` routes, `layouts/DashboardTopShell.tsx`, `pages/dashboard/**`, `components/dashboard/**` | ADAPT shared shell/overview and persona pages; never rewrite auth and navigation to match a mock |
| 13 Onboarding States | `pages/onboarding/**`, existing V2 nested onboarding and validations | ADAPT form shells/stepper; preserve verified phone, identity documents and conditional steps |
| 14 Pharmacy Management | `pages/dashboard/sidebar/owner/**`, `PharmacyPage.tsx`, `ChainPage.tsx`, admin/organisation route modules | ADAPT directory/edit/claim/membership UI, preserve membership and pharmacy scope |
| 15 Finance States | `pages/dashboard/sidebar/Invoices/**`, finance routing and shared-core APIs | ADAPT invoicing UI while preserving issuer/recipient persona, payment authority and BAS data |
| 16 Workflow States | `components/roster/**`, `features/workforce/**`, `pages/dashboard/sidebar/{RosterOwnerPage,PostShiftPage,...}`, attendance/hub/chat pages | ADAPT actual workflow controls; never create routes from Figma `source:` labels |

## Current implementation evidence and outstanding work

- **Implemented in PR #156:** shared overview action/metric/upcoming/activity components and adoption in OwnerOverviewHome and DashboardOverviewTemplate. Still require browser screenshot, typecheck and multi-persona regression evidence.
- **Concurrent PR #155:** modifies first-look dashboard and shell; reconcile exact source before merging. Keep its working search/sidebar/pharmacy selector, data policies and real roles.
- **Not yet implemented/tested:** many other page families below. Default decision ADAPT is a review instruction, not a completion label.

## 11 — Web · Access & Shared (15 design frames)

### CT Area · 01 · Authentication

| Figma node | Actual design frame / route-state label | Decision | Reason / guardrail |
| --- | --- | --- | --- |
| `16:34284` | Access / Login · /login | **KEEP / scope boundary** | Next public/auth bridge, or shared kiosk. Do not duplicate its route in Vite. |
| `16:34310` | Access / Create Account · /register | **KEEP / scope boundary** | Next public/auth bridge, or shared kiosk. Do not duplicate its route in Vite. |

### CT Area · 02 · Verification & Recovery

| Figma node | Actual design frame / route-state label | Decision | Reason / guardrail |
| --- | --- | --- | --- |
| `16:34351` | Access / Email Verification · /otp-verify | **KEEP / scope boundary** | Next public/auth bridge, or shared kiosk. Do not duplicate its route in Vite. |
| `16:34376` | Access / Mobile Verification · /mobile-verify | **KEEP / scope boundary** | Next public/auth bridge, or shared kiosk. Do not duplicate its route in Vite. |
| `16:34411` | Access / Reset Your Password · /password-reset | **KEEP / scope boundary** | Next public/auth bridge, or shared kiosk. Do not duplicate its route in Vite. |
| `16:34432` | Access / Set a New Password · /reset-password/:uid/:token | **KEEP / scope boundary** | Next public/auth bridge, or shared kiosk. Do not duplicate its route in Vite. |
| `16:34456` | Access / Mobile Checkout Return · /mobile-checkout-return | **KEEP / scope boundary** | Next public/auth bridge, or shared kiosk. Do not duplicate its route in Vite. |

### CT Area · 03 · Shared Opportunities & Public Access

| Figma node | Actual design frame / route-state label | Decision | Reason / guardrail |
| --- | --- | --- | --- |
| `16:34497` | Access / Shared Shift Opportunity · /shifts/link?id=:id | **KEEP / scope boundary** | Next public/auth bridge, or shared kiosk. Do not duplicate its route in Vite. |
| `16:34537` | Access / Public Organisation · /organization/:slug | **KEEP / scope boundary** | Next public/auth bridge, or shared kiosk. Do not duplicate its route in Vite. |
| `16:34565` | Access / Join This Pharmacy · /membership/apply/:token | **KEEP / scope boundary** | Next public/auth bridge, or shared kiosk. Do not duplicate its route in Vite. |

### CT Area · 04 · References, Attendance & System

| Figma node | Actual design frame / route-state label | Decision | Reason / guardrail |
| --- | --- | --- | --- |
| `16:34477` | Access / Account Deletion · /account-deletion | **KEEP / scope boundary** | Next public/auth bridge, or shared kiosk. Do not duplicate its route in Vite. |
| `16:34670` | Access / Reference Declined · /onboarding/referee-reject/:pk/:refIndex | **KEEP / scope boundary** | Next public/auth bridge, or shared kiosk. Do not duplicate its route in Vite. |
| `16:34697` | Shared / Attendance Kiosk · /kiosk | **KEEP / scope boundary** | Next public/auth bridge, or shared kiosk. Do not duplicate its route in Vite. |
| `16:34737` | Access / Page Not Found · * | **KEEP / scope boundary** | Next public/auth bridge, or shared kiosk. Do not duplicate its route in Vite. |
| `16:34611` | Access / Reference Questionnaire · /referee/questionnaire/:token | **KEEP / scope boundary** | Next public/auth bridge, or shared kiosk. Do not duplicate its route in Vite. |

## 12 — Web · Authenticated (144 design frames)

### CT Area · 01 · Owner workspace

| Figma node | Actual design frame / route-state label | Decision | Reason / guardrail |
| --- | --- | --- | --- |
| `15:3049` | Owner / Overview · /dashboard/owner/overview | **ADAPT** | Use shared React overview primitives; preserve persona-specific API/permissions. |
| `15:3203` | Owner / Pills · /dashboard/owner/pills | **ADAPT** | Keep existing React component, hooks, URL and business state; refine its UI. |
| `15:3297` | Owner / Profile · /dashboard/owner/onboarding | **ADAPT** | Keep existing React component, hooks, URL and business state; refine its UI. |
| `15:3399` | Owner / Manage Pharmacies · /dashboard/owner/manage-pharmacies | **ADAPT** | Keep existing React component, hooks, URL and business state; refine its UI. |
| `15:3520` | Owner / My Pharmacy · /dashboard/owner/manage-pharmacies/my-pharmacies | **ADAPT** | Keep existing React component, hooks, URL and business state; refine its UI. |
| `15:3641` | Owner / My Chain · /dashboard/owner/manage-pharmacies/my-chain | **ADAPT** | Keep existing React component, hooks, URL and business state; refine its UI. |
| `15:3731` | Owner / Internal Roster · /dashboard/owner/manage-pharmacies/roster | **ADAPT** | Keep existing React component, hooks, URL and business state; refine its UI. |
| `15:3881` | Owner / Attendance Approvals · /dashboard/owner/manage-pharmacies/attendance-reviews | **ADAPT** | Keep existing React component, hooks, URL and business state; refine its UI. |
| `15:3999` | Owner / Attendance Approvals · /dashboard/owner/attendance-reviews | **ADAPT** | Keep existing React component, hooks, URL and business state; refine its UI. |
| `15:4117` | Owner / My Attendance · /dashboard/owner/attendance | **ADAPT** | Keep existing React component, hooks, URL and business state; refine its UI. |
| `15:4217` | Owner / Post Shift · /dashboard/owner/post-shift | **ADAPT** | Keep existing React component, hooks, URL and business state; refine its UI. |
| `15:4343` | Owner / Active Shifts · /dashboard/owner/shift-center/active | **ADAPT** | Keep existing React component, hooks, URL and business state; refine its UI. |
| `15:4450` | Owner / Confirmed Shifts · /dashboard/owner/shift-center/confirmed | **ADAPT** | Keep existing React component, hooks, URL and business state; refine its UI. |
| `15:4557` | Owner / Shift History · /dashboard/owner/shift-center/history | **ADAPT** | Keep existing React component, hooks, URL and business state; refine its UI. |
| `15:4664` | Owner / Received invoices · /dashboard/owner/invoice | **ADAPT** | Keep existing React component, hooks, URL and business state; refine its UI. |
| `15:4771` | Owner / Invoices · /dashboard/owner/invoice/new | **ADAPT + AUTHORITY** | Preserve issuer/recipient persona scoping, existing API and invoice route guards. |
| `15:4903` | Owner / Invoices · /dashboard/owner/invoice/:id | **ADAPT + AUTHORITY** | Preserve issuer/recipient persona scoping, existing API and invoice route guards. |
| `15:5017` | Owner / Public Shifts · /dashboard/owner/shifts | **ADAPT** | Keep existing React component, hooks, URL and business state; refine its UI. |
| `15:5131` | Owner / Public Shifts · /dashboard/owner/shifts/public | **ADAPT** | Keep existing React component, hooks, URL and business state; refine its UI. |
| `15:5245` | Owner / Community Shifts · /dashboard/owner/shifts/community | **ADAPT** | Keep existing React component, hooks, URL and business state; refine its UI. |
| `15:5359` | Owner / Active Shift Candidates · /dashboard/owner/shifts/active | **ADAPT** | Keep existing React component, hooks, URL and business state; refine its UI. |
| `15:5473` | Owner / Confirmed Shifts · /dashboard/owner/shifts/confirmed | **ADAPT** | Keep existing React component, hooks, URL and business state; refine its UI. |
| `15:5587` | Owner / Shift History · /dashboard/owner/shifts/history | **ADAPT** | Keep existing React component, hooks, URL and business state; refine its UI. |
| `15:5701` | Owner / Shift Detail · /dashboard/owner/shifts/:id | **ADAPT** | Keep current shift state/capability and canonical route; use Figma for content hierarchy. |
| `15:5823` | Owner / Talent Hub · /dashboard/owner/interests | **ADAPT** | Keep existing React component, hooks, URL and business state; refine its UI. |
| `15:5946` | Owner / Learning Materials · /dashboard/owner/learning | **ADAPT** | Keep existing React component, hooks, URL and business state; refine its UI. |
| `15:6044` | Owner / Chat · /dashboard/owner/chat | **ADAPT** | Keep existing React component, hooks, URL and business state; refine its UI. |
| `15:6156` | Owner / Calendar · /dashboard/owner/calendar | **ADAPT** | Keep existing React component, hooks, URL and business state; refine its UI. |
| `15:6349` | Owner / Logout · /dashboard/owner/logout | **KEEP** | Preserve established logout/auth security; design only for presentation if needed. |

### CT Area · 02 · Organisation workspace

| Figma node | Actual design frame / route-state label | Decision | Reason / guardrail |
| --- | --- | --- | --- |
| `15:6426` | Organisation / Overview · /dashboard/organization/overview | **ADAPT** | Use shared React overview primitives; preserve persona-specific API/permissions. |
| `15:6577` | Organisation / Pills · /dashboard/organization/pills | **ADAPT** | Keep existing React component, hooks, URL and business state; refine its UI. |
| `15:6668` | Organisation / Invite Staff · /dashboard/organization/invite | **ADAPT** | Keep existing React component, hooks, URL and business state; refine its UI. |
| `15:6768` | Organisation / Manage Pharmacies · /dashboard/organization/manage-pharmacies | **ADAPT** | Keep existing React component, hooks, URL and business state; refine its UI. |
| `15:6886` | Organisation / My Pharmacies · /dashboard/organization/manage-pharmacies/my-pharmacies | **ADAPT** | Keep existing React component, hooks, URL and business state; refine its UI. |
| `15:7004` | Organisation / My Chain · /dashboard/organization/manage-pharmacies/my-chain | **ADAPT** | Keep existing React component, hooks, URL and business state; refine its UI. |
| `15:7091` | Organisation / Internal Roster · /dashboard/organization/manage-pharmacies/roster | **ADAPT** | Keep existing React component, hooks, URL and business state; refine its UI. |
| `15:7238` | Organisation / Attendance Approvals · /dashboard/organization/manage-pharmacies/attendance-reviews | **ADAPT** | Keep existing React component, hooks, URL and business state; refine its UI. |
| `15:7353` | Organisation / Attendance Approvals · /dashboard/organization/attendance-reviews | **ADAPT** | Keep existing React component, hooks, URL and business state; refine its UI. |
| `15:7468` | Organisation / Post Shift · /dashboard/organization/post-shift | **ADAPT** | Keep existing React component, hooks, URL and business state; refine its UI. |
| `15:7591` | Organisation / Active Shifts · /dashboard/organization/shift-center/active | **ADAPT** | Keep existing React component, hooks, URL and business state; refine its UI. |
| `15:7695` | Organisation / Confirmed Shifts · /dashboard/organization/shift-center/confirmed | **ADAPT** | Keep existing React component, hooks, URL and business state; refine its UI. |
| `15:7799` | Organisation / Shift History · /dashboard/organization/shift-center/history | **ADAPT** | Keep existing React component, hooks, URL and business state; refine its UI. |
| `15:7903` | Organisation / Invoices · /dashboard/organization/invoice | **ADAPT + AUTHORITY** | Preserve issuer/recipient persona scoping, existing API and invoice route guards. |
| `15:8046` | Organisation / Invoices · /dashboard/organization/invoice/new | **ADAPT + AUTHORITY** | Preserve issuer/recipient persona scoping, existing API and invoice route guards. |
| `15:8175` | Organisation / Invoices · /dashboard/organization/invoice/:id | **ADAPT + AUTHORITY** | Preserve issuer/recipient persona scoping, existing API and invoice route guards. |
| `15:8286` | Organisation / Public Shifts · /dashboard/organization/shifts | **ADAPT** | Keep existing React component, hooks, URL and business state; refine its UI. |
| `15:8397` | Organisation / Public Shifts · /dashboard/organization/shifts/public | **ADAPT** | Keep existing React component, hooks, URL and business state; refine its UI. |
| `15:8508` | Organisation / Community Shifts · /dashboard/organization/shifts/community | **ADAPT** | Keep existing React component, hooks, URL and business state; refine its UI. |
| `15:8619` | Organisation / Active Shift Candidates · /dashboard/organization/shifts/active | **ADAPT** | Keep existing React component, hooks, URL and business state; refine its UI. |
| `15:8730` | Organisation / Confirmed Shifts · /dashboard/organization/shifts/confirmed | **ADAPT** | Keep existing React component, hooks, URL and business state; refine its UI. |
| `15:8841` | Organisation / Shift History · /dashboard/organization/shifts/history | **ADAPT** | Keep existing React component, hooks, URL and business state; refine its UI. |
| `15:8952` | Organisation / Shift Detail · /dashboard/organization/shifts/:id | **ADAPT** | Keep current shift state/capability and canonical route; use Figma for content hierarchy. |
| `15:9071` | Organisation / Talent Hub · /dashboard/organization/interests | **ADAPT** | Keep existing React component, hooks, URL and business state; refine its UI. |
| `15:9191` | Organisation / Learning Materials · /dashboard/organization/learning | **ADAPT** | Keep existing React component, hooks, URL and business state; refine its UI. |
| `15:9286` | Organisation / Chat · /dashboard/organization/chat | **ADAPT** | Keep existing React component, hooks, URL and business state; refine its UI. |
| `15:9395` | Organisation / Calendar · /dashboard/organization/calendar | **ADAPT** | Keep existing React component, hooks, URL and business state; refine its UI. |
| `15:9585` | Organisation / Logout · /dashboard/organization/logout | **KEEP** | Preserve established logout/auth security; design only for presentation if needed. |

### CT Area · 03 · Admin workspace

| Figma node | Actual design frame / route-state label | Decision | Reason / guardrail |
| --- | --- | --- | --- |
| `15:9659` | Admin / Overview · /dashboard/admin/:pharmacyId/overview | **ADAPT** | Use shared React overview primitives; preserve persona-specific API/permissions. |
| `15:9798` | Admin / Pills · /dashboard/admin/:pharmacyId/pills | **ADAPT** | Keep existing React component, hooks, URL and business state; refine its UI. |
| `15:9877` | Admin / Manage Pharmacy · /dashboard/admin/:pharmacyId/manage-pharmacies | **ADAPT** | Keep existing React component, hooks, URL and business state; refine its UI. |
| `15:9983` | Admin / My Pharmacy · /dashboard/admin/:pharmacyId/manage-pharmacies/my-pharmacies | **ADAPT** | Keep existing React component, hooks, URL and business state; refine its UI. |
| `15:10089` | Admin / Internal Roster · /dashboard/admin/:pharmacyId/manage-pharmacies/roster | **ADAPT** | Keep existing React component, hooks, URL and business state; refine its UI. |
| `15:10224` | Admin / Attendance Approvals · /dashboard/admin/:pharmacyId/attendance-reviews | **ADAPT** | Keep existing React component, hooks, URL and business state; refine its UI. |
| `15:10327` | Admin / Post Shift · /dashboard/admin/:pharmacyId/post-shift | **ADAPT** | Keep existing React component, hooks, URL and business state; refine its UI. |
| `15:10438` | Admin / Active Shifts · /dashboard/admin/:pharmacyId/shift-center/active | **ADAPT** | Keep existing React component, hooks, URL and business state; refine its UI. |
| `15:10530` | Admin / Confirmed Shifts · /dashboard/admin/:pharmacyId/shift-center/confirmed | **ADAPT** | Keep existing React component, hooks, URL and business state; refine its UI. |
| `15:10622` | Admin / Shift History · /dashboard/admin/:pharmacyId/shift-center/history | **ADAPT** | Keep existing React component, hooks, URL and business state; refine its UI. |
| `15:10714` | Admin / Invoices · /dashboard/admin/:pharmacyId/invoice | **ADAPT + AUTHORITY** | Preserve issuer/recipient persona scoping, existing API and invoice route guards. |
| `15:10845` | Admin / Invoices · /dashboard/admin/:pharmacyId/invoice/new | **ADAPT + AUTHORITY** | Preserve issuer/recipient persona scoping, existing API and invoice route guards. |
| `15:10962` | Admin / Invoices · /dashboard/admin/:pharmacyId/invoice/:id | **ADAPT + AUTHORITY** | Preserve issuer/recipient persona scoping, existing API and invoice route guards. |
| `15:11061` | Admin / Active Shift Candidates · /dashboard/admin/:pharmacyId/shifts | **ADAPT** | Keep existing React component, hooks, URL and business state; refine its UI. |
| `15:11160` | Admin / Active Shift Candidates · /dashboard/admin/:pharmacyId/shifts/active | **ADAPT** | Keep existing React component, hooks, URL and business state; refine its UI. |
| `15:11259` | Admin / Confirmed Shifts · /dashboard/admin/:pharmacyId/shifts/confirmed | **ADAPT** | Keep existing React component, hooks, URL and business state; refine its UI. |
| `15:11358` | Admin / Shift History · /dashboard/admin/:pharmacyId/shifts/history | **ADAPT** | Keep existing React component, hooks, URL and business state; refine its UI. |
| `15:11457` | Admin / Shift Detail · /dashboard/admin/:pharmacyId/shifts/:id | **ADAPT** | Keep current shift state/capability and canonical route; use Figma for content hierarchy. |
| `15:11564` | Admin / Chat · /dashboard/admin/:pharmacyId/chat | **ADAPT** | Keep existing React component, hooks, URL and business state; refine its UI. |
| `15:11661` | Admin / Calendar · /dashboard/admin/:pharmacyId/calendar | **ADAPT** | Keep existing React component, hooks, URL and business state; refine its UI. |
| `15:11839` | Admin / Logout · /dashboard/admin/:pharmacyId/logout | **KEEP** | Preserve established logout/auth security; design only for presentation if needed. |

### CT Area · 04 · Pharmacist workspace

| Figma node | Actual design frame / route-state label | Decision | Reason / guardrail |
| --- | --- | --- | --- |
| `15:11901` | Pharmacist / Overview · /dashboard/pharmacist/overview | **ADAPT** | Use shared React overview primitives; preserve persona-specific API/permissions. |
| `15:12055` | Pharmacist / Profile · /dashboard/pharmacist/onboarding | **ADAPT** | Keep existing React component, hooks, URL and business state; refine its UI. |
| `15:12164` | Pharmacist / Public Shifts · /dashboard/pharmacist/shifts | **ADAPT** | Keep existing React component, hooks, URL and business state; refine its UI. |
| `15:12278` | Pharmacist / Public Shifts · /dashboard/pharmacist/shifts/public | **ADAPT** | Keep existing React component, hooks, URL and business state; refine its UI. |
| `15:12392` | Pharmacist / Community Shifts · /dashboard/pharmacist/shifts/community | **ADAPT** | Keep existing React component, hooks, URL and business state; refine its UI. |
| `15:12506` | Pharmacist / Confirmed Shifts · /dashboard/pharmacist/shifts/confirmed | **ADAPT** | Keep existing React component, hooks, URL and business state; refine its UI. |
| `15:12620` | Pharmacist / Shift History · /dashboard/pharmacist/shifts/history | **ADAPT** | Keep existing React component, hooks, URL and business state; refine its UI. |
| `15:12734` | Pharmacist / Shift Detail · /dashboard/pharmacist/shifts/:id | **ADAPT** | Keep current shift state/capability and canonical route; use Figma for content hierarchy. |
| `15:12849` | Pharmacist / My Roster · /dashboard/pharmacist/shifts/roster | **ADAPT** | Keep existing React component, hooks, URL and business state; refine its UI. |
| `15:12963` | Pharmacist / My Attendance · /dashboard/pharmacist/attendance | **ADAPT** | Keep existing React component, hooks, URL and business state; refine its UI. |
| `15:13063` | Pharmacist / Set Availability · /dashboard/pharmacist/availability | **ADAPT** | Keep existing React component, hooks, URL and business state; refine its UI. |
| `15:13194` | Pharmacist / Manage Memberships · /dashboard/pharmacist/memberships | **ADAPT** | Keep existing React component, hooks, URL and business state; refine its UI. |
| `15:13299` | Pharmacist / Invoices · /dashboard/pharmacist/invoice | **ADAPT + AUTHORITY** | Preserve issuer/recipient persona scoping, existing API and invoice route guards. |
| `15:13445` | Pharmacist / Invoices · /dashboard/pharmacist/invoice/new | **ADAPT + AUTHORITY** | Preserve issuer/recipient persona scoping, existing API and invoice route guards. |
| `15:13577` | Pharmacist / Invoices · /dashboard/pharmacist/invoice/:id | **ADAPT + AUTHORITY** | Preserve issuer/recipient persona scoping, existing API and invoice route guards. |
| `15:13691` | Pharmacist / Publish Availability · /dashboard/pharmacist/interests?publish_availability=1 | **ADAPT** | Keep existing React component, hooks, URL and business state; refine its UI. |
| `15:13822` | Pharmacist / Talent Hub · /dashboard/pharmacist/interests | **ADAPT** | Keep existing React component, hooks, URL and business state; refine its UI. |
| `15:13945` | Pharmacist / Learning Materials · /dashboard/pharmacist/learning | **ADAPT** | Keep existing React component, hooks, URL and business state; refine its UI. |
| `15:14043` | Pharmacist / Chat · /dashboard/pharmacist/chat | **ADAPT** | Keep existing React component, hooks, URL and business state; refine its UI. |
| `15:14155` | Pharmacist / Calendar · /dashboard/pharmacist/calendar | **ADAPT** | Keep existing React component, hooks, URL and business state; refine its UI. |
| `15:14348` | Pharmacist / Logout · /dashboard/pharmacist/logout | **KEEP** | Preserve established logout/auth security; design only for presentation if needed. |

### CT Area · 05 · Other Staff workspace

| Figma node | Actual design frame / route-state label | Decision | Reason / guardrail |
| --- | --- | --- | --- |
| `15:14425` | Other Staff / Overview · /dashboard/otherstaff/overview | **ADAPT** | Use shared React overview primitives; preserve persona-specific API/permissions. |
| `15:14579` | Other Staff / Profile · /dashboard/otherstaff/onboarding | **ADAPT** | Keep existing React component, hooks, URL and business state; refine its UI. |
| `15:14688` | Other Staff / Public Shifts · /dashboard/otherstaff/shifts | **ADAPT** | Keep existing React component, hooks, URL and business state; refine its UI. |
| `15:14802` | Other Staff / Public Shifts · /dashboard/otherstaff/shifts/public | **ADAPT** | Keep existing React component, hooks, URL and business state; refine its UI. |
| `15:14916` | Other Staff / Community Shifts · /dashboard/otherstaff/shifts/community | **ADAPT** | Keep existing React component, hooks, URL and business state; refine its UI. |
| `15:15030` | Other Staff / Confirmed Shifts · /dashboard/otherstaff/shifts/confirmed | **ADAPT** | Keep existing React component, hooks, URL and business state; refine its UI. |
| `15:15144` | Other Staff / Shift History · /dashboard/otherstaff/shifts/history | **ADAPT** | Keep existing React component, hooks, URL and business state; refine its UI. |
| `15:15258` | Other Staff / Shift Detail · /dashboard/otherstaff/shifts/:id | **ADAPT** | Keep current shift state/capability and canonical route; use Figma for content hierarchy. |
| `15:15373` | Other Staff / My Roster · /dashboard/otherstaff/shifts/roster | **ADAPT** | Keep existing React component, hooks, URL and business state; refine its UI. |
| `15:15487` | Other Staff / My Attendance · /dashboard/otherstaff/attendance | **ADAPT** | Keep existing React component, hooks, URL and business state; refine its UI. |
| `15:15587` | Other Staff / Set Availability · /dashboard/otherstaff/availability | **ADAPT** | Keep existing React component, hooks, URL and business state; refine its UI. |
| `15:15718` | Other Staff / Manage Memberships · /dashboard/otherstaff/memberships | **ADAPT** | Keep existing React component, hooks, URL and business state; refine its UI. |
| `15:15823` | Other Staff / Invoices · /dashboard/otherstaff/invoice | **ADAPT + AUTHORITY** | Preserve issuer/recipient persona scoping, existing API and invoice route guards. |
| `15:15969` | Other Staff / Invoices · /dashboard/otherstaff/invoice/new | **ADAPT + AUTHORITY** | Preserve issuer/recipient persona scoping, existing API and invoice route guards. |
| `15:16101` | Other Staff / Invoices · /dashboard/otherstaff/invoice/:id | **ADAPT + AUTHORITY** | Preserve issuer/recipient persona scoping, existing API and invoice route guards. |
| `15:16215` | Other Staff / Publish Availability · /dashboard/otherstaff/interests?publish_availability=1 | **ADAPT** | Keep existing React component, hooks, URL and business state; refine its UI. |
| `15:16346` | Other Staff / Talent Hub · /dashboard/otherstaff/interests | **ADAPT** | Keep existing React component, hooks, URL and business state; refine its UI. |
| `15:16469` | Other Staff / Learning Materials · /dashboard/otherstaff/learning | **ADAPT** | Keep existing React component, hooks, URL and business state; refine its UI. |
| `15:16567` | Other Staff / Chat · /dashboard/otherstaff/chat | **ADAPT** | Keep existing React component, hooks, URL and business state; refine its UI. |
| `15:16679` | Other Staff / Calendar · /dashboard/otherstaff/calendar | **ADAPT** | Keep existing React component, hooks, URL and business state; refine its UI. |
| `15:16872` | Other Staff / Logout · /dashboard/otherstaff/logout | **KEEP** | Preserve established logout/auth security; design only for presentation if needed. |

### CT Area · 06 · Explorer workspace

| Figma node | Actual design frame / route-state label | Decision | Reason / guardrail |
| --- | --- | --- | --- |
| `15:16949` | Explorer / Overview · /dashboard/explorer/overview | **ADAPT** | Use shared React overview primitives; preserve persona-specific API/permissions. |
| `15:17067` | Explorer / Profile · /dashboard/explorer/onboarding | **KEEP + VERIFY** | Explorer permission/route restrictions override any illustrative Figma action. |
| `15:17140` | Explorer / Public Shifts · /dashboard/explorer/shifts | **KEEP + VERIFY** | Explorer permission/route restrictions override any illustrative Figma action. |
| `15:17218` | Explorer / Public Shifts · /dashboard/explorer/shifts/public | **KEEP + VERIFY** | Explorer permission/route restrictions override any illustrative Figma action. |
| `15:17296` | Explorer / Community Shifts · /dashboard/explorer/shifts/community | **KEEP + VERIFY** | Explorer permission/route restrictions override any illustrative Figma action. |
| `15:17374` | Explorer / Talent Hub · /dashboard/explorer/interests | **KEEP + VERIFY** | Explorer permission/route restrictions override any illustrative Figma action. |
| `15:17461` | Explorer / Learning Materials · /dashboard/explorer/learning | **KEEP + VERIFY** | Explorer permission/route restrictions override any illustrative Figma action. |
| `15:17523` | Explorer / Chat · /dashboard/explorer/chat | **KEEP + VERIFY** | Explorer permission/route restrictions override any illustrative Figma action. |
| `15:17599` | Explorer / Calendar · /dashboard/explorer/calendar | **KEEP + VERIFY** | Explorer permission/route restrictions override any illustrative Figma action. |
| `15:17756` | Explorer / Logout · /dashboard/explorer/logout | **KEEP** | Preserve established logout/auth security; design only for presentation if needed. |

### CT Area · 07 · Shared & Setup

| Figma node | Actual design frame / route-state label | Decision | Reason / guardrail |
| --- | --- | --- | --- |
| `15:17797` | Shared & setup routes / Pharmacy Hub · /dashboard/pharmacy-hub | **ADAPT** | Keep existing React component, hooks, URL and business state; refine its UI. |
| `15:17864` | Shared & setup routes / My Attendance · /dashboard/attendance | **ADAPT** | Keep existing React component, hooks, URL and business state; refine its UI. |
| `15:17922` | Shared & setup routes / Attendance Approvals · /dashboard/attendance/reviews | **ADAPT** | Keep existing React component, hooks, URL and business state; refine its UI. |
| `15:17998` | Shared & setup routes / Timesheets · /dashboard/workforce/timesheets | **ADAPT** | Keep existing React component, hooks, URL and business state; refine its UI. |
| `15:18093` | Shared & setup routes / Manager Leave · /dashboard/workforce/leave | **ADAPT** | Keep existing React component, hooks, URL and business state; refine its UI. |
| `15:18165` | Shared & setup routes / Workforce & Payroll · /dashboard/workforce/settings | **ADAPT** | Keep existing React component, hooks, URL and business state; refine its UI. |
| `15:18238` | Shared & setup routes / My Hours · /dashboard/my-hours | **ADAPT** | Keep existing React component, hooks, URL and business state; refine its UI. |
| `15:18315` | Shared & setup routes / My Leave · /dashboard/my-leave | **ADAPT** | Keep existing React component, hooks, URL and business state; refine its UI. |
| `15:18377` | Shared & setup routes / Owner Onboarding · /onboarding/owner | **ADAPT** | Keep existing React component, hooks, URL and business state; refine its UI. |
| `15:18504` | Shared & setup routes / Pharmacist Onboarding · /onboarding/pharmacist | **ADAPT** | Keep existing React component, hooks, URL and business state; refine its UI. |
| `15:18571` | Shared & setup routes / Other Staff Onboarding · /onboarding/otherstaff | **ADAPT** | Keep existing React component, hooks, URL and business state; refine its UI. |
| `15:18638` | Shared & setup routes / Explorer Onboarding · /onboarding/explorer | **KEEP + VERIFY** | Explorer permission/route restrictions override any illustrative Figma action. |
| `15:18444` | Setup / Owner Setup · Profile · /setup/owner/onboarding | **ADAPT** | Keep existing React component, hooks, URL and business state; refine its UI. |
| `15:18476` | Setup / Owner Setup · Pharmacies · /setup/owner/pharmacies | **ADAPT** | Keep existing React component, hooks, URL and business state; refine its UI. |

## 13 — Web · Onboarding States (21 design frames)

### CT Area · 01 · Pharmacist Onboarding

| Figma node | Actual design frame / route-state label | Decision | Reason / guardrail |
| --- | --- | --- | --- |
| `15:18709` | Pharmacist / Pharmacist Onboarding · Basic Info · /dashboard/pharmacist/onboarding?step=basic-info | **ADAPT STATE** | Figma ?step query is descriptive; do not overwrite real nested V2 onboarding route or validation. |
| `15:18844` | Pharmacist / Pharmacist Onboarding · Identity · /dashboard/pharmacist/onboarding?step=identity | **ADAPT STATE** | Figma ?step query is descriptive; do not overwrite real nested V2 onboarding route or validation. |
| `15:18962` | Pharmacist / Pharmacist Onboarding · Skills · /dashboard/pharmacist/onboarding?step=skills | **ADAPT STATE** | Figma ?step query is descriptive; do not overwrite real nested V2 onboarding route or validation. |
| `15:19078` | Pharmacist / Pharmacist Onboarding · Payment · /dashboard/pharmacist/onboarding?step=payment | **ADAPT STATE** | Figma ?step query is descriptive; do not overwrite real nested V2 onboarding route or validation. |
| `15:19195` | Pharmacist / Pharmacist Onboarding · Referees · /dashboard/pharmacist/onboarding?step=referees | **ADAPT STATE** | Figma ?step query is descriptive; do not overwrite real nested V2 onboarding route or validation. |
| `15:19319` | Pharmacist / Pharmacist Onboarding · Rate · /dashboard/pharmacist/onboarding?step=rate | **ADAPT STATE** | Figma ?step query is descriptive; do not overwrite real nested V2 onboarding route or validation. |
| `15:19430` | Pharmacist / Pharmacist Onboarding · Profile · /dashboard/pharmacist/onboarding?step=profile | **ADAPT STATE** | Figma ?step query is descriptive; do not overwrite real nested V2 onboarding route or validation. |

### CT Area · 02 · Other Staff Onboarding

| Figma node | Actual design frame / route-state label | Decision | Reason / guardrail |
| --- | --- | --- | --- |
| `15:19534` | Other Staff / Other Staff Onboarding · Basic Info · /dashboard/otherstaff/onboarding?step=basic-info | **ADAPT STATE** | Figma ?step query is descriptive; do not overwrite real nested V2 onboarding route or validation. |
| `15:19664` | Other Staff / Other Staff Onboarding · Identity · /dashboard/otherstaff/onboarding?step=identity | **ADAPT STATE** | Figma ?step query is descriptive; do not overwrite real nested V2 onboarding route or validation. |
| `15:19782` | Other Staff / Other Staff Onboarding · Regulatory Docs · /dashboard/otherstaff/onboarding?step=regulatory-docs | **ADAPT STATE** | Figma ?step query is descriptive; do not overwrite real nested V2 onboarding route or validation. |
| `15:19895` | Other Staff / Other Staff Onboarding · Skills · /dashboard/otherstaff/onboarding?step=skills | **ADAPT STATE** | Figma ?step query is descriptive; do not overwrite real nested V2 onboarding route or validation. |
| `15:20014` | Other Staff / Other Staff Onboarding · Payment · /dashboard/otherstaff/onboarding?step=payment | **ADAPT STATE** | Figma ?step query is descriptive; do not overwrite real nested V2 onboarding route or validation. |
| `15:20131` | Other Staff / Other Staff Onboarding · Referees · /dashboard/otherstaff/onboarding?step=referees | **ADAPT STATE** | Figma ?step query is descriptive; do not overwrite real nested V2 onboarding route or validation. |
| `15:20255` | Other Staff / Other Staff Onboarding · Profile · /dashboard/otherstaff/onboarding?step=profile | **ADAPT STATE** | Figma ?step query is descriptive; do not overwrite real nested V2 onboarding route or validation. |

### CT Area · 03 · Explorer Onboarding

| Figma node | Actual design frame / route-state label | Decision | Reason / guardrail |
| --- | --- | --- | --- |
| `15:20359` | Explorer / Explorer Onboarding · Basic Info · /dashboard/explorer/onboarding?step=basic-info | **ADAPT STATE** | Figma ?step query is descriptive; do not overwrite real nested V2 onboarding route or validation. |
| `15:20449` | Explorer / Explorer Onboarding · Identity · /dashboard/explorer/onboarding?step=identity | **ADAPT STATE** | Figma ?step query is descriptive; do not overwrite real nested V2 onboarding route or validation. |
| `15:20527` | Explorer / Explorer Onboarding · Interests · /dashboard/explorer/onboarding?step=interests | **ADAPT STATE** | Figma ?step query is descriptive; do not overwrite real nested V2 onboarding route or validation. |
| `15:20596` | Explorer / Explorer Onboarding · Referees · /dashboard/explorer/onboarding?step=referees | **ADAPT STATE** | Figma ?step query is descriptive; do not overwrite real nested V2 onboarding route or validation. |
| `15:20680` | Explorer / Explorer Onboarding · Profile · /dashboard/explorer/onboarding?step=profile | **ADAPT STATE** | Figma ?step query is descriptive; do not overwrite real nested V2 onboarding route or validation. |

### CT Area · 04 · Owner Onboarding

| Figma node | Actual design frame / route-state label | Decision | Reason / guardrail |
| --- | --- | --- | --- |
| `15:20744` | Owner / Owner Onboarding · Profile & Verification · /dashboard/owner/onboarding?step=profile-&-verification | **ADAPT STATE** | Figma ?step query is descriptive; do not overwrite real nested V2 onboarding route or validation. |
| `15:20850` | Owner / Owner Onboarding · Referral & Subscription · /dashboard/owner/onboarding?step=referral-&-subscription | **ADAPT STATE** | Figma ?step query is descriptive; do not overwrite real nested V2 onboarding route or validation. |

## 14 — Web · Pharmacy Management (10 design frames)

### CT Area · 01 · Pharmacy Directory & Profile

| Figma node | Actual design frame / route-state label | Decision | Reason / guardrail |
| --- | --- | --- | --- |
| `15:20950` | Owner / Pharmacy directory · /dashboard/owner/manage-pharmacies?state=directory | **ADAPT STATE** | Figma ?state query identifies a visual variant, not guaranteed production routing. |
| `15:21052` | Owner / Add pharmacy · /dashboard/owner/manage-pharmacies?state=add | **ADAPT STATE** | Figma ?state query identifies a visual variant, not guaranteed production routing. |
| `15:21152` | Owner / Pharmacy detail · /dashboard/owner/manage-pharmacies?state=detail | **ADAPT STATE** | Figma ?state query identifies a visual variant, not guaranteed production routing. |
| `15:21277` | Owner / Edit pharmacy · /dashboard/owner/manage-pharmacies?state=edit | **ADAPT STATE** | Figma ?state query identifies a visual variant, not guaranteed production routing. |

### CT Area · 02 · Memberships & Admins

| Figma node | Actual design frame / route-state label | Decision | Reason / guardrail |
| --- | --- | --- | --- |
| `15:21377` | Owner / Staff memberships · /dashboard/owner/manage-pharmacies?state=staff | **ADAPT STATE** | Figma ?state query identifies a visual variant, not guaranteed production routing. |
| `15:21477` | Owner / Locum memberships · /dashboard/owner/manage-pharmacies?state=locums | **ADAPT STATE** | Figma ?state query identifies a visual variant, not guaranteed production routing. |
| `15:21577` | Owner / Admin assignments · /dashboard/owner/manage-pharmacies?state=admins | **ADAPT STATE** | Figma ?state query identifies a visual variant, not guaranteed production routing. |

### CT Area · 03 · Claims & Chains

| Figma node | Actual design frame / route-state label | Decision | Reason / guardrail |
| --- | --- | --- | --- |
| `15:21671` | Owner / Pharmacy claim · /dashboard/owner/manage-pharmacies?state=claim | **ADAPT STATE** | Figma ?state query identifies a visual variant, not guaranteed production routing. |
| `15:21759` | Owner / Chain overview · /dashboard/owner/manage-pharmacies?state=chain | **ADAPT STATE** | Figma ?state query identifies a visual variant, not guaranteed production routing. |
| `15:21849` | Owner / Manage chain pharmacies · /dashboard/owner/manage-pharmacies?state=chainManage | **ADAPT STATE** | Figma ?state query identifies a visual variant, not guaranteed production routing. |

## 15 — Web · Finance States (16 design frames)

### CT Area · 01 · Invoices & Payments

| Figma node | Actual design frame / route-state label | Decision | Reason / guardrail |
| --- | --- | --- | --- |
| `15:21943` | Pharmacist / Invoices · /dashboard/pharmacist/invoice?tool=invoices | **ADAPT FINANCE** | Reuse existing invoice React workspace/components, preserve calculations, saved data and permissions. |
| `15:22089` | Pharmacist / Invoices · /dashboard/pharmacist/invoice?tool=invoicesOverdue | **ADAPT FINANCE** | Reuse existing invoice React workspace/components, preserve calculations, saved data and permissions. |
| `15:22235` | Owner / Received invoices · /dashboard/pharmacist/invoice?tool=received | **CORRECT LABEL / KEEP AUTHORITY** | Figma owner label uses pharmacist invoice URL. Do NOT grant/change billing access. Keep persona-aware invoice issuer/recipient rules. |
| `15:23139` | Pharmacist / Invoices · /dashboard/pharmacist/invoice?tool=invoiceComposerA | **ADAPT FINANCE** | Reuse existing invoice React workspace/components, preserve calculations, saved data and permissions. |
| `15:23271` | Pharmacist / Invoices · /dashboard/pharmacist/invoice?tool=invoiceComposerB | **ADAPT FINANCE** | Reuse existing invoice React workspace/components, preserve calculations, saved data and permissions. |
| `15:23399` | Pharmacist / Invoices · /dashboard/pharmacist/invoice?tool=invoiceComposerC | **ADAPT FINANCE** | Reuse existing invoice React workspace/components, preserve calculations, saved data and permissions. |
| `15:23517` | Pharmacist / Invoices · /dashboard/pharmacist/invoice?tool=revisionHistory | **ADAPT FINANCE** | Reuse existing invoice React workspace/components, preserve calculations, saved data and permissions. |
| `15:23618` | Owner / Invoices · /dashboard/pharmacist/invoice?tool=requestRevision | **CORRECT LABEL / KEEP AUTHORITY** | Figma owner label uses pharmacist invoice URL. Do NOT grant/change billing access. Keep persona-aware invoice issuer/recipient rules. |
| `15:23708` | Pharmacist / Invoices · /dashboard/pharmacist/invoice?tool=paymentEditor | **ADAPT FINANCE** | Reuse existing invoice React workspace/components, preserve calculations, saved data and permissions. |

### CT Area · 02 · Customers & Reusable Items

| Figma node | Actual design frame / route-state label | Decision | Reason / guardrail |
| --- | --- | --- | --- |
| `15:22342` | Pharmacist / Customers & stores · /dashboard/pharmacist/invoice?tool=customers | **ADAPT FINANCE** | Reuse existing invoice React workspace/components, preserve calculations, saved data and permissions. |
| `15:22456` | Pharmacist / Customers & stores · /dashboard/pharmacist/invoice?tool=customerEditor | **ADAPT FINANCE** | Reuse existing invoice React workspace/components, preserve calculations, saved data and permissions. |
| `15:22571` | Pharmacist / Saved items · /dashboard/pharmacist/invoice?tool=items | **ADAPT FINANCE** | Reuse existing invoice React workspace/components, preserve calculations, saved data and permissions. |
| `15:22687` | Pharmacist / Saved items · /dashboard/pharmacist/invoice?tool=itemEditor | **ADAPT FINANCE** | Reuse existing invoice React workspace/components, preserve calculations, saved data and permissions. |

### CT Area · 03 · Expenses, Receipts & BAS

| Figma node | Actual design frame / route-state label | Decision | Reason / guardrail |
| --- | --- | --- | --- |
| `15:22794` | Pharmacist / Expenses & receipts · /dashboard/pharmacist/invoice?tool=expenses | **ADAPT FINANCE** | Reuse existing invoice React workspace/components, preserve calculations, saved data and permissions. |
| `15:22908` | Pharmacist / Expenses & receipts · /dashboard/pharmacist/invoice?tool=expenseEditor | **ADAPT FINANCE** | Reuse existing invoice React workspace/components, preserve calculations, saved data and permissions. |
| `15:23022` | Pharmacist / GST · BAS workspace · /dashboard/pharmacist/invoice?tool=bas | **ADAPT FINANCE** | Reuse existing invoice React workspace/components, preserve calculations, saved data and permissions. |

## 16 — Web · Workflow States (26 design frames)

### CT Area · 01 · Roster Management

| Figma node | Actual design frame / route-state label | Decision | Reason / guardrail |
| --- | --- | --- | --- |
| `15:23812` | Owner / Roster · Staff view · source:rosterStaff | **ADAPT WORKFLOW** | source: label denotes an in-page state, not an endpoint; preserve working workflow and validation. |
| `15:23958` | Owner / Roster · Calendar view · source:rosterCalendar | **ADAPT WORKFLOW** | source: label denotes an in-page state, not an endpoint; preserve working workflow and validation. |
| `15:24104` | Owner / Roster · Stacked view · source:rosterStacked | **ADAPT WORKFLOW** | source: label denotes an in-page state, not an endpoint; preserve working workflow and validation. |
| `15:24250` | Owner / Roster · Add shift · source:rosterAdd | **ADAPT WORKFLOW** | source: label denotes an in-page state, not an endpoint; preserve working workflow and validation. |
| `15:24347` | Owner / Roster · Edit shift · source:rosterEdit | **ADAPT WORKFLOW** | source: label denotes an in-page state, not an endpoint; preserve working workflow and validation. |
| `15:24444` | Owner / Roster · Cover request · source:rosterCover | **ADAPT WORKFLOW** | source: label denotes an in-page state, not an endpoint; preserve working workflow and validation. |
| `15:24528` | Owner / Roster · Escalate open shift · source:rosterEscalate | **ADAPT WORKFLOW** | source: label denotes an in-page state, not an endpoint; preserve working workflow and validation. |
| `15:24617` | Owner / Roster · Publish validation · source:rosterPublish | **ADAPT WORKFLOW** | source: label denotes an in-page state, not an endpoint; preserve working workflow and validation. |

### CT Area · 02 · Attendance Management

| Figma node | Actual design frame / route-state label | Decision | Reason / guardrail |
| --- | --- | --- | --- |
| `15:24701` | Owner / Attendance · Worker active shift · source:attendanceActive | **ADAPT WORKFLOW** | source: label denotes an in-page state, not an endpoint; preserve working workflow and validation. |
| `15:24790` | Owner / Attendance · Worker off shift · source:attendanceOff | **ADAPT WORKFLOW** | source: label denotes an in-page state, not an endpoint; preserve working workflow and validation. |
| `15:25025` | Owner / Attendance · Approve provisional shift · source:attendanceApprove | **ADAPT WORKFLOW** | source: label denotes an in-page state, not an endpoint; preserve working workflow and validation. |
| `15:25107` | Owner / Attendance · Reject provisional shift · source:attendanceReject | **ADAPT WORKFLOW** | source: label denotes an in-page state, not an endpoint; preserve working workflow and validation. |
| `15:25189` | Owner / Attendance · Timeline correction · source:attendanceTimeline | **ADAPT WORKFLOW** | source: label denotes an in-page state, not an endpoint; preserve working workflow and validation. |
| `15:24949` | Shared / Attendance Approvals · /dashboard/attendance/reviews | **ADAPT WORKFLOW** | source: label denotes an in-page state, not an endpoint; preserve working workflow and validation. |

### CT Area · 03 · Shift Posting & Escalation

| Figma node | Actual design frame / route-state label | Decision | Reason / guardrail |
| --- | --- | --- | --- |
| `15:25296` | Owner / Post Shift · Details · source:postDetails | **ADAPT WORKFLOW** | source: label denotes an in-page state, not an endpoint; preserve working workflow and validation. |
| `15:25398` | Owner / Post Shift · Visibility & escalation · source:postVisibility | **ADAPT WORKFLOW** | source: label denotes an in-page state, not an endpoint; preserve working workflow and validation. |
| `15:25505` | Owner / Post Shift · Engagement & rates · source:postEngagement | **ADAPT WORKFLOW** | source: label denotes an in-page state, not an endpoint; preserve working workflow and validation. |
| `15:25608` | Owner / Post Shift · Review & publish · source:postReview | **ADAPT WORKFLOW** | source: label denotes an in-page state, not an endpoint; preserve working workflow and validation. |

### CT Area · 04 · Workforce & Employment

| Figma node | Actual design frame / route-state label | Decision | Reason / guardrail |
| --- | --- | --- | --- |
| `15:25908` | Owner / Workforce · Payroll configuration · source:payrollConfig | **ADAPT WORKFLOW** | source: label denotes an in-page state, not an endpoint; preserve working workflow and validation. |
| `15:25704` | Owner / Employment Engagement · current terms · source:engagement | **ADAPT WORKFLOW** | source: label denotes an in-page state, not an endpoint; preserve working workflow and validation. |
| `15:25814` | Owner / Employment Engagement · Award preview · source:awardPreview | **ADAPT WORKFLOW** | source: label denotes an in-page state, not an endpoint; preserve working workflow and validation. |

### CT Area · 05 · Communication & Availability

| Figma node | Actual design frame / route-state label | Decision | Reason / guardrail |
| --- | --- | --- | --- |
| `15:26013` | Owner / Chat · empty state · source:chatEmpty | **ADAPT WORKFLOW** | source: label denotes an in-page state, not an endpoint; preserve working workflow and validation. |
| `15:26161` | Owner / Chat · /dashboard/owner/chat | **ADAPT WORKFLOW** | source: label denotes an in-page state, not an endpoint; preserve working workflow and validation. |
| `15:26343` | Owner / Pharmacy Hub · Create post / media · source:hubComposer | **ADAPT WORKFLOW** | source: label denotes an in-page state, not an endpoint; preserve working workflow and validation. |
| `15:26535` | Owner / Pharmacy Hub · Create poll · source:hubPoll | **ADAPT WORKFLOW** | source: label denotes an in-page state, not an endpoint; preserve working workflow and validation. |
| `15:26734` | Pharmacist / Set Availability · /dashboard/pharmacist/availability | **ADAPT WORKFLOW** | source: label denotes an in-page state, not an endpoint; preserve working workflow and validation. |

## Implementation and visual acceptance contract

Each changed React screen must record: Figma node ID; current React source route/component and preservation constraints; screenshot at large desktop, 768–1024 px tablet and 390 px mobile; keyboard/tab/focus and reduced motion; empty/loading/error/filled/permission states; regression test result; keep/changed/rejected visual deltas; user/browser proof. An untested or unimplemented row cannot be called complete.

**No-spaghetti acceptance:** a single source for repeated tone/metric/action UI; no parallel hardcoded route maps; shared-core API authority; avoid files > target size without a justified split; remove unused component copies only after callsite verification; no codegen JSX/temporary Figma assets. Track measured code health and real route coverage before asserting 100%.