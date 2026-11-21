from rest_framework.permissions import BasePermission


class CanAccessFinance(BasePermission):
    def has_permission(self, request, view):
        return getattr(request.user, 'role', None) != 'EXPLORER'
