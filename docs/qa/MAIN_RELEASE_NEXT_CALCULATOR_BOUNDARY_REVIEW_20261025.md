# PR200 continuation — bounded web/Next clinical and tenant-boundary review (2026-10-25)

## Integrity and scope

Live PR200 head checked **3c81f80d13a2c69bcf67a21e6666e4f677dcadc5**, OPEN/DRAFT. No application changes, tests or runtime traffic performed. This is a *bounded manually inspected source subset*, NOT C073/C074 completion or a whole-chunk S1 verdict. Prior B01–B71, C/F findings and three P0 source confirmations remain preserved. Aggregate remains stale.

## New release-gate candidate: Next paediatric dose calculator made publicly accessible before independent clinical validation

Classification: **P1 release-governance / clinical safety candidate**; **SOURCE_CONFIRMED exposure and lack of sign-off, NOT a clinically incorrect-dose proof**. This candidate is **newly recorded for validation**, subject to duplication check against pre-existing findings. There is no claim of verified harm or executed tests.

Causal path:
1. [`app/calculator/page.tsx`](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/frontend_web/landing_next/app/calculator/page.tsx) is a public Next route rendering the calculator without server-side professional login/authorization.
2. [`components/calculator.tsx#L33-L49`](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/frontend_web/landing_next/features/paediatric-calculator/components/calculator.tsx#L27-L51) displays mg/dose and mL/dose for routine category regimens once numeric input and programmatic blockers pass. It displays *Clinical validation pending* at lines 101/107, but a warning is not a hard gate.
3. [`data/regimens.ts#L3-L24`](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/frontend_web/landing_next/features/paediatric-calculator/data/regimens.ts#L3-L24) explicitly states its records are source transcriptions without independent clinical sign-off; routine regimens default to `category:'calculation'`.
4. [`lib/engine.ts#L28-L48`](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/frontend_web/landing_next/features/paediatric-calculator/lib/engine.ts#L28-L48) checks age, weight, contraindication flags and dosage caps and blocks reference-only/specialist unconfirmed cases, but cannot validate clinical appropriateness or clinical source currency.
5. [`data/medicines.ts`](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/frontend_web/landing_next/features/paediatric-calculator/data/medicines.ts) notes that ARTG/supply status has not been audited.

Impact: The public can obtain patient-specific paediatric anti-infective numeric doses from a tool explicitly marked unvalidated. This is a release decision about whether the calculator must remain feature-flagged, restricted to qualified clinical users or withheld until independent sign-off. The issue is **not** a proof that any particular regimen value is wrong.

Negative test contract: On a production-like Next deployment with no authenticated session, GET /calculator and interact with an ordinary regimen after entering child age/weight; determine whether unvalidated mg/mL values are generated; check intended product policy.
Positive test contract: Confirm that release build does not expose clinically actionable outputs until each enabled indication/formulation has documented independent Australian clinical/pharmacist review, source version/date, extreme-boundary test cases and signed release acceptance. Check neonatal, age-band, min-weight, max-dose, divided daily dose, strength and renal/hepatic/allergy flags.

## Reviewed implementation boundaries; no new defect claimed

- [`app/api/[...path]/route.ts`](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/frontend_web/landing_next/app/api/%5B...path%5D/route.ts) permits only `v1` prefix, forwarding through shared `platformProxy`.
- [`app/api/platform/[...path]/route.ts`](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/frontend_web/landing_next/app/api/platform/%5B...path%5D/route.ts) forwards incoming path through `platformProxy`.
- [`app/api/hub/[...path]/route.ts`](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/frontend_web/landing_next/app/api/hub/%5B...path%5D/route.ts) maps session to public-hub/me, users/login and users/logout; other hub paths forward via `platformProxy`. Object access is enforced by backend, not these route wrappers; earlier C075 covers proxy.
- Ethical Next route wrappers delegate to `EthicalWorkspaceV2`; its client code checks access contexts before loading lots/transfers and its UI gates owner action presentation. This does **not** prove backend cross-tenant safety and earlier C010 findings still require tests.
- Public marketplace item page requests `marketplace.getListing` and gated enquiry; the request supplies `buying_pharmacy` chosen from eligible contexts. Backend must independently validate it; no novel server vulnerability proved.

## S0 / S1 / S2 / S3 accounting

- S0: historical static scan exists, not rerun.
- S1: **no newly certified whole-file chunk** in this note. Pending 14 chunks remain pending.
- S2: bounded causal source reasoning above only, not independent second-review sign-off.
- S3: **0 tests executed**; no HTTP, browser, PostgreSQL, native, clinical dose verification, or deployed acceptance.
- The recorded expected 1,826/2,151 S1 is **not** regenerated here; original ledger remains stale.

## Follow-through

First complete C073/C074 with whole-file records rather than using this limited review as proof of 103 file completions; audit backend ethical authorization and marketplace enquiries, then C046/C048/C076-C078, C072, C080/C082-C086 and F12. Regenerate ledger using the existing merge tool at an authenticated checkout, dedupe findings, repeat critical source verification and perform exact-head runtime testing. PR remains DRAFT and NOT RELEASE READY.
