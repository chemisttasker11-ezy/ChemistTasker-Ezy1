from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied

from client_profile.models import OtherStaffOnboarding, PharmacistOnboarding
from client_profile.domains.explorer.views import ExplorerPostViewSet


class TalentPublishingAccessTests(TestCase):
    def setUp(self):
        self.view = ExplorerPostViewSet()

    def check_access(self, user):
        self.view.request = type("Request", (), {"user": user})()
        self.view._require_public_staff_access()

    def test_explorer_does_not_need_staff_onboarding(self):
        user = get_user_model().objects.create_user(
            email="explorer-talent@example.com", password="test", role="EXPLORER"
        )
        self.check_access(user)

    def test_other_staff_needs_mobile_and_verified_profile(self):
        user = get_user_model().objects.create_user(
            email="staff-talent@example.com", password="test", role="OTHER_STAFF"
        )
        profile = OtherStaffOnboarding.objects.create(user=user)
        with self.assertRaises(PermissionDenied):
            self.check_access(user)
        user.is_mobile_verified = True
        user.save(update_fields=["is_mobile_verified"])
        with self.assertRaises(PermissionDenied):
            self.check_access(user)
        profile.verified = True
        profile.save(update_fields=["verified"])
        self.check_access(user)

    def test_pharmacist_needs_current_verified_registration(self):
        user = get_user_model().objects.create_user(
            email="pharmacist-talent@example.com", password="test",
            role="PHARMACIST", is_mobile_verified=True,
        )
        profile = PharmacistOnboarding.objects.create(user=user, verified=True)
        with self.assertRaises(PermissionDenied):
            self.check_access(user)
        profile.ahpra_verified = True
        profile.ahpra_expiry_date = timezone.localdate() - timedelta(days=1)
        profile.save(update_fields=["ahpra_verified", "ahpra_expiry_date"])
        with self.assertRaises(PermissionDenied):
            self.check_access(user)
        profile.ahpra_expiry_date = timezone.localdate() + timedelta(days=1)
        profile.save(update_fields=["ahpra_expiry_date"])
        self.check_access(user)
