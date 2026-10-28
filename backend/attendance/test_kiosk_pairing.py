"""PR-C authenticated web issuance contracts.

Run: manage.py test attendance.test_kiosk_pairing --settings core.postgres_test_settings
Real expiry and proof-bound recovery extend the existing standalone pairing tests.
"""
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from unittest.mock import patch

from django.core.cache import cache
from django.core.cache.backends.locmem import LocMemCache
from django.db import close_old_connections, connection, connections
from django.test import TestCase, TransactionTestCase
from rest_framework.test import APIClient

from attendance import credentials
from attendance.credentials import authenticate_kiosk_device
from attendance.models import KioskDevice, KioskPairingAuthorization
from client_profile.characterization_support import client_for, make_owner_with_pharmacy, make_user
from memberships.models import Membership
from organizations.models import Organization, Pharmacy, PharmacyAdmin
from users.models import OrganizationMembership


REQUEST = "/api/v1/attendance/kiosk/pairing/request/"
PAIR = "/api/v1/attendance/kiosk/pairing/pair/"
WEB = {"HTTP_X_CLIENT_PLATFORM": "web"}


class PairingFixture:
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        if connection.vendor != "postgresql":
            raise AssertionError("Run C pairing tests with --settings core.postgres_test_settings; no SQLite/skip fallback.")

    def setUp(self):
        super().setUp()
        cache.clear()
        security = LocMemCache(f"pairing-{self.id()}", {})
        security.clear()
        counter = patch.object(credentials, "security_cache", security)
        counter.start()
        self.addCleanup(counter.stop)
        self.addCleanup(security.clear)
        self.addCleanup(cache.clear)
        notifications = patch("notifications.services.notify_users")
        notifications.start()
        self.addCleanup(notifications.stop)
        self.owner, self.pharmacy = make_owner_with_pharmacy("C Alpha")
        self.org = Organization.objects.create(name="C Organization")
        self.pharmacy.organization = self.org
        self.pharmacy.timezone = "Australia/Brisbane"
        self.pharmacy.save(update_fields=["organization", "timezone"])
        self.sibling = Pharmacy.objects.create(name="C Beta", owner=self.pharmacy.owner, organization=self.org)
        self.other_owner, self.other_pharmacy = make_owner_with_pharmacy("C Other tenant")
        self.manager = make_user("PHARMACIST")
        self.assignment = PharmacyAdmin.objects.create(
            user=self.manager, pharmacy=self.pharmacy, admin_level="MANAGER", is_active=True,
        )

    def issue(self, user, pharmacy=None):
        return client_for(user).post(REQUEST, {
            "pharmacy_id": (pharmacy or self.pharmacy).pk, "device_name": "Web dashboard counter",
        }, format="json", **WEB)

    def assert_options(self, user, pharmacies):
        response = client_for(user).get(REQUEST, **WEB)
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual({row["id"] for row in response.data["pharmacies"]}, {p.pk for p in pharmacies})
        for row in response.data["pharmacies"]:
            self.assertEqual(set(row), {"id", "name", "timezone"})
        return response

    def assert_refused_without_issuance(self, user, pharmacy=None):
        before = list(KioskPairingAuthorization.objects.order_by("pk").values())
        devices = list(KioskDevice.objects.order_by("pk").values())
        response = self.issue(user, pharmacy)
        self.assertEqual(response.status_code, 403, response.data)
        self.assertNotIn("pairing_code", response.data)
        self.assertEqual(list(KioskPairingAuthorization.objects.order_by("pk").values()), before)
        self.assertEqual(list(KioskDevice.objects.order_by("pk").values()), devices)


class WebPairingAuthorityTests(PairingFixture, TestCase):
    def test_owner_and_authorised_manager_issue_via_existing_web_route(self):
        for actor, pharmacies in ((self.owner, [self.pharmacy, self.sibling]), (self.manager, [self.pharmacy])):
            with self.subTest(actor=actor.pk):
                self.assert_options(actor, pharmacies)
                count = KioskDevice.objects.count()
                response = self.issue(actor)
                self.assertEqual(response.status_code, 200, response.data)
                self.assertRegex(response.data["pairing_code"], r"^\d{6}$")
                self.assertEqual(response.data["expires_in_seconds"], 900)
                self.assertEqual(response.data["pharmacy_id"], self.pharmacy.pk)
                authorization = KioskPairingAuthorization.objects.get(authorized_by=actor)
                self.assertEqual(authorization.pharmacy_id, self.pharmacy.pk)
                self.assertEqual(authorization.device_name, "Web dashboard counter")
                self.assertIsNone(authorization.consumed_at)
                self.assertEqual(KioskDevice.objects.count(), count, "Issuance must not activate a terminal.")
                # Redemption remains public and returns a restricted web terminal credential.
                paired = APIClient().post(PAIR, {"pairing_code": response.data["pairing_code"]}, format="json")
                self.assertEqual(paired.status_code, 201, paired.data)
                device = authenticate_kiosk_device(paired.data["device_token"])
                self.assertIsNotNone(device)
                self.assertEqual(device.client_kind, "WEB_ONLINE")
                self.assertEqual(device.pharmacy_id, self.pharmacy.pk)
                self.assertEqual(device.activated_by_id, actor.pk)
                self.assertTrue(paired.data["device_token"].startswith("ctk_kiosk_"))
                self.assertNotIn("access", paired.data)
                self.assertNotIn("refresh", paired.data)
                authorization.refresh_from_db()
                self.assertEqual(authorization.resulting_device_id, device.pk)
                # The terminal token cannot become a manager issuance credential.
                terminal = APIClient()
                terminal.credentials(HTTP_X_DEVICE_TOKEN=paired.data["device_token"])
                denied = terminal.post(REQUEST, {"pharmacy_id": self.pharmacy.pk}, format="json", **WEB)
                self.assertIn(denied.status_code, (401, 403), denied.data)

    def test_org_and_chief_admins_retain_org_wide_pairing_access(self):
        for role in ("ORG_ADMIN", "CHIEF_ADMIN"):
            with self.subTest(role=role):
                actor = make_user("ORG_STAFF")
                OrganizationMembership.objects.create(user=actor, organization=self.org, role=role)
                self.assert_options(actor, [self.pharmacy, self.sibling])
                self.assertEqual(self.issue(actor, self.sibling).status_code, 200)
                self.assert_refused_without_issuance(actor, self.other_pharmacy)

    def test_region_admin_is_limited_to_explicit_pharmacies_in_their_organization(self):
        actor = make_user("ORG_STAFF")
        scope = OrganizationMembership.objects.create(
            user=actor, organization=self.org, role="REGION_ADMIN", admin_level="MANAGER",
        )
        # A malformed cross-org assignment cannot expand authority into another tenant.
        scope.pharmacies.add(self.pharmacy, self.other_pharmacy)
        self.assert_options(actor, [self.pharmacy])
        self.assertEqual(self.issue(actor).status_code, 200)
        self.assert_refused_without_issuance(actor, self.sibling)
        self.assert_refused_without_issuance(actor, self.other_pharmacy)
        scope.pharmacies.clear()
        self.assert_options(actor, [])
        self.assert_refused_without_issuance(actor)

    def test_other_tenant_owner_and_worker_cannot_issue_or_list_target_pharmacies(self):
        worker = make_user("PHARMACIST")
        Membership.objects.create(
            user=worker, pharmacy=self.pharmacy, role="PHARMACIST", status="ACCEPTED", is_active=True,
        )
        for actor, pharmacies in ((self.other_owner, [self.other_pharmacy]), (worker, [])):
            with self.subTest(actor=actor.pk):
                self.assert_options(actor, pharmacies)
                self.assert_refused_without_issuance(actor)
        self.assert_refused_without_issuance(self.manager, self.sibling)
        self.assert_refused_without_issuance(self.owner, self.other_pharmacy)

    def test_anonymous_cannot_list_or_issue_codes(self):
        for method in ("get", "post"):
            with self.subTest(method=method):
                response = getattr(APIClient(), method)(REQUEST, {"pharmacy_id": self.pharmacy.pk}, format="json", **WEB)
                self.assertIn(response.status_code, (401, 403), response.data)
                self.assertNotIn("pairing_code", response.data)
                self.assertNotIn("pharmacies", response.data)
        self.assertFalse(KioskPairingAuthorization.objects.exists())
        self.assertFalse(KioskDevice.objects.exists())

    def test_inactive_and_lesser_admin_assignments_do_not_grant_pairing(self):
        for changes in ({"is_active": False}, {"is_active": True, "admin_level": "ROSTER_MANAGER"},
                        {"is_active": True, "admin_level": "COMMUNICATION_MANAGER"}):
            with self.subTest(changes=changes):
                PharmacyAdmin.objects.filter(pk=self.assignment.pk).update(**changes)
                self.assert_options(self.manager, [])
                self.assert_refused_without_issuance(self.manager)

    def test_manager_authority_loss_between_issuance_and_redemption_leaves_code_unconsumed(self):
        issued = self.issue(self.manager)
        self.assertEqual(issued.status_code, 200, issued.data)
        authorization = KioskPairingAuthorization.objects.get()
        PharmacyAdmin.objects.filter(pk=self.assignment.pk).update(is_active=False)
        self.assert_options(self.manager, [])
        self.assert_refused_without_issuance(self.manager)
        response = APIClient().post(PAIR, {"pairing_code": issued.data["pairing_code"]}, format="json")
        self.assertIn(response.status_code, (400, 403), response.data)
        self.assertNotIn("device_token", response.data)
        authorization.refresh_from_db()
        self.assertIsNone(authorization.consumed_at)
        self.assertIsNone(authorization.resulting_device_id)
        self.assertFalse(KioskDevice.objects.exists())

    def test_deactivated_issuer_with_active_assignment_cannot_redeem_code(self):
        issued = self.issue(self.manager)
        self.assertEqual(issued.status_code, 200, issued.data)
        authorization = KioskPairingAuthorization.objects.get()
        self.manager.is_active = False
        self.manager.save(update_fields=["is_active"])
        self.assignment.refresh_from_db()
        self.assertTrue(self.assignment.is_active, "The account, not its manager assignment, was disabled.")

        response = APIClient().post(PAIR, {"pairing_code": issued.data["pairing_code"]}, format="json")

        self.assertIn(response.status_code, (400, 403), response.data)
        self.assertEqual(set(response.data), {"error"}, "Keep the existing public pairing error shape.")
        self.assertIsInstance(response.data["error"], str)
        self.assertTrue(response.data["error"])
        authorization.refresh_from_db()
        self.assertIsNone(authorization.consumed_at)
        self.assertIsNone(authorization.resulting_device_id)
        self.assertFalse(KioskDevice.objects.exists(), "A disabled issuer must not activate any terminal.")

    def test_inactive_manager_cannot_list_pairing_options(self):
        self.manager.is_active = False
        self.manager.save(update_fields=["is_active"])
        # Force authentication to exercise authority even with a pre-existing authenticated actor.
        response = client_for(self.manager).get(REQUEST, **WEB)
        self.assertIn(response.status_code, (200, 401, 403), response.data)
        if response.status_code == 200:
            self.assertEqual(response.data, {"pharmacies": []})
        else:
            self.assertNotIn("pharmacies", response.data)
        self.assertNotIn("pairing_code", response.data)
        self.assertFalse(KioskPairingAuthorization.objects.exists())
        self.assertFalse(KioskDevice.objects.exists())
        self.assignment.refresh_from_db()
        self.assertTrue(self.assignment.is_active)

    def test_inactive_manager_cannot_issue_pairing_code(self):
        self.manager.is_active = False
        self.manager.save(update_fields=["is_active"])
        self.assert_refused_without_issuance(self.manager)
        self.assignment.refresh_from_db()
        self.assertTrue(self.assignment.is_active)


class PairingConsumptionPostgresTests(PairingFixture, TransactionTestCase):
    def test_simultaneous_redemption_creates_one_device(self):
        issued = self.issue(self.owner)
        self.assertEqual(issued.status_code, 200, issued.data)
        code = issued.data["pairing_code"]
        ready = Barrier(2)

        def redeem():
            close_old_connections()
            try:
                with connection.cursor() as cursor:
                    cursor.execute("SET lock_timeout = '5s'")
                    cursor.execute("SET statement_timeout = '10s'")
                ready.wait(timeout=5)
                response = APIClient().post(PAIR, {"pairing_code": code}, format="json")
                return response.status_code, response.data
            finally:
                connections.close_all()

        with ThreadPoolExecutor(max_workers=2) as executor:
            attempts = [executor.submit(redeem) for _ in range(2)]
            outcomes = [attempt.result(timeout=15) for attempt in attempts]
        self.assertEqual(sorted(status for status, _ in outcomes), [201, 400], outcomes)
        self.assertEqual(KioskDevice.objects.count(), 1)
        authorization = KioskPairingAuthorization.objects.get()
        self.assertIsNotNone(authorization.consumed_at)
        self.assertEqual(authorization.resulting_device_id, KioskDevice.objects.get().pk)
        winner = next(data for status, data in outcomes if status == 201)
        self.assertEqual(winner["device_id"], authorization.resulting_device_id)
        original_hash = KioskDevice.objects.get().device_token
        replay = APIClient().post(PAIR, {"pairing_code": code}, format="json")
        self.assertEqual(replay.status_code, 400, replay.data)
        self.assertNotIn("device_token", replay.data)
        self.assertEqual(KioskDevice.objects.count(), 1)
        self.assertEqual(KioskDevice.objects.get().device_token, original_hash)
