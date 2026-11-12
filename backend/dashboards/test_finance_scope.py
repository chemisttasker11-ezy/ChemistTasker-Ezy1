from datetime import date, time, timedelta
from decimal import Decimal
from uuid import uuid4

from django.test import TestCase

from client_profile.characterization_support import client_for, make_owner_with_pharmacy, make_user
from invoicing.models import Invoice
from organizations.models import Organization, PharmacyAdmin
from shifts.models import Shift, ShiftSlot
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

    def test_org_admin_summary_skips_a_worker_draft_never_sent(self):
        Invoice.objects.create(user=make_user("PHARMACIST"), pharmacy=self.pharmacy, source="internal",
                               request_key=uuid4(), total=Decimal("999.00"), status="draft")
        data = self.get_dashboard(self.org_admin)
        self.assertEqual(data["invoice_summary"]["total_count"], 1)
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

    def test_owner_summary_and_activity_skip_a_worker_draft_never_sent(self):
        Invoice.objects.create(
            user=make_user("PHARMACIST"),
            pharmacy=self.pharmacy,
            pharmacy_name_snapshot=self.pharmacy.name,
            source="internal",
            request_key=uuid4(),
            total=Decimal("999.00"),
            status="draft",
        )
        data = self.get_dashboard(self.owner)
        self.assertEqual(data["invoice_summary"]["total_count"], 1)
        self.assertEqual(data["invoice_summary"]["total_billed"], "$125.00")
        self.assertFalse(any("999" in str(item.get("description")) for item in data["activity"]))

    def test_delegated_pharmacy_admin_does_not_receive_finance_summary_or_activity(self):
        data = self.get_dashboard(self.manager)
        self.assertEqual(data["invoice_summary"]["total_count"], 0)
        self.assertEqual(data["invoice_summary"]["total_billed"], "$0.00")
        self.assertFalse(any(item.get("kind") == "invoice" for item in data["activity"]))


class OwnerDashboardOperationalScopeTests(TestCase):
    def test_workspace_calendar_includes_shifts_posted_by_another_user(self):
        owner, pharmacy = make_owner_with_pharmacy("Shared roster reporting")
        staff = make_user("PHARMACIST")
        future = date.today() + timedelta(days=4)
        for creator in (owner, staff):
            shift = Shift.objects.create(
                pharmacy=pharmacy,
                created_by=creator,
                role_needed="PHARMACIST",
                employment_type="LOCUM",
                visibility="PLATFORM",
                rate_type="FLEXIBLE",
            )
            ShiftSlot.objects.create(shift=shift, date=future, start_time=time(9), end_time=time(17))
        response = client_for(owner).get("/api/v1/dashboard/owner/", {"workspace": "internal", "pharmacy_id": pharmacy.id})
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["upcoming_stats"]["week"], 1)
        self.assertEqual(response.data["workspace_upcoming_stats"]["week"], 2)
        self.assertEqual(response.data["shift_summary"]["upcoming_confirmed_count"], 0)


class ExplorerDashboardFinanceTests(TestCase):
    def setUp(self):
        self.user = make_user("PHARMACIST")
        Invoice.objects.create(user=self.user, total=Decimal("321.00"), status="sent")
        self.organization = Organization.objects.create(name="Explorer finance org")
        owner, pharmacy = make_owner_with_pharmacy("Explorer finance pharmacy")
        pharmacy.organization = self.organization
        pharmacy.save(update_fields=["organization"])
        Invoice.objects.create(user=owner, pharmacy=pharmacy, total=Decimal("456.00"), status="sent")
        OrganizationMembership.objects.create(user=self.user, organization=self.organization, role="ORG_ADMIN")

    def assert_no_finance(self, response):
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["invoice_summary"]["total_count"], 0)
        self.assertEqual(response.data["bills_summary"]["total_billed"], "$0.00")
        self.assertFalse(any(item.get("kind") == "invoice" for item in response.data["activity"]))
        self.assertIn("shift_summary", response.data)

    def test_historical_invoice_is_hidden_from_owner_dashboard(self):
        self.user.role = "EXPLORER"
        self.user.save(update_fields=["role"])
        self.assert_no_finance(client_for(self.user).get("/api/v1/dashboard/owner/", {"workspace": "platform"}))

    def test_org_admin_explorer_gets_no_finance_in_either_workspace(self):
        self.user.role = "EXPLORER"
        self.user.save(update_fields=["role"])
        for workspace in ("internal", "platform"):
            with self.subTest(workspace=workspace):
                self.assert_no_finance(client_for(self.user).get(
                    f"/api/v1/dashboard/organization/{self.organization.id}/", {"workspace": workspace}))

    def test_pharmacist_keeps_platform_invoice(self):
        response = client_for(self.user).get("/api/v1/dashboard/pharmacist/", {"workspace": "platform"})
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["invoice_summary"]["total_billed"], "$321.00")
        self.assertTrue(any(item.get("kind") == "invoice" for item in response.data["activity"]))

    def test_explorer_cannot_use_worker_dashboard_to_read_invoice(self):
        self.user.role = "EXPLORER"
        self.user.save(update_fields=["role"])
        for path in ("pharmacist", "otherstaff"):
            with self.subTest(path=path):
                response = client_for(self.user).get(f"/api/v1/dashboard/{path}/", {"workspace": "platform"})
                self.assertEqual(response.status_code, 403)
