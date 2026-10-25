# Region choices API for Australian public holidays

`GET /api/v1/holidays/regions/?state=QLD` (authenticated) exposes the exact declared work-base district choices, legal coverage text, official source, verified and pending years. An owner must explicitly configure `Pharmacy.public_holiday_region` using a listed code; **no heuristic geocoding from postcode or suburb**. If the employee is based elsewhere for work, that legally relevant work-base must be reviewed as part of engagement terms.

The date and penalty rules remain in the single `shifts.holidays` resolver; API view contains no duplicated business logic. Existing `public_holiday_dates` array remains full-day only. `public_holiday_windows` holds part-days; `public_holiday_calendar_status` reports unverified years. Client screens need validation that they display these warnings before production.

Routes mounted under existing `shifts.urls` API v1; no new top-level URL router. Positive region listing and ACT/SA no-region controls added. No deploy, NO-GO.
