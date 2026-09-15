# Public pages migration — local work only

## Source access

Requested functional source: https://github.com/chemisttasker-smsm/chemisttasker-ezy.

The connected GitHub API returned 404 for this repository. Installed-repository search returned no matches; the connector's repository list for this owner exposes `chemisttasker` only. A local clone of the requested repository also failed. No implementation has been substituted from the older repository. Latest source access is required to verify feature parity before migrating pages.

Design source: the existing local `landing_next/app`, plus `landing_lightweight-handoff/landing_lightweight/CODEX-PROMPT.md` and `BRAND-DESIGN-GUIDE.md`. The user's new instruction authorizes migration of public routes to Next.js; private dashboards remain in Vite. All work stays local, without commits, pushes, pull requests or deployment.

## Preliminary public route inventory

This list is from the existing local `frontend_web/src/main.tsx`, not yet verified against the requested latest repository.

| Existing route | Existing implementation |
| --- | --- |
| `/` | Existing approved Next landing to retain |
| `/pricing` | PricingPage |
| `/pricing/organization` | OrganizationPricingPage |
| `/login` | login |
| `/register` | register |
| `/otp-verify` | OTPVerify |
| `/mobile-verify` | MobileOTPVerify |
| `/mobile-checkout-return` | MobileCheckoutReturnPage |
| `/password-reset` | PasswordResetRequestPage |
| `/reset-password/:uid/:token` | ResetPasswordPage |
| `/terms-of-service` | TermsOfServicePage |
| `/privacy-policy` | PrivacyPolicyPage |
| `/account-deletion` | AccountDeletionPage |
| `/shifts/public-board` | PublicJobBoardPage |
| `/talent/public-board` | PublicTalentBoardPage |
| `/shifts/link` | SharedShiftLandingPage |
| `/organization/:slug` | PublicOrganizationPage |
| `/membership/apply/:token` | MembershipApplyPage |
| `/referee/questionnaire/:token` | RefereeQuestionnairePage |
| `/onboarding/referee-reject/:pk/:refIndex` | RefereeRejectPage |

Contact and other embedded public components must also be located in the latest source. A public route can still require authentication for a particular action; preserve those checks.

## Execution and verification

1. Read the latest repository instructions and inventory all public routes, embedded components and their imports. Record baseline build results.
2. Map each control to its existing handler, API method/payload, query parameters, permissions, validation and loading/error/success behaviour.
3. Add shared public layout, navigation, typography and form controls using the approved navy/purple/mist design. Preserve the existing homepage, blog and news work.
4. Migrate public informational pages, pricing and contact, then the full public shifts/talent flows and remaining discovered public routes.
5. Preserve registration, verification, password recovery, token refresh, role landing destinations and handoffs to private dashboards. Do not replace real integrations with local mock success.
6. Run appropriate type/build checks and test representative complete workflows locally, including keyboard and mobile layouts. Use isolated fixtures for writes; no real shifts, applications, messages or billing actions.
7. Open the completed local preview in the in-app browser and document verified behaviour and outstanding integration limits.

Status: route inventory prepared; implementation awaiting access to the requested latest source.
