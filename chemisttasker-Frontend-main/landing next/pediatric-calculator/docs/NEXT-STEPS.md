# Handoff — 6 September 2026

Resumed: oral-only catalogue and all-regimen result cards are implemented. Remaining clinical data expansion is pending.

## Current working application

- Standalone Next.js calculator at http://127.0.0.1:3100/. Run `npm run dev` from `pediatric-calculator` if needed.
- Uses the landing page's design direction without integrating into the landing or main project.
- 54 oral catalogue entries, 19 enabled development regimens across 11 ingredients. Catalogue inclusion does not mean a verified dose is available.
- Measured weight takes priority. Automatic age-estimation applies only when weight is blank; invalid weight blocks calculation.
- The hero illustration is now a graduated 100 mL measuring cylinder.
- Clinical sign-off and exhaustive Australian formulation verification remain outstanding.
- Closing checks: TypeScript passed and all 47 existing tests passed after retrying outside the sandbox. The initial test attempt failed during a Windows user-information lookup, before tests ran. The earlier production build predates the decorative icon change; no new clinical logic was introduced in this closing pass.

## Progress in the resumed UI pass

Completed steps 1 and 2 below. Removed the AMH excerpt, its source file and obsolete documentation; step 3 still needs a verified replacement dose source. All 47 tests and the production build passed. Coverage CSV regenerated.

## Agreed scope and next implementation steps

1. **Oral paediatrics only.** Work from the existing list and its gaps; ingredient names suffice. Remove the eight parenteral reference entries and dexamethasone from the displayed catalogue. Preserve recovered legacy data as an archive.
2. **Show every indication/regimen in results.** Remove the indication selector and route toggle. Render separate result cards for all oral regimens of the selected ingredient. Each card needs its own eligibility checks, source, duration, maximum and specialist acknowledgement; clear acknowledgement on patient/formulation changes.
3. **Replace the supplied AMH cefuroxime excerpt.** Remove `submitted-cefuroxime.ts` and its UI/test/document references. Do not relabel AMH numbers as coming from another source. The existing public PCH cefuroxime source has a July 2026 review date and remains calculation-disabled. Verify a public Australian paediatric source or suitable product PI before enabling replacement doses. The Zinnat tablet PI alone does not establish the requested paediatric regimen.
4. **Expand Australian oral forms and strengths.** Add source-linked liquids, tablets and capsules for the existing ingredients. One brand's Australian PI is sufficient; no need to enumerate every generic. Use PBS and Chemist Warehouse as product-finding directories. Distinguish registered/source-listed products from currently marketed stock, overseas/SAS supply and compounded formulations. Do not claim exhaustive market availability from a PI alone.
5. **Expand remaining oral regimens.** Prioritise public CHQ, RCH, SCHN, PCH and TGA/brand PI evidence. Record source-specific ages, indication, mg/kg/dose versus mg/kg/day, frequency, maximum, duration and formulation restrictions. Keep unsupported paediatric entries explicitly reference-only; specialist regimens need a separate status. Never extrapolate adult doses. Do not describe an incomplete search as proof that no paediatric evidence exists.
6. **Product handling only where documented.** Add exact brand-specific crushing/opening instructions when readily available. Otherwise leave this pending. Protect non-interchangeable liquids/tablets and combination ratios; do not convert a dose to a volume for an incompatible formulation.
7. **Verify before release.** Test all-regimen rendering, age/weight boundaries, inclusive weight bands, caps before volume conversion, combination components, formulation compatibility, per-card specialist gates and blank/invalid weight behaviour. Run tests, typecheck and build, then inspect desktop/mobile UI. Obtain independent pharmacist/clinician validation before clinical release.

## Research already saved

`scripts/research-products.py` fetches public ACSQHC Medicine Finder PI/CMI pages; `scripts/read-research.py` extracts relevant text. Raw caches are in ignored `.research/`, not shipped content. Some HTTP 200 results redirect to the generic directory, so validate the document title and content. Some slugs returned 404; retry only corrected slugs. Research has not yet been transcribed into medicine records.

Useful corrected slugs to continue checking: `flopen-viatris`, `zithromax-powder-for-oral-suspension`, `doryx`, `bactrim-ds-tablets`, `noxafil-oral-suspension`, `noxafil-modified-release-tablets`. Prefix these with `https://www.safetyandquality.gov.au/medicine-finder/` and verify live content before use.

Existing catalogue gaps to evaluate include linezolid, fosfomycin, atovaquone/proguanil, artemether/lumefantrine and praziquantel. Their inclusion and calculable doses still need source review.

## Future integration

The separate main project at `C:\Users\semse\Desktop\chemisttasker` uses Django/DRF/PostgreSQL with a React/Vite frontend. No integration changes have been made. Keep the calculator separate until the user requests integration.
