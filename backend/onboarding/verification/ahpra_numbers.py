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
    """Compare valid registrations by their ten digits; retain invalid legacy identifiers."""
    full = full_registration_number(number)
    if full:
        return full[3:]
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


def _remaining_legacy_owner(number: str, *, releasing_user_id: int) -> int | None:
    """Find another pre-0080 holder before relinquishing the canonical registry row.

    This scan is deliberately limited to number releases (rare support or unchecked-number
    corrections), not normal profile saves. Legacy source values were not normalised in the
    original tables, so a raw SQL equality check would miss equivalent formats.
    """
    from onboarding.models import OtherStaffOnboarding, OwnerOnboarding, PharmacistOnboarding

    candidates = []
    for model in (PharmacistOnboarding, OtherStaffOnboarding, OwnerOnboarding):
        rows = (
            model.objects.exclude(user_id=releasing_user_id)
            .exclude(ahpra_number__isnull=True).exclude(ahpra_number='')
            .values_list('user_id', 'ahpra_number', 'ahpra_verified')
            .iterator(chunk_size=1000)
        )
        for user_id, saved_number, checked in rows:
            if normalize(saved_number) == number:
                candidates.append((not bool(checked), user_id))
    return min(candidates)[1] if candidates else None


def _release_or_transfer_unused_registrations(user_id) -> None:
    """Do not free a number while any grandfathered account still holds it.

    Called inside a transaction. Row locking prevents a new claimant from slipping
    between release of the old owner and registration of the legacy successor.
    """
    from onboarding.models import AhpraRegistration

    current_numbers = _user_numbers(user_id)
    registrations = AhpraRegistration.objects.select_for_update().filter(user_id=user_id)
    for registration in registrations:
        number = normalize(registration.number)
        if number in current_numbers:
            continue
        successor = _remaining_legacy_owner(number, releasing_user_id=user_id)
        if successor is None:
            registration.delete()
        else:
            registration.user_id = successor
            registration.save(update_fields=['user'])


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
            if ahpra_number_owner_conflict(profile.user_id, new):
                raise serializers.ValidationError({'ahpra_number': [TAKEN]})
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
            _release_or_transfer_unused_registrations(profile.user_id)
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
    """Compare existing reservations canonically without rewriting legacy stored numbers."""
    from onboarding.models import AhpraRegistration
    number = normalize(number)
    return bool(number) and any(
        normalize(saved) == number
        for saved in AhpraRegistration.objects.exclude(user_id=user_id).values_list('number', flat=True).iterator()
    )


def sync_ahpra_registrations(user_id, *, grandfathered_numbers=frozenset()) -> None:
    """Sync an admin correction without losing legacy reservations.

    Only numbers already present on this account before the admin save may be
    grandfathered if another account owns the registry row. New/changed claims
    still fail atomically, including if a competing admin write wins after form
    validation. Callers can use the default empty allowance for strict writes.
    """
    from onboarding.models import AhpraRegistration

    with transaction.atomic():
        numbers = _user_numbers(user_id)
        grandfathered_numbers = {normalize(number) for number in grandfathered_numbers}
        for number in numbers:
            if ahpra_number_owner_conflict(user_id, number):
                if number in grandfathered_numbers:
                    continue
                raise IntegrityError('This AHPRA number belongs to another account.')
            try:
                with transaction.atomic():
                    registration, _ = AhpraRegistration.objects.get_or_create(
                        number=number, defaults={'user_id': user_id}
                    )
                    owner_id = registration.user_id
            except IntegrityError:
                owner_id = AhpraRegistration.objects.get(number=number).user_id
            if owner_id != user_id and number not in grandfathered_numbers:
                raise IntegrityError('This AHPRA number belongs to another account.')
        _release_or_transfer_unused_registrations(user_id)


def full_registration_number(raw) -> str | None:
    """Format an AHPRA registration number for register lookup.

    Strips spaces and dashes, uppercases.
    Accepts 'PHA' + 10 digits, or 7-10 digits (left-padded to 10 with zeros).
    Returns 'PHA' + 10 digits, or None for anything else.
    """
    clean = re.sub(r'[\s\-]+', '', str(raw or '')).upper()
    if re.fullmatch(r'PHA\d{10}', clean):
        return clean
    if re.fullmatch(r'\d{7,10}', clean):
        return f"PHA{clean.zfill(10)}"
    return None

