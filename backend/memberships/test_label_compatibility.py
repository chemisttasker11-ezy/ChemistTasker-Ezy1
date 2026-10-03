from django.test import SimpleTestCase

from client_profile.domains.common import labels as legacy_labels
from memberships.labels import membership_role_label


class MembershipLabelCompatibilityTests(SimpleTestCase):
    def test_common_label_reexports_membership_label_contract(self):
        self.assertIs(legacy_labels.membership_role_label, membership_role_label)

    def test_membership_role_labels_keep_existing_display_values(self):
        self.assertEqual(membership_role_label("PHARMACIST"), "Pharmacist")
        self.assertEqual(membership_role_label("INTERN"), "Intern Pharmacist")
        self.assertEqual(membership_role_label("ASSISTANT"), "Pharmacy Assistant")
        self.assertEqual(membership_role_label(""), "")
