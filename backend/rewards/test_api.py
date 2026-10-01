"""Characterization of the Pills rewards API (/api/client-profile/pill-rewards/)."""
from django.test import TestCase

from rewards.models import PillLedgerEntry, PillReferralCode, PillReferralEvent, PillRewardRule
from client_profile.characterization_support import (
    BASE, client_for, make_owner_with_pharmacy, make_staff_member, make_user,
)

URL = BASE + "pill-rewards/"


class PillRewardsAuthTests(TestCase):
    def test_every_action_requires_authentication(self):
        client = client_for()
        for path in ("balance/", "rules/", "referral-code/", "history/", "referrals/"):
            self.assertIn(client.get(URL + path).status_code, (401, 403), path)
        for path in ("refer-friend/", "refer-shift/", "claim/", "pay-shift/"):
            self.assertIn(client.post(URL + path, {}, format="json").status_code, (401, 403), path)


class PillRewardsReadTests(TestCase):
    def setUp(self):
        self.user = make_user("PHARMACIST")
        self.client = client_for(self.user)

    def test_balance_shape_and_default(self):
        res = self.client.get(URL + "balance/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(set(res.json()), {"balance", "shift_post_cost"})
        self.assertEqual(res.json()["balance"], 0)

    def test_rules_are_seeded_and_listed_in_code_order(self):
        res = self.client.get(URL + "rules/")
        self.assertEqual(res.status_code, 200)
        rows = res.json()
        self.assertTrue(rows)
        self.assertEqual([r["code"] for r in rows], sorted(r["code"] for r in rows))
        self.assertEqual(len(rows), PillRewardRule.objects.filter(is_active=True).count())

    def test_referral_code_is_created_once_per_user(self):
        first = self.client.get(URL + "referral-code/")
        second = self.client.get(URL + "referral-code/")
        self.assertEqual(first.status_code, 200)
        self.assertEqual(first.json(), second.json())
        self.assertEqual(PillReferralCode.objects.filter(user=self.user).count(), 1)

    def test_history_and_referrals_start_empty(self):
        for path in ("history/", "referrals/"):
            res = self.client.get(URL + path)
            self.assertEqual(res.status_code, 200, path)
            body = res.json()
            rows = body["results"] if isinstance(body, dict) else body
            self.assertEqual(rows, [], path)

    def test_history_only_shows_own_entries(self):
        other = make_user("PHARMACIST")
        for owner, key in ((self.user, "char-own"), (other, "char-other")):
            PillLedgerEntry.objects.create(
                user=owner, entry_type="EARN", source="MANUAL", delta=5,
                balance_after=5, idempotency_key=key,
            )
        body = self.client.get(URL + "history/").json()
        rows = body["results"] if isinstance(body, dict) else body
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["delta"], 5)
        self.assertEqual(self.client.get(URL + "balance/").json()["balance"], 5)


class PillRewardsWriteTests(TestCase):
    def setUp(self):
        self.owner, self.pharmacy = make_owner_with_pharmacy()
        self.outsider = make_user("PHARMACIST")

    def test_refer_friend_creates_pending_event(self):
        res = client_for(self.outsider).post(URL + "refer-friend/", {"referred_email": "friend@example.com"}, format="json")
        self.assertEqual(res.status_code, 201)
        event = PillReferralEvent.objects.get(referrer=self.outsider)
        self.assertEqual(event.status, PillReferralEvent.Status.PENDING)
        self.assertEqual(res.json()["id"], event.id)

    def test_refer_shift_unknown_shift_is_404(self):
        res = client_for(self.owner).post(URL + "refer-shift/", {"shift_id": 999999}, format="json")
        self.assertEqual(res.status_code, 404)

    def test_claim_with_unknown_code_is_rejected(self):
        res = client_for(self.outsider).post(URL + "claim/", {"code": "NOPE-NOPE"}, format="json")
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.json(), {"detail": "Referral code is invalid or inactive."})
        self.assertFalse(PillReferralEvent.objects.filter(referred_user=self.outsider).exists())

    def test_pay_shift_requires_shift_id(self):
        res = client_for(self.owner).post(URL + "pay-shift/", {}, format="json")
        self.assertEqual(res.status_code, 400)
        self.assertIn("shift_id", res.json())

    def test_pay_shift_unknown_shift_is_404(self):
        res = client_for(self.owner).post(URL + "pay-shift/", {"shift_id": 999999}, format="json")
        self.assertEqual(res.status_code, 404)


class PillRewardsShiftPermissionTests(TestCase):
    def setUp(self):
        from client_profile.models import Shift
        self.owner, self.pharmacy = make_owner_with_pharmacy()
        self.outsider = make_user("PHARMACIST")
        self.shift = Shift.objects.create(
            pharmacy=self.pharmacy, created_by=self.owner, role_needed="ASSISTANT", employment_type="LOCUM",
        )

    def test_refer_shift_denied_for_non_manager(self):
        res = client_for(self.outsider).post(URL + "refer-shift/", {"shift_id": self.shift.id}, format="json")
        self.assertEqual(res.status_code, 403)
        self.assertFalse(PillReferralEvent.objects.exists())

    def test_refer_shift_allowed_for_pharmacy_owner(self):
        res = client_for(self.owner).post(URL + "refer-shift/", {"shift_id": self.shift.id}, format="json")
        self.assertEqual(res.status_code, 201)
        self.assertEqual(PillReferralEvent.objects.get().shift_id, self.shift.id)

    def test_pay_shift_denied_for_non_manager(self):
        res = client_for(self.outsider).post(URL + "pay-shift/", {"shift_id": self.shift.id}, format="json")
        self.assertEqual(res.status_code, 403)

    def test_pay_shift_owner_without_pending_payment_is_400(self):
        res = client_for(self.owner).post(URL + "pay-shift/", {"shift_id": self.shift.id}, format="json")
        self.assertEqual(res.status_code, 400)
        self.assertIn("does not require payment", str(res.json()))
