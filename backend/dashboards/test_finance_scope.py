from decimal import Decimal

from django.test import TestCase

from client_profile.characterization_support import client_for, make_owner_with_pharmacy, make_user
from invoicing.models import Invoice
from organizations.models import Organization, PharmacyAdmin
from users.models import OrganizationMembership


class OrganizationDashboardFinanceScopeTests(TestCase):
    def setUp(self):
        self.organization = Organization.objects.create(name="Dashboard Finance Org")
        self.owner, self.pharmacy = make_owner_with_pharmacy("Dashboard Finance Pharmacy")
        self.pharmacy.organization = self.organization
        self.pharmacy.save(update_fields=["organization"])

        Invoice.objects.create(
            user=self.owner,
            pharmacy=self.pharmacy,
            pharmacy_name_snapshot=self.pharmacy.name,
            total=Decimal("275.00"),
            status="sent",
        )

        self.org_admin = make_user("ORG_STAFF")
        OrganizationMembership.objects.create(
            user=self.org_admin,
            organization=self.organization,
            role="ORG_ADMIN",
        )

        self.chief = make_user("ORG_STAFF")
        OrganizationMembership.objects.create(
            user=self.chief,
            organization=self.organization,
            role="CHIEF_ADMIN",
            admin_level="MANAGER",
        )

        self.region = make_user("ORG_STAFF")
        self.region_membership = OrganizationMembership.objects.create(
            user=self.region,
            organization=self.organization,
            role="REGION_ADMIN",
            admin_level="MANAGER",
        )
        self.region_membership.pharmacies.add(self.pharmacy)

        self.url = f"/api/v1/dashboard/organization/{self.organization.id}/"

    def get_dashboard(self, user):
        response = client_for(user).get(
            self.url,
            {"workspace": "internal", "pharmacy_id": self.pharmacy.id},
        )
        self.assertEqual(response.status_code, 200, response.data)
        return response.data

    def test_org_admin_receives_finance_summary(self):
        data = self.get_dashboard(self.org_admin)
        self.assertEqual(data["invoice_summary"]["total_count"], 1)
        self.assertEqual(data["invoice_summary"]["unpaid_count"], 1)
        self.assertEqual(data["invoice_summary"]["total_billed"], "$275.00")

    def test_delegated_org_roles_do_not_receive_finance_totals_or_activity(self):
        for user in (self.chief, self.region):
            with self.subTest(user=user.email):
                data = self.get_dashboard(user)
                self.assertEqual(data["invoice_summary"]["total_count"], 0)
                self.assertEqual(data["invoice_summary"]["unpaid_count"], 0)
                self.assertEqual(data["invoice_summary"]["total_billed"], "$0.00")
                self.assertFalse(any(item.get("kind") == "invoice" for item in data["activity"]))


class DelegatedPharmacyDashboardFinanceScopeTests(TestCase):
    def setUp(self):
        self.owner, self.pharmacy = make_owner_with_pharmacy("Delegated Dashboard Pharmacy")
        Invoice.objects.create(
            user=self.owner,
            pharmacy=self.pharmacy,
            pharmacy_name_snapshot=self.pharmacy.name,
            total=Decimal("125.00"),
            status="sent",
        )
        self.manager = make_user("PHARMACIST")
        PharmacyAdmin.objects.create(
            user=self.manager,
            pharmacy=self.pharmacy,
            admin_level=PharmacyAdmin.AdminLevel.MANAGER,
            is_active=True,
        )
        self.url = "/api/v1/dashboard/owner/"

    def get_dashboard(self, user):
        response = client_for(user).get(
            self.url,
            {"workspace": "internal", "pharmacy_id": self.pharmacy.id},
        )
        self.assertEqual(response.status_code, 200, response.data)
        return response.data

    def test_owner_keeps_finance_summary(self):
        data = self.get_dashboard(self.owner)
        self.assertEqual(data["invoice_summary"]["total_count"], 1)
        self.assertEqual(data["invoice_summary"]["total_billed"], "$125.00")

    def test_delegated_pharmacy_admin_does_not_receive_finance_summary_or_activity(self):
        data = self.get_dashboard(self.manager)
        self.assertEqual(data["invoice_summary"]["total_count"], 0)
        self.assertEqual(data["invoice_summary"]["total_billed"], "$0.00")
        self.assertFalse(any(item.get("kind") == "invoice" for item in data["activity"]))
