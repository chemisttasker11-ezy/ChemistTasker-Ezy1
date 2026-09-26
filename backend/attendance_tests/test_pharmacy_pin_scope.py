import os
import unittest

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "attendance_tests.settings")

import django
django.setup()

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from rest_framework.test import APIRequestFactory, force_authenticate

from client_profile.attendance_credentials import worker_update_own_pin
from client_profile.attendance_views import KioskRequestPairingCodeView, WorkerUpdatePinView
from client_profile.models import Membership, OwnerOnboarding, Pharmacy, WorkerPIN
from attendance_tests.roster_schema import clear_schema, create_schema, drop_schema


class PharmacyPinScopeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        create_schema()

    @classmethod
    def tearDownClass(cls):
        drop_schema()
        super().tearDownClass()

    def setUp(self):
        clear_schema()
        User = get_user_model()
        self.owner = User.objects.create(username="scope_owner", email="owner@scope.invalid", role="OWNER")
        self.other = User.objects.create(username="other_owner", email="other@scope.invalid", role="OWNER")
        self.worker = User.objects.create(username="scope_worker", email="worker@scope.invalid", role="PHARMACIST")
        profile = OwnerOnboarding.objects.create(user=self.owner, role="PHARMACIST", phone_number="0400000000")
        other_profile = OwnerOnboarding.objects.create(user=self.other, role="PHARMACIST", phone_number="0400000001")
        self.a = Pharmacy.objects.create(name="Alpha", owner=profile)
        self.b = Pharmacy.objects.create(name="Beta", owner=profile)
        self.c = Pharmacy.objects.create(name="Restricted", owner=other_profile)
        for pharmacy in (self.a, self.b):
            Membership.objects.create(user=self.worker, pharmacy=pharmacy, role="PHARMACIST",
                employment_type="FULL_TIME", status=Membership.Status.ACCEPTED, is_active=True)

    def test_multi_pharmacy_pin_requires_explicit_scope(self):
        with self.assertRaises(ValidationError):
            worker_update_own_pin(self.worker, "123456")
        self.assertFalse(WorkerPIN.objects.exists())
        pin = worker_update_own_pin(self.worker, "123456", self.a.pk)
        self.assertEqual(pin.membership.pharmacy_id, self.a.pk)
        self.assertTrue(pin.check_pin("123456"))
        self.assertFalse(WorkerPIN.objects.filter(membership__pharmacy=self.b).exists())

    def test_pin_cannot_target_unrelated_pharmacy(self):
        with self.assertRaises(ValidationError):
            worker_update_own_pin(self.worker, "123456", self.c.pk)
        self.assertFalse(WorkerPIN.objects.exists())

    def test_owner_can_choose_all_owned_pharmacies_only(self):
        request = APIRequestFactory().get("/pairing/request/")
        force_authenticate(request, self.owner)
        response = KioskRequestPairingCodeView.as_view()(request)
        self.assertEqual(response.status_code, 200)
        self.assertEqual({row["id"] for row in response.data["pharmacies"]}, {self.a.pk, self.b.pk})

    def test_worker_options_exclude_pending_memberships(self):
        Membership.objects.filter(user=self.worker, pharmacy=self.b).update(status="INVITED")
        request = APIRequestFactory().get("/worker/pin/update/")
        force_authenticate(request, self.worker)
        response = WorkerUpdatePinView.as_view()(request)
        self.assertEqual([row["id"] for row in response.data["pharmacies"]], [self.a.pk])
