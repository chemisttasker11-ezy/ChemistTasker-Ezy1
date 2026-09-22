"""Run with manage.py shell under runtime_settings to prepare local acceptance data."""
import json
from datetime import time, timedelta
from zoneinfo import ZoneInfo

from django.conf import settings
from django.contrib.auth import get_user_model
from django.utils import timezone
from client_profile.models import (
    Organization, OwnerOnboarding, Pharmacy, Membership,
    Shift, ShiftSlot, ShiftSlotAssignment,
)
from client_profile.attendance_credentials import generate_kiosk_pairing_code

assert settings.SETTINGS_MODULE == "attendance_tests.runtime_settings"
assert settings.DATABASES["default"]["NAME"].startswith("chemisttasker_kiosk_test_")
User = get_user_model()
owner, _ = User.objects.get_or_create(email="owner@kiosk-acceptance.invalid", defaults={
    "username": "kiosk_acceptance_owner", "role": "OWNER", "is_active": True,
})
worker, _ = User.objects.get_or_create(email="worker@kiosk-acceptance.invalid", defaults={
    "username": "kiosk_acceptance_worker", "role": "PHARMACIST", "is_active": True,
    "first_name": "Kiosk", "last_name": "Acceptance",
})
org, _ = Organization.objects.get_or_create(name="Local Kiosk Acceptance")
profile, _ = OwnerOnboarding.objects.get_or_create(user=owner, defaults={
    "phone_number": "0400000000", "role": "PHARMACIST",
})
pharmacy, _ = Pharmacy.objects.get_or_create(owner=profile, name="LOCAL TEST Pharmacy", defaults={
    "organization": org, "timezone": "Australia/Brisbane",
})
membership, _ = Membership.objects.get_or_create(user=worker, pharmacy=pharmacy, defaults={
    "role": "PHARMACIST", "employment_type": "FULL_TIME",
    "status": Membership.Status.ACCEPTED, "is_active": True,
})
shift, _ = Shift.objects.get_or_create(pharmacy=pharmacy, created_by=owner, dedicated_user=worker,
    role_needed="PHARMACIST", employment_type="FULL_TIME", defaults={"min_hourly_rate": 50, "max_hourly_rate": 50})
today = timezone.now().astimezone(ZoneInfo("Australia/Brisbane")).date()
for day in (today, today + timedelta(days=1)):
    slot, _ = ShiftSlot.objects.get_or_create(shift=shift, date=day,
        start_time=time(0, 0), end_time=time(23, 59))
    ShiftSlotAssignment.objects.get_or_create(shift=shift, slot=slot, slot_date=day, user=worker)
code = generate_kiosk_pairing_code(owner, pharmacy, "Local Windows Acceptance", ttl_seconds=7200)
print(json.dumps({"pharmacy_id": pharmacy.pk, "worker_id": worker.pk, "pairing_code": code}))
