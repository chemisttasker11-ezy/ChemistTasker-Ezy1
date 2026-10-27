"""Logged-out sessions cannot authenticate REST or mint socket tickets."""
from django.test import TestCase
from client_profile.characterization_support import client_for, make_user


class I4RestRevocation(TestCase):
    def setUp(self):
        from users.tokens import RefreshToken
        self.user = make_user("PHARMACIST")
        self.a, self.b = RefreshToken.for_user(self.user), RefreshToken.for_user(self.user)

    def me(self, refresh):
        return client_for().get("/api/v1/users/me/", HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")

    def logout(self, refresh):
        r = client_for().post("/api/v1/users/logout/", {"refresh": str(refresh)}, format="json")
        self.assertEqual(r.status_code, 200)

    def test_i4_access_token_of_logged_out_session_refused(self):
        access = str(self.a.access_token)
        self.logout(self.a)
        r = client_for().get("/api/v1/users/me/", HTTP_AUTHORIZATION=f"Bearer {access}")
        self.assertEqual(r.status_code, 401, "REST still serves the logged-out session's access token")

    def test_i4_ws_ticket_mint_after_logout_refused(self):
        access = str(self.a.access_token)
        self.logout(self.a)
        r = client_for().post("/api/v1/users/ws-ticket/", HTTP_AUTHORIZATION=f"Bearer {access}")
        self.assertNotIn(r.status_code, (200, 201), "logged-out session can still mint socket tickets")

    def test_i4_other_session_unaffected_control(self):
        self.logout(self.a)
        self.assertEqual(self.me(self.b).status_code, 200)

    def test_i4_deactivated_user_refused(self):
        type(self.user).objects.filter(pk=self.user.pk).update(is_active=False)
        self.assertEqual(self.me(self.b).status_code, 401)
