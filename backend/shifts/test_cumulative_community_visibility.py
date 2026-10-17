"""Owner E01: organisation publication is cumulative, notification choice is separate."""
from datetime import date, time, timedelta

from django.test import TestCase
from client_profile.characterization_support import client_for, make_owner_with_pharmacy, make_user
from memberships.models import Membership
from organizations.models import Organization, Chain
from shifts.models import Shift, ShiftSlot


class CumulativeCommunityVisibilityTests(TestCase):
    def setUp(self):
        self.owner, self.pharmacy = make_owner_with_pharmacy("Organisation vacancy source")
        self.org = Organization.objects.create(name="Shift source org", slug="shift-source-org-182")
        self.pharmacy.organization = self.org
        self.pharmacy.save(update_fields=["organization"])
        self.chain = Chain.objects.create(
            owner=self.pharmacy.owner, name="Source group", is_active=True,
        )
        self.chain.pharmacies.add(self.pharmacy)
        self.shift = Shift.objects.create(
            pharmacy=self.pharmacy, created_by=self.owner,
            role_needed="PHARMACIST", employment_type="LOCUM",
            visibility="ORG_CHAIN", post_anonymously=False,
        )
        ShiftSlot.objects.create(
            shift=self.shift, date=date.today() + timedelta(days=10),
            start_time=time(9, 0), end_time=time(17, 0),
        )

    def member(self, pharmacy, employment_type):
        user = make_user("PHARMACIST")
        Membership.objects.create(
            user=user, pharmacy=pharmacy, role="PHARMACIST",
            employment_type=employment_type,
            status=Membership.Status.ACCEPTED, is_active=True,
        )
        return user

    def visible(self, user):
        response = client_for(user).get("/api/v1/community-shifts/")
        self.assertEqual(response.status_code, 200)
        body = response.data
        if isinstance(body, dict):
            body = body.get("results", [])
        return any(item["id"] == self.shift.pk for item in body)

    def test_pharmacy_staff_still_sees_org_published_vacancy(self):
        self.assertTrue(self.visible(self.member(self.pharmacy, "FULL_TIME")))

    def test_pharmacy_favourite_locum_still_sees_org_published_vacancy(self):
        self.assertTrue(self.visible(self.member(self.pharmacy, "LOCUM")))

    def test_owner_chain_worker_still_sees_org_published_vacancy(self):
        _, sibling = make_owner_with_pharmacy("Same owner sibling")
        sibling.owner = self.pharmacy.owner
        sibling.save(update_fields=["owner"])
        self.chain.pharmacies.add(sibling)
        self.assertTrue(self.visible(self.member(sibling, "FULL_TIME")))

    def test_organisation_worker_sees_org_published_vacancy(self):
        _, sibling = make_owner_with_pharmacy("Other owner same org")
        sibling.organization = self.org
        sibling.save(update_fields=["organization"])
        self.assertTrue(self.visible(self.member(sibling, "FULL_TIME")))

    def test_unrelated_worker_cannot_view_org_published_vacancy(self):
        _, unrelated = make_owner_with_pharmacy("Unrelated org")
        self.assertFalse(self.visible(self.member(unrelated, "FULL_TIME")))
