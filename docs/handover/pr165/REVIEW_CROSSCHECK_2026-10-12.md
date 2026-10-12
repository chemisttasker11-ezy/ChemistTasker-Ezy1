# Reviewer cross-check and successor PR

This is the source-based follow-up to both supplied reviewer reports and the archived PR165 reviews. The user requested a new PR containing this branch's accumulated work, with no intention to merge PR165. The separate `feat/launch-journey-completion-20261012` branch has not been merged here. Its tip `13ec2c1` is not an ancestor of this branch. No collision with that branch occurred locally.

## Policy that the fixes preserve

- Role-eligible skills are claims. A candidate may select them and apply without individual certificates; a claim or upload alone does not earn a verified badge. Employer evidence/supervision checks and existing account-level public onboarding verification remain separate.
- All Other Staff may apply for Assistant work. Intern and Student vacancies are restricted to those respective roles. Technician work admits Technicians, Interns and Students; Assistants need a claimed dispensing competency/qualification. Guild level labels have full qualification explainers. Instant pharmacy staffing additionally uses the pharmacy-accepted membership role; it is not a new certificate gate for applications.
- Pharmacy rates are starting guides. Posted custom rates and date overrides remain available. Internal staff assignment uses their own employment agreement and ABN/TFN settlement terms; accepted external offer terms keep precedence.
- Published external rates are hidden from pharmacy and active owner-chain staff, including when a shift reaches Public. Managers retain rates. Favourites/organisation/public external workers see them unless they also have an internal staff relationship. A worker's own agreed finance records are separate.
- Dedicated bookings remain private regardless of form embedding. No audience widening or team/chain broadcasts.
- Current account role chooses the work profile. Historical onboarding rows remain stored and must not overwrite the current profession, biography or CV.

## Original functional review

| Finding | Correction and ownership | Evidence / limit |
| --- | --- | --- |
| Talent booking lost privacy without `embedded=1` | Explicit dedicated state in shared shifts posting draft and backend posting/serialization rules; Next talent handoff keeps the concrete role/user. | Shared posting tests exercise privacy independently of embedding; backend posting tests reject widening/broadcasts and exercise private partial PATCH. |
| `OTHER_STAFF` resolved to Assistant before subtype | `shared-core/src/talent.ts` resolves subtype centrally; Vite/Next/Expo use it. | Shared talent tests; host typechecks. |
| Expo review dropped work profile and skills/software | Typed shared work profile mapping is retained through native member/interest/offer review; native review renders the canonical grouping. | Expo typecheck/export and shared mapping tests pass. Android/iOS device journeys are separately outstanding. |
| Cleared preset reapplied on step remount | Parent draft owns preset initialization/manual edit state; zero selections remains an intentional edit. | Shared preset and browser wizard regression. |
| Automatic widening mode/interval reset | Parent draft stores mode and interval in both hosts; automatic dates use shared shifts logic. | Shared escalation tests and browser navigation regression. |
| Historical pharmacist row overrode Other Staff | `onboarding/services/work_profile.py` selects current-role onboarding. Public projection and interest biography follow it. Booked private bio/CV now follow it too. | New assigned-profile HTTP test reproduced the old biography, then passed after correction. It checks current Student role, bio/CV and unchanged booked contact access. Historical data is a negative fixture, not happy-path truth. |
| Success handler called twice | Submission invokes completion once; roster replacement retains its existing handler semantics. | Source-derived mocked completion regression and posting browser flow. |
| Recurrence / custom date rates lost during payload construction | Shared `draftSlots` reconciliation and `postingDraft` builder preserve date identities, overrides and extras. | 198 shared-core tests, including date override above pharmacy guide. |
| Chain notification shown for an independent pharmacy | Chain eligibility comes from active owner chains and shared posting availability; UI and payload suppress unavailable chain controls/commands. | Backend chain/posting tests and wizard fixture. |
| Pharmacy context duplicated in collapsed and expanded card | Workload/services/staffing render under full details as Pharmacy services. Required/Preferred/Software use common wording/styles. | Browser card/appearance checks; native device rendering still needs acceptance. |
| Role-specific saved selections | Shared preset API/domain contract; Skills controls save the current role selection and preserve edits. | Backend pharmacy-profile tests and wizard regression. |
| Internal staff saw external rates / claim used published fallback | Backend rate visibility owns redaction, announcements reuse it; staff engagement service owns immutable agreed snapshots. | Rate/claim/engagement tests and PostgreSQL concurrency contracts. No client-only concealment. |

## Packaging, architecture and later reviewer findings

| Finding | Resolution | Evidence / classification |
| --- | --- | --- |
| Registry absent from backend image | Backend Docker build contexts package the canonical registry at `/opt/chemisttasker/skills_registry.json`. One cached loader fails explicitly when missing instead of accepting an empty catalogue. | Backend image boot/system check without source/shared-core bind; registry loader tests. Packaging defect fixed. |
| Vite missing `automaticShiftEscalationDates` export | Development startup builds core, uses canonical compiled output and refreshes dependency optimization. | Live browser module import returned functions for escalation and payload builder. Source alias trial exposed a TypeScript-only export and was corrected. |
| Next reached sibling host dependencies | `@chemisttasker/shared-ui` has its own package/peer boundary; core/UI artifacts are installed without altering locked host dependencies. Next Docker builds from root and traces its standalone runtime. | Isolated production build/boot and authenticated Next/Vite/Django acceptance. Shared UI peer dependency choices remain explicit in package manifests. |
| Payroll settings test failed | Owner overview accepts canonical `pharmacy_id`, preserving existing PATCH logic. | Payroll browser test and full browser gate. |
| Eight pharmacy appearance cases failed | Existing appearance baselines retained. | All 24 appearance cases passed in the 160-pass full browser gate. No screenshot blessing to hide changes. |
| Dedicated partial PATCH used `.index(None)` | Effective dedicated state derives allowed tiers before validation; partial updates preserve private audience. | Description/slot/retarget/unauthorized HTTP cases. |
| Claimed skill could allow unsafe instant technician assignment | Shared backend accepted-membership-role helper governs instant staffing and engagement terms. Applications retain the agreed claims policy. | Claim eligibility and engagement regressions. Distinguish application from immediate staff assignment. |
| `users` imported onboarding fixture composition | Multi-domain staging fixture composition moved to `testing`. Historical compatibility entry point preserved. | Backend ownership contracts pass without widening allowlists. Inherited architecture defect fixed. |
| Posting form remained oversized | Web controllers separate timetable, pricing and templates; shared shifts draft builder/validator serves web and native. Form reduced from about 1,452 to about 740 lines. | Module ratchet and ownership audits; shared payload tests and host checks. Rendering remains host-specific; no claim of zero duplication across the repository. |
| Native travel/accommodation/flexible timing/review absent | Native Details/Timetable fields added; Review uses the actual native board card from the shared payload. | Expo compilation/export pass; device acceptance still required. |
| GST separators corrupted | Two labels restored to UTF-8 bullets. | Source/appearance checks. |
| Registry tests mocked removed permissive loaders | Tests target the canonical loader and packaged resource path, including fail-closed behavior. | Backend CI matrix passes. |
| Pay-visibility N+1 (several queries per shift) | Request-scoped serializer context caches by request, user and pharmacy; all three shift serializers reuse it. Policy stays in `shifts/rate_visibility.py`. | Regression primes one decision, then 50 calls across serializers issue zero additional queries; a subsequent request sees newly granted manager scope. Per distinct pharmacy lookup still exists. |
| Payroll-enabled community claims now require TFN/dated engagement | Intentional use of existing staff assignment/settlement rules, not a certificate restriction. Incomplete agreements refuse instant assignment rather than lock an external advertised rate. | Engagement/claim tests; document this visible prerequisite for owners. |
| Stale Technician-only source comment | Comment corrected to the actual shared role matrix. | No eligibility code change. |
| Wiring job unauthenticated fetch | Audit uses the `origin/main` ref already fetched by checkout. | Local wiring audit passes. Real hosted checkout evidence must come from the successor PR's CI. |
| Generated Next files / fixtures accidentally publish | Generated dev AGENTS/next-env changes removed; synthetic credentials/users/SDK/artifacts remain ignored. Historical handover copies are deliberately tracked under docs at the user's explicit request. | Pre-publication status/check-ignore and tracked-file review. |

## Verified lifecycle and limits

Fresh isolated Student candidates started with empty skills, then saved `PRESCRIPTION_DISPENSING` and `CORUM_LOTS` through the normal onboarding PATCH with `tab=skills`. GET reloaded both IDs. The real owner browser journey passed Next login/return destination, Vite candidate review, current role, experience and account ID badge, anonymous public counteroffer before reveal, real owner reveal, returned skill/software IDs and absence of email/CV. These candidates are explicitly synthetic; fixture admin account-verification flags are not evidence of genuine qualification verification.

The second live Next check passed server ranking and organisation/search/role/urgency request filters. Public-board data is mocked for that ranking check; it is not real marketplace acceptance. The isolated auth suite separately passed owner refresh/CSRF/logout and delegated pharmacy scope (2 tests).

Neither the user's old seeded users nor directly forced historical profiles establish product policy. API/registry rules and explicit user decisions do. Negative historical tests stay separate from the clean happy path.

This cross-check addresses the supplied actionable findings. It is not a certification that every control on every changed page has been independently exercised on every platform. Architecture checks enforce current domain boundaries; 42 pre-existing Vite/Next wiring drift entries remain visible in the wiring report. Do not hide them or describe the entire codebase as duplication-free.

## Remaining release acceptance

1. Complete Android APK installation and native onboarding/talent/candidate/posting/roster journeys. Official emulator is installed and booted. Android export succeeded. Windows debug compilation initially failed with CMake process errors, then old Ninja's long prefab paths; a disposable-toolchain retry with installed Ninja 1.12 is in progress. No vendor/app-source workaround is being published.
2. Run iOS native acceptance on a Mac/iOS runner; none is available in this Windows session.
3. Obtain the successor PR's hosted CI results, including checkout/wiring and platform-specific jobs, then staging multi-persona acceptance before merge/release. Local production image boot is not staging acceptance.
4. Reconfirm exact publication commit gates and record results in the current ledger. No merge, deployment, live data migration or real outbound messaging occurred here.

PR165 is superseded for this publication. The launch branch is excluded; integrating it is outside this task.
