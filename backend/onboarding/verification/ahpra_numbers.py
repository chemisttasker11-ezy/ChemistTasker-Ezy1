"""AHPRA numbers: one person each, for life (owner decision 2026-10-13).

A checked number cannot be changed in the app (support corrects mistakes). No two accounts may hold the same number;
the same person may use it on each of their own profiles (intern -> pharmacist, owner + pharmacist). Ownership is a
row in AhpraRegistration with a unique normalised number, so concurrent claims cannot both succeed.
`guard_ahpra_write` is called first by every onboarding serializer write (onboarding/serializers.py update methods);
unknown tabs are refused there, so no write path skips it.
"""
import re

from django.db import IntegrityError, transaction
from rest_framework import serializers

LOCKED = "Your AHPRA number has been checked and stays with you for life, so it can't be changed. Contact support if it is wrong."
TAKEN = 'This AHPRA number is already used by another account. Contact support if it is yours.'


def normalize(number) -> str:
    return re.sub(r'\s+', '', str(number or '')).upper()


def _user_numbers(user_id, *, skip=None) -> set[str]:
    """Numbers on this person's profiles, leaving out `skip` (the profile being changed)."""
    from onboarding.models import OtherStaffOnboarding, OwnerOnboarding, PharmacistOnboarding
    numbers = set()
    for model in (PharmacistOnboarding, OtherStaffOnboarding, OwnerOnboarding):
        for row in model.objects.filter(user_id=user_id).only('pk', 'ahpra_number'):
            if not (skip is not None and isinstance(skip, model) and row.pk == skip.pk):
                numbers.add(normalize(row.ahpra_number))
    numbers.discard('')
    return numbers


def guard_ahpra_number(profile, new_number) -> bool:
    """Change this profile's AHPRA number: refuse a checked number or one another account holds; otherwise save the new
    number, its reset check (and Verified when the role needs AHPRA), the claim and the release of numbers the person
    no longer uses, all in one transaction with this person's number changes serialised (third review 2026-10-14:
    ownership never drifts from the saved profile). Returns whether the number changed. The rest of the tab saves
    separately, so a refused Submit still keeps its other edits."""
    from django.contrib.auth import get_user_model
    from onboarding.models import AhpraRegistration
    from onboarding.verification.policy import revoke_for_changed_evidence

    with transaction.atomic():
        get_user_model().objects.select_for_update().filter(pk=profile.user_id).first()  # one change at a time per person
        if profile.pk:
            profile.refresh_from_db(fields=['ahpra_number', 'ahpra_verified'])
        old, new = normalize(getattr(profile, 'ahpra_number', None)), normalize(new_number)
        if new == old:
            return False
        if getattr(profile, 'ahpra_verified', False):
            raise serializers.ValidationError({'ahpra_number': [LOCKED]})
        if new:
            try:
                with transaction.atomic():
                    owner_id = AhpraRegistration.objects.get_or_create(number=new, defaults={'user_id': profile.user_id})[0].user_id
            except IntegrityError:  # a concurrent claim by another account won the unique number
                owner_id = AhpraRegistration.objects.get(number=new).user_id
            if owner_id != profile.user_id:
                raise serializers.ValidationError({'ahpra_number': [TAKEN]})

        # A new number needs a new check, and Verified waits for it when the role needs AHPRA.
        profile.ahpra_number = (new_number or '').strip() or None
        profile.ahpra_verified = False
        profile.ahpra_verification_note = ''
        fields = ['ahpra_number', 'ahpra_verified', 'ahpra_verification_note']
        if hasattr(profile, 'verified') and not type(profile).__name__.startswith('Owner') and revoke_for_changed_evidence(profile, 'ahpra'):
            fields.append('verified')
        if profile.pk:
            profile.save(update_fields=fields)
            AhpraRegistration.objects.filter(user_id=profile.user_id).exclude(number__in=_user_numbers(profile.user_id)).delete()
    return True


def guard_ahpra_write(profile, validated_data: dict, *, tab: str, number_tabs: tuple[str, ...]) -> None:
    """The onboarding serializers' write boundary. Only the step that owns the number may change it; elsewhere an
    AHPRA field is dropped so it can never touch ownership."""
    if 'ahpra_number' not in validated_data:
        return
    if tab not in number_tabs:
        validated_data.pop('ahpra_number')
        return
    guard_ahpra_number(profile, validated_data['ahpra_number'])


def ahpra_number_owner_conflict(user_id, number) -> bool:
    """True when another account holds this number (admin form check before saving a support correction)."""
    from onboarding.models import AhpraRegistration
    number = normalize(number)
    return bool(number) and AhpraRegistration.objects.filter(number=number).exclude(user_id=user_id).exists()


def sync_ahpra_registrations(user_id) -> None:
    """Make the registry match this person's saved profiles: claim every number they hold and release the rest.
    Support corrections in Django admin call this after saving (they may change a checked number; that is the
    support override). Raises IntegrityError when another account holds a number, so the admin save rolls back."""
    from onboarding.models import AhpraRegistration
    numbers = _user_numbers(user_id)
    for number in numbers:
        owner = AhpraRegistration.objects.get_or_create(number=number, defaults={'user_id': user_id})[0].user_id
        if owner != user_id:
            # Existing legacy duplicate profiles may still carry another
            # canonical owner's number. Do not unverify or block unrelated
            # admin saves; never create a competing registry ownership row.
            from onboarding.models import OtherStaffOnboarding, OwnerOnboarding, PharmacistOnboarding
            existing = any(
                normalize(value) == number
                for model in (PharmacistOnboarding, OtherStaffOnboarding, OwnerOnboarding)
                for value in model.objects.filter(user_id=user_id).values_list('ahpra_number', flat=True)
            )
            if not existing:
                raise IntegrityError(f'AHPRA number already belongs to user {owner}')
    AhpraRegistration.objects.filter(user_id=user_id).exclude(number__in=numbers).delete()
