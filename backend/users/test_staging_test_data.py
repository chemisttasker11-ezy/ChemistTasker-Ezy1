"""Safety and idempotence tests for synthetic staging accounts."""
import os
from unittest.mock import patch

from django.test import SimpleTestCase, TestCase

from memberships.models import Membership
from organizations.models import Organization, Pharmacy
from users.models import OrganizationMembership, User
from testing.staging_test_data import (
    PERSONAS, demo_email, require_staging_database,
    seed_demo_data, validate_credentials,
)


def demo_credentials():
    return {
        key: {"email": demo_email(key), "password": "IsolatedSynthetic" * 3 + key}
        for key in PERSONAS
    }


class StagingAccountSafetyTests(SimpleTestCase):
    def test_never_seed_in_production_or_local(self):
        for value in ("production", "local", "test", ""):
            with self.subTest(env=value), patch.dict(
                os.environ,
                {"APP_ENV": value, "STAGING_TEST_DATA_ENABLED": "1",
                 "USE_PROD_DB": "False"},
            ):
                with self.assertRaises(RuntimeError):
                    require_staging_database()

    def test_credential_records_must_match_reserved_test_emails(self):
        valid = demo_credentials()
        self.assertEqual(validate_credentials(valid), valid)
        for bad in (
            {},
            {**valid, "extra": {"email": "x", "password": "x"}},
            {**valid, "owner": {"email": "real@example.com", "password": "A" * 26}},
            {**valid, "owner": {"email": demo_email("owner"), "password": "short"}},
        ):
            with self.assertRaises(ValueError):
                validate_credentials(bad)


class StagingAccountFixturesTests(TestCase):
    def test_roles_relationships_and_repeat_seeding(self):
        credentials = demo_credentials()
        seed_demo_data(credentials)
        emails = User.objects.filter(email__endswith="@staging.chemisttasker.test")
        self.assertEqual(emails.count(), 8)
        for persona, (role, _, _) in PERSONAS.items():
            account = User.objects.get(email=demo_email(persona))
            self.assertEqual(account.role, role)
            self.assertTrue(account.is_otp_verified)
            self.assertTrue(account.is_mobile_verified)
            self.assertFalse(account.is_staff)
            self.assertFalse(account.is_superuser)
            self.assertTrue(account.check_password(credentials[persona]["password"]))
        org = Organization.objects.get(slug="chemisttasker-staging-demo")
        self.assertEqual(Pharmacy.objects.filter(organization=org).count(), 2)
        self.assertEqual(
            OrganizationMembership.objects.get(
                user__email=demo_email("organization_admin")
            ).role, "ORG_ADMIN",
        )
        self.assertEqual(set(Membership.objects.filter(
            user__email__endswith="@staging.chemisttasker.test"
        ).values_list("role", flat=True)), {
            "PHARMACIST", "INTERN", "TECHNICIAN", "ASSISTANT", "STUDENT",
        })
        password_hash = User.objects.get(email=demo_email("owner")).password
        seed_demo_data(credentials)
        self.assertEqual(emails.count(), 8)
        self.assertEqual(Pharmacy.objects.filter(organization=org).count(), 2)
        self.assertEqual(Membership.objects.filter(
            user__email__endswith="@staging.chemisttasker.test"
        ).count(), 5)
        self.assertEqual(User.objects.get(email=demo_email("owner")).password, password_hash)

    def test_does_not_take_over_preexisting_account(self):
        User.objects.create_user(
            email=demo_email("owner"), password="SomethingPrivate123",
            role="OWNER", last_name="NOT A DEMO USER",
        )
        with self.assertRaisesRegex(RuntimeError, "collision"):
            seed_demo_data(demo_credentials())
        self.assertEqual(User.objects.count(), 1)
        self.assertFalse(User.objects.get(email=demo_email("owner")).is_otp_verified)
