"""Account selection and response contracts for the subscription helper extraction."""

from datetime import datetime, timezone as dt_timezone
from types import SimpleNamespace
from unittest.mock import patch

from django.db import transaction
from django.test import TestCase, override_settings
from django.urls import reverse

from billing.models import OwnerSubscription
from billing.views import (
    _get_or_create_subscription_for_account,
    _get_subscription_for_account,
    _serialize_subscription,
    _subscription_lookup_from_account,
)
from client_profile.characterization_support import client_for, make_owner_with_pharmacy, make_user
from organizations.models import Organization
from users.models import OrganizationMembership


class SubscriptionAccountContracts(TestCase):
    def setUp(self):
        self.owner, self.pharmacy = make_owner_with_pharmacy("Subscription accounts")
        self.organization = Organization.objects.create(name="Subscription organization")
        self.contact = make_user("ORG_STAFF")
        self.account = {
            "scope": "organization",
            "organization": self.organization,
            "owner_user": self.owner,
            "billing_contact": self.contact,
        }
        self.owner_account = {
            "scope": "owner",
            "organization": None,
            "owner_user": self.owner,
            "billing_contact": self.owner,
        }

    def test_lookup_keeps_organization_precedence_and_owner_fallback(self):
        self.assertEqual(_subscription_lookup_from_account(self.account), {"organization": self.organization})
        self.assertEqual(_subscription_lookup_from_account(self.owner_account), {"owner": self.owner})
        missing_organization = {**self.account, "organization": None}
        self.assertEqual(_subscription_lookup_from_account(missing_organization), {"owner": self.owner})
        with self.assertRaisesMessage(ValueError, "No billing owner found for this pharmacy."):
            _subscription_lookup_from_account({**missing_organization, "owner_user": None})

    def test_organization_reads_prefer_active_primary_then_active_owner(self):
        owner_sub = OwnerSubscription.objects.create(owner=self.owner, status="active")
        self.assertEqual(_get_subscription_for_account(self.account), owner_sub)
        org_sub = OwnerSubscription.objects.create(organization=self.organization)
        for organization_status in ("active", "inactive", "canceled"):
            for owner_status in ("active", "inactive", "canceled"):
                with self.subTest(organization=organization_status, owner=owner_status):
                    org_sub.status = organization_status
                    org_sub.save(update_fields=["status"])
                    owner_sub.status = owner_status
                    owner_sub.save(update_fields=["status"])
                    expected = org_sub if organization_status == "active" or owner_status != "active" else owner_sub
                    self.assertEqual(_get_subscription_for_account(self.account), expected)

    def test_owner_reads_do_not_use_an_unrelated_organization_subscription(self):
        OwnerSubscription.objects.create(organization=self.organization, status="active")
        self.assertIsNone(_get_subscription_for_account(self.owner_account))
        owner_sub = OwnerSubscription.objects.create(owner=self.owner, status="inactive")
        self.assertEqual(_get_subscription_for_account(self.owner_account), owner_sub)

    def test_missing_organization_subscription_and_inactive_owner_return_none(self):
        OwnerSubscription.objects.create(owner=self.owner, status="inactive")
        self.assertIsNone(_get_subscription_for_account(self.account))
        self.assertIsNone(_get_subscription_for_account({**self.account, "owner_user": None}))

    def test_creation_uses_primary_account_even_when_reads_fall_back_to_active_owner(self):
        owner_sub = OwnerSubscription.objects.create(owner=self.owner, status="active", billing_contact=self.owner)
        self.assertEqual(_get_subscription_for_account(self.account), owner_sub)
        created = _get_or_create_subscription_for_account(self.account)
        self.assertEqual(created.organization_id, self.organization.pk)
        self.assertIsNone(created.owner_id)
        self.assertEqual(created.billing_contact_id, self.contact.pk)
        self.assertEqual(created.status, "inactive")
        repeated = _get_or_create_subscription_for_account(self.account)
        self.assertEqual(repeated.pk, created.pk)
        self.assertEqual(OwnerSubscription.objects.count(), 2)
        owner_sub.refresh_from_db()
        self.assertEqual(owner_sub.billing_contact_id, self.owner.pk)

    def test_existing_contact_refresh_preserves_provider_identity_and_entitlement(self):
        sub = OwnerSubscription.objects.create(
            organization=self.organization, billing_contact=self.owner, status="active", staff_count=9,
            stripe_customer_id="cus_primary", stripe_subscription_id="sub_primary",
            stripe_extra_seat_subscription_id="sub_seats",
        )
        original_updated_at = sub.updated_at
        refreshed = _get_or_create_subscription_for_account(self.account)
        self.assertEqual(refreshed.pk, sub.pk)
        sub.refresh_from_db()
        self.assertEqual(sub.billing_contact_id, self.contact.pk)
        self.assertEqual(sub.status, "active")
        self.assertEqual(sub.staff_count, 9)
        self.assertEqual(sub.stripe_customer_id, "cus_primary")
        self.assertEqual(sub.stripe_subscription_id, "sub_primary")
        self.assertEqual(sub.stripe_extra_seat_subscription_id, "sub_seats")
        self.assertEqual(sub.updated_at, original_updated_at)
        _get_or_create_subscription_for_account({**self.account, "billing_contact": None})
        sub.refresh_from_db()
        self.assertEqual(sub.billing_contact_id, self.contact.pk)

    def test_new_account_without_explicit_contact_uses_owner(self):
        sub = _get_or_create_subscription_for_account({**self.owner_account, "billing_contact": None})
        self.assertEqual(sub.owner_id, self.owner.pk)
        self.assertEqual(sub.billing_contact_id, self.owner.pk)

    def test_account_writes_remain_inside_the_callers_transaction(self):
        with self.assertRaisesMessage(RuntimeError, "caller rollback"):
            with transaction.atomic():
                _get_or_create_subscription_for_account(self.account)
                raise RuntimeError("caller rollback")
        self.assertFalse(OwnerSubscription.objects.exists())
        sub = OwnerSubscription.objects.create(organization=self.organization, billing_contact=self.owner)
        with self.assertRaisesMessage(RuntimeError, "caller rollback"):
            with transaction.atomic():
                _get_or_create_subscription_for_account(self.account)
                raise RuntimeError("caller rollback")
        sub.refresh_from_db()
        self.assertEqual(sub.billing_contact_id, self.owner.pk)

    def test_absent_subscription_keeps_the_existing_response_shape(self):
        self.assertEqual(_serialize_subscription(None), {
            "exists": False, "active": False, "status": "inactive", "staffCount": 5,
            "extraSeatCount": 0, "stripeCustomerId": None, "stripeSubscriptionId": None,
            "currentPeriodEnd": None,
        })

    def test_existing_subscription_preserves_counts_identifiers_and_period(self):
        period = datetime(2026, 11, 1, 5, 30, tzinfo=dt_timezone.utc)
        sub = OwnerSubscription(
            owner=self.owner, status="active", stripe_customer_id="cus_serialized",
            stripe_subscription_id="sub_serialized", stripe_extra_seat_subscription_id="sub_seats",
            current_period_end=period,
        )
        for stored, expected in ((None, 5), (0, 5), (-1, 5), (4, 5), (5, 5), (9, 9)):
            with self.subTest(staff_count=stored):
                sub.staff_count = stored
                self.assertEqual(_serialize_subscription(sub), {
                    "exists": True, "active": True, "status": "active", "staffCount": expected,
                    "extraSeatCount": expected - 5, "stripeCustomerId": "cus_serialized",
                    "stripeSubscriptionId": "sub_serialized", "stripeExtraSeatSubscriptionId": "sub_seats",
                    "currentPeriodEnd": "2026-11-01T05:30:00+00:00",
                })
        sub.status = "canceled"
        sub.current_period_end = None
        self.assertFalse(_serialize_subscription(sub)["active"])
        self.assertIsNone(_serialize_subscription(sub)["currentPeriodEnd"])


@override_settings(FRONTEND_BASE_URL="https://billing.example.test/")
class SubscriptionAccountEndpointContracts(TestCase):
    def setUp(self):
        self.owner, self.pharmacy = make_owner_with_pharmacy("Subscription HTTP")
        self.organization = Organization.objects.create(name="Subscription HTTP organization")
        self.pharmacy.organization = self.organization
        self.pharmacy.save(update_fields=["organization"])
        self.org_admin = make_user("ORG_STAFF")
        OrganizationMembership.objects.create(
            user=self.org_admin, organization=self.organization, role="ORG_ADMIN",
        )
        self.chief = make_user("ORG_STAFF")
        OrganizationMembership.objects.create(
            user=self.chief, organization=self.organization, role="CHIEF_ADMIN",
        )
        provider = patch("billing.views.stripe")
        self.provider = provider.start()
        self.addCleanup(provider.stop)
        self.provider.Customer.create.return_value = SimpleNamespace(id="cus_new")
        self.provider.checkout.Session.create.return_value = SimpleNamespace(url="https://checkout.example.test")

    def test_owner_and_org_admin_can_read_correct_subscription_without_writes(self):
        owner_sub = OwnerSubscription.objects.create(owner=self.owner, status="active", staff_count=8)
        org_sub = OwnerSubscription.objects.create(organization=self.organization, status="inactive", staff_count=5)
        url = reverse("api_v1:billing:current_subscription")
        for user in (self.owner, self.org_admin):
            with self.subTest(user=user.pk):
                response = client_for(user).get(url, {"pharmacy_id": self.pharmacy.pk})
                self.assertEqual(response.status_code, 200, response.data)
                self.assertEqual(response.data["staffCount"], 8)
                self.assertEqual(response.data["billingScope"], "organization")
                self.assertEqual(response.data["accountName"], self.organization.name)
        response = client_for(self.owner).get(url)
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["billingScope"], "owner")
        self.assertEqual(response.data["staffCount"], 8)
        self.assertEqual(OwnerSubscription.objects.count(), 2)
        owner_sub.refresh_from_db()
        org_sub.refresh_from_db()
        self.assertEqual(owner_sub.status, "active")
        self.assertEqual(org_sub.status, "inactive")
        self.assertIsNone(org_sub.billing_contact_id)
        self.assertEqual(self.provider.mock_calls, [])

    def test_subscription_reads_keep_action_authority_and_required_context(self):
        url = reverse("api_v1:billing:current_subscription")
        self.assertEqual(client_for(self.chief).get(url, {"pharmacy_id": self.pharmacy.pk}).status_code, 403)
        self.assertEqual(client_for(self.org_admin).get(url).status_code, 400)
        self.assertEqual(client_for(self.org_admin).get(url, {"pharmacy_id": self.pharmacy.pk + 10000}).status_code, 404)
        self.assertFalse(OwnerSubscription.objects.exists())
        self.assertEqual(self.provider.mock_calls, [])

    def test_org_checkout_creates_primary_account_with_unchanged_metadata_and_redirects(self):
        from billing.views import BASE_SUB_PRICE

        owner_sub = OwnerSubscription.objects.create(owner=self.owner, status="active", stripe_customer_id="cus_owner")
        response = client_for(self.org_admin).post(
            reverse("api_v1:billing:subscribe"),
            {"pharmacy_id": self.pharmacy.pk, "platform": "mobile"}, format="json",
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data, {"url": "https://checkout.example.test"})
        org_sub = OwnerSubscription.objects.get(organization=self.organization)
        self.assertEqual(org_sub.billing_contact_id, self.org_admin.pk)
        self.assertEqual(org_sub.stripe_customer_id, "cus_new")
        owner_sub.refresh_from_db()
        self.assertEqual(owner_sub.stripe_customer_id, "cus_owner")
        self.provider.Customer.create.assert_called_once_with(email=self.org_admin.email, name=self.organization.name)
        self.provider.checkout.Session.create.assert_called_once_with(
            customer="cus_new", payment_method_types=["card"],
            line_items=[{"price": BASE_SUB_PRICE, "quantity": 1}], mode="subscription",
            success_url="https://billing.example.test/mobile-checkout-return?path=organization%2Fprofile&checkout=success&billing=1",
            cancel_url="https://billing.example.test/mobile-checkout-return?path=organization%2Fprofile&checkout=cancel&billing=1",
            metadata={
                "billing_scope": "organization", "actor_user_id": self.org_admin.pk, "staff_count": 5,
                "pharmacy_id": self.pharmacy.pk, "owner_user_id": self.owner.pk,
                "organization_id": self.organization.pk, "billing_contact_user_id": self.org_admin.pk,
            },
        )

    def test_unauthorized_checkout_cannot_create_account_or_contact_provider(self):
        response = client_for(self.chief).post(
            reverse("api_v1:billing:subscribe"),
            {"pharmacy_id": self.pharmacy.pk}, format="json",
        )
        self.assertEqual(response.status_code, 403, response.data)
        self.assertFalse(OwnerSubscription.objects.exists())
        self.assertEqual(self.provider.mock_calls, [])
