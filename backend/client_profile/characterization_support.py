"""Shared fixtures for the characterization tests (test_characterization_*.py).

These tests pin CURRENT behaviour through the real URL stack so that moving code
between modules or apps can be proven behaviour-neutral. They are not a
statement that the pinned behaviour is ideal.
"""
import itertools

from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from client_profile.models import (
    Membership,
    OtherStaffOnboarding,
    OwnerOnboarding,
    Pharmacy,
)

User = get_user_model()
BASE = "/api/client-profile/"
_seq = itertools.count(1)


def make_user(role="OTHER_STAFF", **extra):
    n = next(_seq)
    return User.objects.create_user(
        email=f"char{n}@example.com",
        password="test-pass",
        role=role,
        first_name=extra.pop("first_name", f"First{n}"),
        last_name=extra.pop("last_name", f"Last{n}"),
        **extra,
    )


def make_owner_with_pharmacy(name="Characterization Pharmacy"):
    owner = make_user("OWNER")
    onboarding = OwnerOnboarding.objects.create(user=owner, phone_number="0400000000", role="MANAGER")
    pharmacy = Pharmacy.objects.create(name=name, abn="51824753556", owner=onboarding)
    return owner, pharmacy


def make_staff_member(pharmacy, role="ASSISTANT", status=Membership.Status.ACCEPTED, **user_extra):
    user = make_user("OTHER_STAFF", **user_extra)
    OtherStaffOnboarding.objects.create(user=user, role_type=role)
    membership = Membership.objects.create(user=user, pharmacy=pharmacy, role=role, status=status)
    return user, membership


def client_for(user=None):
    client = APIClient()
    if user is not None:
        client.force_authenticate(user=user)
    return client


def make_assignment(pharmacy, owner, worker, day=None):
    """A worker assigned to one slot at the pharmacy (a 'completed relationship' for ratings)."""
    from datetime import date, time
    from client_profile.models import Shift, ShiftSlot, ShiftSlotAssignment

    day = day or date(2026, 1, 5)
    shift = Shift.objects.create(pharmacy=pharmacy, created_by=owner, role_needed="ASSISTANT", employment_type="LOCUM")
    slot = ShiftSlot.objects.create(shift=shift, date=day, start_time=time(9, 0), end_time=time(17, 0))
    assignment = ShiftSlotAssignment.objects.create(shift=shift, slot=slot, slot_date=day, user=worker)
    return shift, slot, assignment
