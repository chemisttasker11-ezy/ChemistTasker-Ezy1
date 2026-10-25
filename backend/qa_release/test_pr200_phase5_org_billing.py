"""C004-N3/N4 independent billing-scope challenge, no provider calls."""
from datetime import date, timedelta
from django.test import TestCase, override_settings
from django.utils import timezone
from client_profile.characterization_support import make_owner_with_pharmacy, make_user
from organizations.models import Organization
from users.models import OrganizationMembership, User
from billing.models import OwnerSubscription
from billing.utils import (
    BILLING_STATE_PAYMENT_REQUIRED,
    get_billing_state_for_pharmacy, resolve_billing_account,
)
from billing.views import _get_subscription_for_account


@override_settings(BILLING_LIVE_DATE=date(2020, 1, 1), FREE_TRIAL_DAYS=30)
class C004OrganizationBillingContactIsolation(TestCase):
    def setUp(self):
        self.owner, self.pharmacy = make_owner_with_pharmacy("P5 C004 Org Billing")
        self.org = Organization.objects.create(name="P5 C004 Organisation")
        self.pharmacy.organization = self.org
        self.pharmacy.save(update_fields=["organization"])
        self.old_admin = make_user("OWNER")
        self.new_admin = make_user("OWNER")
        for admin in (self.old_admin, self.new_admin):
            OrganizationMembership.objects.create(
                user=admin, organization=self.org, role="ORG_ADMIN",
            )
        past = timezone.now() - timedelta(days=120)
        User.objects.filter(
            pk__in=[self.owner.pk, self.old_admin.pk],
        ).update(date_joined=past)
        self.owner.refresh_from_db()
        self.old_admin.refresh_from_db()

    def test_c004_n3_old_org_admin_trial_expired_positive(self):
        self.assertEqual(
            get_billing_state_for_pharmacy(self.pharmacy, acting_user=self.old_admin),
            BILLING_STATE_PAYMENT_REQUIRED,
        )

    def test_c004_n3_recent_org_admin_cannot_restart_same_org_trial(self):
        self.assertEqual(
            get_billing_state_for_pharmacy(self.pharmacy, acting_user=self.new_admin),
            BILLING_STATE_PAYMENT_REQUIRED,
            "Joining an existing organisation must not restart its billing trial.",
        )

    def test_c004_n4_own_org_subscription_takes_precedence_positive(self):
        owner_sub = OwnerSubscription.objects.create(
            owner=self.owner, stripe_subscription_id="sub_owner_c004",
            status="active",
        )
        org_sub = OwnerSubscription.objects.create(
            organization=self.org, stripe_subscription_id="sub_org_c004",
            status="active",
        )
        account = resolve_billing_account(self.pharmacy, acting_user=self.old_admin)
        self.assertEqual(_get_subscription_for_account(account).pk, org_sub.pk)
        self.assertNotEqual(org_sub.pk, owner_sub.pk)

    def test_c004_n4_owner_personal_subscription_must_not_become_org_subscription(self):
        OwnerSubscription.objects.create(
            owner=self.owner, stripe_subscription_id="sub_owner_only_c004",
            status="active",
        )
        account = resolve_billing_account(self.pharmacy, acting_user=self.old_admin)
        self.assertEqual(account["scope"], "organization")
        self.assertIsNone(
            _get_subscription_for_account(account),
            "An owner personal subscription must not silently grant organisation-wide billing entitlement.",
        )
