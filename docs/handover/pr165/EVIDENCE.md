# PR165 evidence and limits

Application commit `2e67f18` was pushed to both PR165 feature branches after the user's explicit immediate-push instruction. The full outgoing gate was not completed; do not mark it passed. Hosted checks, exact-commit gate and staging acceptance remain release work. The following results are focused pre-publication evidence, not all-CI acceptance.

## Reproduced before the fixes

The initial senior review executed source-derived probes with synthetic inputs and mocked managers/task dispatch. It confirmed: a dedicated booking could broadcast to another worker; `OTHER_STAFF` short-circuited Technician to Assistant; cleared saved selections reapplied after step remount; widening mode/interval reset; the success callback ran twice; an Other Staff account with an admin-created historical pharmacist row displayed the old profession. The candidate review source also dropped the native work profile. The source locations and original probes are described in the archived senior review; they are historical evidence, not current passing tests.

The recurring Review representation showed date-specific rates while submission kept only the base recurrence rate. A subsequent custom-rate probe showed why the pharmacy rate must remain a guide. Staff-rate review found that shift responses and announcement email cards exposed advertised rates at all tiers, and community claims created assignments without the existing staff settlement snapshot.

## Verification completed

| Check | Result and scope |
| --- | --- |
| Shared policy tests | 45 passed across skills, context, presets, visibility, work profile, recurrence/rate rows and talent presentation |
| Earlier relevant backend regressions | 122 passed; disposable SQLite, synthetic users and captured dispatch |
| Final rate/engagement regressions | 88 passed; viewer redaction, emails, staff agreement claims, posted overrides, existing posting/claim/roster and membership/engagement contracts |
| TypeScript | Shared build and Vite/Next/Expo checks passed |
| Architecture | Domain ownership, shared package/transport/boundary and static wiring checks passed |
| Web fixture | Actual shared form and card with mocked API; no real save/email; navigation state, direct booking, callback, custom rate and rate visibility observed |

These runs overlap; do not add their counts as unique tests. The final rate run corrected one formatting expectation (`77.50` versus the existing formatter's `77.5`). No product change was made to satisfy that assertion. Negative-path notification-queue failures were intentionally mocked by existing contracts.

The direct synthetic submission had `dedicated_user:42`, `visibility:LOCUM_CASUAL`, all widening timestamps null, all broadcast flags false. Two successful synthetic submissions produced two completion calls, one each. A separate custom-rate submission kept slot rate `77.50` alongside pharmacy guide `65`; the guide was not silently saved over the pharmacy profile. Browser-scoped preset persistence is not claimed as account/cloud syncing.

For internal viewers, serializer tests remove `rate` from every slot, posted fixed/range/super/payment fields and nested pharmacy pay defaults; they also exercise the real community detail URL. Owner/admin and favourite controls retain rates. Active owner-chain staff are hidden; inactive chains do not create that relationship. Worker-specific agreed invoice lines remain unchanged. Email metadata removes both summary and per-date prices for staff.

Staff claim tests record TFN/TIMESHEET_ONLY with no external published unit rate when the pharmacy handles its own payroll; payroll-enabled claims price from the dated EmploymentEngagement snapshot. Missing required payroll terms refuse atomically rather than falling back to the advertised rate. An overnight Friday/Saturday example locks 47.50 from the employee's 40/50 agreement, independent of a posted 99. Accepted external engagement routing remains covered by existing membership/settlement tests.

Native work-profile rendering is compiled and policy-tested, not independently accepted on a device. The full release gate is separate from these focused results and must be recorded against the outgoing commit. Keep PR165 draft until hosted checks/staging acceptance are reviewed.

Four serializer baselines intentionally change: Shift and MyShift add `support_on_shift` and the read-only `published_rates_visible`; OpenShift adds the visibility flag; ShiftOffer inherits the updated nested shift/pharmacy context. No top-level fields are removed from these serializer declarations. Viewer redaction is a runtime projection. SQLite and actual PostgreSQL contracts were measured separately; no unrelated serializer baseline or ownership allowlist was changed.

## Primary-source qualification evidence

- [Guild certificate training](https://www.guild.org.au/guild-branches/act/training/certificate-training): Certificate III in Community Pharmacy (SIR30116), Certificate IV in Community Pharmacy (SIR40116), Certificate IV in Community Pharmacy Dispensary (SIR40216) and dispensary courses.
- [National Training Register — SIRCDIS003](https://training.gov.au/Training/Details/SIRCDIS003): Assist in dispensing prescriptions is core in SIR40216, elective in SIR30116/SIR40116 and part of SIRSS00012. A general certificate title does not prove that unit/stream was completed.
- [National training package](https://training.gov.au/assets/SIR/SIR_R2.0.pdf): Community Pharmacy Dispensary skill set SIRSS00012 includes dispensing units.
- [Guild Certificate III course flyer](https://www.guild.org.au/__data/assets/pdf_file/0034/94669/22_000086_CIII-CP.pdf): distinguishes streams, including dispensary.
- [Pharmacy Industry Award, Schedule A](https://awards.fairwork.gov.au/MA000012.html): common Levels describe competencies/classification; they are distinct from the evidence of a particular dispensing qualification.
- [Pharmacy Board internships](https://www.pharmacyboard.gov.au/Registration/Internships): provisional registration and approved supervised practice for interns.
- [Pharmacy Board dispensing guideline reference](https://www.pharmacyboard.gov.au/documents/default.aspx?chksum=cZm3mO8R6fTMdPPl3scPUw%3D%3D&dbid=AP&record=WD15%2F17695): education/training/experience and supervision distinguish student/intern and assistant/technician scope. This point was checked using indexed primary-source excerpts; direct retrieval returned 403. Do not describe that PDF as downloaded. An older Guild skill-set PDF returned 404, so qualification confirmation uses the National Training Register instead.

The user's final product policy separates claimed skills from verified evidence. Missing individual certificate verification does not prohibit saving a role-eligible claim or applying. Employers remain responsible for verifying regulated work and supervision. Assistant dispensing eligibility is a claim-based app policy; it is not independent pharmacist authorization.

## Migration and local evidence

Migration 0074 adds qualification claim, verified marker and review note to the onboarding-owned Other Staff model. No historical files/rows were removed and no generic certificate verification was converted into dispensary approval. The PR165 local database backup preceded migration; the ignored dump is 1,373,534 bytes. No production database was changed.

Local-only logs and screenshots are recorded in `playground/PR165_FIX_EVIDENCE_2026-10-12.txt`, `fix-regressions-final.log`, `rate-policy-tests.log` and `review-fixes-visual/`. They contain local synthetic fixtures and remain ignored. This tracked document carries the findings, scope and limits for an agent on another machine.
