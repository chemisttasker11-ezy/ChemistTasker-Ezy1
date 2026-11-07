# ChatGPT chat 6 message 2 (senior, read-only) findings on M5 heads 7c6b54c1 / 404b0351 / 6dacc654 (2026-11-07 ~20:55)
Ran: 10/10 standalone shared-core contract tests (audience, postingWindow) via a Node shim; web m5Audience.test.mjs C 1/1 on
base and on M5-01 head. Nothing else could run (no network, no npm/pip, Library skill zip not found, no Actions runs).
Route these to Codex A (verify each before fixing; they are source-review findings, not proven failures):
- M5-04 P1 PostShiftScreen.tsx:1253-1263: setToast() right before router.replace() can unmount the Snackbar, so the
  success message is lost. Fix: destination-aware/persistent success feedback; prove with a mounted navigation test.
- M5-04 P1 m5-post-shift.test.cjs tests helpers only, not the mounted PostShiftScreen (API error, navigation, edit scope,
  picker wiring, legacy route) -> mounted tests required.
- M5-04 P2 PostShiftScreen.tsx:104,897-921: posting window memoised at mount; a wizard left open across local midnight
  keeps an expired minimum. Fix: recompute per render/day or on focus; test with a moved clock.
- M5-01 P1 m5-active-shifts.test.cjs: stubbed Active card; mount ActiveShiftsPage for audience/status/metrics/toggle/
  empty/error/share R tests. P2 ActiveShiftCards.tsx:501-524 live counts, attention badges, expansion under loading/
  notification/payment states.
- M5-03 P1 Message test does not exercise startDirectChat, double tap, deferred completion, account switch, persona
  navigation. P2 OwnerAssignedShiftBoard.tsx:249-265 card at 360 dp + font scale 1.3 and nested card-press propagation.
