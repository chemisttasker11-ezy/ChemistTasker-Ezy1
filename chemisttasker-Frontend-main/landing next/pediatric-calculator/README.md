# ChemistTasker paediatric anti-infective calculator

Standalone Next.js app. Neither the landing page nor the main Django/Vite platform was changed. This is a local development and clinical-review preview, not a clinically approved prescribing product.

## Run

Requires Node 22+. From this directory:

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:3100. `npm run build` creates the production build; `npm start` serves it on the same port after stopping development. `npm test` runs calculation and DOM interaction tests. `npm run typecheck` checks TypeScript.

## Structure

- `src/components/calculator.tsx`: calculator, searchable medicine library and source/scope views.
- `src/lib/engine.ts`: deterministic validation, historical APLS fallback, age/weight eligibility, fixed/range/banded doses, caps and liquid conversion. No AI runtime.
- `src/data/regimens.ts`: source-transcribed oral development records. Clinician sign-off is pending for every record.
- `src/data/medicines.ts`: scope catalogue; drug inclusion does not imply ARTG registration or paediatric suitability.
- `src/data/sources.ts`: references, access dates and document identifiers. Access dates do not prove source currency.
- `src/data/legacy-regimens.json`: all 94 original regimen records, recovered unchanged. Displayed as indication references; numerical calculations disabled until revalidated.
- `docs/COVERAGE.csv`: ingredient/source coverage inventory. Regenerate with `npx tsx scripts/coverage.ts`.

## Patient and calculation rules

Age is required even with measured weight to prevent bypassing neonatal and regimen-age exclusions. Enter completed years and additional months (0–11). Scope is 1 month to under 18 years. Measured weight accepts 0.5–300 kg as an application input boundary, not a statement of clinical normality.

Only an empty weight field enables age estimation. Invalid, negative, zero and non-finite entered weights block calculation. Historical APLS 2011 estimates: infants 1–11 months use `0.5 × months + 4`; completed years 1–5 use `2 × years + 8`; completed years 6–12 use `3 × years + 7`. No estimate from the 13th birthday. Every estimated result is labelled; source is the linked 2012 validation study. This is a fallback approximation, not a contemporary dosing-weight recommendation.

Standard calculations assume normal organ function and uncomplicated dosing context. Marking allergy/contraindication, renal/hepatic impairment, or complex context blocks arithmetic. This is not automated allergy, interaction or obesity screening. Specialist calculations require an existing treating-team plan acknowledgement, which is cleared when patient or formulation changes; this is not credential verification.

Known liquid strengths have a formulation source. Custom strengths are manually transcribed from a pack by the user, explicitly labelled, and validated for positive finite values. A mg-only result does not determine tablet splitting or a measurable administration amount. Ranges are preserved, not reduced to their midpoint. No administration rounding or course-quantity recommendation is made.

## Clinical release work still required

Independent clinical review; full AMH scope reconciliation (complete index not supplied); medicine-by-medicine source currency and reuse-rights checks; formulation-specific ARTG/PI audit; reconciliation of differing hospital guidelines without blending doses; extension of administration/CMI coverage; review of estimate age conventions; and real-browser desktop/mobile/accessibility validation.

The cefuroxime PCH monograph retrieved during this work lists review due July 2026. Its calculation stays disabled. The later user excerpt is not silently substituted into an enabled regimen.

Patient values stay in React memory, disappear on reload and are not placed in URLs, storage, analytics or API requests. External references open in separate tabs. No database, login, backend access, public deployment or landing-page integration is included.
