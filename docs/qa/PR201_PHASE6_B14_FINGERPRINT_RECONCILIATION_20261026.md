# B14 pricing fingerprint deliberate change

After integrating `shifts.holidays`, the existing `shifts.test_pricing_contract.PricingEquivalenceTests` fails the fingerprint at PR201 CI [40201071214](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/actions/runs/40201071214), reporting:

- Prior snapshot: `e28fcfd3cd9c2b7ad17e5d448555841721d5d99c04009e05341a47376a2bef79`
- Actual new snapshot: `2bf25c5417541de8fdff3208ec5de97fddd1382bd174724793bea6ccb66bf33d`

This is an **intentional metadata change**, not a semantic pass by assumption: public holiday segments now include source, scope, verified/pending status and region. Existing 2026 representative NSW date/day dollar assertions passed in the same CI run, and new 2026–2027 region-specific amount comparisons remain separate golden tests. The ratchet is updated to this observed CI value only, with explicit provenance.

Run the full targeted matrix under the current exact branch head before considering this verified. If further rates differ, fail the gate and investigate rather than updating the golden again blindly. No deployment. NO-GO.
