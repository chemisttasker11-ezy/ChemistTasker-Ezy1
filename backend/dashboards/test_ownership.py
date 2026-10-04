from django.apps import apps
from django.test import SimpleTestCase


class DashboardReadModelOwnershipTests(SimpleTestCase):
    def test_dashboards_is_installed_as_model_free_application_app(self):
        self.assertEqual(apps.get_app_config("dashboards").name, "dashboards")
        self.assertEqual(list(apps.get_app_config("dashboards").get_models()), [])
