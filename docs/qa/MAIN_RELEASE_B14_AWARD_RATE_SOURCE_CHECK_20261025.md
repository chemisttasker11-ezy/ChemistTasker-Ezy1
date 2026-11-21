# B14 independent award and holiday source challenge — 25 October 2026

**Verdict: SOURCE-CONFIRMED STALE SHIFT GUIDE DATA, conditional P0/P1 wage impact. NOT S3 runtime-reproduced.** Audit baseline `b77e9fd296bc2710350ef6f3cd402ce2529ffc06`.

## Frozen code versus date-effective primary authority

The canonical Fair Work Commission Pharmacy Industry Award MA000012, current consolidated instrument *effective 1 July 2026*, lists adult minimum base pharmacist **$41.74/h** and Schedule B casual pharmacist standard weekday 8am–7pm **$52.18/h**, public holiday **$104.35/h**; adult casual pharmacy assistant level 1 standard weekday **$34.76/h**, public holiday **$69.53/h** (the Award specifies other time buckets and classifications separately). Primary source: https://awards.fairwork.gov.au/MA000012.html (updated 8 July 2026). Use pay-period effective-date rules in a final payroll engine; minimums do not necessarily equal negotiated locum market rates.

The frozen `backend/workforce/award_rates.py:10-93` *already contains* an updated `AWARD_EFFECTIVE_FROM = "2026-07-01"` and pharmacist weekday **$52.18**, weekend/public holiday published 2026 rates. **Do not claim that this new workforce schedule is stale.**

However, the *separate* frozen `backend/shifts/pricing_data.py:14` loads `backend/shifts/data/award_rates_casual_first_level.json`. That file contains older `PHARMACIST.PHARMACIST.casual.weekday = 47.68`, `public_holiday = 95.35` and `ASSISTANT.LEVEL_1.casual.weekday = 33.19`, `public_holiday = 66.38`. For 2026 dates these are **below** the corresponding current Fair Work casual rates by pharmacist **$4.50/h** weekday and **$9.00/h** public holiday, and assistant level 1 **$1.57/h** weekday and **$3.15/h** public holiday. This is a *real dual-data-source discrepancy*; the precise underpayment risk depends on whether the shift-guide data is merely indicative or actually persisted/locked into award-covered employee pay. No pay-period runtime path or final locked-rate result is certified here.

`backend/shifts/pricing.py` imports the older static `shifts.pricing_data.award_rates` and calls `_get_award_rate_for_segment` for non-pharmacist award routes; pharmacist routes may use negotiated pharmacy or worker preferences and must be mapped separately. The outdated module is **not equivalent** to `workforce/award_rates.py`. Product fixes must be designed elsewhere, not on this audit PR.

Holiday source `backend/shifts/data/public_holidays.json` has only 2026 dates across the eight jurisdictions. `backend/shifts/pricing.py:47-51` evaluates membership in that static list; **no 2027 date appears**, so any 2027 ordinary lookup would return false unless an upper layer overrides/replaces the data. Official Queensland public-holiday tables include 2027 events: https://www.qld.gov.au/recreation/travel/holidays/public. State-wide and regional show-holiday distinctions must be preserved; 2026 Brisbane EKKA holiday should not automatically be applied to all Queensland pharmacies.

## Necessary negative and positive execution proof

1. Positive: pharmacist casual 2026-07-01 ordinary weekday and 2026 public holiday rates match source version in `workforce.resolve_award_schedule`; contract must account for classification and 2026 rule as of pay-period start.
2. Negative: non-pharmacist assistant casual shift on a 2026 weekday versus documented Award minimum; assert effective/locked employee rate never goes below $34.76 when subject to this Award. Compare `shifts.pricing` and `workforce.award_rates` results, verify whether lowest guide enters payments or only UI. Add early/late bucket cases.
3. Negative: 2027 Queensland Australia Day (2027-01-26) and Easter/QLD Labour Day classified as public holidays, with correct region treatment; test both shift pricing and worker payroll. Positive: an adjacent 2027 non-holiday weekday remains ordinary.
4. Cross-platform: verify exact source displayed through Vite, Next and Expo shift authoring; rate notices and negotiated/award minimum distinction, and finance invoices if any.
5. Policy: wages, independent locum invoicing and roster employee pays have different contractual and legal status; do not call every displayed guide amount automatic illegal underpayment.

**S3 status:** NOT EXECUTED. **B14 remains a confirmed source data issue**, actual user-facing payroll impact and severity not proven. Source baseline permalinks:
- https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/backend/shifts/data/award_rates_casual_first_level.json
- https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/backend/workforce/award_rates.py#L10-L93
- https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/backend/shifts/pricing.py#L47-L51
