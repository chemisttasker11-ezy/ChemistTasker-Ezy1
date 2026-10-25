# PR200 Phase 5 focused booking / qualification result

## 25 October 2026: targeted qualification and paid-slot evidence
- First targeted run `40185447852` was **INVALID due to missing mandatory shift pay-band fixture fields** (2 setup errors, no evidence). Fixed in audit-only commit `9c13610c` without changing app code.
- [Exact-head focused run 40186580438](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/actions/runs/40186580438) executed **2 tests, both negative assertions failed as expected, zero fixture errors**, valid positive controls were evaluated before failing assertions.
- **C020-N1 now isolated-HTTP-reproduced**: manual roster PATCH equivalent owner POST `/api/v1/shifts/{id}/manual-assign/` accepted TECHNICIAN for PHARMACIST slot (200) after valid TECHNICIAN assignment positive control; `staff_assignment_defaults` mocked only to remove payroll setup variability.
- **B54 now isolated-HTTP-reproduced for *sequential duplicate reservation***: two candidate offers on the same slot both became `ACCEPTED_AWAITING_PAYMENT` (200 each) using mocked PAYMENT_REQUIRED billing state. This **does not** prove concurrent PostgreSQL race or provider double charge; source and separate concurrency/provider acceptance still required.
- Canonical totals now **32 distinct runtime-reproduced IDs**, accumulated **36 failing negative assertions** (34 from prior 45-test run plus these 2 targeted cases), original **226 raw IDs preserved**. No full-suite retest/99% S2 certification. Phase 5 OPEN, Phase 6 untouched, PR201 untouched, NO-GO.

Do not conflate this mock-supported sequential reservation with real Stripe/provider charge or concurrent database race. Existing P0/P1 candidate queue, F12 native/browser parity, and 99% independent S2 semantic audit remain outstanding.
