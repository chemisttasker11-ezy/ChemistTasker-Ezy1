from rest_framework.permissions import BasePermission

HUBS = {'public': 'ChemistTasker Hub', 'pharmacist': 'Pharmacist Hub', 'intern': 'Intern Hub', 'staff': 'Other Staff Hub', 'explorer': 'Explorer Hub', 'owner': 'Owner Hub'}
AREAS = {'blog': 'Blog', 'news': 'News', **{f'hub:{k}': v for k, v in HUBS.items()}}


def verified(user):
    return bool(user and user.is_authenticated and user.is_active and getattr(user, 'is_otp_verified', True))


def is_content_admin(user):
    from .models import ContentAdministrator
    return verified(user) and ContentAdministrator.objects.filter(user=user, active=True).exists()


def capabilities(user):
    from .models import ContentAssignment
    if not verified(user):
        return {'administrator': False, 'areas': {}}
    administrator = is_content_admin(user)
    areas = {key: 'publisher' for key in AREAS} if administrator else dict(ContentAssignment.objects.filter(user=user).values_list('area', 'role'))
    return {'administrator': administrator, 'areas': areas}


def can_publish(user, area):
    return capabilities(user)['areas'].get(area) == 'publisher'


def member_hubs(user):
    if not verified(user):
        return []
    role = getattr(user, 'role', '')
    own = {'OWNER': 'owner', 'PHARMACIST': 'pharmacist', 'EXPLORER': 'explorer'}.get(role)
    if role == 'OTHER_STAFF':
        from client_profile.models import OtherStaffOnboarding
        subtype = OtherStaffOnboarding.objects.filter(user=user).values_list('role_type', flat=True).first()
        own = 'intern' if str(subtype).upper() == 'INTERN' else 'staff'
    return ['public'] + ([own] if own else [])


class VerifiedMember(BasePermission):
    def has_permission(self, request, view):
        return verified(request.user)


class ContentAccess(VerifiedMember):
    def has_permission(self, request, view):
        return super().has_permission(request, view) and bool(capabilities(request.user)['areas'])


class ContentAdmin(VerifiedMember):
    def has_permission(self, request, view):
        return is_content_admin(request.user)
