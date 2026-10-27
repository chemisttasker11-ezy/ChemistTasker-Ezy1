"""Session logout must prevent refresh without revoking another device."""
from unittest.mock import patch

from django.conf import settings
from django.core.cache import cache
from django.test import TestCase, override_settings
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import UntypedToken

from client_profile.characterization_support import make_user
from users.models import RevokedSession
from users.tokens import RefreshToken


@override_settings(AXES_ENABLED=False)
class SessionRefreshRevocationTests(TestCase):
    def setUp(self):
        self.user = make_user('PHARMACIST')

    def refresh(self, token, cookie=False):
        cache.clear()
        client = APIClient()
        if cookie:
            client.cookies[settings.JWT_REFRESH_COOKIE] = token
        return client.post('/api/v1/users/token/refresh/', {} if cookie else {'refresh': token}, format='json')

    def test_logout_revokes_rotated_refresh_across_body_and_cookie_routes(self):
        for cookie in (False, True):
            for stale_logout in (False, True):
                with self.subTest(cookie=cookie, stale_logout=stale_logout):
                    original = RefreshToken.for_user(self.user)
                    rotated = self.refresh(str(original))
                    self.assertEqual(rotated.status_code, 200, rotated.data)
                    latest = rotated.data['refresh']
                    with patch('users.api_auth.notify_auth_changed'):
                        logged_out = APIClient().post('/api/v1/users/logout/', {
                            'refresh': str(original) if stale_logout else latest,
                        }, format='json')
                    self.assertEqual(logged_out.status_code, 200)
                    self.assertTrue(RevokedSession.objects.filter(session_id=original['sid']).exists())
                    rejected = self.refresh(latest, cookie=cookie)
                    self.assertIn(rejected.status_code, (400, 401), rejected.data)
                    self.assertNotIn('access', rejected.data)
                    self.assertNotIn('refresh', rejected.data)

    def test_other_session_can_rotate_and_keep_remember_me_expiry(self):
        revoked = RefreshToken.for_user(self.user)
        RevokedSession.objects.create(session_id=revoked['sid'])
        survivor = RefreshToken.for_user(self.user)
        survivor['remember_me'] = True
        first = self.refresh(str(survivor))
        self.assertEqual(first.status_code, 200, first.data)
        rotated = UntypedToken(first.data['refresh'])
        self.assertEqual(rotated['sid'], survivor['sid'])
        self.assertEqual(rotated['exp'], survivor['exp'])
        self.assertTrue(rotated['remember_me'])
        second = self.refresh(first.data['refresh'], cookie=True)
        self.assertEqual(second.status_code, 200, second.data)
        self.assertIn('access', second.data)

    def test_revoked_legacy_refresh_uses_jti_as_session_identity(self):
        legacy = RefreshToken.for_user(self.user)
        del legacy['sid']
        RevokedSession.objects.create(session_id=legacy['jti'])
        self.assertIn(self.refresh(str(legacy)).status_code, (400, 401))
