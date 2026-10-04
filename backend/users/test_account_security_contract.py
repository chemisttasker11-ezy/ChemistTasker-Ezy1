"""Security behaviour of the account endpoints: e-mail and mobile OTP (lockout, expiry, cooldowns, provider failure),
logout revocation, WebSocket tickets, password-reset and resend non-enumeration, and account deletion.

Complements users/tests.py (cookies, refresh rotation, remember-me, login enumeration). Throttle counters are cleared
between attempts so the tests exercise the endpoints' own lockout rules rather than the rate limiter. The SMS provider is
stubbed at requests.post; e-mails are captured at Celery send_task.
"""
import logging
from contextlib import contextmanager
from datetime import timedelta
from unittest import mock

from django.contrib.auth import get_user_model
from django.contrib.auth.hashers import make_password
from django.core.cache import cache
from django.core import mail
from django.core.files.base import ContentFile
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken
from rest_framework_simplejwt.tokens import RefreshToken

from client_profile.characterization_support import make_owner_with_pharmacy, make_user
from onboarding.models import OwnerOnboarding, PharmacistOnboarding
from users.models import WebSocketTicket

User = get_user_model()
API = "/api/users/"
STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.InMemoryStorage"},
    "staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"},
}


@contextmanager
def queued_emails():
    sent = []

    def record(name, args=None, kwargs=None, **options):
        kwargs = kwargs or {}
        sent.append((kwargs.get("template_name"), tuple(kwargs.get("recipient_list") or [])))

    with mock.patch("celery.app.base.Celery.send_task", side_effect=record):
        yield sent


def post(client, path, data=None):
    cache.clear()  # throttle counters
    with queued_emails() as sent:
        response = client.post(f"{API}{path}", data or {}, format="json")
    return response, sent


class RecaptchaPrivacyTests(TestCase):
    def test_provider_exception_detail_is_not_logged(self):
        from users.recaptcha import verify_recaptcha
        import requests

        secret = "SECRET-recaptcha-response-token"
        with mock.patch(
            "users.recaptcha.requests.post",
            side_effect=requests.RequestException(f"https://provider.example/?response={secret}"),
        ), self.assertLogs("users.views", level="WARNING") as logs:
            self.assertFalse(verify_recaptcha(secret))

        logged = "\n".join(logs.output)
        self.assertNotIn(secret, logged)
        self.assertIn("error_type=RequestException", logged)


class EmailOtpTests(TestCase):
    def otp_user(self, code="123456", created_at=None, **extra):
        return make_user("PHARMACIST", is_otp_verified=False, otp_code=make_password(code),
                         otp_created_at=created_at or timezone.now(), **extra)

    def test_five_wrong_codes_lock_the_account_for_fifteen_minutes(self):
        user = self.otp_user()
        client = APIClient()
        for attempt in range(1, 6):
            response, _ = post(client, "verify-otp/", {"email": user.email, "otp": "000000"})
            self.assertEqual((response.status_code, response.data["detail"]),
                             (400, "Invalid or expired verification code."))
            user.refresh_from_db()
            self.assertEqual(user.otp_failed_attempts, attempt)
        self.assertAlmostEqual(user.otp_locked_until, timezone.now() + timedelta(minutes=15), delta=timedelta(minutes=1))

        locked, sent = post(client, "verify-otp/", {"email": user.email, "otp": "123456"})
        self.assertEqual(locked.status_code, 400)  # the correct code is refused while locked, with the same message
        self.assertEqual(sent, [])
        user.refresh_from_db()
        self.assertFalse(user.is_otp_verified)

        user.otp_locked_until = timezone.now() - timedelta(seconds=1)
        user.save(update_fields=["otp_locked_until"])
        ok, sent = post(client, "verify-otp/", {"email": user.email, "otp": "123456"})
        self.assertEqual(ok.status_code, 200, ok.data)
        user.refresh_from_db()
        self.assertEqual((user.is_otp_verified, user.otp_code, user.otp_failed_attempts, user.otp_locked_until),
                         (True, None, 0, None))
        self.assertEqual(sent, [("emails/welcome_email.html", (user.email,))])
        self.assertEqual(set(ok.data), {"refresh", "access", "user"})  # non-browser clients get tokens

    def test_expired_legacy_and_browser_cases(self):
        expired = self.otp_user(created_at=timezone.now() - timedelta(minutes=11))
        response, _ = post(APIClient(), "verify-otp/", {"email": expired.email, "otp": "123456"})
        self.assertEqual(response.status_code, 400)
        legacy = make_user("PHARMACIST", is_otp_verified=False, otp_code="654321", otp_created_at=timezone.now())
        response, _ = post(APIClient(), "verify-otp/", {"email": legacy.email, "otp": "654321"})
        self.assertEqual(response.status_code, 200)
        unknown, _ = post(APIClient(), "verify-otp/", {"email": "nobody@example.com", "otp": "123456"})
        self.assertEqual((unknown.status_code, unknown.data["detail"]), (400, "Invalid or expired verification code."))

    def test_resend_does_not_reveal_accounts_and_resets_the_lock(self):
        user = self.otp_user(otp_failed_attempts=5, otp_locked_until=timezone.now() + timedelta(minutes=10))
        verified = make_user("PHARMACIST", is_otp_verified=True)
        expected = {"detail": "If this email is eligible, a verification code has been sent."}
        for email, sends in ((user.email, True), (verified.email, False), ("nobody@example.com", False)):
            with self.subTest(email=email):
                mail.outbox = []
                response, _ = post(APIClient(), "resend-otp/", {"email": email})
                self.assertEqual((response.status_code, response.data), (200, expected))
                # sent through users.tasks.queue_email, which delivers immediately in eager test mode
                self.assertEqual([m.to for m in mail.outbox], [[email]] if sends else [])
        user.refresh_from_db()
        self.assertEqual((user.otp_failed_attempts, user.otp_locked_until), (0, None))
        self.assertTrue(user.otp_code.startswith("pbkdf2_") or "$" in user.otp_code)  # stored hashed


@override_settings(DEBUG=False, MOBILEMESSAGE_SENDER="CT", MOBILEMESSAGE_USERNAME="u", MOBILEMESSAGE_PASSWORD="p")
class MobileOtpTests(TestCase):
    IDENTITY = {"first_name": "Ann", "last_name": "Lee", "username": "ann.lee"}

    def client_for(self, user):
        client = APIClient()
        client.force_authenticate(user)
        return client

    def provider(self, status_code=200, text='{"status":"ok"}'):
        response = mock.Mock(status_code=status_code, text=text)
        return mock.patch("requests.post", return_value=response)

    def test_request_validates_sends_and_cools_down(self):
        user = make_user("PHARMACIST", is_otp_verified=True)
        client = self.client_for(user)
        missing, _ = post(client, "mobile/request-otp/", {})
        self.assertEqual((missing.status_code, missing.data["error"]), (400, "Mobile number is required"))
        bad, _ = post(client, "mobile/request-otp/", {"mobile_number": "12345", **self.IDENTITY})
        self.assertEqual((bad.status_code, bad.data["error"]), (400, "Invalid Australian mobile number format"))
        nameless, _ = post(client, "mobile/request-otp/", {"mobile_number": "0412345678"})
        self.assertEqual((nameless.status_code, set(nameless.data)), (400, {"first_name", "last_name", "username"}))

        with self.provider() as sms:
            response, _ = post(client, "mobile/request-otp/", {"mobile_number": "0412 345 678", **self.IDENTITY})
        self.assertEqual((response.status_code, response.data), (200, {"detail": "OTP sent successfully"}))
        user.refresh_from_db()
        self.assertEqual((user.mobile_number, user.first_name, user.is_mobile_verified), ("61412345678", "Ann", False))
        message = sms.call_args.kwargs["json"]["messages"][0]
        self.assertEqual(message["to"], "61412345678")
        self.assertTrue(message["message"].startswith("Your ChemistTasker verification code is "))

        with self.provider() as sms:
            again, _ = post(client, "mobile/request-otp/", {"mobile_number": "0412345678", **self.IDENTITY})
            resend, _ = post(client, "mobile/resend-otp/", {})
        self.assertEqual((again.status_code, resend.status_code), (429, 429))
        sms.assert_not_called()

    @override_settings(DEBUG=True)
    def test_debug_mobile_otp_response_does_not_log_or_print_the_secret(self):
        user = make_user("PHARMACIST", is_otp_verified=True)
        client = self.client_for(user)
        with mock.patch("users.api_otp.generate_otp", return_value="123456"), \
                mock.patch("builtins.print") as printed, \
                mock.patch("users.api_otp.logging.getLogger") as get_logger:
            response, _ = post(
                client,
                "mobile/request-otp/",
                {"mobile_number": "0412345678", **self.IDENTITY},
            )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["debug_otp"], "123456")
        printed.assert_not_called()
        get_logger.assert_not_called()

        user.refresh_from_db()
        user.mobile_otp_created_at = timezone.now() - timedelta(seconds=61)
        user.save(update_fields=["mobile_otp_created_at"])
        with mock.patch("users.api_otp.generate_otp", return_value="654321"), \
                mock.patch("builtins.print") as printed, \
                mock.patch("users.api_otp.logging.getLogger") as get_logger:
            response, _ = post(client, "mobile/resend-otp/", {})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["debug_otp"], "654321")
        printed.assert_not_called()
        get_logger.assert_not_called()

    def test_provider_failure_is_a_502(self):
        user = make_user("PHARMACIST", is_otp_verified=True)
        provider_body = "rejected: message 'Your ChemistTasker verification code is 999999' to 61400000000"
        with self.provider(status_code=500, text=provider_body), self.assertLogs("users.views", "WARNING") as logs:
            response, _ = post(self.client_for(user), "mobile/request-otp/", {"mobile_number": "0400000000",
                                                                              **self.IDENTITY})
        self.assertEqual((response.status_code, response.data["error"]),
                         (502, "Unable to send verification code right now. Please try again later."))
        # Regression: the provider's response body (which can echo the code and the number) used to be logged.
        logged = "\n".join(logs.output)
        self.assertNotIn("999999", logged)
        self.assertNotIn("61400000000", logged)
        self.assertIn("provider status 500", logged)

        resend_user = make_user("PHARMACIST", is_otp_verified=True, mobile_number="61400000000")
        with self.provider(status_code=500, text=provider_body), self.assertLogs("users.views", "WARNING") as logs:
            response, _ = post(self.client_for(resend_user), "mobile/resend-otp/", {})
        self.assertEqual(response.status_code, 502)
        self.assertNotIn("999999", "\n".join(logs.output))

    def test_verify_locks_after_five_wrong_codes_and_succeeds_with_the_right_one(self):
        user = make_user("PHARMACIST", is_otp_verified=True, mobile_number="61412345678",
                         mobile_otp_code=make_password("222333"), mobile_otp_created_at=timezone.now())
        client = self.client_for(user)
        fmt, _ = post(client, "mobile/verify-otp/", {"otp": "12"})
        self.assertEqual((fmt.status_code, fmt.data["error"]), (400, "Invalid OTP format"))
        for attempt in range(1, 5):
            wrong, _ = post(client, "mobile/verify-otp/", {"otp": "000000"})
            self.assertEqual((wrong.status_code, wrong.data["error"]), (400, "Invalid OTP"))
        locked, _ = post(client, "mobile/verify-otp/", {"otp": "000000"})
        self.assertEqual(locked.status_code, 429)
        self.assertEqual(set(locked.data), {"detail", "locked_until", "retry_after_seconds"})
        still, _ = post(client, "mobile/verify-otp/", {"otp": "222333"})
        self.assertEqual(still.status_code, 429)

        user.refresh_from_db()
        user.mobile_otp_locked_until = timezone.now() - timedelta(seconds=1)
        user.save(update_fields=["mobile_otp_locked_until"])
        ok, _ = post(client, "mobile/verify-otp/", {"otp": "222333"})
        self.assertEqual(ok.status_code, 200, ok.data)
        self.assertEqual(set(ok.data), {"detail", "user", "access", "refresh"})
        user.refresh_from_db()
        self.assertEqual((user.is_mobile_verified, user.mobile_otp_code, user.mobile_otp_failed_attempts), (True, None, 0))

        identity = {"first_name": user.first_name, "last_name": user.last_name, "username": user.username or "ann.lee"}
        changed, _ = post(client, "mobile/request-otp/", {"mobile_number": "0499999999", **identity})
        self.assertEqual(changed.data["mobile_number"], "Verified mobile number is locked and cannot be changed.")


class SessionTests(TestCase):
    def test_logout_blacklists_the_refresh_token_and_clears_cookies(self):
        user = make_user("PHARMACIST")
        refresh = RefreshToken.for_user(user)
        response, _ = post(APIClient(), "logout/", {"refresh": str(refresh)})
        self.assertEqual((response.status_code, response.data), (200, {"detail": "Logged out successfully."}))
        self.assertTrue(BlacklistedToken.objects.filter(token__jti=refresh["jti"]).exists())
        self.assertEqual(response.cookies["ct_access"].value, "")
        self.assertEqual(response.cookies["ct_refresh"].value, "")
        garbage, _ = post(APIClient(), "logout/", {"refresh": "not-a-token"})
        self.assertEqual(garbage.status_code, 200)

    def test_websocket_tickets_are_per_user_and_need_authentication(self):
        anonymous, _ = post(APIClient(), "ws-ticket/")
        self.assertIn(anonymous.status_code, (401, 403))
        user = make_user("PHARMACIST")
        client = APIClient()
        client.force_authenticate(user)
        first, _ = post(client, "ws-ticket/")
        second, _ = post(client, "ws-ticket/")
        self.assertEqual(len(first.data["ticket"]), 64)
        self.assertNotEqual(first.data["ticket"], second.data["ticket"])
        self.assertEqual(WebSocketTicket.objects.filter(user=user).count(), 2)

    def test_password_reset_request_does_not_reveal_accounts(self):
        user = make_user("PHARMACIST")
        expected = {"detail": "If this email exists, a reset link has been sent."}
        mail.outbox = []
        known, _ = post(APIClient(), "password-reset/", {"email": user.email.upper()})
        self.assertEqual([(m.subject, m.to) for m in mail.outbox], [("Reset your password", [user.email])])
        mail.outbox = []
        unknown, _ = post(APIClient(), "password-reset/", {"email": "nobody@example.com"})
        self.assertEqual(mail.outbox, [])
        self.assertEqual((known.status_code, known.data, unknown.status_code, unknown.data), (200, expected, 200, expected))


@override_settings(STORAGES=STORAGES)
class AccountDeletionTests(TestCase):
    def test_deletion_anonymises_revokes_and_removes_identity_documents(self):
        path = "/api/account/"
        pharmacist = make_user("PHARMACIST", mobile_number="61400000000", is_mobile_verified=True)
        onboarding = PharmacistOnboarding.objects.create(user=pharmacist, government_id_type="AUS_PASSPORT",
                                                         identity_meta={"expiry": "2030-01-01"})
        onboarding.government_id.save("passport.pdf", ContentFile(b"%PDF-1.7 id"), save=True)
        refresh = RefreshToken.for_user(pharmacist)
        WebSocketTicket.objects.create(user=pharmacist, ticket="t" * 64)
        email = pharmacist.email
        client = APIClient()
        client.force_authenticate(pharmacist)
        with queued_emails() as sent:
            response = client.delete(path)
        self.assertEqual((response.status_code, response.data), (200, {"success": True}))
        pharmacist.refresh_from_db()
        self.assertEqual((pharmacist.is_active, pharmacist.email, pharmacist.username, pharmacist.first_name,
                          pharmacist.mobile_number, pharmacist.has_usable_password()),
                         (False, f"deleted+{pharmacist.id}@chemisttasker.invalid", None, "", None, False))
        self.assertIsNotNone(pharmacist.deleted_at)
        self.assertTrue(BlacklistedToken.objects.filter(token__jti=refresh["jti"]).exists())
        self.assertFalse(WebSocketTicket.objects.filter(user=pharmacist).exists())
        onboarding.refresh_from_db()
        self.assertEqual((bool(onboarding.government_id), onboarding.government_id_type, onboarding.identity_meta),
                         (False, None, {}))
        self.assertEqual(sent, [("emails/account_deleted.html", (email,))])

        again = APIClient()
        again.force_authenticate(pharmacist)
        repeat = again.delete(path)
        self.assertEqual((repeat.status_code, repeat.data), (200, {"success": True}))

        owner, _ = make_owner_with_pharmacy("Deleting Owner")
        owner_onboarding = OwnerOnboarding.objects.get(user=owner)
        owner_onboarding.government_id.save("licence.pdf", ContentFile(b"%PDF-1.7 id"), save=True)
        client = APIClient()
        client.force_authenticate(owner)
        with queued_emails():
            response = client.delete(path)
        self.assertEqual(response.status_code, 200)
        owner_onboarding.refresh_from_db()
        # Regression: an owner's identity documents used to be left behind by the deletion clean-up.
        self.assertFalse(owner_onboarding.government_id)
        self.assertEqual(owner_onboarding.identity_meta, {})
