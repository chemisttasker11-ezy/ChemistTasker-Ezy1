from django.utils import timezone

from infrastructure.serializer_lifecycle import _delete_file_if_unreferenced
from onboarding.models import OtherStaffOnboarding


def indemnity_status(profile, today=None):
    if isinstance(profile, OtherStaffOnboarding) and profile.role_type != 'INTERN':
        return None
    if not profile.indemnity_certificate or not profile.indemnity_expiry:
        return 'missing'
    return 'expired' if profile.indemnity_expiry < (today or timezone.localdate()) else 'shown'


def apply_indemnity_fields(instance, data, update_fields):
    if isinstance(instance, OtherStaffOnboarding) and instance.role_type != 'INTERN':
        return
    for field in ('indemnity_insurer', 'indemnity_expiry', 'indemnity_certificate'):
        if field in data:
            old_file = instance.indemnity_certificate if field == 'indemnity_certificate' else None
            if old_file and getattr(old_file, 'name', None) != getattr(data[field], 'name', None):
                _delete_file_if_unreferenced(old_file, current_instance=instance)
            setattr(instance, field, data[field])
            update_fields.append(field)
