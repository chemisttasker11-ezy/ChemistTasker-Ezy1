"""Seed only the fresh database created by the authenticated browser runner."""
import os
import django

if os.environ.get("DJANGO_SETTINGS_MODULE") != "core.e2e_acceptance_settings":
    raise RuntimeError("Refusing to seed outside isolated E2E settings")
django.setup()

from django.contrib.auth import get_user_model
from onboarding.models import OwnerOnboarding, PharmacistOnboarding
from organizations.models import Pharmacy, PharmacyAdmin
from memberships.models import Membership

User = get_user_model()
if User.objects.exists():
    raise RuntimeError("Refusing to seed a database that already contains users")

def create_user(name, role):
    return User.objects.create_user(
        email=f"{name}@browser-acceptance.example.test",
        password=os.environ["E2E_TEST_PASSWORD"], role=role,
        first_name=name.title(), last_name="Acceptance",
        is_otp_verified=True, is_mobile_verified=True,
    )

owner = create_user("owner", "OWNER")
profile = OwnerOnboarding.objects.create(user=owner, phone_number="0400000000", role="MANAGER", verified=True, gov_id_verified=True)
p1 = Pharmacy.objects.create(name="Acceptance Bendigo Pharmacy", abn="51824753556", owner=profile, suburb="Bendigo", state="VIC", postcode="3550")
Pharmacy.objects.create(name="Acceptance Second Pharmacy", abn="51824753556", owner=profile, suburb="Melbourne", state="VIC", postcode="3000")
worker = create_user("worker", "PHARMACIST")
PharmacistOnboarding.objects.create(user=worker, verified=True, gov_id_verified=True, ahpra_verified=True, suburb="Bendigo", state="VIC", postcode="3550")
membership = Membership.objects.create(user=worker, pharmacy=p1, role="PHARMACIST", status="ACCEPTED")
PharmacyAdmin.objects.create(user=worker, pharmacy=p1, membership=membership, admin_level="MANAGER", staff_role="PHARMACIST", created_by=owner)
from testing.invoice_acceptance_fixture import seed_invoice_work
seed_invoice_work(worker, p1)
print("Seeded disposable owner, two pharmacies, delegated pharmacist and accepted invoice work.")
