# B14 Pharmacy Award / QLD 2027 public-holiday remediation

As at 25 October 2026, MA000012 Schedule B (adult casual) rates are effective for the first full pay period on/after 1 July 2026. Shift pricing previously used the older 2025 file for every date. The award resolver now chooses 2025 historical data for dates before 1 July 2026 and generates current rates from the authoritative `workforce.award_rates.CASUAL_WEEKDAY/CASUAL_WEEKEND`, avoiding a second maintained 2026 table. Exact 07:00, 18:00 Saturday, 19:00 and 21:00 ordinary-hour boundaries are respected in the current schedule. Overtime outside ordinary hours and junior DOB-driven classification must still use the full engagement/payroll award process; advertised previews are not a standalone payroll engine.

The verified QLD 2027 dates have been entered including Australia Day 26 Jan 2027, Anzac observed 26 Apr, and both substitute Christmas days. Brisbane RNA show day is **not statewide**, so no statewide QLD rate is inferred from this date. QLD Christmas Eve only receives the holiday rate from 18:00; the pricing function now distinguishes day segments.

Other states' full 2027 holidays and local show holidays are not yet certified; they must not be labelled complete. Tests cover 2025 vs 2026 rates, 2027 QLD Australia Day, Saturday evening and QLD Christmas Eve part-day.

Authoritative sources:
- https://awards.fairwork.gov.au/MA000012.html
- https://www.qld.gov.au/recreation/travel/holidays/public

No deployment. Production remains NO-GO until exact-head tests and wider state/role payroll acceptance.
