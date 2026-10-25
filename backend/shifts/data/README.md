# Shift pricing data

Loaded by `shifts/pricing_data.py` (on first use, validated, cached).

| File | Content | Used by |
| --- | --- | --- |
| `award_rates_casual_first_level.json` | Casual first-level hourly rates per role (assistant, technician, student, intern, pharmacist), per day type and early-morning / late-night band | `shifts.pricing` award rate for non-pharmacist shifts |
| `public_holidays.json` | Statewide full-day public holiday dates per state code (2026–2027) | `shifts.pricing` day type; `organizations` pharmacy serializer (`public_holiday_dates`) |

Source of the award rates: Fair Work Ombudsman pay guide for the Pharmacy Industry Award [MA000012] (document
G00122881). It is a public document, available from fairwork.gov.au; the copy that used to sit in
`client_profile/data/` is in the repository history.

Updating rates or holidays changes `shifts/test_pricing_contract.py`'s fingerprint on purpose: update the expected
values in the same commit as the data, and say so in the commit message.

| `public_holidays_local.json` | Dated official declarations for region, part-day and substitution, with explicit pending years | `shifts.holidays` |
| `reconcile_public_holidays.py` | Static offline reconciliation gate (not a scraper) | PR201 targeted CI |
| `AGENTS.md` | Mandatory Fair Work / geography / payroll source-of-truth instructions | Contributors and coding agents |

Pharmacy `public_holiday_region` identifies an explicitly verified work-base district. Do not infer it from `suburb`/`postcode` or a destination pharmacy when a worker is temporarily away from their work base. Full-day dates continue under the existing `public_holiday_dates` API for compatibility; part-day windows and declaration status have separate fields. Where region is not verified, payroll must not silently classify ordinary hours.
