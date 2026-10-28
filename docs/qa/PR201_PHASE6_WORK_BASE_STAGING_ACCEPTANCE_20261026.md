# PR201 Phase 6 — employee-specific work-base and staging acceptance

Date 26 October 2026; source PR201 branch before this batch f8e33f82. This is a *regression and implementation* note, not deployment proof.

- Source of law: Fair Work/NES public holidays where employee is based for work, including regional and part-day; employer's pharmacy postcode or temporary shift address is not conclusive. The legal work-base region must be explicitly employee-confirmed.
- `shifts.holidays.confirmed_employee_work_base` validates state, region, confirmation and source; no guessed postcode mapping.
- External TFN offer terms accept `public_holiday_work_base` and freeze that exact validated scope. Without it, payroll remains review-required and timesheet-only (rather than silently treating the posting pharmacy as the certified employee base). Award floors use the confirmed employee region if given. Invalid/cross-state regions are rejected.
- Dated staff EmploymentEngagement Award snapshots retain the confirmed individual work-base, using the same validator; old historical snapshots remain unchanged.
- Targeted cases assert Gold Coast-based worker assigned to Brisbane pharmacy on 28 Aug 2026 receives the Gold Coast public-holiday floor; Brisbane-based worker has weekday floor, and missing or mismatched confirmation is rejected.
- Still to verify: employee-specific override in direct-staff timesheet/export and effective-dated work-base changes, activation after an employee's base changes, and staging UI evidence. Until these gates pass, do not certify payroll.
- No migration, deploy, or changes to audit PR200. Release NO-GO.

Mandatory acceptance: run `python backend/manage.py test shifts.test_pr201_employee_work_base shifts.test_pr201_award_floor shifts.test_pr201_holidays`, then check exact-head shared-core, Vite, Next, Expo and PostgreSQL gates; inspect the deployed staging revision before claiming staging has the fixes.
