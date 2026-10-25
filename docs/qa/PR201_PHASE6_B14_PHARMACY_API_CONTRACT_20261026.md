# B14 pharmacy configuration and API acceptance

Added real Django HTTP contracts (not only direct function tests) for region discovery and state validation. Region selection rejects a mismatched state (NSW Walcha for a Queensland pharmacy), normalizes the configured `QLD_GOLD_COAST`, serializes the Gold Coast 2026 show date but not Brisbane's 2026 Ekka, and returns explicit QLD 18:00 Christmas Eve windows and 2027 pending status. This validates the shared backend contract required by Vite/Next/Expo. No postcode-based inference, no independent frontend date table.

Run via PR201 `release_blocker_regressions.yml` with the holiday data validator. This is fixture-backed API acceptance; real workforce base-for-work agreements and client visual UX still require staging verification. NO-GO.
