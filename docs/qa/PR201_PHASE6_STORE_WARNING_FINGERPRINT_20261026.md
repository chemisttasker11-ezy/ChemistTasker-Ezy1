# Shift pricing fingerprint: store message-only change

PR201 run https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/actions/runs/40204717233
failed only the historical pricing-matrix fingerprint (107 tests: 1 failed),
with observed SHA ad683b2ba0f64963fe23a0ea84ffe9b654135357cf3293fc5b7d26d856bd8476.

Compared against previous expected SHA 2bf25c5417541de8fdff3208ec5de97fddd1382bd174724793bea6ccb66bf33d.
The code change affecting the pricing matrix between these heads only
reworded `shifts.holidays.HolidayResolution.note` on an unconfigured district
from "employee's work-base district" to "registered store's declared
district"; holiday date logic, rate lookups and values were untouched.
The matrix includes provenance/warning text in the fingerprint, so this
intentional copy correction changes the hash without changing money.

The six new published MA000012 source-amount and store-location tests in
the same CI run passed (overall failure solely the snapshot). Updating
the single golden hash is therefore justified; do not update it again
without source review and positive/negative amount comparisons.

No schema/data/deployment changes. Production NO-GO.
