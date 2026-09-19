# Frontend parity and refactor backlog

This document records which ChemistTasker frontend capabilities are built, which are wired into navigation, and which remain incomplete. It also separates product gaps from code-organization work so refactors do not accidentally become rewrites.

## Frontend ownership

- Next.js remains the public/SEO frontend.
- Vite remains the authenticated web application.
- Expo/React Native remains the mobile application.
- Shared Core owns reusable API contracts, types and router-neutral domain logic.

## Status definitions

- **Built**: working implementation exists and is routed.
- **Built / integration pending**: implementation exists, but one or more personas do not expose it through the intended navigation.
- **Placeholder**: route exists but content is not implemented.
- **Missing parity**: corresponding product workflow exists on another first-class client but no equivalent mobile/web workflow is currently wired.

## Web product status

| Area | Status | Notes |
| --- | --- | --- |
| Post Shift | Built | Large page; pure helpers extracted. Preserve current routes and payloads. |
| Shift Centre / Active Shifts | Built | Large page; pure runtime helpers extracted. |
| Pharmacy management | Built | Model/normalizer layer extracted. |
| Owner/worker roster | Built | Routes exist. Large components still need decomposition. |
| Worker attendance | Built | Direct and persona routes exist. |
| Manager attendance approvals | Built | Direct and owner/org/admin routes exist. |
| Manager timesheets | Built | `/dashboard/workforce/timesheets`. |
| Manager leave review | Built | `/dashboard/workforce/leave`. |
| Workforce settings | Built | `/dashboard/workforce/settings`. |
| My Hours | Built | `/dashboard/my-hours`. |
| My Leave | Built | `/dashboard/my-leave`. |
| Expanded worker finance | Built | Invoices, customers/stores, reusable items, expenses/receipts, GST/BAS workspace for non-owner invoice workflow. |
| Learning Materials | **Placeholder** | Current web page only renders a title. |
| Workforce sidebar discoverability | **Built / integration pending** | Direct routes exist, but not all workforce tools are surfaced in persona navigation. |

## Mobile product status

| Area | Status | Notes |
| --- | --- | --- |
| Post Shift | Built | Large screen; pure helpers extracted. |
| Shift browsing / Shift Centre | Built | Shared shift board and active-shift implementations exist. |
| Pharmacy management | Built | Owner/org/admin pharmacy flows exist. |
| Worker My Hours | Built | Root `/my-hours` implementation exists. |
| Worker My Leave | Built | Root `/my-leave` implementation exists. |
| Attendance PIN | Built | Worker PIN setup exists. |
| Kiosk pairing | Built | Mobile-to-terminal pairing flow exists. |
| Invoices | Built | Persona invoice routes use shared InvoiceList/editor flows. |
| Expanded finance workspace | **Built / integration pending** | Shared mobile FinanceWorkspace already implements customers, items, expenses and GST/BAS, but persona invoice routes currently open InvoiceList rather than the full workspace. |
| Pharmacist learning | Built | Pharmacist implementation exists; Other Staff reuses it. |
| Owner/org/explorer learning | **Missing parity** | No equivalent routed learning screen for these personas. |
| Manager internal roster | **Missing mobile parity** | Web owner/org roster exists; no equivalent dedicated mobile roster-management workflow found. |
| Manager attendance approvals | **Missing mobile parity** | Web manager review exists; mobile currently has worker PIN/pairing flows but no manager review screen. |
| Manager timesheets | **Missing mobile parity** | Web manager timesheet workflow exists; mobile worker My Hours exists, but manager review/lock workflow is not surfaced. |
| Manager leave review | **Missing mobile parity** | Worker My Leave exists; manager approval/rejection workflow is web-only. |
| Workforce settings | **Missing mobile parity** | Web management workflow exists; no mobile equivalent found. |
| My Hours/My Leave navigation | **Built / integration pending** | Screens exist at root routes; persona layouts should expose them consistently where product logic requires. |

## Refactor backlog — web

These are not missing product pages; they are maintainability hotspots.

1. KioskPage
2. PostShiftPage — continue splitting state/controller and UI sections
3. PharmacyPage — continue splitting editor, claims, memberships and tabs
4. ActiveShiftsPage — continue splitting card orchestration/payment/candidate review
5. PharmacyCalendarPage
6. RosterOwnerPage and large roster components
7. HubFeed
8. TopBarActions
9. RosterWorkerPage
10. TalentBoard, Chat, SetAvailability and invoice editor/detail flows

## Refactor backlog — mobile

1. PostShiftScreen — continue splitting controller/UI after helper extraction
2. ActiveShiftsPage
3. PharmacyForm
4. Shared calendar
5. HubScreen / HubFeed
6. ShiftList
7. SetAvailabilityScreen
8. StaffManager / LocumManager
9. Messages detail / chat
10. Finance and invoice UI components where duplicated presentation can be shared locally

## Refactor safety rule

Structural refactors must not change:
- router paths,
- backend endpoint strings,
- Shared Core service names,
- request/response payload shapes,
- permission behavior,
- existing handler semantics,
- visible product behavior unless a separate feature change explicitly requires it.

Every large-page extraction should compare pre/post route, service/API-call and handler fingerprints, then pass the existing typecheck/build/test gates before the next behavior-sensitive extraction.
