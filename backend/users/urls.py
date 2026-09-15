from django.urls import path, include
from .views import *
from .browser_session import csrf_token
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from rest_framework.routers import DefaultRouter
from django.contrib.auth import views as auth_views


router = DefaultRouter()
# since we'll include this at /api/users/, register at the root
router.register('', UserViewSet, basename='user')
router.register('organization-memberships', OrganizationMembershipViewSet, basename='organization-membership')

organization_membership_list = OrganizationMembershipViewSet.as_view({'get': 'list'})
organization_membership_detail = OrganizationMembershipViewSet.as_view({
    'get': 'retrieve',
    'patch': 'partial_update',
    'delete': 'destroy',
})

urlpatterns = [
    path('csrf/', csrf_token, name='browser-csrf'),
    path('register/', RegisterView.as_view()),
    path('login/', CustomLoginView.as_view(), name='custom_token_obtain_pair'),
    path('token/refresh/', CustomTokenRefreshView.as_view(), name='token_refresh'),
    path('logout/', LogoutView.as_view(), name='logout'),
    path('mobile/app-config/', MobileAppConfigView.as_view(), name='mobile-app-config'),
    path('me/', CurrentUserView.as_view(), name='me'),
    path('ws-ticket/', WsTicketView.as_view(), name='ws-ticket'),
    path('password-reset-confirm/',PasswordResetConfirmAPIView.as_view(), name='password_reset_confirm_api'),
    path('password-reset/', PasswordResetRequestAPIView.as_view(), name='password-reset-request'),
    path('contact/', ContactMessageCreateView.as_view(), name='contact-us'),
    path('auth/reset/<uidb64>/<token>/', auth_views.PasswordResetConfirmView.as_view(),name='password_reset_confirm'),
    path('auth/reset/done/',           auth_views.PasswordResetCompleteView.as_view(),name='password_reset_complete'),
    path('verify-otp/', VerifyOTPView.as_view(), name='verify-otp'),
    path('resend-otp/', ResendOTPView.as_view(), name='resend-otp'),

    # Mobile verification
    path('mobile/request-otp/', RequestMobileOTPView.as_view(), name='mobile-request-otp'),
    path('mobile/verify-otp/', VerifyMobileOTPView.as_view(), name='mobile-verify-otp'),
    path('mobile/resend-otp/', ResendMobileOTPView.as_view(), name='mobile-resend-otp'),

    # ... other user routes ...
    path('invite-org-user/', InviteOrgUserView.as_view(), name='invite-org-user'),
    path('organization-role-definitions/', OrganizationRoleDefinitionView.as_view(), name='organization-role-definitions'),
    path('organization-memberships/', organization_membership_list, name='organization-membership-list'),
    path('organization-memberships/<int:pk>/', organization_membership_detail, name='organization-membership-detail'),

    path('', include(router.urls)),

]
