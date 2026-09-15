# Verification — 6 September 2026

## Checks completed

- Next.js production build: passed.
- TypeScript strict checks: passed.
- Deterministic engine and React DOM interaction tests: 47 cases passed in the final run.
- Local root route: HTTP 200. Local fonts and supplied wordmark use root-relative asset paths.
- npm dependency installation audit: zero reported vulnerabilities at installation time.

Tests cover historical age-estimation boundaries, measured-weight precedence, invalid weights with no fallback, neonatal exclusion, unknown age, age/weight bands, maximum doses, range endpoints, mg/day division, units-based nystatin, invalid concentration, specialist confirmation, patient changes clearing results, ingredient transitions, oral-only catalogue, all-regimen rendering, independent specialist acknowledgements, manual formulation conversion, library search, and cefuroxime remaining disabled with the AMH excerpt removed.

## Limits

DOM tests use jsdom, not a visual browser. Desktop/mobile appearance, real-browser keyboard/screen-reader behaviour and accessibility contrast have not been independently audited. No live clinical service was called. No specialist authenticated workflow or database integration exists.

Source transcription checks are not clinical validation. All active records are development records awaiting independent pharmacist/clinician sign-off. The 54-ingredient catalogue contains 19 enabled development regimens across 11 ingredients; remaining ingredients and all 94 recovered legacy records are reference-only unless a separate active record exists. This is a broader scope catalogue, not 54 dose-complete monographs.

The supplied AMH cefuroxime excerpt has been removed. The public PCH reference remains calculation-disabled pending source currency review. No new clinical doses were added in this UI pass.
