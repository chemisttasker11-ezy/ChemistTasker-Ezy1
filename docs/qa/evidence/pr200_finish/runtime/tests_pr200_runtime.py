"""PR #200 audit: runtime checks of F04-N1 and F04-N2 (audit only, no fixes).

Each negative test FAILS on today's code if the finding is real (the forbidden thing succeeds).
Each positive control must PASS.
"""
from datetime import date, time, timedelta
from decimal import Decimal

from django.test import TestCase

from client_profile.characterization_support import client_for, make_owner_with_pharmacy, make_user
from memberships.models import Membership
from onboarding.models import PharmacistOnboarding
from organizations.models import Organization, Pharmacy
from shifts.models import Shift, ShiftSlot

API = "/api/v1/"
DAY = date.today() + timedelta(days=10)


def make_shift(pharmacy, owner, visibility):
    shift = Shift.objects.create(
        pharmacy=pharmacy, created_by=owner, role_needed="PHARMACIST", employment_type="LOCUM",
        visibility=visibility, single_user_only=True,
    )
    ShiftSlot.objects.create(shift=shift, date=DAY, start_time=time(9, 0), end_time=time(17, 0), rate=Decimal("60.00"))
    return shift


def make_pharmacist(pharmacy=None, employment_type="FULL_TIME"):
    user = make_user("PHARMACIST", mobile_number="0411111111")
    PharmacistOnboarding.objects.create(user=user, verified=True, short_bio="Bio", rate_preference={})
    if pharmacy:
        Membership.objects.create(
            user=user, pharmacy=pharmacy, role="PHARMACIST", employment_type=employment_type,
            status=Membership.Status.ACCEPTED, is_active=True,
        )
    return user


class F04N1MemberStatusTests(TestCase):
    """Pharmacy B (in org X with sibling pharmacy C) posts a PLATFORM pharmacist shift. An external verified
    pharmacist with no membership anywhere asks member_status with FULL_PART_TIME / ORG_CHAIN visibility."""

    def setUp(self):
        self.owner, self.pharmacy = make_owner_with_pharmacy("Victim Pharmacy B")
        self.org = Organization.objects.create(name="Victim Org X", slug="victim-org-x")
        self.pharmacy.organization = self.org
        self.pharmacy.save(update_fields=["organization"])
        self.sibling = Pharmacy.objects.create(name="Sibling Pharmacy C", abn="51824753556", owner=self.pharmacy.owner,
                                               organization=self.org)
        self.staff_b = make_pharmacist(self.pharmacy, "FULL_TIME")
        self.staff_c = make_pharmacist(self.sibling, "PART_TIME")
        self.shift = make_shift(self.pharmacy, self.owner, "PLATFORM")
        self.outsider = make_pharmacist()

    def test_positive_control_owner_sees_staff(self):
        response = client_for(self.owner).get(f"{API}shifts/{self.shift.id}/member_status/?visibility=FULL_PART_TIME")
        print(f"\n[F04-N1 positive] owner GET FULL_PART_TIME -> {response.status_code}, "
              f"user_ids={[row['user_id'] for row in response.data]}")
        self.assertEqual(response.status_code, 200)
        self.assertEqual([row["user_id"] for row in response.data], [self.staff_b.id])

    def test_positive_control_outsider_can_see_platform_shift(self):
        response = client_for(self.outsider).get(f"{API}shifts/{self.shift.id}/")
        print(f"\n[F04-N1 positive] outsider GET shift detail -> {response.status_code}")
        self.assertEqual(response.status_code, 200)

    def _outsider_status(self, visibility):
        response = client_for(self.outsider).get(f"{API}shifts/{self.shift.id}/member_status/?visibility={visibility}")
        leaked = [
            {key: row.get(key) for key in ("user_id", "name", "employment_type", "membership_id", "pharmacy_name",
                                           "organization_name")}
            for row in (response.data if isinstance(response.data, list) else [])
        ]
        print(f"\n[F04-N1 negative] outsider GET {visibility} -> {response.status_code}, rows={leaked}")
        return response, leaked

    def test_negative_outsider_full_part_time(self):
        response, leaked = self._outsider_status("FULL_PART_TIME")
        self.assertFalse(
            response.status_code == 200 and leaked,
            f"FORBIDDEN SUCCEEDED: unrelated pharmacist got HTTP {response.status_code} with staff rows {leaked}",
        )

    def test_negative_outsider_org_chain(self):
        response, leaked = self._outsider_status("ORG_CHAIN")
        self.assertFalse(
            response.status_code == 200 and leaked,
            f"FORBIDDEN SUCCEEDED: unrelated pharmacist got HTTP {response.status_code} with org staff rows {leaked}",
        )


class F04N2ShiftPatchTests(TestCase):
    """Owner A PATCHes their own shift: pharmacy -> unrelated pharmacy B, apply_rates_to_pharmacy, payment_status."""

    def setUp(self):
        self.owner_a, self.pharmacy_a = make_owner_with_pharmacy("Attacker Pharmacy A")
        self.owner_b, self.pharmacy_b = make_owner_with_pharmacy("Victim Pharmacy B")
        self.pharmacy_b.rate_weekday = Decimal("50.00")
        self.pharmacy_b.save(update_fields=["rate_weekday"])
        self.shift = make_shift(self.pharmacy_a, self.owner_a, "LOCUM_CASUAL")

    def _state(self):
        self.shift.refresh_from_db()
        self.pharmacy_b.refresh_from_db()
        return {"shift.pharmacy_id": self.shift.pharmacy_id, "shift.payment_status": self.shift.payment_status,
                "B.rate_weekday": str(self.pharmacy_b.rate_weekday)}

    def test_positive_control_owner_edits_own_shift(self):
        response = client_for(self.owner_a).patch(f"{API}shifts/{self.shift.id}/", {"description": "Updated"}, format="json")
        self.shift.refresh_from_db()
        print(f"\n[F04-N2 positive] owner A PATCH description -> {response.status_code}, description={self.shift.description!r}")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(self.shift.description, "Updated")

    def test_positive_control_owner_b_cannot_patch_a_shift(self):
        response = client_for(self.owner_b).patch(f"{API}shifts/{self.shift.id}/", {"description": "x"}, format="json")
        print(f"\n[F04-N2 positive] owner B PATCH A's shift -> {response.status_code}")
        self.assertIn(response.status_code, (403, 404))

    def test_negative_move_shift_to_unrelated_pharmacy_and_rewrite_rates(self):
        before = self._state()
        response = client_for(self.owner_a).patch(f"{API}shifts/{self.shift.id}/", {
            "pharmacy": self.pharmacy_b.id, "role_needed": "PHARMACIST", "apply_rates_to_pharmacy": True,
            "rate_weekday": "1.00",
        }, format="json")
        after = self._state()
        print(f"\n[F04-N2 negative move] owner A PATCH pharmacy=B + apply_rates -> {response.status_code}, "
              f"before={before}, after={after}, pharmacy_A={self.pharmacy_a.id}, pharmacy_B={self.pharmacy_b.id}")
        self.assertEqual(after["shift.pharmacy_id"], self.pharmacy_a.id,
                         f"FORBIDDEN SUCCEEDED: HTTP {response.status_code}, shift moved to unrelated pharmacy B")
        self.assertEqual(after["B.rate_weekday"], "50.00",
                         f"FORBIDDEN SUCCEEDED: HTTP {response.status_code}, pharmacy B rate_weekday rewritten")

    def test_negative_owner_sets_payment_status_paid(self):
        response = client_for(self.owner_a).patch(f"{API}shifts/{self.shift.id}/", {"payment_status": "PAID"}, format="json")
        after = self._state()
        print(f"\n[F04-N2 negative payment] owner A PATCH payment_status=PAID -> {response.status_code}, after={after}")
        self.assertEqual(after["shift.payment_status"], "NOT_REQUIRED",
                         f"FORBIDDEN SUCCEEDED: HTTP {response.status_code}, payment_status forged to PAID")
