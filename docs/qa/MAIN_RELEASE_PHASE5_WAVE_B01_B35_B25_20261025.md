# Phase 5 focused semantic source challenge: B01, B35, B25

**Frozen main:** `b77e9fd296bc2710350ef6f3cd402ce2529ffc06`. This is a causal source review and planned six-test matrix, **not** S2 whole-file certification or any S3 reproduction before logs are inspected.

## B01: subscriber price mismatch
`POST /api/v1/billing/charge-fulfillment/{shift_id}/` authenticates billing authority, resolves the billing account and active subscription, then selects the ordinary fixed Stripe Price ID without consulting the active subscriber flag. In `backend/billing/views.py:635-649` the mapping comments explicitly distinguish standard locum and discounted locum prices, but only the standard ID is assigned. Test a valid accepted-awaiting-payment offer with no subscription (positive standard price), then the same contract with active OwnerSubscription (negative expected discounted price); mock the provider, not the endpoint. Live Stripe product configuration and settled payment remain untested.

## B35: authenticated roster-owner POST bypasses read tenancy
`backend/workforce/roster/urls.py` exposes `roster-owner` as a DRF ModelViewSet. `backend/workforce/roster/views.py:44-97` filters `get_queryset` by managed pharmacies, but has no create or perform_create permission override; `backend/workforce/roster/serializers.py:25-60` accepts writable shift, slot and user FKs. A default POST need not pass through the filtered queryset. Positive: owner B can create an assignment in B. Negative: owner A cannot POST the same B-linked data and must not persist a foreign ShiftSlotAssignment. Distinct route from B36 and B38.

## B25: audience change persists ahead of schedule validation
`backend/marketplace/views.py:198-227` first updates ListingAudiencePolicy and listing.version, then iterates schedule creating each ListingEscalationStep; a later invalid step raises 400 without a whole-handler atomic transaction. Positive: verified owner updates audience and valid schedule. Negative: later invalid step must leave audience, version and all steps unchanged. Use verified synthetic onboarding, identity and terms; a fixture error or status that never reaches the intended handler is not evidence.

**CI:** `.github/workflows/pr200_targeted_b01_b35_b25.yml` runs disposable SQLite test contracts, intentionally red where frozen main is unsafe. Only promote fixture-valid, boundary-specific failures, with positive control pass and log/run/head. **S2 independently accepted numerator unchanged and unknown.**

**CI hardening:** `.github/workflows/pr200_readonly_static_audit.yml` was not genuinely read-only: `contents: write` plus a bot commit/push step. This audit-only change reduces to `contents: read`, disables checkout credential persistence and removes the push step; evidence remains in uploaded artifacts. No source product change.

## 25 October 2026 — B01/B25 targeted red and B35 invalid fixture

[Run 40191476067](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/actions/runs/40191476067), test head `b33cdca0263df3554e1c119a47e8f59dbdda1796`, six tests: **2 fixture-valid negative failures (B01/B25), 2 positive passes, 2 B35 test fixture errors**. B01 active subscriber with valid one-offer checkout chose ordinary price, while no-subscription positive selected ordinary price correctly. B25 invalid second audience step returned HTTP 400 but persisted listing.version increment (1→2); valid schedule positive passed. B35 Shift creation raised `ValidationError` requiring hourly/annual pay before reaching HTTP — **NOT reproduced**. B35 fixture now supplies the required min/max hourly pay and will be rerun. B25 test now captures version/circle/step postconditions together. Totals: **47 distinct exercised IDs / 55 cumulative negative reds** across historical isolated runs; not production exploits and not 99% independently approved S2. See canonical status and VERIFIED.json.
