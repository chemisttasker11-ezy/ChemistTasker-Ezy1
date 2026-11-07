# M5-03 phase 1 evidence

Base 5c28634d production modules were copied with `git show` to a temporary directory and loaded by the test harness; the directory was removed. Command: `node --test frontend_mobile/scripts/m5-assigned-boards.test.cjs` with `M5_BASE_DIR` set. Base: 4 pass, 7 fail. Head before fixes: 10 pass, 1 fail (rating double tap). The head results below include the phase 2 fix.

| Test | Base | Head |
| --- | --- | --- |
| R status_pill | red: no confirmed summary | green |
| R dates_toggle | red: no explicit control (0 != 1) | green |
| R date_rows | red: Booked absent | green |
| R message_action | red: zero Message buttons (0 != 2) | green |
| R copy | red: Interests instead of Interested | green |
| R message navigation | red: message callback undefined | green |
| R rating double tap | red: two saves (2 != 1) | green after phase 2 |
| C board press | green | green |
| C profile/rate callbacks | green | green |
| C scope/profile/payroll/retry | green | green |
| C rating persistence | green | green |

The message test starts two same-user presses from one render, also starts another user, switches to a new mounted account before resolving the old request, and checks the new account's route. This harness simulates the keyed unmount; it is not a device navigation test. The red on base for navigation is the absent action, so the race behavior itself cannot be isolated on base.

Existing tests importing or reading affected modules: `confirmedHistory.test.mjs`, `workerShiftPermissions.test.mjs`; `ShiftsScreen` is covered by `scripts/m4-explorer-shifts.test.cjs`. No J5 conversions.

Limitations: the within-account out-of-order chat completion is not directly tested; the test resolves the older request after unmount. The payroll double-tap lock added during review also lacks a dedicated double-tap test. The phase 2 instruction prohibits test edits, so these remain for the next tests-only round. The requested full owner/organization/admin sibling-route review has not been completed.
