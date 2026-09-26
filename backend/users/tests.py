from django.contrib.auth import get_user_model
from django.contrib.auth.hashers import make_password
from django.contrib.auth.tokens import default_token_generator
from django.test import Client, TestCase, override_settings
from django.urls import reverse
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode
from django.utils import timezone
from datetime import timedelta
import jwt
from rest_framework_simplejwt.tokens import RefreshToken
from unittest.mock import patch


class LoginFailureAttemptCountTests(TestCase):
    @override_settings(
        AXES_ENABLED=True,
        AXES_FAILURE_LIMIT=5,
        AXES_LOCKOUT_PARAMETERS=[["username", "ip_address"]],
    )
    def test_wrong_password_attempts_remaining_decrements(self):
        get_user_model().objects.create_user(
            email="wrong-password@example.com",
            password="CorrectPassword123!",
            role="PHARMACIST",
            is_otp_verified=True,
            is_mobile_verified=True,
        )

        first = self.client.post(
            "/api/users/login/",
            {"email": "wrong-password@example.com", "password": "WrongPassword123!"},
            content_type="application/json",
            REMOTE_ADDR="192.0.2.55",
        )
        second = self.client.post(
            "/api/users/login/",
            {"email": "wrong-password@example.com", "password": "WrongPassword123!"},
            content_type="application/json",
            REMOTE_ADDR="192.0.2.55",
        )

        self.assertEqual(first.status_code, 401)
        self.assertEqual(second.status_code, 401)
        self.assertEqual(first.json()["attempts_remaining"], 4)
        self.assertEqual(second.json()["attempts_remaining"], 3)


class LoginRememberMeTests(TestCase):
    @override_settings(
        AXES_ENABLED=False,
        JWT_REMEMBER_ME_REFRESH_TOKEN_LIFETIME=timedelta(days=7),
    )
    def test_remember_me_caps_refresh_token_and_cookie_to_one_week(self):
        get_user_model().objects.create_user(
            email="remember@example.com",
            password="CorrectPassword123!",
            role="PHARMACIST",
            is_otp_verified=True,
            is_mobile_verified=True,
        )

        response = self.client.post(
            "/api/users/login/",
            {"email": "remember@example.com", "password": "CorrectPassword123!", "remember_me": True},
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        payload = jwt.decode(response.json()["refresh"], options={"verify_signature": False})
        self.assertTrue(payload["remember_me"])
        self.assertLessEqual(payload["exp"] - payload["iat"], 7 * 24 * 60 * 60)
        self.assertEqual(response.cookies["ct_refresh"]["max-age"], 7 * 24 * 60 * 60)

    @override_settings(AXES_ENABLED=False)
    def test_without_remember_me_uses_session_cookies_for_web_login(self):
        get_user_model().objects.create_user(
            email="session@example.com",
            password="CorrectPassword123!",
            role="PHARMACIST",
            is_otp_verified=True,
            is_mobile_verified=True,
        )

        response = self.client.post(
            "/api/users/login/",
            {"email": "session@example.com", "password": "CorrectPassword123!", "remember_me": False},
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.cookies["ct_access"]["max-age"], "")
        self.assertEqual(response.cookies["ct_refresh"]["max-age"], "")


class PasswordResetConfirmTests(TestCase):
    @override_settings(AXES_ENABLED=True)
    def test_successful_password_reset_clears_axes_attempts_for_user(self):
        from axes.models import AccessAttempt

        user = get_user_model().objects.create_user(
            email="locked@example.com",
            password="OldPassword123!",
            role="PHARMACIST",
        )
        AccessAttempt.objects.create(
            username=user.email,
            ip_address="192.168.1.3",
            user_agent="test-client",
            path_info="/api/users/login/",
            failures_since_start=6,
        )

        response = self.client.post(
            reverse("password_reset_confirm_api"),
            {
                "uid": urlsafe_base64_encode(force_bytes(user.pk)),
                "token": default_token_generator.make_token(user),
                "new_password1": "NewPassword123!",
                "new_password2": "NewPassword123!",
            },
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertFalse(AccessAttempt.objects.filter(username__iexact=user.email).exists())
        user.refresh_from_db()
        self.assertTrue(user.check_password("NewPassword123!"))


class OrganizationRolePermissionSafetyTests(TestCase):
    def test_role_permission_fails_closed_without_required_roles(self):
        from types import SimpleNamespace
        from users.permissions import OrganizationRolePermission

        request = SimpleNamespace(user=SimpleNamespace(is_authenticated=True))
        view = SimpleNamespace(kwargs={})

        self.assertFalse(OrganizationRolePermission().has_permission(request, view))


class OrganizationPermissionConfigurationTests(TestCase):
    def test_role_permission_fails_closed_without_required_roles(self):
        from types import SimpleNamespace
        from .permissions import OrganizationRolePermission

        request = SimpleNamespace(
            user=SimpleNamespace(is_authenticated=True),
            data={},
        )
        view = SimpleNamespace(kwargs={})

        self.assertFalse(OrganizationRolePermission().has_permission(request, view))


class PublicAndPrivateRoutePreservationTests(TestCase):
    def test_public_reads_remain_anonymous(self):
        for path in ('/api/marketplace/categories/', '/api/marketplace/listings/', '/api/public-hub/articles/', '/api/users/mobile/app-config/'):
            with self.subTest(path=path):
                self.assertEqual(self.client.get(path).status_code, 200)

    def test_private_reads_require_authentication(self):
        for path in ('/api/client-profile/pharmacies/', '/api/users/me/', '/api/content/documents/', '/api/marketplace/me/listings/'):
            with self.subTest(path=path):
                self.assertIn(self.client.get(path).status_code, (401, 403))

    def test_owner_cannot_read_or_modify_another_owners_pharmacy(self):
        from client_profile.models import OwnerOnboarding, Pharmacy
        from rest_framework.test import APIClient
        owner = get_user_model().objects.create_user(email='scope-owner@example.test', role='OWNER')
        outsider = get_user_model().objects.create_user(email='scope-outsider@example.test', role='OWNER')
        profile = OwnerOnboarding.objects.create(user=owner, phone_number='0400000000', role='MANAGER', chain_pharmacy=False)
        pharmacy = Pharmacy.objects.create(name='Private pharmacy', owner=profile)
        client = APIClient()
        client.force_authenticate(outsider)
        path = f'/api/client-profile/pharmacies/{pharmacy.pk}/'
        self.assertEqual(client.get(path).status_code, 404)
        self.assertEqual(client.patch(path, {'name': 'Changed'}, format='json').status_code, 404)
        client.force_authenticate(owner)
        self.assertEqual(client.get(path).status_code, 200)
        pharmacy.refresh_from_db()
        self.assertEqual(pharmacy.name, 'Private pharmacy')


class BrowserTokenExposureTests(TestCase):
    @override_settings(AXES_ENABLED=False)
    def test_expo_mobile_otp_verification_keeps_refresh_out_of_browser_json(self):
        user = get_user_model().objects.create_user(
            email="expo-mobile-otp@example.com",
            password="CorrectPassword123!",
            role="PHARMACIST",
            is_otp_verified=True,
            is_mobile_verified=False,
        )
        user.mobile_otp_code = make_password("123456")
        user.mobile_otp_created_at = timezone.now()
        user.save(update_fields=["mobile_otp_code", "mobile_otp_created_at"])
        access = str(RefreshToken.for_user(user).access_token)
        response = self.client.post(
            "/api/users/mobile/verify-otp/", {"otp": "123456"},
            content_type="application/json",
            HTTP_AUTHORIZATION=f"Bearer {access}",
            HTTP_ORIGIN="http://localhost:8081",
            HTTP_X_CLIENT_PLATFORM="mobile",
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn("access", response.json())
        self.assertNotIn("refresh", response.json())
        self.assertIn("ct_refresh", response.cookies)

    @override_settings(AXES_ENABLED=False, CSRF_TRUSTED_ORIGINS=["http://localhost:8081"])
    def test_expo_origin_cannot_spoof_native_login_or_skip_cookie_csrf(self):
        get_user_model().objects.create_user(
            email="expo-browser@example.com",
            password="CorrectPassword123!",
            role="PHARMACIST",
            is_otp_verified=True,
            is_mobile_verified=True,
        )
        credentials = {"email": "expo-browser@example.com", "password": "CorrectPassword123!"}
        browser = Client(enforce_csrf_checks=True)
        csrf = browser.get("/api/users/csrf/").json()["csrfToken"]
        browser_headers = {
            "HTTP_ORIGIN": "http://localhost:8081",
            "HTTP_X_CLIENT_PLATFORM": "mobile",
        }
        rejected = browser.post(
            "/api/users/login/", credentials, content_type="application/json", **browser_headers
        )
        self.assertEqual(rejected.status_code, 403)

        login = browser.post(
            "/api/users/login/", credentials, content_type="application/json",
            HTTP_X_CSRFTOKEN=csrf, **browser_headers
        )
        self.assertEqual(login.status_code, 200)
        self.assertIn("access", login.json())
        self.assertNotIn("refresh", login.json())
        self.assertIn("ct_refresh", login.cookies)

        cookie_write = browser.post(
            "/api/users/ws-ticket/", {}, content_type="application/json", **browser_headers
        )
        self.assertEqual(cookie_write.status_code, 403)
        rejected_refresh = browser.post(
            "/api/users/token/refresh/", {}, content_type="application/json", **browser_headers
        )
        self.assertEqual(rejected_refresh.status_code, 403)
        rejected_refresh_with_bearer = browser.post(
            "/api/users/token/refresh/", {}, content_type="application/json",
            HTTP_AUTHORIZATION="Bearer arbitrary", **browser_headers
        )
        self.assertEqual(rejected_refresh_with_bearer.status_code, 403)

        csrf = browser.get("/api/users/csrf/").json()["csrfToken"]
        refreshed = browser.post(
            "/api/users/token/refresh/", {}, content_type="application/json",
            HTTP_X_CSRFTOKEN=csrf, **browser_headers
        )
        self.assertEqual(refreshed.status_code, 200)
        self.assertIn("access", refreshed.json())
        self.assertNotIn("refresh", refreshed.json())

        rejected_logout = browser.post(
            "/api/users/logout/", {}, content_type="application/json", **browser_headers
        )
        self.assertEqual(rejected_logout.status_code, 403)
        rejected_logout_with_bearer = browser.post(
            "/api/users/logout/", {}, content_type="application/json",
            HTTP_AUTHORIZATION="Bearer arbitrary", **browser_headers
        )
        self.assertEqual(rejected_logout_with_bearer.status_code, 403)
        csrf = browser.get("/api/users/csrf/").json()["csrfToken"]
        logout = browser.post(
            "/api/users/logout/", {}, content_type="application/json",
            HTTP_X_CSRFTOKEN=csrf, **browser_headers
        )
        self.assertEqual(logout.status_code, 200)

    @override_settings(AXES_ENABLED=False)
    def test_native_token_refresh_still_uses_response_body(self):
        get_user_model().objects.create_user(
            email="native-token@example.com",
            password="CorrectPassword123!",
            role="PHARMACIST",
            is_otp_verified=True,
            is_mobile_verified=True,
        )
        native = Client(enforce_csrf_checks=True)
        login = native.post(
            "/api/users/login/",
            {"email": "native-token@example.com", "password": "CorrectPassword123!"},
            content_type="application/json", HTTP_X_CLIENT_PLATFORM="mobile",
        )
        self.assertEqual(login.status_code, 200)
        refresh_token = login.json()["refresh"]
        # Native clients do not use cookies; send the token on a fresh client.
        native = Client(enforce_csrf_checks=True)
        refreshed = native.post(
            "/api/users/token/refresh/", {"refresh": refresh_token},
            content_type="application/json", HTTP_X_CLIENT_PLATFORM="mobile",
        )
        self.assertEqual(refreshed.status_code, 200)
        self.assertIn("refresh", refreshed.json())
        rotated_refresh = refreshed.json()["refresh"]
        logout = Client(enforce_csrf_checks=True).post(
            "/api/users/logout/", {"refresh": rotated_refresh},
            content_type="application/json", HTTP_X_CLIENT_PLATFORM="mobile",
        )
        self.assertEqual(logout.status_code, 200)
        rejected = Client(enforce_csrf_checks=True).post(
            "/api/users/token/refresh/", {"refresh": rotated_refresh},
            content_type="application/json", HTTP_X_CLIENT_PLATFORM="mobile",
        )
        self.assertEqual(rejected.status_code, 401)

    @override_settings(AXES_ENABLED=False, JWT_COOKIE_SECURE=True)
    def test_web_login_keeps_refresh_token_out_of_javascript_response(self):
        get_user_model().objects.create_user(
            email="web-cookie-only@example.com",
            password="CorrectPassword123!",
            role="PHARMACIST",
            is_otp_verified=True,
            is_mobile_verified=True,
        )
        csrf = self.client.get("/api/users/csrf/").json()["csrfToken"]
        response = self.client.post(
            "/api/users/login/",
            {
                "email": "web-cookie-only@example.com",
                "password": "CorrectPassword123!",
                "remember_me": True,
            },
            content_type="application/json",
            HTTP_X_CSRFTOKEN=csrf,
            HTTP_X_CLIENT_PLATFORM="web",
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn("access", response.json())
        self.assertNotIn("refresh", response.json())
        self.assertIn("ct_refresh", response.cookies)
        self.assertTrue(response.cookies["ct_refresh"]["httponly"])
        self.assertTrue(response.cookies["ct_refresh"]["secure"])

    @override_settings(AXES_ENABLED=False)
    def test_web_refresh_rotates_cookie_without_exposing_refresh_token(self):
        get_user_model().objects.create_user(
            email="web-refresh@example.com",
            password="CorrectPassword123!",
            role="PHARMACIST",
            is_otp_verified=True,
            is_mobile_verified=True,
        )
        csrf = self.client.get("/api/users/csrf/").json()["csrfToken"]
        login = self.client.post(
            "/api/users/login/",
            {"email": "web-refresh@example.com", "password": "CorrectPassword123!"},
            content_type="application/json",
            HTTP_X_CSRFTOKEN=csrf,
            HTTP_X_CLIENT_PLATFORM="web",
        )
        self.assertEqual(login.status_code, 200)
        csrf = self.client.get("/api/users/csrf/").json()["csrfToken"]
        response = self.client.post(
            "/api/users/token/refresh/",
            {},
            content_type="application/json",
            HTTP_X_CSRFTOKEN=csrf,
            HTTP_X_CLIENT_PLATFORM="web",
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn("access", response.json())
        self.assertNotIn("refresh", response.json())
        self.assertIn("ct_refresh", response.cookies)

    @override_settings(AXES_ENABLED=False)
    def test_non_web_client_keeps_token_response_for_mobile_compatibility(self):
        get_user_model().objects.create_user(
            email="mobile-token@example.com",
            password="CorrectPassword123!",
            role="PHARMACIST",
            is_otp_verified=True,
            is_mobile_verified=True,
        )
        response = self.client.post(
            "/api/users/login/",
            {"email": "mobile-token@example.com", "password": "CorrectPassword123!"},
            content_type="application/json",
            HTTP_X_CLIENT_PLATFORM="mobile",
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn("access", response.json())
        self.assertIn("refresh", response.json())


class LoginEnumerationSafetyTests(TestCase):
    @override_settings(AXES_ENABLED=False)
    def test_unknown_email_and_wrong_password_have_same_generic_error(self):
        get_user_model().objects.create_user(
            email="known@example.com",
            password="CorrectPassword123!",
            role="PHARMACIST",
            is_otp_verified=True,
            is_mobile_verified=True,
        )
        unknown = self.client.post(
            "/api/users/login/",
            {"email": "missing@example.com", "password": "WrongPassword123!"},
            content_type="application/json",
        )
        wrong = self.client.post(
            "/api/users/login/",
            {"email": "known@example.com", "password": "WrongPassword123!"},
            content_type="application/json",
        )
        self.assertEqual(unknown.status_code, 401)
        self.assertEqual(wrong.status_code, 401)
        self.assertEqual(unknown.json()["code"], "invalid_credentials")
        self.assertEqual(wrong.json()["code"], "invalid_credentials")
        self.assertEqual(unknown.json()["detail"], wrong.json()["detail"])

    @override_settings(AXES_ENABLED=False)
    def test_unverified_account_is_only_disclosed_after_correct_password(self):
        get_user_model().objects.create_user(
            email="unverified@example.com",
            password="CorrectPassword123!",
            role="PHARMACIST",
            is_otp_verified=False,
            is_mobile_verified=False,
        )
        wrong = self.client.post(
            "/api/users/login/",
            {"email": "unverified@example.com", "password": "WrongPassword123!"},
            content_type="application/json",
        )
        correct = self.client.post(
            "/api/users/login/",
            {"email": "unverified@example.com", "password": "CorrectPassword123!"},
            content_type="application/json",
        )
        self.assertEqual(wrong.status_code, 401)
        self.assertEqual(wrong.json()["code"], "invalid_credentials")
        self.assertEqual(correct.status_code, 401)
        self.assertEqual(correct.json()["code"], "email_not_verified")


class EmailOtpSecurityTests(TestCase):
    @patch("users.views.async_task")
    def test_web_otp_verification_does_not_expose_or_set_auth_tokens(self, _async_task):
        user = get_user_model().objects.create_user(
            email="web-otp@example.com",
            password="CorrectPassword123!",
            role="PHARMACIST",
            is_otp_verified=False,
            is_mobile_verified=False,
        )
        user.otp_code = "123456"
        user.otp_created_at = timezone.now()
        user.save(update_fields=["otp_code", "otp_created_at"])

        response = self.client.post(
            "/api/users/verify-otp/",
            {"email": user.email, "otp": "123456"},
            content_type="application/json",
            HTTP_X_CLIENT_PLATFORM="web",
        )
        self.assertEqual(response.status_code, 200)
        self.assertNotIn("access", response.json())
        self.assertNotIn("refresh", response.json())
        self.assertNotIn("ct_access", response.cookies)
        self.assertNotIn("ct_refresh", response.cookies)
        user.refresh_from_db()
        self.assertTrue(user.is_otp_verified)

    @patch("users.views.async_task")
    def test_mobile_otp_verification_keeps_token_contract(self, _async_task):
        user = get_user_model().objects.create_user(
            email="mobile-otp@example.com",
            password="CorrectPassword123!",
            role="PHARMACIST",
            is_otp_verified=False,
            is_mobile_verified=False,
        )
        user.otp_code = "654321"
        user.otp_created_at = timezone.now()
        user.save(update_fields=["otp_code", "otp_created_at"])

        response = self.client.post(
            "/api/users/verify-otp/",
            {"email": user.email, "otp": "654321"},
            content_type="application/json",
            HTTP_X_CLIENT_PLATFORM="mobile",
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn("access", response.json())
        self.assertIn("refresh", response.json())

    def test_unknown_email_and_wrong_otp_have_same_failure(self):
        user = get_user_model().objects.create_user(
            email="otp-known@example.com",
            password="CorrectPassword123!",
            role="PHARMACIST",
            is_otp_verified=False,
            is_mobile_verified=False,
        )
        user.otp_code = "123456"
        user.otp_created_at = timezone.now()
        user.save(update_fields=["otp_code", "otp_created_at"])

        missing = self.client.post(
            "/api/users/verify-otp/",
            {"email": "otp-missing@example.com", "otp": "000000"},
            content_type="application/json",
        )
        wrong = self.client.post(
            "/api/users/verify-otp/",
            {"email": user.email, "otp": "000000"},
            content_type="application/json",
        )
        self.assertEqual(missing.status_code, 400)
        self.assertEqual(wrong.status_code, 400)
        self.assertEqual(missing.json(), wrong.json())
