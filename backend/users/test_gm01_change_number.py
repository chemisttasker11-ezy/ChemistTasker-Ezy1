from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.urls import reverse
from rest_framework.test import APIClient


@override_settings(MOBILE_OTP_DISPLAY_IN_APP=True)
class ChangeMobileNumberTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            email="change@example.test", first_name="Alex", last_name="Smith",
            username="alex", mobile_number="61411111111", is_mobile_verified=True,
        )
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def request_code(self, number="0412 222 222"):
        return self.client.post(reverse("api_v1:mobile-request-otp"), {"mobile_number": number}, format="json")

    def verify(self, code):
        return self.client.post(reverse("api_v1:mobile-verify-otp"), {"otp": code}, format="json")

    def test_pending_wrong_and_success(self):
        response = self.request_code()
        self.assertEqual(response.status_code, 200)
        code = response.data["debug_otp"]
        self.user.refresh_from_db()
        self.assertEqual((self.user.mobile_number, self.user.pending_mobile_number, self.user.is_mobile_verified),
                         ("61411111111", "61412222222", True))
        self.assertEqual(self.verify("000000").status_code, 400)
        self.user.refresh_from_db()
        self.assertEqual(self.user.mobile_number, "61411111111")
        self.assertTrue(self.user.is_mobile_verified)
        self.assertEqual(self.verify(code).status_code, 200)
        self.user.refresh_from_db()
        self.assertEqual((self.user.mobile_number, self.user.pending_mobile_number, self.user.is_mobile_verified),
                         ("61412222222", None, True))

    def test_taken_at_request_and_confirmation(self):
        other = get_user_model().objects.create_user(email="other@example.test", mobile_number="61412222222", is_mobile_verified=True)
        self.assertEqual(self.request_code().status_code, 400)
        other.is_mobile_verified = False
        other.save(update_fields=["is_mobile_verified"])
        response = self.request_code()
        self.assertEqual(response.status_code, 200)
        other.is_mobile_verified = True
        other.save(update_fields=["is_mobile_verified"])
        self.assertEqual(self.verify(response.data["debug_otp"]).status_code, 400)
        self.user.refresh_from_db()
        self.assertEqual(self.user.mobile_number, "61411111111")
        self.assertTrue(self.user.is_mobile_verified)

    def test_first_time_flow(self):
        self.user.is_mobile_verified = False
        self.user.save(update_fields=["is_mobile_verified"])
        response = self.client.post(reverse("api_v1:mobile-request-otp"), {
            "mobile_number": "0412 222 222", "first_name": "Alex", "last_name": "Smith", "username": "alex",
        }, format="json")
        self.assertEqual(response.status_code, 200)
        self.user.refresh_from_db()
        self.assertEqual(self.user.mobile_number, "61412222222")
        self.assertIsNone(self.user.pending_mobile_number)
        self.assertFalse(self.user.is_mobile_verified)
        self.assertEqual(self.verify(response.data["debug_otp"]).status_code, 200)
        self.user.refresh_from_db()
        self.assertTrue(self.user.is_mobile_verified)

