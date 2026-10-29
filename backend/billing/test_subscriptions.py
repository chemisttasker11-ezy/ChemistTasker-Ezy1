from django.test import TestCase
from django.utils import timezone

from billing.models import OwnerSubscription
from billing.subscriptions import (
    build_extra_seat_metadata,
    build_subscription_metadata,
    get_or_create_subscription_for_account,
    get_subscription_for_account,
    get_subscription_from_customer,
    get_subscription_from_metadata,
    serialize_subscription,
    subscription_lookup_from_account,
)
from client_profile.characterization_support import make_owner_with_pharmacy, make_user
from organizations.models import Organization


class SubscriptionAccountOperationsTests(TestCase):
    def setUp(self):
        self.owner, self.pharmacy = make_owner_with_pharmacy("Subscription helper pharmacy")
        self.contact = make_user("ORG_STAFF")
        self.organization = Organization.objects.create(name="Subscription helper org")

    def owner_account(self, **overrides):
        account = {
            "scope": "owner",
            "organization": None,
            "owner_user": self.owner,
            "billing_contact": self.owner,
        }
        account.update(overrides)
        return account

    def organization_account(self, **overrides):
        account = {
            "scope": "organization",
            "organization": self.organization,
            "owner_user": self.owner,
            "billing_contact": self.contact,
        }
        account.update(overrides)
        return account

    def test_lookup_keeps_owner_and_organization_boundaries_distinct(self):
        self.assertEqual(subscription_lookup_from_account(self.owner_account()), {"owner": self.owner})
        self.assertEqual(
            subscription_lookup_from_account(self.organization_account()),
            {"organization": self.organization},
        )
        with self.assertRaisesMessage(ValueError, "No billing owner found"):
            subscription_lookup_from_account(self.owner_account(owner_user=None))

    def test_organization_active_subscription_wins_and_active_owner_is_legacy_fallback(self):
        org_sub = OwnerSubscription.objects.create(
            organization=self.organization,
            billing_contact=self.contact,
            status="active",
        )
        owner_sub = OwnerSubscription.objects.create(owner=self.owner, status="active")
        self.assertEqual(get_subscription_for_account(self.organization_account()), org_sub)

        org_sub.status = "inactive"
        org_sub.save(update_fields=["status"])
        self.assertEqual(get_subscription_for_account(self.organization_account()), owner_sub)

        owner_sub.status = "inactive"
        owner_sub.save(update_fields=["status"])
        self.assertEqual(get_subscription_for_account(self.organization_account()), org_sub)

    def test_get_or_create_preserves_scope_and_refreshes_billing_contact(self):
        account = self.organization_account()
        subscription = get_or_create_subscription_for_account(account)
        self.assertEqual(subscription.organization, self.organization)
        self.assertIsNone(subscription.owner_id)
        self.assertEqual(subscription.billing_contact, self.contact)

        replacement = make_user("ORG_STAFF")
        account["billing_contact"] = replacement
        same = get_or_create_subscription_for_account(account)
        self.assertEqual(same.pk, subscription.pk)
        self.assertEqual(same.billing_contact, replacement)

    def test_metadata_contract_and_extra_seat_clamping_are_unchanged(self):
        account = self.organization_account()
        metadata = build_subscription_metadata(
            account,
            actor_user=self.contact,
            staff_count=9,
            pharmacy=self.pharmacy,
        )
        self.assertEqual(metadata, {
            "billing_scope": "organization",
            "actor_user_id": self.contact.id,
            "staff_count": 9,
            "pharmacy_id": self.pharmacy.id,
            "owner_user_id": self.owner.id,
            "organization_id": self.organization.id,
            "billing_contact_user_id": self.contact.id,
        })
        extra = build_extra_seat_metadata(
            account,
            actor_user=self.contact,
            extra_seat_count=-3,
            pharmacy=self.pharmacy,
        )
        self.assertEqual(extra["staff_count"], 5)
        self.assertEqual(extra["extra_seat_count"], 0)
        self.assertEqual(extra["subscription_kind"], "extra_seats")

    def test_provider_identity_resolution_preserves_metadata_precedence(self):
        owner_sub = OwnerSubscription.objects.create(
            owner=self.owner,
            stripe_customer_id="cus_owner",
        )
        org_sub = OwnerSubscription.objects.create(
            organization=self.organization,
            stripe_customer_id="cus_org",
        )
        metadata = {
            "organization_id": self.organization.id,
            "owner_user_id": self.owner.id,
            "actor_user_id": self.owner.id,
        }
        self.assertEqual(get_subscription_from_metadata(metadata), org_sub)
        self.assertEqual(get_subscription_from_metadata({"owner_user_id": self.owner.id}), owner_sub)
        self.assertEqual(get_subscription_from_metadata({"actor_user_id": self.owner.id}), owner_sub)
        self.assertIsNone(get_subscription_from_metadata({}))
        self.assertEqual(get_subscription_from_customer("cus_org"), org_sub)
        self.assertIsNone(get_subscription_from_customer(None))

    def test_serialization_preserves_api_shape_and_minimum_seat_count(self):
        empty = serialize_subscription(None)
        self.assertEqual(empty, {
            "exists": False,
            "active": False,
            "status": "inactive",
            "staffCount": 5,
            "extraSeatCount": 0,
            "stripeCustomerId": None,
            "stripeSubscriptionId": None,
            "currentPeriodEnd": None,
        })

        period_end = timezone.now()
        subscription = OwnerSubscription.objects.create(
            owner=self.owner,
            status="active",
            staff_count=2,
            stripe_customer_id="cus_serialized",
            stripe_subscription_id="sub_serialized",
            stripe_extra_seat_subscription_id="sub_extra_serialized",
            current_period_end=period_end,
        )
        self.assertEqual(serialize_subscription(subscription), {
            "exists": True,
            "active": True,
            "status": "active",
            "staffCount": 5,
            "extraSeatCount": 0,
            "stripeCustomerId": "cus_serialized",
            "stripeSubscriptionId": "sub_serialized",
            "stripeExtraSeatSubscriptionId": "sub_extra_serialized",
            "currentPeriodEnd": period_end.isoformat(),
        })
