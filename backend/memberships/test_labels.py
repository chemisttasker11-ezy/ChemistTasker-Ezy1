from django.test import SimpleTestCase

from memberships.labels import membership_role_label


class MembershipLabelTests(SimpleTestCase):
    def test_membership_role_labels_keep_existing_display_values(self):
        self.assertEqual(membership_role_label("PHARMACIST"), "Pharmacist")
        self.assertEqual(membership_role_label("INTERN"), "Intern Pharmacist")
        self.assertEqual(membership_role_label("ASSISTANT"), "Pharmacy Assistant")
        self.assertEqual(membership_role_label(""), "")
