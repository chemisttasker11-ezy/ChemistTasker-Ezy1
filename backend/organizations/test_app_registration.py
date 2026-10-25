from fnmatch import fnmatch
from pathlib import Path

from django.apps import apps
from django.test import SimpleTestCase


class OrganizationAppRegistrationTests(SimpleTestCase):
    def test_organizations_is_installed_as_real_django_app(self):
        self.assertEqual(apps.get_app_config("organizations").name, "organizations")

    def test_release_blocker_workflow_covers_tenant_lifecycle_changes(self):
        workflow = Path(__file__).resolve().parents[2] / ".github/workflows/release_blocker_regressions.yml"
        paths = workflow.read_text().split("    paths:\n", 1)[1].split("  workflow_dispatch:", 1)[0]
        patterns = [line.strip().removeprefix('- ').strip('"') for line in paths.splitlines()]
        for changed in ("backend/organizations/views.py", "backend/memberships/views.py",
                        "backend/client_profile/test_admin_invitations.py", "backend/shifts/serialization/shifts.py"):
            with self.subTest(changed=changed):
                self.assertTrue(any(fnmatch(changed, pattern) for pattern in patterns))
