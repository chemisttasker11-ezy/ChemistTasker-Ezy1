import React from 'react';
import ReactDOM from 'react-dom/client';
import { Outlet, Navigate } from 'react-router-dom';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { WorkspaceProvider } from './contexts/WorkspaceContext'; // Add this import
import { ToastProvider } from './contexts/ToastContext';
import { initSharedCoreApi } from './config/api';
import './index.css';

import { createBrowserRouter, RouterProvider } from 'react-router-dom';

import App from './App';
import PublicRouteBridge from './components/PublicRouteBridge';
function WebRoot(){return <PublicRouteBridge><App/></PublicRouteBridge>;}
import LandingPage from './pages/LandingPage';
import PricingPage from './pages/PricingPage';
import OrganizationPricingPage from './pages/OrganizationPricingPage';
import Login from './pages/login';
import Register from './pages/register';
import OTPVerify from './pages/OTPVerify';
import ResetPasswordPage from './pages/ResetPasswordPage';
import PasswordResetRequestPage from './pages/PasswordResetRequestPage';
import TermsOfServicePage from './pages/TermsOfServicePage';
import PrivacyPolicyPage from './pages/PrivacyPolicyPage';
import NotFoundPage from './pages/NotFoundPage';
import MobileOTPVerify from './pages/MobileOTPVerify';
import MobileCheckoutReturnPage from './pages/MobileCheckoutReturnPage';
import AccountDeletionPage from './pages/AccountDeletionPage';

const PublicJobBoardPage = React.lazy(() => import('./pages/PublicJobBoardPage'));
const PublicTalentBoardPage = React.lazy(() => import('./pages/PublicTalentBoardPage'));
const SharedShiftLandingPage = React.lazy(() => import('./pages/SharedShiftLandingPage'));
const MembershipApplyPage = React.lazy(() => import('./pages/MembershipApplyPage'));
const PublicOrganizationPage = React.lazy(() => import('./pages/PublicOrganizationPage'));

// Orgnization
const OrganizationOverviewPage = React.lazy(() => import('./pages/dashboard/organization/OrganizationOverviewPage'));
const InviteStaffPage = React.lazy(() => import('./pages/dashboard/organization/InviteStaffPage'));
import OrganizationDashboardWrapper from './layouts/OrganizationDashboardWrapper';

// Other users types
const OwnerOnboarding = React.lazy(() => import('./pages/onboarding/OwnerOnboarding'));
const RefereeQuestionnairePage = React.lazy(() => import('./pages/onboarding/RefereeQuestionnairePage'));
const RefereeRejectPage = React.lazy(() => import('./pages/onboarding/RefereeRejectPage'));
const RosterOwnerPage = React.lazy(() => import('./pages/dashboard/sidebar/RosterOwnerPage'));
const RosterWorkerPage = React.lazy(() => import('./pages/dashboard/sidebar/RosterWorkerPage'));
const KioskPage = React.lazy(() => import('./pages/attendance/KioskPage'));
const WorkerAttendancePage = React.lazy(() => import('./pages/attendance/WorkerAttendancePage'));
const ManagerAttendanceReviewPage = React.lazy(() => import('./pages/attendance/ManagerAttendanceReviewPage'));
const TimesheetsPage = React.lazy(() => import('./features/workforce/TimesheetsPage'));
const MyHoursPage = React.lazy(() => import('./features/workforce/MyHoursPage'));
const MyLeavePage = React.lazy(() => import('./features/workforce/MyLeavePage'));
const ManagerLeavePage = React.lazy(() => import('./features/workforce/ManagerLeavePage'));
const WorkforceSettingsPage = React.lazy(() => import('./features/workforce/WorkforceSettingsPage'));




import ProtectedRoute from './components/ProtectedRoute';
import OwnerDashboardGate from './components/OwnerDashboardGate';
import OwnerDashboardWrapper from './layouts/ownerDashboard';
const AdminOverview = React.lazy(() => import('./pages/dashboard/admin/AdminOverview'));
const AdminManagePharmaciesPage = React.lazy(() => import('./pages/dashboard/admin/AdminManagePharmaciesPage'));
const AdminRosterPage = React.lazy(() => import('./pages/dashboard/admin/AdminRosterPage'));
const AdminPostShiftPage = React.lazy(() => import('./pages/dashboard/admin/AdminPostShiftPage'));
const AdminActiveShiftsPage = React.lazy(() => import('./pages/dashboard/admin/AdminActiveShiftsPage'));
const AdminConfirmedShiftsPage = React.lazy(() => import('./pages/dashboard/admin/AdminConfirmedShiftsPage'));
const AdminHistoryShiftsPage = React.lazy(() => import('./pages/dashboard/admin/AdminHistoryShiftsPage'));
const AdminPosterShiftDetailPage = React.lazy(() => import('./pages/dashboard/admin/AdminPosterShiftDetailPage'));
import AdminDashboardWrapper from './layouts/adminDashboard';
import PharmacistDashboardWrapper from './layouts/pharmacistDashboard';
import HubDashboardWrapper from './layouts/HubDashboardWrapper';
import OtherstaffDashboardWrapper from './layouts/otherStaffDashboard';
import ExplorerDashboardWrapper from './layouts/explorerDashboard';
import { OwnerShiftCenterPage, OrganizationShiftCenterPage, AdminShiftCenterPage } from './pages/dashboard/shiftCenter/ShiftCenterPage';

initSharedCoreApi();



// owner stub pages
// import OverviewPageOwner          from './pages/dashboard/sidebar/OverviewPageOwner';
const OwnerOverviewContainer = React.lazy(() => import('./pages/dashboard/sidebar/owner/OwnerOverviewContainer'));
const PillsPage = React.lazy(() => import('./pages/dashboard/sidebar/rewards/PillsPage'));

const OverviewPageStaff = React.lazy(() => import('./pages/dashboard/sidebar/OverviewPageStaff'));
const ChainPage = React.lazy(() => import('./pages/dashboard/sidebar/ChainPage'));
const PharmacyPage = React.lazy(() => import('./pages/dashboard/sidebar/PharmacyPage'));
const PostShiftPage = React.lazy(() => import('./pages/dashboard/sidebar/PostShiftPage'));
const PublicShiftsPage = React.lazy(() => import('./pages/dashboard/sidebar/PublicShiftsPage'));
const CommunityShiftsPage = React.lazy(() => import('./pages/dashboard/sidebar/CommunityShiftsPage'));
const SetAvailabilityPage = React.lazy(() => import('./pages/dashboard/sidebar/SetAvailabilityPage'));
const TalentBoard = React.lazy(() => import('./pages/dashboard/sidebar/TalentBoard'));
const LearningMaterialsPage = React.lazy(() => import('./pages/dashboard/sidebar/LearningMaterialsPage'));
const LogoutPage = React.lazy(() => import('./pages/dashboard/sidebar/LogoutPage'));
const ActiveShiftsPage = React.lazy(() => import('./pages/dashboard/sidebar/ActiveShiftsPage'));
const ConfirmedShiftsPage = React.lazy(() => import('./pages/dashboard/sidebar/ConfirmedShiftsPage'));
const HistoryShiftsPage = React.lazy(() => import('./pages/dashboard/sidebar/HistoryShiftsPage'));
const MyConfirmedShiftsPage = React.lazy(() => import('./pages/dashboard/sidebar/MyConfirmedShiftsPage'));
const MyHistoryShiftsPage = React.lazy(() => import('./pages/dashboard/sidebar/MyHistoryShiftsPage'));
const PosterShiftDetailPage = React.lazy(() => import('./pages/dashboard/sidebar/PosterShiftDetailPage'));
const WorkerShiftDetailPage = React.lazy(() => import('./pages/dashboard/sidebar/WorkerShiftDetailPage'));
const ChatPage = React.lazy(() => import('./pages/dashboard/sidebar/chat/ChatPage'));
const HubPage = React.lazy(() => import('./pages/dashboard/sidebar/hub/HubPage'));
const InvoiceManagePage = React.lazy(() => import('./pages/dashboard/sidebar/Invoices/InvoiceManagePage'));
const InvoiceGeneratePage = React.lazy(() => import('./pages/dashboard/sidebar/Invoices/InvoiceGeneratePage'));
const InvoiceDetailPage = React.lazy(() => import('./pages/dashboard/sidebar/Invoices/InvoiceDetailPage'));
const PharmacyCalendarPage = React.lazy(() => import('./pages/dashboard/sidebar/PharmacyCalendarPage'));
const ManageMembershipsPage = React.lazy(() => import('./pages/dashboard/sidebar/ManageMembershipsPage'));

import { AuthProvider } from './contexts/AuthContext';


// Version2
const PharmacistOnboardingV2Layout = React.lazy(() => import('./pages/onboarding/onboarding_pharmacist/PharmacistOnboardingV2Layout'));
const OtherStaffOnboardingV2Layout = React.lazy(() => import('./pages/onboarding/onboarding_staff/OtherStaffOnboardingV2Layout'));
const ExplorerOnboardingV2Layout = React.lazy(() => import('./pages/onboarding/onboarding_explorer/ExplorerOnboardingV2Layout'));
const OwnerSetupOnboardingPage = React.lazy(() => import('./pages/setup/OwnerSetupOnboardingPage'));
const OwnerSetupPharmaciesPage = React.lazy(() => import('./pages/setup/OwnerSetupPharmaciesPage'));

const router = createBrowserRouter([
  {
    Component: WebRoot,
    children: [
      { index: true, element: <LandingPage /> },
      { path: 'pricing', element: <PricingPage /> },
      { path: 'pricing/organization', element: <OrganizationPricingPage /> },
      { path: 'login', element: <Login /> },
      { path: 'otp-verify', element: <OTPVerify /> },
      { path: 'mobile-verify', element: <MobileOTPVerify /> },
      { path: 'mobile-checkout-return', element: <MobileCheckoutReturnPage /> },
      { path: 'register', element: <Register /> },
      { path: 'password-reset', element: <PasswordResetRequestPage /> },
      { path: '/terms-of-service', element: <TermsOfServicePage /> },
      { path: '/privacy-policy', element: <PrivacyPolicyPage /> },
      { path: '/account-deletion', element: <AccountDeletionPage /> },


      { path: 'shifts/public-board', element: <PublicJobBoardPage /> },
      { path: 'talent/public-board', element: <PublicTalentBoardPage /> },
      { path: 'shifts/link', element: <SharedShiftLandingPage /> },
      { path: 'organization/:slug', element: <PublicOrganizationPage /> },

      { path: 'membership/apply/:token', element: <MembershipApplyPage /> },

      // PUBLIC referee confirmation page (add here)
      { path: 'referee/questionnaire/:token', element: <RefereeQuestionnairePage /> },
      { path: 'onboarding/referee-reject/:pk/:refIndex', element: <RefereeRejectPage /> },

      // Password reset confirm route
      { path: 'reset-password/:uid/:token', element: <ResetPasswordPage /> },

      // Standalone Kiosk Route (Counter Tablet PWA)
      { path: 'kiosk', element: <KioskPage /> },

      // Direct Attendance Routes
      {
        path: 'dashboard/attendance',
        element: (
          <ProtectedRoute>
            <WorkerAttendancePage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'dashboard/attendance/reviews',
        element: (
          <ProtectedRoute>
            <ManagerAttendanceReviewPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'dashboard/workforce/timesheets',
        element: (
          <ProtectedRoute>
            <TimesheetsPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'dashboard/workforce/leave',
        element: (
          <ProtectedRoute>
            <ManagerLeavePage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'dashboard/workforce/settings',
        element: (
          <ProtectedRoute>
            <WorkforceSettingsPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'dashboard/my-hours',
        element: (
          <ProtectedRoute>
            <MyHoursPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'dashboard/my-leave',
        element: (
          <ProtectedRoute>
            <MyLeavePage />
          </ProtectedRoute>
        ),
      },

      // Orgnization
      {
        path: 'dashboard/organization',
        Component: () => (
          <ProtectedRoute requiredRole="ORG_ADMIN">
            <OrganizationDashboardWrapper />
          </ProtectedRoute>
        ),
        children: [
          { index: true, element: <OrganizationOverviewPage /> },
          { path: 'overview', element: <OrganizationOverviewPage /> },
          { path: 'pills', element: <PillsPage /> },
          { path: 'invite', element: <InviteStaffPage /> },
          {
            path: 'manage-pharmacies',
            children: [
              { index: true, element: <PharmacyPage /> },
              { path: 'my-pharmacies', element: <PharmacyPage /> },
              { path: 'my-chain', element: <ChainPage /> },
              { path: 'roster', element: <RosterOwnerPage /> },
              { path: 'attendance-reviews', element: <ManagerAttendanceReviewPage /> },
            ],
          },
          { path: 'attendance-reviews', element: <ManagerAttendanceReviewPage /> },
          { path: 'post-shift', element: <PostShiftPage /> },
          { path: 'shift-center', element: <Navigate to="active" replace /> },
          { path: 'shift-center/:section', element: <OrganizationShiftCenterPage /> },
          {
            path: 'invoice',
            element: <Outlet />,
            children: [
              { index: true, element: <InvoiceManagePage /> },
              { path: 'new', element: <InvoiceGeneratePage /> },
              { path: ':id', element: <InvoiceDetailPage /> },
            ],
          },
          {
            path: 'shifts',
            children: [
              { index: true, element: <PublicShiftsPage /> },
              { path: 'public', element: <PublicShiftsPage /> },
              { path: 'community', element: <CommunityShiftsPage /> },
              { path: 'active', element: <ActiveShiftsPage /> },
              { path: 'confirmed', element: <ConfirmedShiftsPage /> },
              { path: 'history', element: <HistoryShiftsPage /> },
              { path: ':id', element: <PosterShiftDetailPage /> },

            ],
          },
          { path: 'interests', element: <TalentBoard /> },
          { path: 'learning', element: <LearningMaterialsPage /> },
          { path: 'chat', element: <ChatPage /> },
          { path: 'pharmacy-hub', element: <Navigate to="/dashboard/pharmacy-hub" replace /> },
          { path: 'calendar', element: <PharmacyCalendarPage /> },
          { path: 'logout', element: <LogoutPage /> },

        ],
      },

      // dashboard/pharmacy-hub (shared entry point)
      {
        path: 'dashboard/pharmacy-hub',
        Component: () => (
          <ProtectedRoute>
            <HubDashboardWrapper />
          </ProtectedRoute>
        ),
        children: [{ index: true, element: <HubPage /> }],
      },

      // Admin 
      {
        path: 'dashboard/admin/:pharmacyId',
        Component: () => (
          <ProtectedRoute requireAdmin>
            <AdminDashboardWrapper />
          </ProtectedRoute>
        ),
        children: [
          { index: true, element: <AdminOverview /> },
          { path: 'overview', element: <AdminOverview /> },
          { path: 'pills', element: <PillsPage /> },
          { path: 'manage-pharmacies', element: <AdminManagePharmaciesPage /> },
          { path: 'manage-pharmacies/my-pharmacies', element: <AdminManagePharmaciesPage /> },
          { path: 'manage-pharmacies/roster', element: <AdminRosterPage /> },
          { path: 'attendance-reviews', element: <ManagerAttendanceReviewPage /> },
          { path: 'post-shift', element: <AdminPostShiftPage /> },
          { path: 'shift-center', element: <Navigate to="active" replace /> },
          { path: 'shift-center/:section', element: <AdminShiftCenterPage /> },
          {
            path: 'invoice',
            element: <Outlet />,
            children: [
              { index: true, element: <InvoiceManagePage /> },
              { path: 'new', element: <InvoiceGeneratePage /> },
              { path: ':id', element: <InvoiceDetailPage /> },
            ],
          },
          {
            path: 'shifts',
            children: [
              { index: true, element: <AdminActiveShiftsPage /> },
              { path: 'active', element: <AdminActiveShiftsPage /> },
              { path: 'confirmed', element: <AdminConfirmedShiftsPage /> },
              { path: 'history', element: <AdminHistoryShiftsPage /> },
              { path: ':id', element: <AdminPosterShiftDetailPage /> },
            ],
          },
          { path: 'chat', element: <ChatPage /> },
          { path: 'calendar', element: <PharmacyCalendarPage /> },
          { path: 'logout', element: <LogoutPage /> },
        ],
      },

      // standalone owner onboarding
      {
        path: 'onboarding/owner',
        element: (
          <ProtectedRoute requiredRole="OWNER">
            <OwnerOnboarding />
          </ProtectedRoute>
        ),
      },
      {
        path: 'setup/owner/onboarding',
        element: (
          <ProtectedRoute requiredRole="OWNER">
            <OwnerSetupOnboardingPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'setup/owner/pharmacies',
        element: (
          <ProtectedRoute requiredRole="OWNER">
            <OwnerSetupPharmaciesPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'onboarding/pharmacist',
        element: (
          <ProtectedRoute requiredRole="PHARMACIST">
            <PharmacistOnboardingV2Layout />
          </ProtectedRoute>
        ),
      },
      {
        path: 'onboarding/otherstaff',
        element: (
          <ProtectedRoute requiredRole="OTHER_STAFF">
            <OtherStaffOnboardingV2Layout />
          </ProtectedRoute>
        ),
      },
      {
        path: 'onboarding/explorer',
        element: (
          <ProtectedRoute requiredRole="EXPLORER">
            <ExplorerOnboardingV2Layout />
          </ProtectedRoute>
        ),
      },

      // dashboard/owner
      {
        path: 'dashboard/owner',
        Component: () => (
          <ProtectedRoute requiredRole="OWNER">
            <OwnerDashboardGate>
              <OwnerDashboardWrapper />
            </OwnerDashboardGate>
          </ProtectedRoute>
        ),
        children: [
          { index: true, element: <OwnerOverviewContainer /> },
          { path: 'overview', element: <OwnerOverviewContainer /> },
          { path: 'pills', element: <PillsPage /> },
          { path: 'onboarding', element: <OwnerOnboarding /> },
          {
            path: 'manage-pharmacies',
            children: [
              { index: true, element: <PharmacyPage /> },
              { path: 'my-pharmacies', element: <PharmacyPage /> },
              { path: 'my-chain', element: <ChainPage /> },
              { path: 'roster', element: <RosterOwnerPage /> },
              { path: 'attendance-reviews', element: <ManagerAttendanceReviewPage /> },
            ],
          },
          { path: 'attendance-reviews', element: <ManagerAttendanceReviewPage /> },
          { path: 'attendance', element: <WorkerAttendancePage /> },
          { path: 'post-shift', element: <PostShiftPage /> },
          { path: 'shift-center', element: <Navigate to="active" replace /> },
          { path: 'shift-center/:section', element: <OwnerShiftCenterPage /> },
          {
            path: 'invoice',
            element: <Outlet />,
            children: [
              { index: true, element: <InvoiceManagePage /> },
              { path: 'new', element: <InvoiceGeneratePage /> },
              { path: ':id', element: <InvoiceDetailPage /> },
            ],
          },
          {
            path: 'shifts',
            children: [
              { index: true, element: <PublicShiftsPage /> },
              { path: 'public', element: <PublicShiftsPage /> },
              { path: 'community', element: <CommunityShiftsPage /> },
              { path: 'active', element: <ActiveShiftsPage /> },
              { path: 'confirmed', element: <ConfirmedShiftsPage /> },
              { path: 'history', element: <HistoryShiftsPage /> },
              { path: ':id', element: <PosterShiftDetailPage /> },
            ],
          },
          { path: 'interests', element: <TalentBoard /> },
          { path: 'learning', element: <LearningMaterialsPage /> },
          { path: 'chat', element: <ChatPage /> },
          { path: 'pharmacy-hub', element: <Navigate to="/dashboard/pharmacy-hub" replace /> },
          { path: 'calendar', element: <PharmacyCalendarPage /> },
          { path: 'logout', element: <LogoutPage /> },
        ],
      },

      // dashboard/pharmacist
      {
        path: 'dashboard/pharmacist',
        Component: () => (
          <ProtectedRoute requiredRole="PHARMACIST">
            <PharmacistDashboardWrapper />
          </ProtectedRoute>
        ),
        children: [
          { index: true, element: <OverviewPageStaff /> },
          { path: 'overview', element: <OverviewPageStaff /> },

          // NEW: V2 onboarding (tab-per-page layout with nested routes)
          // V2 — single page with its own left-buttons + progress bar
          { path: 'onboarding', element: <PharmacistOnboardingV2Layout /> },

          {
            path: 'shifts',
            children: [
              { index: true, element: <PublicShiftsPage /> },
              { path: 'public', element: <PublicShiftsPage /> },
              { path: 'community', element: <CommunityShiftsPage /> },
              { path: 'confirmed', element: <MyConfirmedShiftsPage /> },
              { path: 'history', element: <MyHistoryShiftsPage /> },
              { path: ':id', element: <WorkerShiftDetailPage /> },
              { path: 'roster', element: <RosterWorkerPage /> },
            ],
          },
          { path: 'attendance', element: <WorkerAttendancePage /> },
          { path: 'availability', element: <SetAvailabilityPage /> },
          { path: 'memberships', element: <ManageMembershipsPage /> },
          {
            path: 'invoice',
            element: <Outlet />,
            children: [
              { index: true, element: <InvoiceManagePage /> },
              { path: 'new', element: <InvoiceGeneratePage /> },
              { path: ':id', element: <InvoiceDetailPage /> },
            ],
          },

          { path: 'interests', element: <TalentBoard /> },
          { path: 'learning', element: <LearningMaterialsPage /> },
          { path: 'chat', element: <ChatPage /> },
          { path: 'pharmacy-hub', element: <Navigate to="/dashboard/pharmacy-hub" replace /> },
          { path: 'calendar', element: <PharmacyCalendarPage /> },
          { path: 'logout', element: <LogoutPage /> },
        ],
      },

      // dashboard/OtherStaff
      {
        path: 'dashboard/otherstaff',
        Component: () => (
          <ProtectedRoute requiredRole="OTHER_STAFF">
            <OtherstaffDashboardWrapper />
          </ProtectedRoute>
        ),
        children: [
          { index: true, element: <OverviewPageStaff /> },
          { path: 'overview', element: <OverviewPageStaff /> },
          { path: 'onboarding', element: <OtherStaffOnboardingV2Layout /> },
          {
            path: 'shifts',
            children: [
              { index: true, element: <PublicShiftsPage /> },
              { path: 'public', element: <PublicShiftsPage /> },
              { path: 'community', element: <CommunityShiftsPage /> },
              { path: 'confirmed', element: <MyConfirmedShiftsPage /> },
              { path: 'history', element: <MyHistoryShiftsPage /> },
              { path: ':id', element: <WorkerShiftDetailPage /> },
              { path: 'roster', element: <RosterWorkerPage /> },
            ],
          },
          { path: 'attendance', element: <WorkerAttendancePage /> },
          { path: 'availability', element: <SetAvailabilityPage /> },
          { path: 'memberships', element: <ManageMembershipsPage /> },
          {
            path: 'invoice',
            element: <Outlet />,
            children: [
              { index: true, element: <InvoiceManagePage /> },
              { path: 'new', element: <InvoiceGeneratePage /> },
              { path: ':id', element: <InvoiceDetailPage /> },
            ],
          },
          { path: 'interests', element: <TalentBoard /> },
          { path: 'learning', element: <LearningMaterialsPage /> },
          { path: 'chat', element: <ChatPage /> },
          { path: 'pharmacy-hub', element: <Navigate to="/dashboard/pharmacy-hub" replace /> },
          { path: 'calendar', element: <PharmacyCalendarPage /> },
          { path: 'logout', element: <LogoutPage /> },
        ],
      },


      // dashboard/explorer
      {
        path: 'dashboard/explorer',
        Component: () => (
          <ProtectedRoute requiredRole="EXPLORER">
            <ExplorerDashboardWrapper />
          </ProtectedRoute>
        ),
        children: [
          { index: true, element: <OverviewPageStaff /> },
          { path: 'overview', element: <OverviewPageStaff /> },
          { path: 'onboarding', element: <ExplorerOnboardingV2Layout /> },
          {
            path: 'shifts',
            children: [
              { index: true, element: <PublicShiftsPage /> },
              { path: 'public', element: <PublicShiftsPage /> },
              { path: 'community', element: <CommunityShiftsPage /> },
            ],
          },
          { path: 'interests', element: <TalentBoard /> },
          { path: 'chat', element: <ChatPage /> },
          { path: 'learning', element: <LearningMaterialsPage /> },
          { path: 'calendar', element: <PharmacyCalendarPage /> },
          { path: 'logout', element: <LogoutPage /> },
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {/* AuthProvider must wrap RouterProvider */}
    <AuthProvider>
      <WorkspaceProvider> {/* Add this wrapper */}
        <LocalizationProvider dateAdapter={AdapterDayjs}>
          <ToastProvider>
            <React.Suspense fallback={null}>
              <RouterProvider router={router} />
            </React.Suspense>
          </ToastProvider>
        </LocalizationProvider>
      </WorkspaceProvider> {/* Close wrapper */}
    </AuthProvider>
  </React.StrictMode>
);
