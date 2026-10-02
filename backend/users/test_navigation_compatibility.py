from django.test import SimpleTestCase

from client_profile.domains.common import helpers as legacy_helpers
from users.navigation import get_frontend_dashboard_url


class DashboardNavigationCompatibilityTests(SimpleTestCase):
    def test_common_helper_reexports_user_navigation_contract(self):
        self.assertIs(legacy_helpers.get_frontend_dashboard_url, get_frontend_dashboard_url)
