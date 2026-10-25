# Shifts domain agent instructions — release safety

## Australian holidays and MA000012
**Mandatory first read:** [data/AGENTS.md](data/AGENTS.md) before changing any date/rate decision, work-base, shift preview, staff engagement, payroll award floor, client presentation, holiday source or annual calendar. It is the single maintained instructions file.

- `shifts.holidays`: the ONLY federal/state/territory/district/date/window/substitution resolver.
- `shifts.pricing`, `shifts.engagement`: consumers of the above, not independent public-holiday data or bespoke council switches.
- `data/reconcile_public_holidays.py --check`: offline evidence/structure gate; pass it before treating calendar as source verified.
- `qa_release.test_pr201_phase6_holidays`, `qa_release.test_pr201_phase6_award_floor`, `shifts.test_pricing_contract`: mandatory positive and negative guards.
- Shared-core presentation helper `shared-core/src/domains/shifts/holidays.ts` is the only Vite/Next/Expo interpretation of API holiday dates; it must not contain legal classification rules.
- Unverified store region / year **must never silently produce a certified payroll amount**. Keep official holiday sources and date-effective rate provenance.
- Never modify legal calendar JSON, authoritative 2026 rates or test golden fingerprints just to make CI green. A deliberate government-backed revision requires dated evidence and new positive/negative contracts.

Changes must remain on the authorised PR #201 remediation branch; audit-only PR #200 stays untouched. No migrations or deploy without explicit approval. Production NO-GO until full release acceptance.
