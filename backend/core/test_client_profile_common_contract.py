from decimal import Decimal

from django.test import SimpleTestCase

from client_profile.domains.common import helpers as legacy_helpers
from client_profile.domains.common import labels as legacy_labels
from client_profile.domains.common import serializers as legacy_serializers


class ClientProfileCommonContractTests(SimpleTestCase):
    def test_helper_email_sanitizer_preserves_case_and_removes_hidden_whitespace(self):
        self.assertEqual(
            legacy_helpers.clean_email(" Te\u200bst @Example.COM "),
            "Test@Example.COM",
        )

    def test_serializer_email_normalizer_lowercases_and_strips_edges(self):
        self.assertEqual(
            legacy_serializers.clean_email("  TeSt@Example.COM  "),
            "test@example.com",
        )

    def test_two_q6_contracts_remain_distinct(self):
        helper_value = legacy_helpers.q6("1.23456789")
        serializer_value = legacy_serializers.q6("1.23456789")

        self.assertEqual(helper_value, Decimal("1.234568"))
        self.assertIsInstance(helper_value, Decimal)
        self.assertEqual(serializer_value, 1.234568)
        self.assertIsInstance(serializer_value, float)

    def test_staff_role_labels_keep_existing_values(self):
        self.assertEqual(legacy_labels.other_staff_role_label("INTERN"), "Intern Pharmacist")
        self.assertEqual(legacy_labels.other_staff_role_label("ASSISTANT"), "Pharmacy Assistant")
        self.assertEqual(legacy_labels.user_work_role_label(None), "candidate")

    def test_shared_serializer_contracts_remain_importable(self):
        for name in (
            "verification_fields_changed",
            "_file_has_changed",
            "_delete_file_if_unreferenced",
            "_should_clear_flag",
            "_update_locked_user_fields",
            "RemoveOldFilesMixin",
            "UploadValidationMixin",
            "_build_absolute_media_url",
        ):
            self.assertTrue(hasattr(legacy_serializers, name), name)
