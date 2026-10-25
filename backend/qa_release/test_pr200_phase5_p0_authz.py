"""PR200 Phase 5: focused P0/P1 control-plane authorization contracts.

Audit-only RED-first tests on frozen main. Each adversarial request has a
legitimate owner/accepted-user control; no production data, migration or
payment-provider call. Failure is only evidence when fixtures reach the
intended endpoint; setup errors are TEST_INVALID.
"""
from datetime import timedelta
from unittest.mock import patch

from django.test import TestCase
from django.utils import timezone

from client_profile.characterization_support import (
    client_for, make_owner_with_pharmacy, make_staff_member, make_user,
)
from organizations.models import (
    Chain, Organization, PharmacyAdmin, PharmacyClaim,
)
from memberships.models import MembershipInviteLink
from users.models import OrganizationMembership
from pharmacy_hub.models import PharmacyHubPoll
from shifts.models import Shift, ShiftInterest


class Phase5AdminAndChainAuthority(TestCase):
    def setUp(self):
        self.owner_a, self.pharmacy_a = make_owner_with_pharmacy("Phase5 Owner A")
        self.owner_b, self.pharmacy_b = make_owner_with_pharmacy("Phase5 Owner B")

    def test_b16_roster_manager_cannot_revoke_another_admin(self):
        roster_user, roster_membership = make_staff_member(
            self.pharmacy_a, role="ASSISTANT"
        )
        target_user, target_membership = make_staff_member(
            self.pharmacy_a, role="TECHNICIAN"
        )
        PharmacyAdmin.objects.create(
            user=roster_user, pharmacy=self.pharmacy_a,
            membership=roster_membership, admin_level="ROSTER_MANAGER",
            staff_role="ASSISTANT", is_active=True,
        )
        target = PharmacyAdmin.objects.create(
            user=target_user, pharmacy=self.pharmacy_a,
            membership=target_membership, admin_level="MANAGER",
            staff_role="TECHNICIAN", is_active=True,
        )
        url = f"/api/v1/pharmacy-admins/{target.pk}/"
        legitimate = client_for(self.owner_a).patch(
            url, {"job_title": "Legitimate owner edit"}, format="json"
        )
        self.assertEqual(legitimate.status_code, 200, legitimate.data)
        target.refresh_from_db()
        self.assertEqual(target.job_title, "Legitimate owner edit")
        forbidden = client_for(roster_user).patch(
            url, {"is_active": False}, format="json"
        )
        self.assertIn(forbidden.status_code, (403, 404), forbidden.data)
        target.refresh_from_db()
        self.assertTrue(target.is_active)

    def test_b17_chain_patch_cannot_insert_foreign_pharmacy(self):
        chain = Chain.objects.create(
            owner=self.pharmacy_a.owner, name="Owner A Chain",
            primary_contact_email=self.owner_a.email,
        )
        chain.pharmacies.add(self.pharmacy_a)
        url = f"/api/v1/chains/{chain.pk}/"
        legitimate = client_for(self.owner_a).patch(
            url, {"name": "Owner A Renamed Chain"}, format="json"
        )
        self.assertEqual(legitimate.status_code, 200, legitimate.data)
        chain.refresh_from_db()
        self.assertEqual(chain.name, "Owner A Renamed Chain")
        refused = client_for(self.owner_a).patch(
            url,
            {"pharmacy_ids": [self.pharmacy_a.pk, self.pharmacy_b.pk]},
            format="json",
        )
        self.assertIn(refused.status_code, (400, 403), refused.data)
        chain.refresh_from_db()
        self.assertEqual(
            list(chain.pharmacies.order_by("id").values_list("id", flat=True)),
            [self.pharmacy_a.pk],
        )


class Phase5ClaimAndInviteAuthority(TestCase):
    def setUp(self):
        self.owner, self.pharmacy = make_owner_with_pharmacy("Phase5 Claim Pharmacy")
        self.foreign_owner, self.foreign_pharmacy = make_owner_with_pharmacy(
            "Phase5 Foreign Pharmacy"
        )
        self.org = Organization.objects.create(name="Phase5 Claim Organisation")
        self.org_admin = make_user("OWNER")
        OrganizationMembership.objects.create(
            user=self.org_admin, organization=self.org, role="ORG_ADMIN",
        )

    def test_b18_org_admin_put_cannot_approve_own_pharmacy_claim(self):
        claim = PharmacyClaim.objects.create(
            pharmacy=self.pharmacy, organization=self.org,
            requested_by=self.org_admin, message="Please review ownership",
        )
        url = f"/api/v1/pharmacy-claims/{claim.pk}/"
        owner_view = client_for(self.owner).get(url)
        self.assertEqual(owner_view.status_code, 200, owner_view.data)
        org_view = client_for(self.org_admin).get(url)
        self.assertEqual(org_view.status_code, 200, org_view.data)
        forged = client_for(self.org_admin).put(
            url,
            {"status": "ACCEPTED", "message": claim.message},
            format="json",
        )
        self.assertIn(forged.status_code, (403, 405), forged.data)
        claim.refresh_from_db()
        self.pharmacy.refresh_from_db()
        self.assertEqual(claim.status, PharmacyClaim.Status.PENDING)
        self.assertIsNone(self.pharmacy.organization_id)

    def test_b19_invite_link_cannot_be_retargeted_to_foreign_pharmacy(self):
        link = MembershipInviteLink.objects.create(
            pharmacy=self.pharmacy, created_by=self.owner,
            category="FULL_PART_TIME",
            expires_at=timezone.now() + timedelta(days=7),
        )
        separate = MembershipInviteLink.objects.create(
            pharmacy=self.pharmacy, created_by=self.owner,
            category="FULL_PART_TIME",
            expires_at=timezone.now() + timedelta(days=7),
        )
        base = "/api/v1/membership-invite-links/"
        valid = client_for(self.owner).patch(
            f"{base}{separate.pk}/", {"is_active": False}, format="json",
        )
        self.assertEqual(valid.status_code, 200, valid.data)
        separate.refresh_from_db()
        self.assertFalse(separate.is_active)
        poisoned = client_for(self.owner).patch(
            f"{base}{link.pk}/",
            {"pharmacy": self.foreign_pharmacy.pk}, format="json",
        )
        self.assertIn(poisoned.status_code, (400, 403), poisoned.data)
        link.refresh_from_db()
        self.assertEqual(link.pharmacy_id, self.pharmacy.pk)


class Phase5PollAndInterestScope(TestCase):
    def setUp(self):
        self.owner_a, self.pharmacy_a = make_owner_with_pharmacy("P5 Poll A")
        self.owner_b, self.pharmacy_b = make_owner_with_pharmacy("P5 Poll B")
        self.worker_a, self.m_a = make_staff_member(self.pharmacy_a)
        self.worker_b, self.m_b = make_staff_member(self.pharmacy_b)
        for m in (self.m_a, self.m_b):
            m.employment_type = "FULL_TIME"
            m.save(update_fields=["employment_type"])

    def test_b22_org_poll_feed_must_not_include_private_pharmacy_poll(self):
        org = Organization.objects.create(name="Shared Chain Organisation")
        self.pharmacy_a.organization = org
        self.pharmacy_a.save(update_fields=["organization"])
        self.pharmacy_b.organization = org
        self.pharmacy_b.save(update_fields=["organization"])
        private = PharmacyHubPoll.objects.create(
            pharmacy=self.pharmacy_b, question="P5_SECRET_PHARMACY_POLL",
            created_by=self.worker_b, created_by_membership=self.m_b,
        )
        org_visible = PharmacyHubPoll.objects.create(
            organization=org, question="P5_ORGANISATION_POLL",
            created_by=self.worker_a, created_by_membership=self.m_a,
        )
        response = client_for(self.worker_a).get(
            f"/api/v1/hub/polls/?scope=organization&organization_id={org.pk}"
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertIn(str(org_visible.question), str(response.data))
        self.assertNotIn(str(private.question), str(response.data))
        self.assertNotIn(f"'id': {private.pk}", str(response.data))

    def test_b20_worker_cannot_move_own_interest_to_foreign_shift(self):
        shift_a = Shift.objects.create(
            pharmacy=self.pharmacy_a, created_by=self.owner_a,
            role_needed="ASSISTANT", employment_type="LOCUM",
            min_hourly_rate=45, max_hourly_rate=60,
        )
        shift_b = Shift.objects.create(
            pharmacy=self.pharmacy_b, created_by=self.owner_b,
            role_needed="ASSISTANT", employment_type="LOCUM",
            min_hourly_rate=45, max_hourly_rate=60,
        )
        interest = ShiftInterest.objects.create(
            user=self.worker_a, shift=shift_a,
        )
        url = f"/api/v1/shift-interests/{interest.pk}/"
        allowed = client_for(self.worker_a).get(url)
        self.assertEqual(allowed.status_code, 200, allowed.data)
        changed = client_for(self.worker_a).patch(
            url, {"shift": shift_b.pk}, format="json",
        )
        self.assertIn(changed.status_code, (400, 403), changed.data)
        interest.refresh_from_db()
        self.assertEqual(interest.shift_id, shift_a.pk)


class Phase5CoverRequestTenantBoundary(TestCase):
    def test_b21_manager_cannot_release_foreign_pharmacy_assignment(self):
        from datetime import time
        from django.core.exceptions import PermissionDenied
        from shifts.models import ShiftSlot, ShiftSlotAssignment, WorkerShiftRequest
        from workforce.roster.worker_actions import release_worker_from_assignment

        owner_a, pharmacy_a = make_owner_with_pharmacy("P5 Cover Authority A")
        owner_b, pharmacy_b = make_owner_with_pharmacy("P5 Cover Authority B")
        worker, member_b = make_staff_member(pharmacy_b, role="ASSISTANT")
        member_b.employment_type = "FULL_TIME"
        member_b.save(update_fields=["employment_type"])
        day = timezone.localdate() + timedelta(days=6)
        shift_b = Shift.objects.create(
            pharmacy=pharmacy_b, created_by=owner_b,
            role_needed="ASSISTANT", employment_type="FULL_TIME",
            min_hourly_rate=45, max_hourly_rate=60,
            visibility="FULL_PART_TIME",
        )
        slot_b = ShiftSlot.objects.create(
            shift=shift_b, date=day, start_time=time(9, 0), end_time=time(17, 0),
        )
        assignment_b = ShiftSlotAssignment.objects.create(
            shift=shift_b, slot=slot_b, slot_date=day, user=worker,
        )
        # Legitimate same-pharmacy authority sees and can manage its own
        # request; no production employee or third-party service is contacted.
        local_request = WorkerShiftRequest.objects.create(
            pharmacy=pharmacy_b, requested_by=worker,
            shift=assignment_b, role="ASSISTANT",
            slot_date=day, start_time=time(9, 0), end_time=time(17, 0),
        )
        self.assertEqual(
            client_for(owner_b).get(
                f"/api/v1/worker-shift-requests/{local_request.pk}/"
            ).status_code, 200
        )
        self.assertTrue(ShiftSlotAssignment.objects.filter(pk=assignment_b.pk).exists())

        forged = WorkerShiftRequest.objects.create(
            pharmacy=pharmacy_a, requested_by=worker,
            shift=assignment_b, role="ASSISTANT",
            slot_date=day, start_time=time(9, 0), end_time=time(17, 0),
        )
        with self.assertRaises(PermissionDenied):
            release_worker_from_assignment(forged, manager=owner_a)
        self.assertTrue(
            ShiftSlotAssignment.objects.filter(pk=assignment_b.pk).exists(),
            "Manager for pharmacy A must not release pharmacy B assignment.",
        )


class Phase5OrganizationBoundaryPolicy(TestCase):
    def test_b23_chief_admin_cannot_edit_organization_record(self):
        org = Organization.objects.create(name="Organization authority baseline")
        owner_admin = make_user("OWNER")
        chief_admin = make_user("OTHER_STAFF")
        OrganizationMembership.objects.create(
            user=owner_admin, organization=org, role="ORG_ADMIN",
        )
        OrganizationMembership.objects.create(
            user=chief_admin, organization=org, role="CHIEF_ADMIN",
        )
        url = f"/api/v1/organizations/{org.pk}/"
        legitimate = client_for(owner_admin).patch(
            url, {"name": "Org Admin Renamed It"}, format="json",
        )
        self.assertEqual(legitimate.status_code, 200, legitimate.data)
        org.refresh_from_db()
        self.assertEqual(org.name, "Org Admin Renamed It")
        unprivileged = client_for(chief_admin).patch(
            url, {"name": "Chief Admin Reassigned Organisation"}, format="json",
        )
        self.assertIn(unprivileged.status_code, (403, 404), unprivileged.data)
        org.refresh_from_db()
        self.assertEqual(org.name, "Org Admin Renamed It")


class Phase5MarketplaceExchangeIntegrity(TestCase):
    """B24: distinguish illegal state transitions from invalid seller fixtures.

    The listing policy is mocked only for synthetic seller eligibility at save
    points; ExchangeAction state transitions, versions and DB writes are real.
    """

    def _exchange(self, state="ENQUIRY"):
        from marketplace.models import MarketplaceCategory, MarketplaceListing, MarketplaceExchange
        from types import SimpleNamespace
        seller = make_user("OWNER", is_otp_verified=True, is_mobile_verified=True,
                           mobile_number="0499000191")
        buyer = make_user("OWNER")
        category = MarketplaceCategory.objects.create(
            slug="pr200-fixtures", name="PR200 fixtures",
            context="BOTH", permitted_modes=["SELL"], maximum_buyer_roles=["OWNER"],
        )
        # Synthetic seller has no completed OwnerOnboarding. Seller listing
        # validation runs again on *completion*, not just initial insertion.
        with patch("marketplace.signals.can_list_category",
                   return_value=SimpleNamespace(allowed=True)):
            listing = MarketplaceListing.objects.create(
                creator=seller, seller_context="PERSONAL", category=category,
                mode="SELL", title="PR200 Fixture Bundle",
                slug="pr200-fixture-bundle", description="Synthetic audit fixture",
                condition="Used", amount="250.00", suburb="Brisbane",
                state="QLD", publication_status="PUBLISHED",
            )
        exchange = MarketplaceExchange.objects.create(
            listing=listing, buyer=buyer, state=state,
        )
        return seller, buyer, listing, exchange

    def _confirm_both(self, seller, buyer, exchange):
        from types import SimpleNamespace
        url = f"/api/v1/marketplace/exchanges/{exchange.pk}/confirm-completion/"
        initial_version = exchange.version
        first = client_for(buyer).post(
            url, {"expected_version": initial_version}, format="json",
        )
        exchange.refresh_from_db()
        # Only bypass seller eligibility for the synthetic listing save;
        # do not mock the exchange endpoint or state machine.
        with patch("marketplace.signals.can_list_category",
                   return_value=SimpleNamespace(allowed=True)):
            second = client_for(seller).post(
                url, {"expected_version": exchange.version}, format="json",
            )
        exchange.refresh_from_db()
        return first, second, initial_version

    def test_b24_enquiry_cannot_be_marked_complete_before_terms_acceptance(self):
        from marketplace.models import MarketplaceExchange, MarketplaceListing
        seller, buyer, listing, exchange = self._exchange(
            MarketplaceExchange.State.ENQUIRY,
        )
        self.assertEqual(client_for(buyer).get(
            f"/api/v1/marketplace/exchanges/{exchange.pk}/"
        ).status_code, 200)
        self.assertEqual(client_for(seller).get(
            f"/api/v1/marketplace/exchanges/{exchange.pk}/"
        ).status_code, 200)
        first, second, initial = self._confirm_both(seller, buyer, exchange)
        listing.refresh_from_db()
        self.assertIn(first.status_code, (400, 403, 409))
        self.assertIn(second.status_code, (400, 403, 409))
        self.assertEqual(exchange.version, initial)
        self.assertEqual(exchange.state, MarketplaceExchange.State.ENQUIRY)
        self.assertFalse(exchange.buyer_confirmed)
        self.assertFalse(exchange.seller_confirmed)
        self.assertNotEqual(
            listing.availability_status, MarketplaceListing.Availability.COMPLETED,
        )

    def test_b24_proposed_unaccepted_terms_cannot_be_completed(self):
        from marketplace.models import MarketplaceExchange
        seller, buyer, listing, exchange = self._exchange(
            MarketplaceExchange.State.TERMS_PROPOSED,
        )
        first, second, initial = self._confirm_both(seller, buyer, exchange)
        self.assertIn(first.status_code, (400, 403, 409))
        self.assertIn(second.status_code, (400, 403, 409))
        self.assertEqual(exchange.version, initial)
        self.assertEqual(exchange.state, MarketplaceExchange.State.TERMS_PROPOSED)
        self.assertFalse(exchange.buyer_confirmed)
        self.assertFalse(exchange.seller_confirmed)

    def test_b24_accepted_exchange_completion_is_legitimate_positive_control(self):
        from marketplace.models import MarketplaceExchange, MarketplaceListing
        seller, buyer, listing, exchange = self._exchange(
            MarketplaceExchange.State.ACCEPTED,
        )
        first, second, initial = self._confirm_both(seller, buyer, exchange)
        listing.refresh_from_db()
        self.assertEqual(first.status_code, 200, first.content)
        self.assertEqual(second.status_code, 200, second.content)
        self.assertEqual(exchange.version, initial + 2)
        self.assertTrue(exchange.buyer_confirmed)
        self.assertTrue(exchange.seller_confirmed)
        self.assertEqual(exchange.state, MarketplaceExchange.State.COMPLETED)
        self.assertEqual(
            listing.availability_status, MarketplaceListing.Availability.COMPLETED,
        )

    def test_b24_nonparty_cannot_confirm_even_on_accepted_exchange(self):
        from marketplace.models import MarketplaceExchange
        seller, buyer, listing, exchange = self._exchange(
            MarketplaceExchange.State.ACCEPTED,
        )
        outsider = make_user("OWNER")
        attempt = client_for(outsider).post(
            f"/api/v1/marketplace/exchanges/{exchange.pk}/confirm-completion/",
            {"expected_version": exchange.version}, format="json",
        )
        self.assertEqual(attempt.status_code, 404, attempt.content)
        exchange.refresh_from_db()
        self.assertFalse(exchange.seller_confirmed)
        self.assertFalse(exchange.buyer_confirmed)
