"""Resolve only the onboarding profile belonging to the account's current worker role."""
from onboarding.models import OtherStaffOnboarding, PharmacistOnboarding, ExplorerOnboarding


def current_worker_profile(user):
    role = str(getattr(user, 'role', '') or '').upper()
    if role == 'PHARMACIST':
        return PharmacistOnboarding.objects.filter(user=user).first()
    if role == 'OTHER_STAFF':
        return OtherStaffOnboarding.objects.filter(user=user).first()
    return None


def current_profile_short_bio(user):
    profile = current_worker_profile(user)
    if str(getattr(user, 'role', '') or '').upper() == 'EXPLORER':
        profile = ExplorerOnboarding.objects.filter(user=user).first()
    return getattr(profile, 'short_bio', None)
