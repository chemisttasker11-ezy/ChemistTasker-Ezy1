# Phase 6 item 4: Fair Work dollar-rate + store-location calculation checks

Requested scope: verify actual MA000012 Award rate calculations and the
registered-store holiday rule only. Do NOT reconcile all 2026–2027 council
declarations here; that remains a separately assigned local action.

Authoritative verified source: https://awards.fairwork.gov.au/MA000012.html
(consolidated as at 1 July 2026, Schedule B.1 and B.2; clauses 21–22, 28).
Adult casual: PHARMACIST weekday 52.18, Sat 18–21 73.05,
Sat 21–midnight 83.48, public holiday 104.35; Pharmacist
full/part time PH 93.92; Pharmacy Assistant level 3 casual PH 73.63;
first-half intern casual PH 84.98. Ordinary PH (225% permanent, 250%
casual) is distinct from overtime; these amounts are source-published
rounded rates, not locally recomputed percentages.

Regression matrix exercises the **actual** external TFN engagement floor,
shift casual preview, technician Level 3 classification, Saturday
boundaries, staff payroll weighted segment (QLD Christmas Eve from 18:00)
and rejects any worker-supplied region override. The pharmacy's configured
state/region controls automatic ordinary shift classification. Unusual
employment agreements / substituted holiday entitlements still require
manual employer review; system must not pretend to determine them.

Existing broad payroll failure tests where fixtures leave Pharmacy.state
blank are preserved for investigation rather than silently weakening
validation or changing expected fixtures.

No official dates, award tables, or schema migrations modified.
