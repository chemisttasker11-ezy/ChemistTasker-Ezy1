from datetime import timedelta
from unittest.mock import patch

from axes.models import AccessAttempt
from django.contrib.auth.tokens import default_token_generator
from django.core.cache import cache, caches
from django.test import TestCase, override_settings
from django.utils import timezone
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode
from django_otp import devices_for_user
from django_otp.oath import TOTP
from django_otp.plugins.otp_totp.models import TOTPDevice
from rest_framework.test import APIClient
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken
from rest_framework_simplejwt.tokens import UntypedToken

from core.admin_site import otp_admin_site
from core.two_factor_views import AdminAwareLoginView
from organizations.models import Organization
from users.models import OrganizationMembership, RevokedSession, User, UserSession
from users.sessions import TRUSTED_DEVICE_COOKIE


ROOT = "/api/v1/users/"
PASSWORD = "CorrectPassword123!"


@override_settings(AXES_ENABLED=False)
class SessionSecurityTests(TestCase):
    def setUp(self):
        cache.clear()
        caches["security"].clear()
        self.addCleanup(caches["security"].clear)
        self.user = self.make_user("owner", "OWNER")

    def make_user(self, name, role):
        return User.objects.create_user(
            email=f"{name}@example.test", password=PASSWORD, role=role, is_otp_verified=True,
        )

    def post(self, path, data=None, *, access=None, client=None, **headers):
        if access:
            headers["HTTP_AUTHORIZATION"] = f"Bearer {access}"
        return (client or APIClient()).post(ROOT + path, data or {}, format="json", **headers)

    def login(self, user=None, *, client=None, password=PASSWORD, **fields):
        return self.post("login/", {"email": (user or self.user).email, "password": password, **fields}, client=client)

    def challenge(self, **kwargs):
        response = self.login(**kwargs)
        self.assertEqual(response.status_code, 401, response.data)
        self.assertEqual(response.data["code"], "two_factor_required")
        self.assertEqual(set(response.data), {"code", "methods", "challenge_token"})
        self.assertFalse(response.cookies)
        return response.data["challenge_token"]

    def complete(self, challenge, code, *, method="email", client=None, remember_device=False):
        return self.post("login/2fa/", {
            "challenge_token": challenge, "method": method, "code": code, "remember_device": remember_device,
        }, client=client)

    def send_email(self, path, data=None, **kwargs):
        with patch("users.tasks.send_async_email") as send:
            result = self.post(path, data, **kwargs)
        self.assertEqual(result.status_code, 200, result.data)
        self.assertEqual(result.data, {"resend_after_seconds": 60})
        self.assertEqual(send.call_args.kwargs["recipient_list"], [self.user.email])
        return send.call_args.kwargs["context"]["otp"]

    def enable_email(self, access):
        code = self.send_email("2fa/email/start/", access=access)
        result = self.post("2fa/email/confirm/", {"code": code}, access=access)
        self.assertEqual(result.status_code, 200, result.data)
        self.assertEqual(result.data, {"eligible": True, "enabled": True, "methods": ["email"]})

    def email_challenge_code(self, challenge, *, client=None):
        with patch("users.two_factor.timezone.now", return_value=timezone.now() + timedelta(seconds=61)):
            return self.send_email("login/2fa/email/", {"challenge_token": challenge}, client=client)

    def get(self, path, access):
        return APIClient().get(ROOT + path, HTTP_AUTHORIZATION=f"Bearer {access}")

    def test_email_confirmation_gates_login_and_revokes_other_sessions(self):
        first = self.login().data
        code = self.send_email("2fa/email/start/", access=first["access"])
        second = self.login()
        self.assertEqual(second.status_code, 200, second.data)
        result = self.post("2fa/email/confirm/", {"code": code}, access=first["access"])
        self.assertEqual(result.status_code, 200, result.data)
        self.assertEqual(self.get("me/", first["access"]).status_code, 200)
        self.assertEqual(self.get("me/", second.data["access"]).status_code, 401)
        self.challenge()
        self.assertEqual(UserSession.objects.filter(user=self.user).count(), 2)

    def test_email_send_is_throttled_and_one_live_code_has_five_guesses(self):
        access = self.login().data["access"]
        with patch("users.two_factor.generate_otp", side_effect=["123456", "654321"]):
            self.send_email("2fa/email/start/", access=access)
            with patch("users.tasks.send_async_email") as send:
                self.assertEqual(self.post("2fa/email/start/", access=access).status_code, 429)
                send.assert_not_called()
            for _ in range(5):
                self.assertEqual(self.post("2fa/email/confirm/", {"code": "555555"}, access=access).status_code, 400)
            self.assertEqual(self.post("2fa/email/confirm/", {"code": "123456"}, access=access).status_code, 400)
            with patch("users.two_factor.timezone.now", return_value=timezone.now() + timedelta(seconds=61)):
                self.send_email("2fa/email/start/", access=access)
            self.assertEqual(self.post("2fa/email/confirm/", {"code": "123456"}, access=access).status_code, 400)
            self.assertEqual(self.post("2fa/email/confirm/", {"code": "654321"}, access=access).status_code, 200)

    def test_authenticator_confirmation_uses_real_totp_and_isolated_admin_devices(self):
        self.user.is_staff = True
        self.user.save(update_fields=["is_staff"])
        access = self.login().data["access"]
        started = self.post("2fa/authenticator/start/", access=access)
        self.assertTrue(started.data["otpauth_uri"].startswith("otpauth://totp/"))
        self.assertEqual(self.login().status_code, 200)
        device = TOTPDevice.objects.get(user=self.user)
        now = timezone.now()
        generator = TOTP(device.bin_key)
        generator.time = now.timestamp()
        code = f"{generator.token():06d}"
        with patch("django_otp.plugins.otp_totp.models.time.time", return_value=generator.time):
            form = otp_admin_site.login_form(data={
                "username": self.user.email, "password": PASSWORD,
                "otp_device": device.persistent_id, "otp_token": code,
            })
            self.assertFalse(form.is_valid())
            self.assertEqual(form.errors.as_data()["__all__"][0].code, "invalid_token")
            self.assertEqual(self.post("2fa/authenticator/confirm/", {"code": code}, access=access).status_code, 200)
        challenge = self.challenge()
        self.assertEqual(self.complete(challenge, code, method="authenticator").status_code, 401)
        admin_device = TOTPDevice.objects.create(user=self.user, name="default")
        self.assertEqual(list(devices_for_user(self.user)), [admin_device])
        with patch.object(AdminAwareLoginView, "get_user", return_value=self.user):
            self.assertEqual(AdminAwareLoginView().get_devices(), [admin_device])
        later = now + timedelta(seconds=31)
        generator.time = later.timestamp()
        with patch("django_otp.plugins.otp_totp.models.time.time", return_value=generator.time), patch(
            "django_otp.models.timezone.now", return_value=later,
        ):
            code = f"{generator.token():06d}"
            self.assertEqual(self.complete(challenge, code, method="authenticator").status_code, 200)

    def test_worker_cannot_set_up(self):
        worker = self.make_user("worker", "PHARMACIST")
        access = self.login(worker).data["access"]
        self.assertEqual(self.get("2fa/", access).data, {"eligible": False, "enabled": False, "methods": []})
        for path in ("2fa/email/start/", "2fa/authenticator/start/", "2fa/backup-codes/regenerate/"):
            self.assertEqual(self.post(path, access=access).status_code, 403)

    def test_organization_membership_grants_setup_eligibility(self):
        admin = self.make_user("admin", "ORG_STAFF")
        access = self.login(admin).data["access"]
        self.assertFalse(self.get("2fa/", access).data["eligible"])
        org = Organization.objects.create(name="Example")
        OrganizationMembership.objects.create(user=admin, organization=org, role="ORG_ADMIN")
        self.assertTrue(self.get("2fa/", access).data["eligible"])
        self.assertEqual(self.post("2fa/authenticator/start/", access=access).status_code, 200)

    def test_challenge_expires_and_is_bound_to_password(self):
        self.enable_email(self.login().data["access"])
        challenge = self.challenge()
        with patch("django.core.signing.time.time", return_value=timezone.now().timestamp() + 601):
            result = self.complete(challenge, "123456")
        self.assertEqual(result.status_code, 401)
        self.assertEqual(result.data["code"], "invalid_two_factor_challenge")
        self.user.set_password("OtherPassword123!")
        self.user.save(update_fields=["password"])
        result = self.complete(challenge, "123456")
        self.assertEqual(result.status_code, 401)
        self.assertEqual(result.data["code"], "invalid_two_factor_challenge")

    def test_backup_codes_are_single_use_and_regeneration_replaces_them(self):
        access = self.login().data["access"]
        self.enable_email(access)
        old_codes = self.post("2fa/backup-codes/regenerate/", access=access).data["backup_codes"]
        self.assertEqual(len(set(old_codes)), 10)
        challenge = self.challenge()
        self.assertEqual(self.complete(challenge, old_codes[0], method="backup").status_code, 200)
        self.assertEqual(self.complete(challenge, old_codes[0], method="backup").status_code, 401)
        new_codes = self.post("2fa/backup-codes/regenerate/", access=access).data["backup_codes"]
        self.assertEqual(self.complete(challenge, old_codes[1], method="backup").status_code, 401)
        with patch("django_otp.models.timezone.now", return_value=timezone.now() + timedelta(seconds=2)):
            self.assertEqual(self.complete(challenge, new_codes[0], method="backup").status_code, 200)

    def test_native_trust_skips_two_factor_and_password_reset_revokes_it_and_sessions(self):
        self.enable_email(self.login().data["access"])
        challenge = self.challenge(device_name="  Personal iPhone  ")
        code = self.email_challenge_code(challenge)
        solved = self.complete(challenge, code, remember_device=True)
        self.assertEqual(solved.status_code, 200, solved.data)
        self.assertEqual(self.get("sessions/", solved.data["access"]).data[0]["device_label"], "Personal iPhone")
        trusted = solved.data["trusted_device_token"]
        self.assertEqual(self.login(trusted_device_token=trusted).status_code, 200)
        reset = self.post("password-reset-confirm/", {
            "uid": urlsafe_base64_encode(force_bytes(self.user.pk)),
            "token": default_token_generator.make_token(self.user),
            "new_password1": "ChangedPassword123!", "new_password2": "ChangedPassword123!",
        })
        self.assertEqual(reset.status_code, 200, reset.data)
        self.assertFalse(UserSession.objects.filter(user=self.user, revoked_at__isnull=True).exists())
        self.challenge(password="ChangedPassword123!", trusted_device_token=trusted)

    def test_web_trust_and_remember_me_use_cookies_and_disable_requires_both_credentials(self):
        access = self.login().data["access"]
        self.enable_email(access)
        web = APIClient(
            enforce_csrf_checks=True, HTTP_X_CLIENT_PLATFORM="web", HTTP_ORIGIN="http://testserver",
        )
        csrf = web.get(ROOT + "csrf/").json()["csrfToken"]
        self.assertEqual(self.login(client=web).status_code, 403)
        web.defaults["HTTP_X_CSRFTOKEN"] = csrf
        challenge = self.challenge(client=web, remember_me=True)
        code = self.email_challenge_code(challenge, client=web)
        result = self.complete(challenge, code, client=web, remember_device=True)
        self.assertEqual(result.status_code, 200, result.data)
        self.assertNotIn("refresh", result.data)
        self.assertNotIn("trusted_device_token", result.data)
        trusted = result.cookies[TRUSTED_DEVICE_COOKIE]
        self.assertTrue(trusted["httponly"])
        self.assertEqual(int(trusted["max-age"]), 30 * 86400)
        refresh = UntypedToken(result.cookies["ct_refresh"].value)
        self.assertEqual(refresh["exp"] - refresh["iat"], 90 * 86400)
        self.assertEqual(self.login(client=web).status_code, 200)
        backup = self.post("2fa/backup-codes/regenerate/", access=access).data["backup_codes"][0]
        payload = {"method": "backup", "code": backup}
        self.assertEqual(self.post("2fa/disable/", {**payload, "password": "wrong"}, access=access).status_code, 400)
        disabled = self.post("2fa/disable/", {**payload, "password": PASSWORD}, access=access)
        self.assertEqual(disabled.data, {"eligible": True, "enabled": False, "methods": []})
        self.assertEqual(int(disabled.cookies[TRUSTED_DEVICE_COOKIE]["max-age"]), 0)
        self.assertEqual(self.get("me/", result.data["access"]).status_code, 401)
        self.assertEqual(self.get("me/", access).status_code, 200)
        with patch("users.two_factor.timezone.now", return_value=timezone.now() + timedelta(seconds=122)):
            self.enable_email(access)
        self.challenge(client=web)

    def test_list_refresh_and_revoke_one_own_device(self):
        first = self.login(device_name="  " + "X" * 70 + "  ").data
        web = APIClient(HTTP_X_CLIENT_PLATFORM="web", HTTP_USER_AGENT="Windows Chrome/1")
        second = self.login(client=web)
        second_sid = UntypedToken(second.data["access"])["sid"]
        first_sid = UntypedToken(first["access"])["sid"]
        listed = self.get("sessions/", first["access"])
        self.assertEqual(listed.status_code, 200)
        self.assertEqual([row["sid"] for row in listed.data], [second_sid, first_sid])
        self.assertEqual([row["current"] for row in listed.data], [False, True])
        self.assertEqual([row["device_label"] for row in listed.data], ["Chrome on Windows", "X" * 60])
        self.assertEqual([row["client_kind"] for row in listed.data], ["web", "native"])
        last_seen = UserSession.objects.get(sid=second_sid).last_seen_at
        self.assertEqual(self.post("token/refresh/", client=web).status_code, 200)
        self.assertEqual(UserSession.objects.get(sid=second_sid).last_seen_at, last_seen)
        UserSession.objects.filter(sid=second_sid).update(last_seen_at=last_seen - timedelta(minutes=6))
        rotated = self.post("token/refresh/", client=web)
        self.assertGreater(UserSession.objects.get(sid=second_sid).last_seen_at, last_seen)
        with patch("users.device_sessions.notify_auth_changed") as notify, self.captureOnCommitCallbacks(execute=True):
            self.assertEqual(self.post(f"sessions/{second_sid}/revoke/", access=first["access"]).status_code, 204)
        notify.assert_called_once_with(self.user.pk, second_sid)
        self.assertTrue(RevokedSession.objects.filter(session_id=second_sid).exists())
        latest = UntypedToken(rotated.cookies["ct_refresh"].value)
        self.assertTrue(BlacklistedToken.objects.filter(token__jti=latest["jti"]).exists())
        self.assertEqual(self.get("me/", rotated.data["access"]).status_code, 401)
        self.assertEqual(self.post("token/refresh/", client=web).status_code, 401)
        self.assertEqual([row["sid"] for row in self.get("sessions/", first["access"]).data], [first_sid])

    def test_revoke_all_signs_out_caller_and_clears_trust(self):
        first = self.login().data
        self.enable_email(first["access"])
        challenge = self.challenge()
        solved = self.complete(challenge, self.email_challenge_code(challenge), remember_device=True).data
        response = self.post("sessions/revoke-all/", access=first["access"])
        self.assertEqual(response.status_code, 204)
        for name in ("ct_access", "ct_refresh", TRUSTED_DEVICE_COOKIE):
            self.assertEqual(int(response.cookies[name]["max-age"]), 0)
        for session in (first, solved):
            self.assertEqual(self.get("me/", session["access"]).status_code, 401)
            self.assertEqual(self.post("token/refresh/", {"refresh": session["refresh"]}).status_code, 401)
        self.assertFalse(UserSession.objects.filter(user=self.user, revoked_at__isnull=True).exists())
        self.challenge(trusted_device_token=solved["trusted_device_token"])

    def test_other_users_sid_returns_404(self):
        owner = self.login().data
        worker = self.login(self.make_user("worker", "PHARMACIST")).data
        sid = UntypedToken(worker["access"])["sid"]
        self.assertEqual(self.post(f"sessions/{sid}/revoke/", access=owner["access"]).status_code, 404)
        self.assertEqual(self.get("me/", worker["access"]).status_code, 200)

    @override_settings(AXES_ENABLED=True, AXES_FAILURE_LIMIT=5)
    def test_wrong_second_factor_counts_toward_existing_lockout(self):
        self.enable_email(self.login().data["access"])
        challenge = self.challenge()
        with patch("users.login_security.send_async_email") as recovery:
            for attempt in range(1, 6):
                result = self.complete(challenge, "not-a-code")
                self.assertEqual(result.status_code, 401 if attempt < 5 else 429, result.data)
                self.assertEqual(result.data["attempts_remaining"], 5 - attempt)
            recovery.assert_called_once()
        self.assertEqual(result.data["code"], "login_locked")
        self.assertEqual(AccessAttempt.objects.get(username=self.user.email).failures_since_start, 5)
        self.assertEqual(self.login().status_code, 429)
