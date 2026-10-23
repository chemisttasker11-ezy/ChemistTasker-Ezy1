# ChemistTasker Live Test Report

## Journey 3: Agreements & Changes
### What Worked
- Confirmed booking correctly displayed on both Owner (`/dashboard/owner/shifts/confirmed`) and Pharmacist (`/dashboard/pharmacist/shifts/confirmed`) boards with locked rate ($75.00/hr).
- In-app notification center delivered real-time notifications for offer confirmation, payment completion, and lock-in.
- Confirmed locum shift mapped automatically onto the pharmacy's Internal Roster grid on 26 Oct.

### Problems
- `[GAP] j3-01 No copy or export of agreed shift terms for worker` - Worker only sees locked rate and a pharmacy modal with address/maps. No access to full engagement contract, cancellation rules, or PDF export. - `j3-pharma-confirmed-desktop.png` - Severity: med
- `[BUG] j3-02 Owner PosterShiftDetailPage crashes for confirmed shift` - Direct URL `/dashboard/owner/shifts/1` crashes with "Active shifts did not load - We could not load your active shifts" because confirmed shifts are excluded from active list. - `j3-owner-shift-1-detail.png` - Severity: high
- `[GAP] j3-03 Owner cannot edit date, time, or rate of confirmed booking in Shift Centre` - Confirmed Shifts board offers only "Hide dates", "View profile", and "Message", with no edit or adjustment workflow. - `j3-owner-view-booked-dates.png` - Severity: high
- `[UX] j3-04 Rescheduling confirmed locum shift on roster dumps raw backend error dict` - Selecting "Move to Another Day..." from roster 3-dots menu displays a raw python validation error dict `{'user': ['Only direct full-time, part-time or casual pharmacy staff can be assigned through roster tools...']}` across the table. Shift remains on original day. - `j3-owner-roster-after-move.png` - Severity: med
- `[BUG] j3-05 Pharmacist Shift Centre direct link renders 404` - Navigating directly to `/dashboard/pharmacist/shift-center` displays a 404 Page Not Found error instead of redirecting to a valid shifts view. - `j3-pharma-shift-center.png` - Severity: med

### Questions for the Owner
- Where should workers and owners review full agreed terms of engagement and cancellation policies after booking?
- How should agreed minor adjustments (e.g., 30-minute late start or overtime extension) be handled without cancelling the shift?

## Journey 4: Cancellations & No-Shows
### What Worked
- Mutual ratings functional in Shift History: pharmacist can rate pharmacy (1-5 stars + comment) and owner can rate worker.
- Invoice generation pre-populates seamlessly from completed shift into `/dashboard/pharmacist/invoice?shift=1` with pharmacy name, hours, rate, and billing details.
- Leave request modal works cleanly from `/dashboard/my-leave` (pharmacy, leave type, start/end dates, note).
- Responsive mobile layouts render cleanly on phone viewport (390px) across worker roster and confirmed boards.

### Problems
- `[GAP] j4-01 No shift cancellation mechanism for owner or worker` - Neither owner nor worker has any UI button or action to cancel a confirmed shift (far away or close to start). - `j4-owner-view-booked-dates.png` - Severity: high
- `[GAP] j4-02 Worker cannot request shift cover or swap` - Confirmed marketplace shifts have no cover/swap request option, and "Reject Entire Shift" button is permanently disabled once confirmed. - `j4-pharma-confirmed-desktop.png` - Severity: high
- `[GAP] j4-03 No no-show or late arrival reporting controls` - Owner dashboard and History tab lack any button or interface to flag a worker no-show, record late arrival, or dispute attendance. - `j4-owner-history-view-dates.png` - Severity: high
- `[BUG] j4-04 Rostering casual staff fails with validation error despite valid dropdown selection` - In roster "Add shift", `Pharmacist LOCAL SEED (CASUAL)` is listed in the staff dropdown, but submitting returns "Failed to create shift: Only direct full-time, part-time or casual pharmacy staff can be assigned through roster tools". - `j4-owner-roster-staff-dropdown.png` - Severity: high
- `[BUG] j4-05 Unassigned/locum shift blocks publishing entire roster with INACTIVE_MEMBERSHIP error` - Owner cannot publish roster week containing a confirmed locum booking; "Publish reviewed roster" is disabled due to `INACTIVE_MEMBERSHIP · Worker Pharmacist LOCAL SEED requires an active accepted membership`. - `j4-owner-roster-publish-dialog.png` - Severity: high
- `[UX] j4-06 Roster "Delete Shift" fails silently on locum shifts` - Clicking "Delete Shift" from the roster 3-dots menu on a locum shift performs no action, shows no confirmation modal, and leaves the shift untouched. - `j4-owner-roster-delete-click.png` - Severity: med

### Questions for the Owner
- What is the cancellation and refund policy if an owner or locum cancels 7 days vs 2 hours before shift start?
- How should a pharmacy report a no-show locum, and does the platform auto-refund booking fees or Pills?
- How should confirmed locum shifts coexist on internal rosters without blocking whole-week publishing due to membership checks?

## Top 5 Worst Problems
1. `[GAP] j4-01 Complete Absence of Shift Cancellation & Fee Refund Mechanism`: Neither owner nor worker can cancel a booked shift in the UI, leaving both parties trapped with locked dates and fees.
2. `[BUG] j4-05 Locum Shift Blocks Whole-Week Roster Publishing (INACTIVE_MEMBERSHIP)`: Confirmed marketplace locums mapped to the roster trigger membership validation failures, preventing the owner from publishing the entire week's schedule to staff.
3. `[GAP] j4-03 Missing No-Show and Late-Arrival Management`: Owners cannot report absent or tardy workers, leaving attendance and payment reconciliation unresolved on the platform.
4. `[BUG] j3-02 Owner PosterShiftDetailPage Crashes for Confirmed Shifts`: Navigating to shift details via `/dashboard/owner/shifts/:id` displays an error screen ("Active shifts did not load") instead of showing the booking.
5. `[BUG] j4-04 Roster Staff Dropdown Offers Unassignable Casual Workers`: The roster "Add Shift" dialog exposes workers in the staff dropdown who cannot actually be assigned, failing on submission with an internal error.
