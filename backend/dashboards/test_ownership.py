from django.apps import apps
from django.test import SimpleTestCase

from client_profile.domains.dashboards import views as legacy_views
from dashboards import views


class DashboardReadModelOwnershipTests(SimpleTestCase):
    def test_dashboards_is_installed_as_model_free_application_app(self):
        self.assertEqual(apps.get_app_config("dashboards").name, "dashboards")
        self.assertEqual(list(apps.get_app_config("dashboards").get_models()), [])

    def test_legacy_dashboard_module_reexports_new_implementations(self):
        for name in (
            "OrganizationDashboardView",
            "OwnerDashboard",
            "PharmacistDashboard",
            "OtherStaffDashboard",
            "ExplorerDashboard",
        ):
            self.assertIs(getattr(legacy_views, name), getattr(views, name))

    def test_dashboard_helpers_are_owned_by_read_model_app(self):
        self.assertIs(legacy_views._dashboard_activity, views._dashboard_activity)
        self.assertIs(legacy_views._dashboard_payload_extras, views._dashboard_payload_extras)
