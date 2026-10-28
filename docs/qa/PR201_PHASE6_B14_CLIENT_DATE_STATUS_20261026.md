# B14 shared-core date-scoped declaration status

A region such as `QLD_GOLD_COAST` can have **2026 show day VERIFIED** while **2027 local show declaration remains PENDING**. The raw pharmacy API region calendar status is all-year metadata. Previously the shared Vite/Next/Expo helper classified every 2026 date as needing review merely because 2027 was pending.

The helper now checks the selected date's year against `pendingYears`; 2026 published dates are verified and 2027 unconfirmed dates require review. Statewide/region-not-configured unknowns remain fail-closed. Added cross-client Vitest regression.
