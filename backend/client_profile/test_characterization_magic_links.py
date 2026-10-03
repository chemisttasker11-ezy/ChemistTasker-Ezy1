"""Membership magic links (/api/client-profile/magic/memberships/<token>/ and .../apply/), used without login."""
import uuid
from datetime import timedelta

from django.test import TestCase
from django.utils import timezone

from client_profile.characterization_support import BASE, client_for, make_owner_with_pharmacy
from client_profile.models import MembershipInviteLink

URL = BASE + "magic/memberships/"
INVALID = {"detail": "Invalid link."}


class MagicLinkTests(TestCase):
    def setUp(self):
        self.owner, self.pharmacy = make_owner_with_pharmacy()
        self.link = MembershipInviteLink.objects.create(
            pharmacy=self.pharmacy, created_by=self.owner, category="FULL_PART_TIME",
            expires_at=timezone.now() + timedelta(days=5))

    def test_a_valid_link_describes_the_pharmacy_and_category(self):
        res = client_for().get(f"{URL}{self.link.token}/")
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertEqual(set(body), {"pharmacy", "pharmacy_name", "category", "expires_at", "payroll_enabled"})
        self.assertEqual((body["pharmacy"], body["category"]), (self.pharmacy.id, "FULL_PART_TIME"))

    def test_an_expired_link_is_gone(self):
        MembershipInviteLink.objects.filter(pk=self.link.pk).update(expires_at=timezone.now() - timedelta(days=1))
        self.assertEqual(client_for().get(f"{URL}{self.link.token}/").status_code, 410)

    def test_unknown_and_malformed_tokens_are_invalid_links(self):
        anonymous = client_for()
        for token in (uuid.uuid4(), "not-a-uuid"):
            with self.subTest(token=token):
                for res in (anonymous.get(f"{URL}{token}/"), anonymous.post(f"{URL}{token}/apply/", {}, format="json")):
                    self.assertEqual(res.status_code, 404)
                    self.assertEqual(res.json(), INVALID)
