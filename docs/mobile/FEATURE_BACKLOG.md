# Mobile feature backlog: web features mobile must gain (3 Nov 2026)

Owner target: mobile offers every feature and function web offers (same data, rules, permissions), designed the
native way. Sources, both checked against the code (read-only, no runtime):
- **SC1** shared-core diff: web uses 295 runtime exports, mobile 308; of 66 web-only, 56 classified by Codex A:
  24 covered, 4 covered but bypassing shared-core, 2 platform, 26 missing/partial. Admin persona policy gives
  the same answers on both sides.
- **PM1-verify** of the parity matrix's 17 logic-drift claims by Claude B: 9 confirmed, 4 partly, 4 not drift.

## Decisions (orchestrator, as senior, 3 Nov)
- **In the app**: shared-shift link landing (deep link), invited-worker membership link (deep link), browse
  public shifts before sign-in. These feed shift filling and onboarding of app users.
- **Stay on web**: external referee questionnaire/decline, public talent feed, public organization profile.
  Their users (referees, recruiters, visitors) arrive from email/web links and do not have the app; nobody loses
  a feature. Organization creation: the web caller is unrouted, so it waits until web routes it.
- **Native auth transport** (`utils/nativeIdentityTransport.ts`) is the one allowed exception to "shared-core
  only" (native token storage and refresh differ from web cookies). Every other screen calls shared-core.
- **L15** (admin Attendance Approvals nav target unrouted) is a web bug, fixed outside this job.

## Build order (by business impact). Each item: Claude B builds with the kit, Argon checks design, Codex A reviews.
| # | Persona | Feature | Evidence |
|---|---|---|---|
| P1.1 | Owner/admin/org manager | Roster shift delete, atomic escalation (release + widen visibility), cover approval that publishes community work, scoped reject permissions | SC1 delete/escalate/approve/rejectWorkerShiftRequestService; L4 |
| P1.2 | Link recipient | Shared-shift landing via deep link → shift detail → express interest | SC1 getViewSharedShift |
| P1.3 | Signed-out visitor | Browse public shifts before sign-in, sign in to act | SC1 getPublicJobBoard |
| P1.4 | Explorer | Shifts tab is a placeholder: real boards | L17 |
| P1.5 | All | Account/membership refresh reloads current authority (stale permissions after a change) | SC1 getCurrentUser |
| P2.1 | Workers, invoice recipients | Authenticated invoice PDF download/share (current Linking.openURL drops the bearer token) | SC1 downloadInvoicePdf |
| P2.2 | Owner/finance | Approve disabled when invoice already approved/paid | L8 (FinanceWorkspace.tsx:146 vs web InvoiceReviewDrawer.tsx:72) |
| P2.3 | Persona invoices | Invoice detail uses the modern finance dispatch | L7 |
| P3.1 | Invited worker | Membership link preview + application submission (deep link) | SC1 browserMagicMembershipInfo/SubmitMagicMembership |
| P3.2 | Owner/admin | Chains: list, create, edit/logo, delete, add/remove pharmacies; claim existing pharmacy onboarding | SC1 chain services, claimOnboarding; L2 |
| P3.3 | Owner/admin/org manager | Student coverage role option in workforce settings | SC1 STAFF_ROLE_OPTIONS |
| P3.4 | Managers + workers | Timesheet detail review | L5 |
| P3.5 | Workers | Published-roster acknowledgement | L3 |
| P3.6 | Managers | Attendance correction keeps event context; timestamps in pharmacy timezone (move web correctionTimestamp.ts to shared-core, fix UTC read back as local at attendance.tsx:410/420) | L6 |
| P3.7 | Org/admin | Navigation follows capability rules (backend 403s to audit) | L10 |
| P4.1 | All chat personas | Older-message paging; canonical pharmacy-team chat | L9; SC1 fetchRoomMessagesByUrl, getOrCreatePharmacyGroup |
| P5.1 | Explorer | Live Home dashboard data + recommendations, activity links mapped to native routes | L1, L13; SC1 getExplorerDashboard |
| P5.2 | Pharmacist/other staff/explorer | Learning (placeholder today) | L16 |

The feature-parity gate (LAUNCH_PLAN) re-runs the shared-core diff each wave; done = every web-only export is
covered, platform, or a decision above.
Evidence reports: C:\dev\worktrees\ct-mobile-mirror-work\SC1-codex.md and PM1-verify-claudeb.md (agent outputs).
