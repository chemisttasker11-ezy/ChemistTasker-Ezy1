# UI foundation wiring dispositions

Read with [the closeout and remaining-task plan](UI_FOUNDATION_CLOSEOUT.md). Baseline: local main `a4fb05b`; reviewed application: `13844e6`. This inventory includes the 29 files whose extracted API/navigation/environment/route literals differ. It does not enumerate every CSS-only change or establish exhaustive behavioral equivalence. Shared services, dynamic callbacks and authorization contracts require the separate source/tests recorded in the closeout.

## Extracted per-file differences

Paths below are relative to `frontend_web/`. “Acceptance” identifies observable branch behavior to include in the later product discussion; it does not authorize reverting the redesign.

| File | Disposition |
| --- | --- |
| `landing_next/app/(hub)/layout.tsx` | Inline home/blog/hubs/news/legal links are now provided by the public shell/route registry. Public destinations remain represented there. |
| `landing_next/app/(public)/layout.tsx` | Home branding is supplied by the common public header rather than a second inline logo link. |
| `landing_next/app/hubs/community-client.tsx` | Former local section/navigation literals disappear with the public hub composition. Public hub and dashboard hub remain distinct surfaces; verify real-stack account handoff in acceptance. |
| `landing_next/app/landing-page.tsx` | Calculator, public boards, hub and store links move to public route/store constants. Dashboard platform handoff belongs to the shared session layer; the removed page-specific environment read is not a backend API deletion. |
| `landing_next/app/not-found.tsx` | Adds real home/public-shift recovery links. Acceptance: recovery destinations are deliberate additions. |
| `landing_next/public/footer.tsx` | Adds home/account-deletion recovery destinations; existing public legal destinations remain. |
| `landing_next/public/header.tsx` | Registry supplies home. `/onboarding/referee-reject/` is a pathname exception to dashboard handoff, not an HTTP request. |
| `landing_next/migrated/components/LegalDocumentShell.tsx` | Adds in-page `#section` links. No server mutation or new API. |
| `landing_next/migrated/pages/MobileCheckoutReturnPage.tsx` | Original `frontendmobile://` handoff retains path/query. Adds timed retry/store/web-dashboard fallbacks. Acceptance: native-return and web fallback need a device/seeded-stack test. |
| `landing_next/migrated/pages/OrganizationPricingPage.tsx` | Standalone page navigation is owned by the common public shell. Contact-form service remains its established owner. |
| `landing_next/migrated/pages/PricingPage.tsx` | Inline home/organization-pricing links are represented by the common shell/registry and page navigation. No pricing API retarget found in this comparison. |
| `landing_next/migrated/pages/PublicJobBoardPage.tsx` | Adds login/register links carrying `next=/shifts/public-board`. Public entry/session helpers remember and finish that destination. Keeps public-board/interests service calls; guards stale searches and resets pagination on filter changes. Acceptance: intended server ordering/filter behavior and authenticated return destination. |
| `src/layouts/DashboardTopShell.tsx` | Adds the active delegated-admin overview destination using the assignment's pharmacy ID. Persona/selector browser coverage verifies existing scope behavior. |
| `src/layouts/TopBarActions.model.ts` | Removes a duplicated hardcoded search route catalog; results now derive from authorized navigation. Acceptance: search result availability/order changes with capabilities/workspace. |
| `src/layouts/TopBarActions.tsx` | Removes duplicate top-bar pharmacy/admin-summary reads in favor of workspace/nav state. Admin/persona navigation remapping remains. Acceptance: workspace state must be refreshed through its owner when memberships change. |
| `src/navigation.tsx` | Adds explorer shifts navigation grouping; existing routed child surfaces remain in App routes. Acceptance: grouping/search changes are frontend behavior, not just styling. |
| `src/pages/dashboard/admin/AdminOverview.tsx` | Uses canonical `/dashboard/pharmacy-hub`; shared shell/session owns logout instead of this page's former shortcut. Capability/persona checks remain separate. |
| `src/pages/dashboard/organization/OrganizationOverviewPage.tsx` | Uses canonical hub and adds invoice action; former overview shortcuts are moved into current navigation/composition. Acceptance: overview action availability changes, particularly finance scope. |
| `src/pages/dashboard/sidebar/ActiveShiftsPage/index.tsx` | `baseRoute` to `postShiftRoute` extraction preserves the edit destination and shift ID. Candidate reveal/profile/cache/rating fixes preserve existing service endpoints and payloads; tests cover mapped reload, reveal retry and competing selections. |
| `src/pages/dashboard/sidebar/InvoiceDetailPage.tsx` | Redirects legacy detail entry to the matching list's `?invoice=id` review state. URL behavior tests verify same-workspace opening/back handling. |
| `src/pages/dashboard/sidebar/InvoiceGeneratePage.tsx` | Redirects legacy generation entry into workspace `?new` with existing shift prefill. The literal extractor truncates the nested template; inspect the actual composed URL and browser tests, not the truncated token. |
| `src/pages/dashboard/sidebar/LearningMaterialsPage.tsx` | Public learning/community links use the configured Next/public origin. This public destination is separate from the dashboard's scoped Vite hub. |
| `src/pages/dashboard/sidebar/OverviewPageStaff.tsx` | Personalized shift cards add role-specific shift detail links; former shortcuts move to the current dashboard composition/navigation. Acceptance: worker overview/recommendation content changes align with backend policy decisions. |
| `src/pages/dashboard/sidebar/owner/LocumManager.tsx` | Adds `mailto:` in expanded member detail. Existing membership/favourites services retain ownership. |
| `src/pages/dashboard/sidebar/owner/OwnerOverviewContainer.tsx` | Adds workforce-settings navigation. Existing scoped `/dashboard/owner/` GET remains; admin/workspace IDs continue through dashboard parameters. |
| `src/pages/dashboard/sidebar/owner/OwnerOverviewHome.tsx` | `/dashboard/` token is an activity URL allowlist check, not a new GET endpoint. Parent container still loads dashboard data. Acceptance: dashboard cards/counts/action destinations reflect the new composition. |
| `src/pages/dashboard/sidebar/owner/OwnerPharmacyDetailPage.tsx` | Adds pharmacy-tool/workforce-settings destinations preserving base path/pharmacy query ID. Extracted sections retain markup; payroll PATCH contract and appearance tests pass. |
| `src/pages/dashboard/sidebar/owner/PharmacyAdmins.tsx` | Adds `mailto:` in expanded admin detail. Its service returns raw records; snake_case here is not the interest mapper defect. |
| `src/pages/dashboard/sidebar/owner/StaffManager.tsx` | Adds `mailto:` in expanded member detail. Membership mapper intentionally retains raw and mapped aliases; do not blanket-convert consumers. |

The two user-reported regressions have separate evidence: explicit shell public-home links at 390/1440 px, and dashboard hub staying in Vite even with the public-community flag enabled. The old main hub redirect is intentionally changed at the user's request; it cannot be described as unchanged navigation.

## Next/Vite duplicate-source review

The audit finds 43 differing twin files, of which **35 already differed on main**. Eighteen of the current Next twins are unchanged from main. Source inequality alone is not an API/behavior defect: public navigation/session/proxy adapters intentionally differ from Vite's React Router/direct API bootstrap.

Eight twins newly differ relative to main:

| Twin path under `pages/` | Classification |
| --- | --- |
| `AccountDeletionPage.tsx` | Next legal-document shell/presentation composition; deletion instructions/email remain. It does not perform account deletion. |
| `MobileCheckoutReturnPage.tsx` | Next public store-link registry and fallback presentation; original deep-link construction remains. Device/web fallback acceptance remains open. |
| `PrivacyPolicyPage.tsx` | Next public legal shell/section composition. Presentation/content review is distinct from changing a backend privacy permission. |
| `TermsOfServicePage.tsx` | Next public legal shell/section composition. No backend service retarget found. |
| `dashboard/sidebar/ShiftsBoard/components/FiltersSidebar.tsx` | Thin adapters use the same shared filter component through different relative import paths. The underlying presentation is consolidated. |
| `dashboard/sidebar/ShiftsBoard/constants.ts` | Shared filter headings re-exported through app-specific paths; app-specific map/travel constants remain local. |
| `dashboard/sidebar/ShiftsBoard/types.ts` | Shared `FilterConfig`; Next additionally carries public-presentation props. Different surface capabilities must remain explicit. |
| `dashboard/sidebar/ShiftsBoard/hooks/useFilterSort.ts` | Next public surface preserves server result ordering and notifies parent filter state outside render/state updater callbacks. This is observable behavior for product acceptance; it is not a reason to copy public flow into authenticated Vite blindly. |

Pre-existing differing twins, grouped for bounded maintenance:

- Public/auth infrastructure: `components/PublicContactFormSection.tsx`, `components/PublicLogoTopBar.tsx`, `config/api.ts`, `constants/api.ts`, `contexts/AuthContext.tsx`, `layouts/AuthLayout.tsx`, `theme/sleekTheme.tsx`, `utils/apiClient.ts`, `utils/dashboardPath.ts`, `utils/seo.ts`, `utils/tokenService.ts`.
- Public/auth pages: `pages/MobileOTPVerify.tsx`, `pages/NotFoundPage.tsx`, `pages/OTPVerify.tsx`, `pages/OrganizationPricingPage.tsx`, `pages/PasswordResetRequestPage.tsx`, `pages/PricingPage.tsx`, `pages/PublicJobBoardPage.tsx`, `pages/PublicOrganizationPage.tsx`, `pages/PublicTalentBoardPage.tsx`, `pages/ResetPasswordPage.tsx`, `pages/SharedShiftLandingPage.tsx`, `pages/login.tsx`, `pages/register.tsx`, `pages/onboarding/RefereeQuestionnairePage.tsx`, `pages/onboarding/RefereeRejectPage.tsx`.
- Feature components: `pages/dashboard/sidebar/PostShiftPage.tsx`, `pages/dashboard/sidebar/ShiftsBoard/components/ShiftList.tsx`, `pages/dashboard/sidebar/ShiftsBoard/hooks/useCounterOffers.ts`, `pages/dashboard/sidebar/ShiftsBoard/index.tsx`, `pages/dashboard/sidebar/TalentBoard/components/FiltersSidebar.tsx`, `pages/dashboard/sidebar/TalentBoard/components/PitchDialog.tsx`, `pages/dashboard/sidebar/TalentBoard/components/TalentCardV2.tsx`, `pages/dashboard/sidebar/TalentBoard/hooks/useTalentFeed.ts`, `pages/dashboard/sidebar/TalentBoard/index.tsx`.

No blind deduplication is authorized by this list. A future consolidation should first identify shared behavior, keep public/authenticated routing and privacy owners separate, capture both apps' contracts, and preserve each app's approved appearance. Larger talent/shift orchestration remains the explicitly recorded maintainability backlog.
