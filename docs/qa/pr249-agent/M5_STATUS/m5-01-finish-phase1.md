# M5-01 finish phase 1 — incomplete

Base 5c28634d; head 7c6b54c1. Base overlay contained complete base `ShiftsScreen.tsx` and `ActiveShiftCards.tsx` from `git show`; other modules were loaded from head. These results characterize the changed screen/card modules with current dependencies, not a complete base checkout. Run `M5_BASE=<overlay> node --test frontend_mobile/scripts/m5-active-shifts.test.cjs`; head: `node --test frontend_mobile/scripts/m5-active-shifts.test.cjs`.

| Case | Base | Head |
|---|---|---|
| R shell_title owner | FAIL line 140: poster header | PASS |
| R shell_title organization | FAIL line 149: missing Shift Centre | PASS |
| R audience_pill | FAIL line 212: missing internal audience pill | PASS |
| R status_pills_collapsed | FAIL line 220: 2 waiting for review | PASS |
| R metrics_and_hints | FAIL line 224: Interested | PASS |
| R humanized_pills | FAIL line 229: Pharmacist | PASS |
| R manage_candidates_toggle | FAIL line 233: button absent | PASS |
| R share_label | FAIL line 249: share action label absent | PASS |
| C worker screen | PASS | PASS |
| C card body, edit and delete handlers | PASS | PASS |
| R list_states_copy | NOT TESTED | NOT TESTED |
| C Dee, Sam, explorer, deep links, notification reload, scope race, payment and checkout conflict | NOT TESTED | NOT TESTED |
| C shared-core/web audience on base | NOT TESTED | PASS (head) |
| R shell title admin | NOT TESTED | NOT TESTED |

Rule 12: `visualContract.test.mjs` source-reads only `ActiveShiftsPage/styles.ts`, unchanged by this branch; its two tests pass on head. The remaining changed files and sibling route lifecycle need further audit. No production files edited in this finish session. The card tests execute the real card and helpers with platform components and unrelated child views mocked; they do not mount the full ActiveShiftsPage.

Head checks: mobile gate 870/870 node tests, typecheck exit 2 TS2305 due to linked shared-core; mapped typecheck against this tree passed; shared-core `npm.cmd run test:ci` 504/504 and `npm.cmd run typecheck` passed; `npx.cmd expo lint` exit 0, 66 warnings. Web all-node run 250/253; failures: missing pngjs in e2e support, marketplace gate and ethical routes. Focused web audience test passed. Full review and remaining tests/fixes are outstanding.
