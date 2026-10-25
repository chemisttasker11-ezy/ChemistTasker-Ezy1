# Phase 6 B14 region-aware holiday integration and targeted verification

**Previous failure addressed:** At CI [40200393220](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/actions/runs/40200393220), B02 failed because the test fixture computed `"not-an-integer" - 5` before making the HTTP request. Corrected the fixture; it was not a production defect.

**Public holiday rule:** For Fair Work Act section 114, employees generally receive the public holidays at their base-for-work location (not necessarily the temporary shift location): https://www.fairwork.gov.au/employment-conditions/public-holidays . Authoritative regional examples:
- Brisbane Ekka vs Gold Coast Show vs Cairns Show: https://www.qld.gov.au/recreation/travel/holidays/show
- Karratha/Port Hedland 2026 King's Birthday replaces rather than adds WA statewide 28 September: https://www.wa.gov.au/service/employment/workplace-arrangements/public-holidays-western-australia
- NSW local public holiday vs non-holiday Local Event Day: https://www.nsw.gov.au/about-nsw/public-holidays/local-public-holidays
- QLD Christmas Eve 18:00-midnight: https://www.qld.gov.au/recreation/travel/holidays/public

Architecture: `shifts.holidays` is the sole date/scope/window resolver. `shifts.pricing` only consumes classifications, `organizations.serializers` only exposes validated region, full-day dates, part-day windows, and source/pending state. New pharmacy region must be explicitly selected; no postcode or suburb inference. Unknown regional coverage is **REQUIRES REVIEW**, not silently certified. Payroll staff holiday pay takes precedence over ordinary early/late bands; the ordinary-vs-overtime award check remains a separate payroll acceptance gate.

Tests added for state/region/part-day split, 2026/2027, WA substitute, unconfigured work base, pending declarations and complete state keys. Run:
`python backend/shifts/data/reconcile_public_holidays.py --check`
`python backend/manage.py test qa_release.test_pr201_phase6_b14 qa_release.test_pr201_phase6_holidays shifts.test_pricing_contract`

**No staging/production migration or payroll changes applied.** Exact-head CI required, local 2027 pending declarations and unverified venue-specific industrial entitlements remain acceptance blockers; release NO-GO.
