'use client';
import dynamic from 'next/dynamic';
import { ThemeProvider } from '@mui/material/styles';
import { AuthProvider } from '@/migrated/contexts/AuthContext';
import { ToastProvider } from '@/migrated/contexts/ToastContext';
import { initSharedCoreApi } from '@/migrated/config/api';
import { publicTheme } from './theme';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
dayjs.extend(utc);
function Loading(){return <div className="public-loading" role="status">Loading your workspace…</div>;}
const pages={
 "PricingPage": dynamic(() => import("@/migrated/pages/PricingPage"), {ssr:false,loading:Loading}),
 "OrganizationPricingPage": dynamic(() => import("@/migrated/pages/OrganizationPricingPage"), {ssr:false,loading:Loading}),
 "login": dynamic(() => import("@/migrated/pages/login"), {ssr:false,loading:Loading}),
 "register": dynamic(() => import("@/migrated/pages/register"), {ssr:false,loading:Loading}),
 "OTPVerify": dynamic(() => import("@/migrated/pages/OTPVerify"), {ssr:false,loading:Loading}),
 "MobileOTPVerify": dynamic(() => import("@/migrated/pages/MobileOTPVerify"), {ssr:false,loading:Loading}),
 "MobileCheckoutReturnPage": dynamic(() => import("@/migrated/pages/MobileCheckoutReturnPage"), {ssr:false,loading:Loading}),
 "PasswordResetRequestPage": dynamic(() => import("@/migrated/pages/PasswordResetRequestPage"), {ssr:false,loading:Loading}),
 "ResetPasswordPage": dynamic(() => import("@/migrated/pages/ResetPasswordPage"), {ssr:false,loading:Loading}),
 "PrivacyPolicyPage": dynamic(() => import("@/migrated/pages/PrivacyPolicyPage"), {ssr:false,loading:Loading}),
 "TermsOfServicePage": dynamic(() => import("@/migrated/pages/TermsOfServicePage"), {ssr:false,loading:Loading}),
 "AccountDeletionPage": dynamic(() => import("@/migrated/pages/AccountDeletionPage"), {ssr:false,loading:Loading}),
 "PublicJobBoardPage": dynamic(() => import("@/migrated/pages/PublicJobBoardPage"), {ssr:false,loading:Loading}),
 "PublicTalentBoardPage": dynamic(() => import("@/migrated/pages/PublicTalentBoardPage"), {ssr:false,loading:Loading}),
 "SharedShiftLandingPage": dynamic(() => import("@/migrated/pages/SharedShiftLandingPage"), {ssr:false,loading:Loading}),
 "PublicOrganizationPage": dynamic(() => import("@/migrated/pages/PublicOrganizationPage"), {ssr:false,loading:Loading}),
 "MembershipApplyPage": dynamic(() => import("@/migrated/pages/MembershipApplyPage"), {ssr:false,loading:Loading}),
 "onboarding/RefereeQuestionnairePage": dynamic(() => import("@/migrated/pages/onboarding/RefereeQuestionnairePage"), {ssr:false,loading:Loading}),
 "onboarding/RefereeRejectPage": dynamic(() => import("@/migrated/pages/onboarding/RefereeRejectPage"), {ssr:false,loading:Loading}),
 "Contact": dynamic(() => import("@/migrated/pages/Contact"), {ssr:false,loading:Loading})
};
initSharedCoreApi();
export default function PublicRuntime({page}:{page:string}) { const Component=pages[page as keyof typeof pages]; return <ThemeProvider theme={publicTheme}><AuthProvider><ToastProvider><Component/></ToastProvider></AuthProvider></ThemeProvider>; }
