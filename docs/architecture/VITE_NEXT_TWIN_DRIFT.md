# A06 - Vite / Next migrated twin inventory

**Branch baseline:** PR #191 at `ffb72937b5`. **Compare method:** Git blob SHA for identical relative paths under `frontend_web/src` and `frontend_web/landing_next/migrated`. No source was copied, deleted or overwritten by this report.

**Matched paths:** 64; **byte-identical:** 21; **divergent:** 43. Differences are **not assumed defects**: Next SSR, API proxy, auth bootstrap and public navigation differ intentionally in several paths. Each divergent path needs route and behavior evidence before extraction. PR #182 shift policy is not an acceptable source for an auto-sync.

## Divergent paths - review required

- [ ] `components/PublicContactFormSection.tsx`
- [ ] `components/PublicLogoTopBar.tsx`
- [ ] `config/api.ts`
- [ ] `constants/api.ts`
- [ ] `contexts/AuthContext.tsx`
- [ ] `layouts/AuthLayout.tsx`
- [ ] `pages/AccountDeletionPage.tsx`
- [ ] `pages/MobileCheckoutReturnPage.tsx`
- [ ] `pages/MobileOTPVerify.tsx`
- [ ] `pages/NotFoundPage.tsx`
- [ ] `pages/OTPVerify.tsx`
- [ ] `pages/OrganizationPricingPage.tsx`
- [ ] `pages/PasswordResetRequestPage.tsx`
- [ ] `pages/PricingPage.tsx`
- [ ] `pages/PrivacyPolicyPage.tsx`
- [ ] `pages/PublicJobBoardPage.tsx`
- [ ] `pages/PublicOrganizationPage.tsx`
- [ ] `pages/PublicTalentBoardPage.tsx`
- [ ] `pages/ResetPasswordPage.tsx`
- [ ] `pages/SharedShiftLandingPage.tsx`
- [ ] `pages/TermsOfServicePage.tsx`
- [ ] `pages/dashboard/sidebar/ShiftsBoard/components/FiltersSidebar.tsx`
- [ ] `pages/dashboard/sidebar/ShiftsBoard/components/ShiftList.tsx`
- [ ] `pages/dashboard/sidebar/ShiftsBoard/constants.ts`
- [ ] `pages/dashboard/sidebar/ShiftsBoard/hooks/useCounterOffers.ts`
- [ ] `pages/dashboard/sidebar/ShiftsBoard/hooks/useFilterSort.ts`
- [ ] `pages/dashboard/sidebar/ShiftsBoard/index.tsx`
- [ ] `pages/dashboard/sidebar/ShiftsBoard/types.ts`
- [ ] `pages/dashboard/sidebar/TalentBoard/components/FiltersSidebar.tsx`
- [ ] `pages/dashboard/sidebar/TalentBoard/components/PitchDialog.tsx`
- [ ] `pages/dashboard/sidebar/TalentBoard/components/TalentCardV2.tsx`
- [ ] `pages/dashboard/sidebar/TalentBoard/hooks/useTalentFeed.ts`
- [ ] `pages/dashboard/sidebar/TalentBoard/index.tsx`
- [ ] `pages/dashboard/sidebar/TalentBoard/types.ts`
- [ ] `pages/login.tsx`
- [ ] `pages/onboarding/RefereeQuestionnairePage.tsx`
- [ ] `pages/onboarding/RefereeRejectPage.tsx`
- [ ] `pages/register.tsx`
- [ ] `theme/sleekTheme.tsx`
- [ ] `utils/apiClient.ts`
- [ ] `utils/dashboardPath.ts`
- [ ] `utils/seo.ts`
- [ ] `utils/tokenService.ts`

## Currently identical - candidates to share without duplicating state

- `assets/clipsnap-edit-6-1-2026.png`
- `components/AnimatedBackground.tsx`
- `constants/adminCapabilities.ts`
- `constants/roles.ts`
- `contexts/ToastContext.tsx`
- `pages/dashboard/sidebar/ShiftsBoard/components/CounterOfferDialog.tsx`
- `pages/dashboard/sidebar/ShiftsBoard/components/ReviewCounterOfferDialog.tsx`
- `pages/dashboard/sidebar/ShiftsBoard/components/ReviewOfferSlotList.tsx`
- `pages/dashboard/sidebar/ShiftsBoard/hooks/useReviewOfferDisplay.ts`
- `pages/dashboard/sidebar/ShiftsBoard/hooks/useShiftPersistence.ts`
- `pages/dashboard/sidebar/ShiftsBoard/utils/counterOffers.ts`
- `pages/dashboard/sidebar/ShiftsBoard/utils/date.ts`
- `pages/dashboard/sidebar/ShiftsBoard/utils/location.ts`
- `pages/dashboard/sidebar/ShiftsBoard/utils/rates.ts`
- `pages/dashboard/sidebar/ShiftsBoard/utils/shift.ts`
- `pages/dashboard/sidebar/TalentBoard/components/AvailabilitySidebar.tsx`
- `pages/dashboard/sidebar/TalentBoard/constants.ts`
- `pages/dashboard/sidebar/TalentBoard/hooks/loadAllTalentPages.ts`
- `pages/dashboard/sidebar/TalentBoard/hooks/useTalentFilters.ts`
- `utils/ownerSetup.ts`
- `utils/roleLabels.ts`

## Acceptance protocol

1. Identify importers in both applications and classify each twin as intentionally platform-specific, reuse via shared UI, or removable dead twin.
2. Prefer shared-core for DTOs, policy and named domain operations; use shared React UI only where both runtime expectations truly match. Never import browser-only storage into Next SSR.
3. Assert routes, auth and error behavior in Vite and Next before any removal. Preserve public hubs, kiosk browser boundary, and #181 planner.
4. Capture before/after screenshots and run both builds with the same packed SDK artifact. Do not treat the list above as an approval whitelist.
