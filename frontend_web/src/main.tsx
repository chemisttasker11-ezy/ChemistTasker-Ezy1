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

import PublicJobBoardPage from './pages/PublicJobBoardPage';
import PublicTalentBoardPage from './pages/PublicTalentBoardPage';
import SharedShiftLandingPage from './pages/SharedShiftLandingPage';
import MembershipApplyPage from './pages/MembershipApplyPage';
import PublicOrganizationPage from './pages/PublicOrganizationPage';

// Orgnization
import OrganizationOverviewPage from './pages/dashboard/organization/OrganizationOverviewPage';
import InviteStaffPage from './pages/dashboard/organization/InviteStaffPage';
import OrganizationDashboardWrapper from './layouts/OrganizationDashboardWrapper';

// Other users types
import OwnerOnboarding from './pages/onboarding/OwnerOnboarding';
import RefereeQuestionnairePage from './pages/onboarding/RefereeQuestionnairePage';
import RefereeRejectPage from './pages/onboarding/RefereeRejectPage';
import RosterOwnerPage from './pages/dashboard/sidebar/RosterOwnerPage';
import RosterWorkerPage from './pages/dashboard/sidebar/RosterWorkerPage';




import ProtectedRoute from './components/ProtectedRoute';
import OwnerDashboardGate from './components/OwnerDashboardGate';
import OwnerDashboardWrapper from './layouts/ownerDashboard';
import AdminOverview from './pages/dashboard/admin/AdminOverview';
import AdminManagePharmaciesPage from './pages/dashboard/admin/AdminManagePharmaciesPage';
import AdminRosterPage from './pages/dashboard/admin/AdminRosterPage';
import AdminPostShiftPage from './pages/dashboard/admin/AdminPostShiftPage';
import AdminActiveShiftsPage from './pages/dashboard/admin/AdminActiveShiftsPage';
import AdminConfirmedShiftsPage from './pages/dashboard/admin/AdminConfirmedShiftsPage';
import AdminHistoryShiftsPage from './pages/dashboard/admin/AdminHistoryShiftsPage';
import AdminPosterShiftDetailPage from './pages/dashboard/admin/AdminPosterShiftDetailPage';
import AdminDashboardWrapper from './layouts/adminDashboard';
import PharmacistDashboardWrapper from './layouts/pharmacistDashboard';
import HubDashboardWrapper from './layouts/HubDashboardWrapper';
import OtherstaffDashboardWrapper from './layouts/otherStaffDashboard';
import ExplorerDashboardWrapper from './layouts/explorerDashboard';
import { OwnerShiftCenterPage, OrganizationShiftCenterPage, AdminShiftCenterPage } from './pages/dashboard/shiftCenter/ShiftCenterPage';

initSharedCoreApi();



// owner stub pages
// import OverviewPageOwner          from './pages/dashboard/sidebar/OverviewPageOwner';
import OwnerOverviewContainer from './pages/dashboard/sidebar/owner/OwnerOverviewContainer';
import PillsPage from './pages/dashboard/sidebar/rewards/PillsPage';

import OverviewPageStaff from './pages/dashboard/sidebar/OverviewPageStaff';
import ChainPage from './pages/dashboard/sidebar/ChainPage';
import PharmacyPage from './pages/dashboard/sidebar/PharmacyPage';
import PostShiftPage from './pages/dashboard/sidebar/PostShiftPage';
import PublicShiftsPage from './pages/dashboard/sidebar/PublicShiftsPage';
import CommunityShiftsPage from './pages/dashboard/sidebar/CommunityShiftsPage';
import SetAvailabilityPage from './pages/dashboard/sidebar/SetAvailabilityPage';
import TalentBoard from './pages/dashboard/sidebar/TalentBoard';
import LearningMaterialsPage from './pages/dashboard/sidebar/LearningMaterialsPage';
import LogoutPage from './pages/dashboard/sidebar/LogoutPage';
import ActiveShiftsPage from './pages/dashboard/sidebar/ActiveShiftsPage';
import ConfirmedShiftsPage from './pages/dashboard/sidebar/ConfirmedShiftsPage';
import HistoryShiftsPage from './pages/dashboard/sidebar/HistoryShiftsPage';
import MyConfirmedShiftsPage from './pages/dashboard/sidebar/MyConfirmedShiftsPage';
import MyHistoryShiftsPage from './pages/dashboard/sidebar/MyHistoryShiftsPage';
import PosterShiftDetailPage from './pages/dashboard/sidebar/PosterShiftDetailPage';
import WorkerShiftDetailPage from './pages/dashboard/sidebar/WorkerShiftDetailPage';
import ChatPage from './pages/dashboard/sidebar/chat/ChatPage';
import HubPage from './pages/dashboard/sidebar/hub/HubPage';
import InvoiceManagePage from './pages/dashboard/sidebar/Invoices/InvoiceManagePage';
import InvoiceGeneratePage from './pages/dashboard/sidebar/Invoices/InvoiceGeneratePage';
import InvoiceDetailPage from './pages/dashboard/sidebar/Invoices/InvoiceDetailPage';
import PharmacyCalendarPage from './pages/dashboard/sidebar/PharmacyCalendarPage';
import ManageMembershipsPage from './pages/dashboard/sidebar/ManageMembershipsPage';

import { AuthProvider } from './contexts/AuthContext';


// Version2
import PharmacistOnboardingV2Layout from './pages/onboarding/onboarding_pharmacist/PharmacistOnboardingV2Layout';
import OtherStaffOnboardingV2Layout from './pages/onboarding/onboarding_staff/OtherStaffOnboardingV2Layout';
import ExplorerOnboardingV2Layout from './pages/onboarding/onboarding_explorer/ExplorerOnboardingV2Layout';
import OwnerSetupOnboardingPage from './pages/setup/OwnerSetupOnboardingPage';
import OwnerSetupPharmaciesPage from './pages/setup/OwnerSetupPharmaciesPage';

const router = createBrowserRouter([
  {
    Component: App,
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

            ],
          },
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
            ],
          },
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
            <RouterProvider router={router} />
          </ToastProvider>
        </LocalizationProvider>
      </WorkspaceProvider> {/* Close wrapper */}
    </AuthProvider>
  </React.StrictMode>
);
