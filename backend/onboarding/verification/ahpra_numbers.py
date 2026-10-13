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
    """Refuse a change to a checked number or a number another account holds; claim the new number for this person,
    release numbers they no longer use, and reset the AHPRA check and Verified on a change (fields saved here).
    Returns whether the number changed.

    The claim commits before the tab saves (tabs keep a refused submission's edits, so they are not one transaction).
    shortcut: if the tab save itself then fails, the number stays registered to this same person until they change it;
    it never blocks them. Wrap claim and save in one transaction if tabs ever become atomic."""
    from onboarding.models import AhpraRegistration
    from onboarding.verification.policy import revoke_for_changed_evidence

    old, new = normalize(getattr(profile, 'ahpra_number', None)), normalize(new_number)
    if new == old:
        return False
    if getattr(profile, 'ahpra_verified', False):
        raise serializers.ValidationError({'ahpra_number': [LOCKED]})
    if new:
        try:
            with transaction.atomic():
                owner_id = AhpraRegistration.objects.get_or_create(number=new, defaults={'user_id': profile.user_id})[0].user_id
        except IntegrityError:  # a concurrent claim won the unique number
            owner_id = AhpraRegistration.objects.get(number=new).user_id
        if owner_id != profile.user_id:
            raise serializers.ValidationError({'ahpra_number': [TAKEN]})
    keep = _user_numbers(profile.user_id, skip=profile) | ({new} if new else set())
    AhpraRegistration.objects.filter(user_id=profile.user_id).exclude(number__in=keep).delete()

    # A new number needs a new check, and Verified waits for it when the role needs AHPRA.
    profile.ahpra_verified = False
    profile.ahpra_verification_note = ''
    fields = ['ahpra_verified', 'ahpra_verification_note']
    if hasattr(profile, 'verified') and not type(profile).__name__.startswith('Owner') and revoke_for_changed_evidence(profile, 'ahpra'):
        fields.append('verified')
    if profile.pk:
        profile.save(update_fields=fields)
    return True


def guard_ahpra_write(profile, validated_data: dict) -> None:
    """The onboarding serializers' write boundary: every accepted write that carries an AHPRA number passes here."""
    if 'ahpra_number' in validated_data:
        guard_ahpra_number(profile, validated_data['ahpra_number'])
