# PR 165 skills and onboarding review

The registry now contains 66 pharmacy capabilities. The four unused entries below were deleted, and onboarding shows no legacy-selection notice. The remaining choices retain exact codes, role conditions and separate definitions for tasks that require different experience.

## Recruitment decisions

| Removed entry | Reason |
| --- | --- |
| Cash handling and payment terminals | Overlaps point-of-sale operation in this picker. |
| Telephone and customer enquiries | Overlaps customer service. |
| Microsoft Word | Adds little differentiation for pharmacy shift recruitment. |
| Other pharmacy software | Does not identify a product or demonstrate a match to a named system. |

These are product decisions, informed by the tasks and skills described by [SEEK for pharmacy assistants](https://au.seek.com/career-advice/role/pharmacy-assistant), [SEEK for pharmacists](https://au.seek.com/career-advice/role/pharmacist/resume-templates), [Indeed pharmacy assistant listings](https://au.indeed.com/q-pharmacy-assistant-jobs.html), and [Raven's guidance for locum shifts](https://www.ravensrecruitment.com.au/pharmacists/how-to-prepare-for-your-first-locum-pharmacist-shift-a-complete-guide-for-australian-pharmacists). These sources support prioritising identifiable tasks and software experience; they do not establish professional eligibility.

DAA packing and final checking remain separate. Vaccination and vaccination administration support remain separate. NDSS support and ordering remain separate. Stock receiving, ordering, reconciliation, rotation and returns describe different responsibilities. Removing them as apparent duplicates would weaken recruitment precision.

Australian dispensing products remain named capabilities. The reviewed software references include [SafeScript integration](https://www.health.vic.gov.au/drugs-and-poisons/setting-up-and-accessing-safescript) and [Dispense Works](https://www.posworks.com.au/pharmacy/dispense-works/). Generic office skills and self-rated personal qualities should not crowd out specific pharmacy experience.

## Symbols and interface

Web uses one explicit Lucide import map across Vite and Next, with a 24-pixel optical grid and smaller card badges. Mobile uses one native badge component and the corresponding Material icons. Dispensing software uses a consistent monitor symbol; the visible product name provides the distinction. The UTI symbol represents a consultation rather than laboratory testing. Icons supplement visible labels, following [Lucide's accessibility guidance](https://github.com/lucide-icons/lucide/blob/main/docs/how-to/accessibility.md).

The custom DAA symbol follows [Webstercare's seven-day, four-dose arrangement](https://www.webstercare.com.au/webster-pak-medication-packs/). The final-check overlay describes the task and uses the surrounding text colour. It is separate from credential verification.

Onboarding adds search across names, definitions and aliases, selected counts, responsive category navigation, visible selection borders and upfront certificate hints. Uploaded documents say “Document uploaded”. Mobile job cards and public software filters now display readable labels. Talent cards use “Other pharmacy skills” for ordinary dispensing and retail capabilities instead of overstating them as “Expanded Scope”.

## Logic corrections

Shift role changes revalidate both requirement lists. Canonical aliases are normalised when editing shifts and onboarding. Talent writes check the account role, staff subtype and software category. Certificate aliases retain their existing proof, preview URLs are cleaned up, malformed skill arrays return validation errors, and removed IDs never match. One mobile filter hook owns the previous duplicate implementations.

## Verification and release status

Focused shared-core and backend skill regression tests pass. The affected web and mobile applications have been typechecked; Vite and Next builds passed during the review. Synthetic browser checks cover Webster search, technician role boundaries, assistant software familiarity, certificate display, saving canonical IDs, empty results, dark theme and phone widths. Automated WCAG A/AA checks found no violations after correcting selected-card contrast; input-background contrast also received visual review.

The full test matrix and API replay were stopped at the user's request. No production-readiness or complete regression-gate claim is made. PR 165 remains a draft; its pre-review hosted checks included Vite and broader backend/E2E failures. No database migration was added or applied.
