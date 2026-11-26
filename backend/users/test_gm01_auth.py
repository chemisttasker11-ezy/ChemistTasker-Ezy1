from datetime import UTC, datetime, timedelta
from unittest.mock import patch

from axes.models import AccessAttempt
from django.contrib.auth import get_user_model
from django.contrib.auth.tokens import default_token_generator
from django.core.cache import cache, caches
from django.test import TestCase, override_settings
from django.utils import timezone
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode
from rest_framework.test import APIClient
from rest_framework_simplejwt.token_blacklist.models import OutstandingToken
from rest_framework_simplejwt.tokens import UntypedToken
from users.tokens import RefreshToken

User = get_user_model()
PASSWORD = "CorrectPassword123!"


def post(path, data, client=None, **headers):
    cache.clear()
    return (client or APIClient()).post(f"/api/v1/users/{path}/", data, format="json", **headers)


@override_settings(AXES_ENABLED=False)
class SessionLifetimeTests(TestCase):
    def test_web_and_expo_lifetime_matrix_survives_rotation(self):
        user = User.objects.create_user(email="verified@example.test", password=PASSWORD, is_otp_verified=True)
        for platform in ("web", "expo"):
            for remember in (False, True, None):
                with self.subTest(platform=platform, remember=remember):
                    web = platform == "web"
                    client = APIClient()
                    headers = {"HTTP_X_CLIENT_PLATFORM": platform}
                    body = {"email": user.email, "password": PASSWORD}
                    if remember is not None:
                        body["remember_me"] = remember
                    issued_at = datetime.now(UTC).replace(microsecond=0) - timedelta(minutes=5)
                    with patch("rest_framework_simplejwt.tokens.aware_utcnow", return_value=issued_at):
                        login = post("login", body, client, **headers)
                    self.assertEqual(login.status_code, 200, login.data)
                    self.assertEqual("refresh" in login.data, not web)
                    refresh_value = login.cookies["ct_refresh"].value if web else login.data["refresh"]
                    refresh = RefreshToken(refresh_value)
                    self.assertEqual(refresh["session_kind"], "web" if web else "native")
                    self.assertEqual(refresh.get("remember_me"), bool(remember) if web else None)
                    lifetime = 90 * 86400 if remember or not web else 7200
                    self.assertEqual(refresh["exp"] - refresh["iat"], lifetime)
                    self.assertEqual(UntypedToken(login.data["access"])["session_exp"], refresh["exp"])
                    self.assertEqual(OutstandingToken.objects.get(jti=refresh["jti"]).expires_at.timestamp(), refresh["exp"])

                    later = datetime.fromtimestamp(refresh["iat"] + 300, UTC)
                    with patch("rest_framework_simplejwt.tokens.aware_utcnow", return_value=later), patch(
                        "users.sessions.timezone.now", return_value=later,
                    ):
                        rotated = post("token/refresh", {} if web else {"refresh": refresh_value}, client, **headers)
                    self.assertEqual(rotated.status_code, 200, rotated.data)
                    self.assertEqual("refresh" in rotated.data, not web)
                    rotated_token = RefreshToken(rotated.cookies["ct_refresh"].value)
                    self.assertEqual(rotated_token["session_kind"], refresh["session_kind"])
                    self.assertEqual(rotated_token.get("remember_me"), refresh.get("remember_me"))
                    self.assertEqual(rotated_token["exp"], refresh["exp"] + (0 if web else 300))
                    self.assertEqual(rotated_token["sid"], refresh["sid"])
                    if not web:
                        self.assertEqual(rotated.cookies["ct_refresh"]["max-age"], lifetime)
                    elif remember:
                        self.assertEqual(rotated.cookies["ct_refresh"]["max-age"], lifetime - 300)
                    else:
                        self.assertEqual(rotated.cookies["ct_refresh"]["max-age"], "")
                        self.assertEqual(rotated.cookies["ct_access"]["max-age"], "")

    def test_access_and_refresh_expire_at_the_same_session_deadline(self):
        user = User.objects.create_user(email="short@example.test", password=PASSWORD, is_otp_verified=True)
        client = APIClient(HTTP_X_CLIENT_PLATFORM="web")
        issued_at = datetime.now(UTC) - timedelta(seconds=7170)
        with patch("rest_framework_simplejwt.tokens.aware_utcnow", return_value=issued_at):
            login = post("login", {"email": user.email, "password": PASSWORD, "remember_me": False}, client)
        original = RefreshToken(login.cookies["ct_refresh"].value)
        near_expiry = datetime.fromtimestamp(original["exp"] - 30, UTC)
        with patch("rest_framework_simplejwt.tokens.aware_utcnow", return_value=near_expiry):
            rotated = post("token/refresh", {}, client)
        self.assertEqual(rotated.status_code, 200, rotated.data)
        self.assertEqual(UntypedToken(rotated.data["access"])["exp"], original["exp"])
        expires = near_expiry + timedelta(seconds=31)
        with patch("rest_framework_simplejwt.tokens.aware_utcnow", return_value=expires):
            expired = post("token/refresh", {}, client)
        self.assertEqual(expired.status_code, 401)

    def test_browser_origin_or_referer_takes_precedence_over_expo_header(self):
        user = User.objects.create_user(email="origin@example.test", password=PASSWORD, is_otp_verified=True)
        for header in ("HTTP_ORIGIN", "HTTP_REFERER"):
            with self.subTest(header=header):
                result = post(
                    "login", {"email": user.email, "password": PASSWORD, "remember_me": False},
                    HTTP_X_CLIENT_PLATFORM="expo", **{header: "http://localhost:8081"},
                )
                self.assertEqual(result.status_code, 200, result.data)
                self.assertNotIn("refresh", result.data)
                refresh = RefreshToken(result.cookies["ct_refresh"].value)
                self.assertEqual(refresh["session_kind"], "web")
                self.assertEqual(refresh["exp"] - refresh["iat"], 7200)

    def test_browser_cannot_rotate_native_token(self):
        user = User.objects.create_user(email="native@example.test", password=PASSWORD, is_otp_verified=True)
        login = post(
            "login", {"email": user.email, "password": PASSWORD, "remember_me": "ignored"},
            HTTP_X_CLIENT_PLATFORM="expo",
        )
        self.assertEqual(login.status_code, 200, login.data)
        body = {"refresh": login.data["refresh"]}
        rejected = post("token/refresh", body, HTTP_ORIGIN="http://localhost:8081", HTTP_X_CLIENT_PLATFORM="expo")
        self.assertEqual(rejected.status_code, 401, rejected.data)
        self.assertEqual(rejected.data, {"detail": "Token is invalid or expired."})
        allowed = post("token/refresh", body, HTTP_X_CLIENT_PLATFORM="expo")
        self.assertEqual(allowed.status_code, 200, allowed.data)

    def test_legacy_native_refresh_gets_full_sliding_lifetime(self):
        user = User.objects.create_user(email="legacy-native@example.test", password=PASSWORD, is_otp_verified=True)
        legacy = RefreshToken.for_user(user)
        self.assertNotIn("session_kind", legacy.payload)
        result = post("token/refresh", {"refresh": str(legacy)}, HTTP_X_CLIENT_PLATFORM="expo")
        self.assertEqual(result.status_code, 200, result.data)
        refresh = RefreshToken(result.data["refresh"])
        self.assertEqual(refresh["session_kind"], "native")
        self.assertEqual(refresh["exp"] - refresh["iat"], 90 * 86400)
        self.assertEqual(refresh["sid"], legacy["sid"])

    def test_legacy_web_refresh_respects_original_remember_choice(self):
        user = User.objects.create_user(email="legacy-web@example.test", password=PASSWORD, is_otp_verified=True)
        for remember in (None, False, True):
            with self.subTest(remember=remember):
                legacy = RefreshToken.for_user(user)
                legacy.set_exp(lifetime=timedelta(days=7 if remember else 90))
                if remember is not None:
                    legacy["remember_me"] = remember
                client = APIClient(HTTP_X_CLIENT_PLATFORM="web")
                client.cookies["ct_refresh"] = str(legacy)
                result = post("token/refresh", {}, client)
                self.assertEqual(result.status_code, 200, result.data)
                refresh = RefreshToken(result.cookies["ct_refresh"].value)
                self.assertEqual(refresh["session_kind"], "web")
                self.assertEqual(refresh["exp"], legacy["exp"] if remember else refresh["iat"] + 7200)
                self.assertEqual(result.cookies["ct_refresh"]["max-age"] != "", bool(remember))


@override_settings(AXES_ENABLED=False)
class SignupEmailCorrectionTests(TestCase):
    def register(self, email="typo@example.test"):
        with patch("users.api_auth.verify_recaptcha", return_value=True), patch(
            "users.api_auth.send_async_email",
        ) as send:
            response = post("register", {
                "email": email, "password": PASSWORD, "confirm_password": PASSWORD,
                "role": "PHARMACIST", "accepted_terms": True, "captcha_token": "token",
            })
        self.assertEqual(response.status_code, 201, response.data)
        return response.data["correction_token"], send.call_args.kwargs["context"]["otp"]

    def test_correction_releases_old_address_and_requires_new_code(self):
        old_email, new_email = "typo@example.test", "corrected@example.test"
        token, old_code = self.register(old_email)
        original_id = User.objects.get(email=old_email).pk
        with patch("users.api_otp.send_async_email") as send:
            change = post("change-registration-email", {
                "email": old_email, "new_email": new_email.upper(), "correction_token": token,
            })
        self.assertEqual(change.status_code, 200, change.data)
        self.assertEqual(change.data, {"email": new_email})
        self.assertEqual(send.call_args.kwargs["recipient_list"], [new_email])
        new_code = send.call_args.kwargs["context"]["otp"]
        self.assertNotEqual(old_code, new_code)
        self.assertFalse(User.objects.filter(email=old_email).exists())
        self.assertEqual(User.objects.get(email=new_email).pk, original_id)
        self.assertEqual(post("login", {"email": new_email, "password": PASSWORD}).data["code"], "email_not_verified")
        for email in (old_email, new_email):
            self.assertEqual(post("verify-otp", {"email": email, "otp": old_code}).status_code, 400)
        self.register(old_email)
        with patch("users.api_otp.async_task"):
            verified = post("verify-otp", {"email": new_email, "otp": new_code}, HTTP_X_CLIENT_PLATFORM="web")
        self.assertEqual(verified.status_code, 200, verified.data)
        self.assertTrue(User.objects.get(pk=original_id).is_otp_verified)
        self.assertEqual(post("change-registration-email", {
            "email": new_email, "new_email": "other@example.test", "correction_token": token,
        }).status_code, 400)

    def test_rejects_invalid_token_and_duplicate_and_rolls_back_delivery_failure(self):
        email = "typo@example.test"
        token, _ = self.register(email)
        original = User.objects.get(email=email)
        User.objects.create_user(email="Taken@example.test", password=PASSWORD, is_otp_verified=True)
        body = {"email": email, "new_email": "taken@example.test", "correction_token": token}
        with patch("users.api_otp.send_async_email") as send:
            invalid = post("change-registration-email", {**body, "correction_token": "invalid"})
            duplicate = post("change-registration-email", body)
        self.assertEqual(invalid.status_code, 400)
        self.assertEqual(duplicate.status_code, 400)
        self.assertIn("new_email", duplicate.data)
        send.assert_not_called()
        with patch("users.api_otp.send_async_email", side_effect=RuntimeError), self.assertLogs("users.views", "WARNING"):
            failed = post("change-registration-email", {**body, "new_email": "new@example.test"})
        self.assertEqual(failed.status_code, 502)
        stored = User.objects.get(pk=original.pk)
        self.assertEqual((stored.email, stored.otp_code), (original.email, original.otp_code))

    def test_password_reset_cannot_verify_pending_email(self):
        self.register()
        user = User.objects.get(email="typo@example.test")
        token = default_token_generator.make_token(user)
        uid = urlsafe_base64_encode(force_bytes(user.pk))
        with patch("users.api_passwords.send_async_email") as send:
            response = post("password-reset", {"email": user.email})
        self.assertEqual(response.status_code, 200)
        send.assert_not_called()
        confirmed = post("password-reset-confirm", {
            "uid": uid, "token": token, "new_password1": "NewPassword123!", "new_password2": "NewPassword123!",
        })
        self.assertEqual(confirmed.status_code, 400)
        html = APIClient().get(f"/api/v1/users/auth/reset/{uid}/{token}/")
        self.assertFalse(html.context["validlink"])
        user.refresh_from_db()
        self.assertFalse(user.is_otp_verified)
        self.assertTrue(user.check_password(PASSWORD))

    def test_password_reset_link_expires_after_one_hour(self):
        user = User.objects.create_user(email="reset@example.test", password=PASSWORD, is_otp_verified=True)
        with patch.object(default_token_generator, "_now", return_value=datetime.now() - timedelta(seconds=3601)):
            token = default_token_generator.make_token(user)
        result = post("password-reset-confirm", {
            "uid": urlsafe_base64_encode(force_bytes(user.pk)), "token": token,
            "new_password1": "NewPassword123!", "new_password2": "NewPassword123!",
        })
        self.assertEqual(result.status_code, 400)
        self.assertEqual(result.data["detail"], "Invalid or expired token.")

    def test_invitation_password_link_lasts_seven_days_and_verifies_the_account(self):
        for age, status in ((timedelta(days=6, hours=23), 200), (timedelta(days=7, seconds=5), 400)):
            for html in (False, True):
                with self.subTest(age=age, html=html):
                    user = User.objects.create_user(email=f"invited-{status}-{html}@example.test", password=None)
                    with patch.object(default_token_generator, "_now", return_value=datetime.now() - age):
                        token = default_token_generator.make_token(user)
                    uid = urlsafe_base64_encode(force_bytes(user.pk))
                    passwords = {"new_password1": "NewPassword123!", "new_password2": "NewPassword123!"}
                    if html:
                        client = APIClient()
                        page = client.get(f"/api/v1/users/auth/reset/{uid}/{token}/", follow=True)
                        self.assertEqual(page.context["validlink"], status == 200)
                        if status == 200:
                            client.post(f"/api/v1/users/auth/reset/{uid}/set-password/", passwords)
                    else:
                        result = post("password-reset-confirm", {"uid": uid, "token": token, **passwords})
                        self.assertEqual(result.status_code, status, result.data)
                    user.refresh_from_db()
                    self.assertEqual((user.is_otp_verified, user.has_usable_password()), (status == 200, status == 200))


@override_settings(AXES_ENABLED=True, AXES_FAILURE_LIMIT=5)
class LoginRecoveryTests(TestCase):
    primary_ip = "192.0.2.1"
    second_ip = "192.0.2.2"

    def setUp(self):
        caches["security"].clear()
        self.addCleanup(caches["security"].clear)
        self.user = User.objects.create_user(email="owner@example.test", password=PASSWORD, is_otp_verified=True)
        captcha = patch("users.api_auth.verify_recaptcha", side_effect=lambda token: token == "valid")
        self.captcha = captcha.start()
        self.addCleanup(captcha.stop)
        email = patch("users.login_security.send_async_email")
        self.email = email.start()
        self.addCleanup(email.stop)

    def login(self, ip=primary_ip, password="WrongPassword123!", email=None, **fields):
        return post("login", {"email": email or self.user.email, "password": password, **fields}, REMOTE_ADDR=ip)

    def trigger_lock(self, ip=primary_ip, email=None):
        for attempt in range(1, 6):
            fields = {"captcha_token": "valid"} if attempt > 3 else {}
            response = self.login(ip=ip, email=email, **fields)
            self.assertEqual(response.status_code, 401 if attempt < 5 else 429, response.data)
        return response

    def test_captcha_is_required_after_three_failures_and_success_resets_count(self):
        for attempt in range(3):
            response = self.login(email=self.user.email.upper())
            self.assertEqual(response.status_code, 401, response.data)
            self.assertEqual(response.data["captcha_required"], attempt == 2)
        self.captcha.assert_not_called()
        for fields in ({}, {"captcha_token": "invalid"}):
            blocked = self.login(password=PASSWORD, **fields)
            self.assertEqual(blocked.status_code, 400, blocked.data)
            self.assertEqual(blocked.data["code"], "captcha_required")
            self.assertEqual(blocked.data["attempts_remaining"], 2)
        valid = self.login(password=PASSWORD, captcha_token="valid")
        self.assertEqual(valid.status_code, 200, valid.data)
        self.assertFalse(self.login().data["captcha_required"])
        self.email.assert_not_called()

    def test_one_recovery_email_per_account_and_single_use_with_correct_password(self):
        locked = self.trigger_lock()
        self.assertEqual(locked.data["code"], "login_locked")
        self.assertGreaterEqual(locked.data["retry_after_seconds"], 3598)
        self.email.assert_called_once()
        self.assertEqual(self.email.call_args.kwargs["recipient_list"], [self.user.email])
        code = self.email.call_args.kwargs["context"]["otp"]
        self.assertNotIn(code, str(locked.data))
        self.assertEqual(self.login(self.second_ip, PASSWORD).status_code, 200)
        self.trigger_lock(self.second_ip)
        self.email.assert_called_once()

        for _ in range(6):
            blocked = self.login(recovery_code=code, captcha_token="valid")
            self.assertEqual(blocked.status_code, 429)
            self.assertEqual(blocked.data["locked_until"], locked.data["locked_until"])
        recovered = self.login(password=PASSWORD, recovery_code=code, captcha_token="valid")
        self.assertEqual(recovered.status_code, 200, recovered.data)
        replayed = self.login(self.second_ip, PASSWORD, recovery_code=code, captcha_token="valid")
        self.assertEqual(replayed.status_code, 429)
        self.email.assert_called_once()

    def test_cooloff_allows_retry_and_unknown_email_gets_the_same_lockout_shape(self):
        locked = self.trigger_lock()
        unknown = self.trigger_lock(email="unknown@example.test")
        self.assertEqual(set(unknown.data), set(locked.data))
        self.assertEqual(unknown.data["code"], locked.data["code"])
        self.email.assert_called_once()
        AccessAttempt.objects.filter(username=self.user.email).update(
            attempt_time=timezone.now() - timedelta(hours=1, seconds=1),
        )
        self.assertEqual(self.login(password=PASSWORD).status_code, 200)

    def test_axes_does_not_store_challenge_secrets_from_form_posts(self):
        response = APIClient().post("/api/v1/users/login/", {
            "email": self.user.email, "password": "WrongPassword123!",
            "captcha_token": "sensitive-captcha", "recovery_code": "123456",
        }, REMOTE_ADDR=self.primary_ip)
        self.assertEqual(response.status_code, 401)
        attempt = AccessAttempt.objects.get(username=self.user.email)
        self.assertNotIn("sensitive-captcha", attempt.post_data)
        self.assertNotIn("123456", attempt.post_data)
