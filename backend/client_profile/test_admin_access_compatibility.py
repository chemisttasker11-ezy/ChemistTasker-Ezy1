from django.test import SimpleTestCase

import client_profile.admin_helpers as legacy
from client_profile.domains.orgs import access


class OrganizationAdminAccessCompatibilityTests(SimpleTestCase):
    def test_legacy_admin_helpers_reexport_domain_interface(self):
        exported = [
            "admin_assignments_for",
            "pharmacies_user_admins",
            "assignment_for",
            "is_admin_of",
            "has_admin_capability",
            "is_owner_admin",
            "is_any_admin",
            "can_manage_admins",
            "can_manage_roster",
            "can_manage_staff",
            "can_manage_comms",
        ]
        for name in exported:
            self.assertIs(getattr(legacy, name), getattr(access, name))
