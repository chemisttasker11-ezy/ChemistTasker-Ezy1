from rest_framework.permissions import BasePermission
from .models import OrganizationMembership
from rest_framework import permissions



class OrganizationRolePermission(BasePermission):
    """
    Grant access if the authenticated user holds at least one of the roles
    listed in view.required_roles on the target organization.

    Usage on a view:
        required_roles = ['ORG_ADMIN', 'REGION_ADMIN']
        permission_classes = [IsAuthenticated, OrganizationRolePermission]
    """

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False

        # Get the list of roles this view requires
        required = getattr(view, 'required_roles', [])
        if not required:
            # A role-gated view without an explicit role list is a configuration error.
            # Fail closed rather than silently degrading to plain authentication.
            return False

        # Identify which org the view is targeting
        org_id = (
            view.kwargs.get('organization_pk') or
            view.kwargs.get('pk') or
            request.data.get('organization')
        )
        if not org_id:
            return False

        # Check membership
        return OrganizationMembership.objects.filter(
            user=user,
            organization_id=org_id,
            role__in=required
        ).exists()

class IsPharmacist(BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.is_pharmacist()

class IsOwner(BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.is_owner()
    
class IsOtherstaff(BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.is_otherstaff()

class IsExplorer(BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.is_explorer()
    
class IsOTPVerified(permissions.BasePermission):
    message = "Please verify your email before starting onboarding."

    def has_permission(self, request, view):
        # Only allow onboarding if OTP is verified
        return request.user and request.user.is_authenticated and request.user.is_otp_verified
