"""Resolve only the onboarding profile belonging to the account's current worker role."""
from onboarding.models import OtherStaffOnboarding, PharmacistOnboarding, ExplorerOnboarding


def current_worker_profile(user):
    role = str(getattr(user, 'role', '') or '').upper()
    if role == 'PHARMACIST':
        return PharmacistOnboarding.objects.filter(user=user).first()
    if role == 'OTHER_STAFF':
        return OtherStaffOnboarding.objects.filter(user=user).first()
    return None


def newcomer_type(user):
    """The New to pharmacy subtype (OVERSEAS, JUNIOR, ...) for every current-user payload: login, token refresh and
    /users/me. None for other roles."""
    if str(getattr(user, 'role', '') or '').upper() != 'EXPLORER':
        return None
    return ExplorerOnboarding.objects.filter(user=user).values_list('role_type', flat=True).first()


def current_profile_short_bio(user):
    profile = current_worker_profile(user)
    if str(getattr(user, 'role', '') or '').upper() == 'EXPLORER':
        profile = ExplorerOnboarding.objects.filter(user=user).first()
    return getattr(profile, 'short_bio', None)


def referee_profile_target(model_name: str, pk: int) -> tuple[str, int]:
    """The profile a referee link or reminder acts on. Links sent before a New to pharmacy upgrade follow the person to
    their current worker profile, where the references were carried (owner decision 2026-10-14)."""
    if str(model_name).lower() == 'exploreronboarding':
        row = ExplorerOnboarding.objects.select_related('user').filter(pk=pk).first()
        current = current_worker_profile(row.user) if row is not None else None
        if current is not None:
            return current._meta.model_name, current.pk
    return model_name, pk


def referee_answered_before_upgrade(model_name: str, pk: int, index: int) -> bool:
    """A link answered on the newcomer profile stays used after the upgrade (review 2026-10-14): its response and flags
    were recorded on that row, which the carried flags came from."""
    from django.contrib.contenttypes.models import ContentType
    from onboarding.models import RefereeResponse
    if str(model_name).lower() != 'exploreronboarding':
        return False
    row = ExplorerOnboarding.objects.filter(pk=pk).first()
    if row is None:
        return False
    if getattr(row, f'referee{index}_confirmed', False) or getattr(row, f'referee{index}_rejected', False):
        return True
    return RefereeResponse.objects.filter(content_type=ContentType.objects.get_for_model(ExplorerOnboarding),
                                          object_id=pk, referee_index=index).exists()
