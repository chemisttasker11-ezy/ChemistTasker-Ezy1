"""New to pharmacy -> Pharmacist or Pharmacy team, once, in one transaction.

The newcomer's own details (date of birth, address, photo, bio, CV, photo ID and references) carry over to the new
profile; the new role's verification applies from scratch (onboarding/verification/policy.py): a pharmacist needs a
checked AHPRA registration, and the overseas mobile skip no longer applies. The New to pharmacy talent post is removed;
the person posts again in the new role.
"""
from django.db import transaction
from django.db.models import Q
from rest_framework.exceptions import ValidationError

STAFF_ROLES = ('INTERN', 'TECHNICIAN', 'ASSISTANT', 'STUDENT')

# Fields with the same meaning on the newcomer and worker profiles. Verification flags other than the ID check are
# never copied: they belong to the new role.
CARRIED_FIELDS = (
    'date_of_birth', 'gender', 'emergency_contact_number', 'emergency_contact_relation',
    'street_address', 'suburb', 'state', 'postcode', 'google_place_id', 'latitude', 'longitude',
    'open_to_travel', 'travel_states', 'coverage_radius_km', 'profile_photo', 'short_bio', 'resume',
    *(f'referee{i}_{name}' for i in (1, 2) for name in ('name', 'relation', 'email', 'workplace', 'confirmed', 'rejected', 'last_sent')),
)
# The photo ID moves as one unit (documents, type, details and the check result), so the carried check always
# describes the carried documents. Shared files are safe: storage deletion skips files another profile references.
IDENTITY_BUNDLE = ('government_id', 'government_id_type', 'identity_secondary_file', 'identity_meta', 'gov_id_verified', 'gov_id_verification_note')


def upgrade_newcomer(user_id, role, staff_role=None):
    """Return (user, staff_role) after converting the newcomer account; raises ValidationError when not allowed."""
    from onboarding.models import ExplorerOnboarding, OtherStaffOnboarding, PharmacistOnboarding
    from talent.models import ExplorerPost
    from users.models import User

    role = str(role or '').upper()
    staff_role = str(staff_role or '').upper()
    if role not in ('PHARMACIST', 'OTHER_STAFF'):
        raise ValidationError({'role': 'Choose Pharmacist or Pharmacy team.'})
    if role == 'OTHER_STAFF' and staff_role not in STAFF_ROLES:
        raise ValidationError({'staff_role': 'Choose assistant, technician, intern or student.'})

    with transaction.atomic():
        user = User.objects.select_for_update().get(pk=user_id)
        if user.role != 'EXPLORER':
            raise ValidationError({'role': 'Only a New to pharmacy account can be upgraded.'})
        newcomer = ExplorerOnboarding.objects.filter(user=user).first()
        target_model = PharmacistOnboarding if role == 'PHARMACIST' else OtherStaffOnboarding
        target, _ = target_model.objects.get_or_create(user=user)
        target_fields = {field.name for field in target_model._meta.get_fields()}
        changed = []
        if newcomer:
            for name in CARRIED_FIELDS:
                value = getattr(newcomer, name, None)
                if name in target_fields and value not in (None, '', [], {}) and getattr(target, name) in (None, '', [], {}, False):
                    setattr(target, name, value)
                    changed.append(name)
            if newcomer.government_id and not target.government_id:
                for name in IDENTITY_BUNDLE:
                    setattr(target, name, getattr(newcomer, name))
                    changed.append(name)
        if role == 'OTHER_STAFF':
            target.role_type = staff_role
            changed.append('role_type')
        target.verified = False
        target.save(update_fields=[*changed, 'verified'])

        user.role = role
        # The overseas mobile skip is a New to pharmacy route only; workers verify their mobile.
        user.mobile_check_skipped = False
        user.save(update_fields=['role', 'mobile_check_skipped'])

        # Owner decision 2026-10-13: the New to pharmacy post comes off the board; they post again in their new role
        # once that profile is verified (the talent hub's normal publishing gate).
        ExplorerPost.objects.filter(Q(author_user=user) | Q(explorer_profile__user=user), role_category='EXPLORER').delete()
    return user, staff_role or 'PHARMACIST'
