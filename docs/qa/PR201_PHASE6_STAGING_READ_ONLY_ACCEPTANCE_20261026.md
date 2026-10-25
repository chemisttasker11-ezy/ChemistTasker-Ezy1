# PR201 staging read-only acceptance — 26 October 2026

Evidence session: https://agent.tinyfish.ai/runs/709bd4b5-03db-400c-a44a-dfaee6edb62e

**Environment**: https://staging.chemisttasker.com.au/ . Logged in with authorized synthetic Owner account, did not create, save, pay, publish, delete or modify any staging data.

## Observed routes
- PASS to view: `/login?next=/dashboard`, `/dashboard`, `/dashboard/post-shift`, `/dashboard/shift-centre`, `/dashboard/owner/roster`, `/dashboard/manage-pharmacies`, `/dashboard/calendar`, `/dashboard/workforce-settings`.
- FAIL/404: `/dashboard/workforce-payroll` (may be a deprecated or incorrect route; reconcile with current Vite/Next router before marking defect).
- `/dashboard/workforce-settings` showed Coverage requirements, Contracted hours, Employment & pay, Kiosk devices, and payroll switch OFF for selected Adelaide Central Pharmacy.
- Post-shift displayed casual/part-time/full-time and shift preview; browser did **not** establish a rate preview.
- Not observed on visited screens: per-pharmacy 2026/2027 legal holiday region selector; part-day holiday declaration windows; employee-specific work-base confirmation; holiday verification banners. This is a UX acceptance gap, not proof that all APIs are absent.
- PR201 deploy identity: **NOT VERIFIED**; no visible app build SHA/tag. Treat staging as **not proven to contain this PR's changes**. Never attribute missing UI to a specific PR without deploy provenance.

## Source / release gates
PR201 currently adds a backend resolver, dated official calendars, explicit `Pharmacy.public_holiday_region`, annual approval-status API, and shared-core parsing. New worker-specific work-base validation is committed. But these do not prove actual payroll accuracy on staging.

Required before staging sign-off:
1. Deploy PR201 (or a tagged exact-SHA staging candidate) **only after authorised approval**, with additive migration rehearsal. Record deployed backend, Vite and Next source SHAs.
2. Verify region selector UX on pharmacy/workforce pages, employee individual base override, and dated/substituted holiday agreement. Reject cross-state/work-base spoofing.
3. Check Gold Coast 2026-08-28 vs Brisbane 2026-08-12, Cairns 2026-07-17, WA regional King's Birthday substitute, NSW part-day, QLD Christmas Eve 18:00, 2027 unannounced local show days.
4. Confirm payroll floor and locked snapshot trace from engagement → roster → attendance → timesheet → export, including employee employed in different district from shift pharmacy; neither payroll nor Stripe should trigger for provisional dates.
5. Verify parity across Vite, Next and Expo on one backend dataset and ensure warnings / part-day windows are visible; don't mark missing UI as PASS.
6. Run exact-head PostgreSQL and source coverage gates, audit migration and check that existing employment terms don't silently inherit a guessed work-base.
7. Only then decide staging acceptance. No production deployment or merge without explicit approval.

**Staging acceptance outcome: PARTIAL READ-ONLY TOUR; B14 employee payroll release acceptance BLOCKED.** Production NO-GO.
