# Shift pricing data

Loaded by `shifts/pricing_data.py` (on first use, validated, cached).

| File | Content | Used by |
| --- | --- | --- |
| `award_rates_casual_first_level.json` | Casual first-level hourly rates per role (assistant, technician, student, intern, pharmacist), per day type and early-morning / late-night band | `shifts.pricing` award rate for non-pharmacist shifts |
| `public_holidays.json` | Public holiday dates per state code | `shifts.pricing` day type; `organizations` pharmacy serializer (`public_holiday_dates`) |

Source of the award rates: Fair Work Ombudsman pay guide for the Pharmacy Industry Award [MA000012] (document
G00122881). It is a public document, available from fairwork.gov.au; the copy that used to sit in
`client_profile/data/` is in the repository history.

Updating rates or holidays changes `shifts/test_pricing_contract.py`'s fingerprint on purpose: update the expected
values in the same commit as the data, and say so in the commit message.
