from django.contrib.auth import get_user_model
from django.contrib.auth.tokens import default_token_generator
from django.test import TestCase, override_settings
from django.urls import reverse
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode
from datetime import timedelta
import jwt


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
