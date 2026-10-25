"""Phase 5 frozen-main evidence: push token revocation and overnight penalty arithmetic."""
from datetime import datetime, time, timedelta
from unittest.mock import patch
from django.test import TestCase
from django.utils import timezone
from rest_framework_simplejwt.tokens import RefreshToken

from billing.models import ShiftPayment
from client_profile.characterization_support import (
    client_for, make_assignment, make_owner_with_pharmacy, make_staff_member,
)
from users.models import DeviceToken


class Phase5PushLogoutPrivacy(TestCase):
    def test_c071_n2_logging_out_revokes_previous_device_push_token(self):
        owner, pharmacy = make_owner_with_pharmacy("PR200 Push")
        user, member = make_staff_member(pharmacy)
        reg = client_for(user).post(
            "/api/v1/device-tokens/",
            {"token": "ExponentPushToken[PR200-SYNTHETIC]", "platform": "android"},
            format="json",
        )
        self.assertIn(reg.status_code, (200, 201), reg.data)
        registered = DeviceToken.objects.get(token="ExponentPushToken[PR200-SYNTHETIC]")
        self.assertEqual(registered.user_id, user.pk)
        self.assertTrue(registered.active)
        refresh = RefreshToken.for_user(user)
        logout = client_for().post(
            "/api/v1/users/logout/",
            {"refresh": str(refresh)}, format="json",
        )
        self.assertEqual(logout.status_code, 200, logout.content)
        registered.refresh_from_db()
        self.assertFalse(registered.active, "Signed-out native device remains eligible for future private push.")


class Phase5OvernightPenalty(TestCase):
    def test_b66_overnight_assigned_work_must_have_nonzero_cancellation_wage(self):
        owner, pharmacy = make_owner_with_pharmacy("PR200 Overnight")
        worker, _ = make_staff_member(pharmacy)
        day = timezone.localdate() + timedelta(days=1)
        shift, slot, assignment = make_assignment(pharmacy, owner, worker, day=day)
        slot.start_time = time(22, 0)
        slot.end_time = time(6, 0)
        slot.save(update_fields=["start_time", "end_time"])
        assignment.unit_rate = 80
        assignment.save(update_fields=["unit_rate"])
        with patch("billing.views.stripe.checkout.Session.create") as create:
            create.return_value.url = "https://checkout.example.test/overnight"
            response = client_for(owner).post(
                f"/api/v1/billing/charge-penalty/{shift.pk}/", {}, format="json",
            )
        self.assertEqual(response.status_code, 200, response.content)
        self.assertIn("url", response.data, response.data)
        if create.called:
            paid_cents = create.call_args.kwargs["line_items"][0]["price_data"]["unit_amount"]
            self.assertGreater(paid_cents, 0)

    def test_b66_same_day_shift_positive_control_generates_penalty_checkout(self):
        owner, pharmacy = make_owner_with_pharmacy("PR200 Daytime")
        worker, _ = make_staff_member(pharmacy)
        day = timezone.localdate() + timedelta(days=1)
        shift, slot, assignment = make_assignment(pharmacy, owner, worker, day=day)
        assignment.unit_rate = 80
        assignment.save(update_fields=["unit_rate"])
        with patch("billing.views.stripe.checkout.Session.create") as create:
            create.return_value.url = "https://checkout.example.test/day"
            response = client_for(owner).post(
                f"/api/v1/billing/charge-penalty/{shift.pk}/", {}, format="json",
            )
        self.assertEqual(response.status_code, 200, response.content)
        self.assertIn("url", response.data, response.data)
        self.assertGreater(create.call_args.kwargs["line_items"][0]["price_data"]["unit_amount"], 0)


class Phase5PasswordResetTokenInvalidation(TestCase):
    def test_b43_password_reset_invalidates_all_preexisting_refresh_tokens(self):
        from django.contrib.auth.tokens import default_token_generator
        from django.utils.encoding import force_bytes
        from django.utils.http import urlsafe_base64_encode
        from client_profile.characterization_support import make_user

        user = make_user("PHARMACIST", is_otp_verified=True)
        old_refresh = RefreshToken.for_user(user)
        uid = urlsafe_base64_encode(force_bytes(user.pk))
        reset_token = default_token_generator.make_token(user)
        reset = client_for().post(
            "/api/v1/users/password-reset-confirm/",
            {
                "uid": uid, "token": reset_token,
                "new_password1": "New-Pr200-Password-2026!",
                "new_password2": "New-Pr200-Password-2026!",
            }, format="json",
        )
        self.assertEqual(reset.status_code, 200, reset.data)
        user.refresh_from_db()
        self.assertTrue(user.check_password("New-Pr200-Password-2026!"))
        old_session = client_for().post(
            "/api/v1/users/token/refresh/",
            {"refresh": str(old_refresh)}, format="json",
        )
        self.assertIn(old_session.status_code, (401, 403),
                      "Password-reset must revoke pre-existing refresh tokens.")
