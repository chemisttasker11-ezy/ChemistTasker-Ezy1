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

## Senior design and recruitment review (12 Oct, registry v5)

Built on the v4 work above: same registry structure, codes, role claim modes, `SkillGlyph` component and
explicit Lucide map. 67 entries: 44 skills in three groups and 23 named software products, shown separately.

### Choices merged or removed (all were new in this PR, so no saved production data changes)

The compact choices remain, but retired narrow codes do not resolve to broader skill IDs. Existing draft requirements fail closed until explicitly replaced or removed. Documents are not transferred across different credentials.

| Was | Now | Why |
| --- | --- | --- |
| S8 record administration | S8 and controlled drugs | Ads and locum posts ask for "S8" as one duty: safe, register, balances. |
| Anaphylaxis response training | Separate choice removed | Does not match first-aid/CPR or transfer its proof. |
| Vaccine administrative support | Service and vaccination bookings | The same booking task. |
| NDSS ordering and administration | NDSS access point | One NDSS duty at the counter; diabetes advice stays with the pharmacist. |
| Customer service, click-and-collect | Customer service and POS | Everyone ticks "customer service"; on its own it does not separate candidates. |
| General OTC knowledge, S3 consultation support | OTC and pharmacy medicine advice (S2/S3) | One counter-advice skill with S3 referral. |
| Stock receiving, expiry checks, returns | Stock control | SEEK and Indeed ads say "stock control"; ordering stays separate. |
| Dispensary workflow coordination | Prescription dispensing | Vague; the dispensing task already covers it. |
| Diabetes screening, blood-pressure measurement | Health checks (BP, glucose, cholesterol) | One pharmacy service. |
| Medication adherence support, WHS procedures, Microsoft Excel | Removed | Vague, self-rated or generic office skills (like Word in v4). |

### Added

- Practice settings: Hospital pharmacy, Aged care pharmacy supply (beside ACOP), Wound care (common in job ads).
- Software, grouped as Dispensing systems, DAA packing, S8 registers, Aged care charts, Point of sale, Monitoring:
  - Dispensing systems from the WA Health approved list (updated 23 Dec 2025) plus the national conformance
    register: Fred Dispense / Fred NXT (alias WinIFRED), Minfos, Z Dispense, LOTS (Corum), Corum Clear Dispense,
    Dispense Works, RxOne (formerly PharmacyPro), Aquarius (Simple Retail), myScript, Mountaintop Dispense,
    iPharmacy (hospital), Compound Direct.
  - DAA packing: FredPak, Z Pak, Minfos Packing, myPak, MPS Connect, Webstercare (MedsPro / MedView / MedCare).
  - S8 register ("DD book"): StrongRoom AI (StrongCare / StrongER), approved by WA Health as an electronic register.
  - Aged care charts: Medi-Map, BESTMED. Monitoring: real-time prescription monitoring (SafeScript, QScript).

### Language

Labels use the words Australian locum posts and job ads use: "ODT dosing (methadone, buprenorphine)",
"Webster / DAA checking", "Sole pharmacist / pharmacist in charge", "eScripts and tokens", "Vaccinations".
Definitions are one plain sentence. The Facebook locum groups could not be opened (the Agent Reach Facebook
channel needs system-level setup that was not approved in this session, and Claude in Chrome was not
connected); tone came from public recruiter pages (LocumCo, Pharmacy SOS, Raven's), SEEK and Indeed.

### Certificates

A certificate is requested only where a credential or accreditation applies: vaccination, first aid/CPR/
anaphylaxis, HMR/RMMR, ACOP, UTI, contraceptive and skin prescribing programs, travel/yellow fever and
sterile compounding. Non-sterile compounding no longer asks for one. Software never does.

These are evidence requests for a verification badge, not prerequisites for saving a role-eligible skill claim or applying. Assistant/technician qualification choices show common Levels and full Guild/National Training Register names. A general Level 3/4 award classification alone does not prove the dispensing units were completed. The dispensing qualification claim is separate from its admin verification flag and uploaded evidence.

### Symbols

One family drawn on Lucide's 24px grid: thin navy lines (1.5/1.75/2px by size) over the drawing's own shapes
filled in two brand tints, the group colour (violet dispensing, cyan clinical, magenta retail, blue software)
with a second brand colour across the lower-right half, after the duotone spot icons the owner liked on
ourmedical.com.au (style only, nothing copied). Selected onboarding cards add two motion arcs. Custom glyphs:
blister pack, blister check, robotic arm, mortar and pestle (compounding), POS terminal. Mobile uses PNGs
rendered from the same component (`frontend_web/scripts/render-mobile-skill-symbols.mjs`), so no native SVG
dependency is added.

Named software shows the vendor's own compact mark (app icon, favicon or the mark inside its logo), unaltered
apart from cropping and resizing, beside the product name; sources are listed in the registry
(`software_logos`). Products without a confirmed official mark keep the ChemistTasker software symbol.

### Interface

Onboarding (web and mobile) shows skill cards by group, then a separate "Software you have used" section of
quick mark chips under sub-headings. Staff without a role see a prompt to set it first. Post shift lists
"Software your pharmacy uses" as its own section without definitions.

### Corrections after the full-stack review

The 67-entry catalogue remains compact. Fourteen non-equivalent retired-code mappings and partial-task synonyms were removed. First aid/CPR retains its original meaning. Narrow historic claims and their documents cannot satisfy broader choices. Partial shift edits reject unknown mandatory requirements rather than silently clearing them.

Pharmacy create/edit now collects services and weekday/weekend script bands in Vite and Expo, including explicit clearing and discard/reset behavior. Vite, Next and Expo shift forms collect canonical workload tags and accompanying staff. Existing workload labels round-trip without loss; legacy-only tags appear in an edit only when already selected. Mobile detail cards use readable context labels.

In Next and Vite, pharmacy workload, services, script load and staffing appear only in expanded full details under “Pharmacy services”. Collapsed cards keep Required, Preferred and Software. Those three headings use the same shared font, weight and theme-aware colors in both summary and full details. Glyph registration, neutral surfaces and claim-mode explanations were corrected; the duplicated staff-role warning was removed.

Pharmacy and shift rules live in their owning domains. Shared-client software-default and staffing-input policies have one implementation used by all clients. Domain/model ownership and architecture checks are run as focused validation, alongside skill/context tests and app typechecks. No full regression-gate or production-readiness claim is made.

### Personal role selections in shift posting

Next and Vite share `ShiftSkillPresetControls` at the top of the Skills step. Required, Preferred and Software selections save per signed-in account and professional role using the existing browser-storage adapter. No description-template model or database migration is added. The interface states that presets are saved in this browser.

The shifts domain owns persistence keys, canonicalization, role validation and the new-shift auto-apply policy (`shared-core/src/domains/shifts/skillPresets.ts`). The UI handles loading, feedback and stale-result cancellation once for both web clients. Existing shifts and manual choices require explicit Use saved selections. Unknown, ineligible, conflicting or malformed saved choices are rejected rather than weakening mandatory requirements. Empty presets can intentionally replace previous choices.
