"""Failure-boundary contracts for user-account delivery and deletion side effects."""
from datetime import timedelta
from unittest import mock

import requests
from django.core.cache import cache
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.contrib.auth.hashers import make_password
from django.db import transaction
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from client_profile.characterization_support import make_user
from onboarding.models import PharmacistOnboarding
from users.account_deletion import _delete_verification_docs_for_user


STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.InMemoryStorage"},
    "staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"},
}


@override_settings(STORAGES=STORAGES)
class AccountDeletionFailureBoundaryTests(TestCase):
    def test_verification_file_cleanup_waits_for_database_commit(self):
        user = make_user("PHARMACIST")
        onboarding = PharmacistOnboarding.objects.create(
            user=user,
            government_id_type="AUS_PASSPORT",
        )
        onboarding.government_id.save(
            "rollback-document.pdf",
            ContentFile(b"%PDF-1.7 rollback"),
            save=True,
        )
        stored_name = onboarding.government_id.name
        self.assertTrue(default_storage.exists(stored_name))

        with self.assertRaises(RuntimeError):
            with transaction.atomic():
                _delete_verification_docs_for_user(user)
                self.assertTrue(
                    default_storage.exists(stored_name),
                    "storage deletion must wait until the database commit is durable",
                )
                raise RuntimeError("force database rollback")

        onboarding.refresh_from_db()
        self.assertEqual(onboarding.government_id.name, stored_name)
        self.assertTrue(default_storage.exists(stored_name))

    def test_delete_account_succeeds_if_confirmation_queue_is_unavailable(self):
        user = make_user("PHARMACIST")
        client = APIClient()
        client.force_authenticate(user)

        with mock.patch(
            "users.api_account.async_task",
            side_effect=ConnectionError("queue unavailable"),
        ):
            response = client.delete("/api/account/")

        self.assertEqual((response.status_code, response.data), (200, {"success": True}))
        user.refresh_from_db()
        self.assertFalse(user.is_active)
        self.assertIsNotNone(user.deleted_at)


class EmailQueueFailureBoundaryTests(TestCase):
    def test_password_reset_remains_non_enumerating_if_queue_is_unavailable(self):
        user = make_user("PHARMACIST")
        expected = {"detail": "If this email exists, a reset link has been sent."}

        with mock.patch(
            "users.api_passwords.send_async_email",
            side_effect=ConnectionError("queue unavailable"),
        ):
            cache.clear()
            known = APIClient().post(
                "/api/users/password-reset/",
                {"email": user.email},
                format="json",
            )
            cache.clear()
            unknown = APIClient().post(
                "/api/users/password-reset/",
                {"email": "absent@example.invalid"},
                format="json",
            )

        self.assertEqual((known.status_code, known.data), (200, expected))
        self.assertEqual((unknown.status_code, unknown.data), (200, expected))

    def test_email_otp_resend_remains_non_enumerating_if_queue_is_unavailable(self):
        previous_created_at = timezone.now() - timedelta(minutes=2)
        previous_code = make_password("112233")
        user = make_user(
            "PHARMACIST",
            is_otp_verified=False,
            otp_code=previous_code,
            otp_created_at=previous_created_at,
            otp_failed_attempts=3,
            otp_locked_until=None,
        )
        previous_state = (
            user.otp_code,
            user.otp_created_at,
            user.otp_failed_attempts,
            user.otp_locked_until,
        )
        expected = {
            "detail": "If this email is eligible, a verification code has been sent."
        }

        with mock.patch(
            "users.api_otp.send_async_email",
            side_effect=ConnectionError("queue unavailable"),
        ):
            cache.clear()
            known = APIClient().post(
                "/api/users/resend-otp/",
                {"email": user.email},
                format="json",
            )
            cache.clear()
            unknown = APIClient().post(
                "/api/users/resend-otp/",
                {"email": "absent@example.invalid"},
                format="json",
            )

        self.assertEqual((known.status_code, known.data), (200, expected))
        self.assertEqual((unknown.status_code, unknown.data), (200, expected))
        user.refresh_from_db()
        self.assertEqual(
            (
                user.otp_code,
                user.otp_created_at,
                user.otp_failed_attempts,
                user.otp_locked_until,
            ),
            previous_state,
            "an undelivered resend must not invalidate the prior OTP/security state",
        )


@override_settings(
    DEBUG=False,
    MOBILEMESSAGE_SENDER="CT",
    MOBILEMESSAGE_USERNAME="u",
    MOBILEMESSAGE_PASSWORD="p",
)
class MobileOtpDeliveryFailureTests(TestCase):
    IDENTITY = {"first_name": "Ann", "last_name": "Lee", "username": "ann.lee"}

    def client_for(self, user):
        client = APIClient()
        client.force_authenticate(user)
        return client

    def provider(self, status_code):
        return mock.patch(
            "users.api_otp.requests.post",
            return_value=mock.Mock(status_code=status_code),
        )

    def test_request_failure_rolls_back_attempt_and_allows_immediate_retry(self):
        user = make_user("PHARMACIST", is_otp_verified=True)
        before = (user.first_name, user.last_name, user.username, user.mobile_number)

        with self.provider(500):
            failed = self.client_for(user).post(
                "/api/users/mobile/request-otp/",
                {"mobile_number": "0400000000", **self.IDENTITY},
                format="json",
            )

        self.assertEqual(failed.status_code, 502, failed.data)
        user.refresh_from_db()
        self.assertEqual(
            (user.first_name, user.last_name, user.username, user.mobile_number),
            before,
        )
        self.assertIsNone(user.mobile_otp_code)
        self.assertIsNone(user.mobile_otp_created_at)

        cache.clear()
        with self.provider(200):
            retry = self.client_for(user).post(
                "/api/users/mobile/request-otp/",
                {"mobile_number": "0400000000", **self.IDENTITY},
                format="json",
            )
        self.assertEqual(retry.status_code, 200, retry.data)

    def test_resend_failure_does_not_create_false_cooldown(self):
        user = make_user(
            "PHARMACIST",
            is_otp_verified=True,
            mobile_number="61400000000",
        )

        with self.provider(500):
            failed = self.client_for(user).post(
                "/api/users/mobile/resend-otp/",
                {},
                format="json",
            )
        self.assertEqual(failed.status_code, 502, failed.data)
        user.refresh_from_db()
        self.assertIsNone(user.mobile_otp_code)
        self.assertIsNone(user.mobile_otp_created_at)

        cache.clear()
        with self.provider(200):
            retry = self.client_for(user).post(
                "/api/users/mobile/resend-otp/",
                {},
                format="json",
            )
        self.assertEqual(retry.status_code, 200, retry.data)

    def test_transport_exception_is_redacted_502_and_rolls_back_attempt(self):
        user = make_user("PHARMACIST", is_otp_verified=True)
        sensitive_provider_detail = "provider-detail-that-must-not-be-logged"

        with mock.patch(
            "users.api_otp.requests.post",
            side_effect=requests.RequestException(sensitive_provider_detail),
        ), self.assertLogs("users.views", level="WARNING") as logs:
            response = self.client_for(user).post(
                "/api/users/mobile/request-otp/",
                {"mobile_number": "0400000000", **self.IDENTITY},
                format="json",
            )

        self.assertEqual(response.status_code, 502, response.data)
        logged = "\n".join(logs.output)
        self.assertNotIn(sensitive_provider_detail, logged)
        self.assertIn("error_type=RequestException", logged)
        user.refresh_from_db()
        self.assertIsNone(user.mobile_number)
        self.assertIsNone(user.mobile_otp_code)
        self.assertIsNone(user.mobile_otp_created_at)
