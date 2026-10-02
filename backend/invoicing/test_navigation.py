from types import SimpleNamespace

from django.test import SimpleTestCase

from invoicing.navigation import invoice_action_url
from client_profile.domains.dashboards.views import _dashboard_invoice_action_url


class InvoiceNavigationContractTests(SimpleTestCase):
    def test_role_destinations_match_legacy_dashboard_contract(self):
        invoice = SimpleNamespace(id=42, pharmacy_id=7)
        expected = {
            "pharmacist": "/dashboard/pharmacist/invoice/42",
            "otherstaff": "/dashboard/otherstaff/invoice/42",
            "organization": "/dashboard/organization/invoice/42",
            "owner": "/dashboard/owner/invoice/42",
            "admin": "/dashboard/admin/7/invoice/42",
            None: "",
            "unknown": "",
        }
        for role, url in expected.items():
            self.assertEqual(invoice_action_url(invoice, role), url)
            self.assertEqual(_dashboard_invoice_action_url(invoice, role), url)

    def test_empty_invoice_and_admin_without_pharmacy_are_stable(self):
        self.assertEqual(invoice_action_url(None, "owner"), "")
        self.assertEqual(invoice_action_url(SimpleNamespace(id=42, pharmacy_id=None), "admin"), "")
