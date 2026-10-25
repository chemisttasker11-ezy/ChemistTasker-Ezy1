# F12 — cross-client parity evidence, bounded continuation (25 October 2026)

**State: IN PROGRESS / not yet a completed F12 flow.** Frozen source baseline `b77e9fd296bc2710350ef6f3cd402ce2529ffc06`. Zero runtime tests; no HTTP/browser/device comparison was run. No app source modified.

## Checked semantic slices

| Action | Vite web | Expo | Shared API or backend | Initial parity assessment / missing verification |
|---|---|---|---|---|
| Counter-offer browse/reconciliation | `frontend_web/src/pages/dashboard/sidebar/ShiftsBoard/hooks/useCounterOffers.ts`: `fetchShiftCounterOffersBatchService(toFetch)` once per rendered page, filters own offers by `currentUserId`, normalizes stored badges | `frontend_mobile/roles/shared/shifts/ShiftsBoard/hooks/useCounterOffers.ts`: individual `fetchShiftCounterOffersService(shiftId)` for listed shifts and local counters | `shared-core/src/domains/shifts/api.ts`: both single `/shifts/{id}/counter-offers/` and batch `/shifts/counter-offers-batch/?shift_ids=` exist | **Confirmed transport strategy divergence, not a confirmed functional bug.** Negative: compare 403 and 404 for unauthorized/nonmember shift IDs and hide other workers' offers. Positive: same visible accepted/pending slots and no request-rate explosion at >50 shifts. |
| Counter-offer manager decision | Web Vite `useCounterOffers` and shared API | `frontend_mobile/roles/shared/shifts/ActiveShiftsPage/hooks/useCounterOffers.ts` uses shared `acceptShiftCounterOfferService` and `rejectShiftCounterOfferService` | Shared `acceptShiftCounterOffer` POST and `rejectShiftCounterOffer` POST | Source paths located, full payload and post-payment state parity NOT verified. |
| Chat send | Vite `frontend_web/src/pages/dashboard/sidebar/chat/MessageComposer.tsx` retains drafts and attachments upon send error; sends via injected `onSendText`/`onSendAttachment` callbacks | Expo `frontend_mobile/roles/shared/chat/ChatPage.tsx` (room container; send callbacks in nested components remain to trace) | Shared chat API and Django room membership/object permissions to trace | Insufficient evidence yet to assert parity. Negative: revoked member chat send and attachments. Positive: send text, file, mention and retry with no duplicates on both clients. |
| Invoice submit | Vite invoice client remains to trace | Expo `frontend_mobile/roles/shared/invoices/InvoiceGenerate.tsx` builds `line_items` JSON in FormData | Finance invoice serializer/send/status transition remains to trace | Not signed off; cross-check GST/super/role and attachment per exact payload. |
| Clock in/out | Vite attendance component remains to trace | Expo `frontend_mobile/app/attendance/clock.tsx` is a route shim; real `frontend_mobile/features/parity/attendance.tsx` must be examined | Attendance API + kiosk + timesheet corrections | Unverified. Negative: clock for another user/pharmacy, duplicate tap/offline replay. Positive: native and web same workday and break totals. |
| Apply/accept/cancel | Vite ShiftBoard and Next migrated components identified | Expo `frontend_mobile/roles/shared/shifts/ActiveShiftsPage/hooks/useShiftActions.ts` accepts candidate using `acceptShiftCandidateService(shiftId, {userId,slotId})` | Shared shifts API and backend acceptance/payment/cancellation must be cross-reconciled | Unverified; important original F01/F02 findings are not closed by this trace. |

## Important caution about root causes

Both Vite and Expo source have persisted counter-offer badges; displaying user-filtered responses in UI is only defence in depth, not proof server authorization. The differing batch-vs-single transport must not be reported as a production defect without demonstrated behaviour difference. Previous provisional C/F issues are preserved; this note does not add duplicate findings.

## Required finish to close F12

For each seven core actions, capture exact request body, URL, active persona and pharmacy, backend view permission, service/DB side effects, status transition and UI error/result on **Vite, Next and Expo**. Test positive and negative scenarios under fixed fixtures, with Stripe and PostgreSQL concurrency where pertinent. Record test runs with commit and logs; do not infer success from unit-test source. F12 remains explicitly incomplete.
