"""The shared helper contracts the client_profile views once reached through a common module, on their owners."""
from decimal import Decimal

from django.test import SimpleTestCase

from core import serializer_lifecycle, serializer_mixins
from core.numbers import coerce_float_6, quantize_decimal_6
from users import presentation
from users.normalization import normalize_email, sanitize_email_text
from users.role_labels import other_staff_role_label, user_work_role_label


class ClientProfileCommonContractTests(SimpleTestCase):
    def test_helper_email_sanitizer_preserves_case_and_removes_hidden_whitespace(self):
        self.assertEqual(
            sanitize_email_text(" Te\u200bst @Example.COM "),
            "Test@Example.COM",
        )

    def test_serializer_email_normalizer_lowercases_and_strips_edges(self):
        self.assertEqual(
            normalize_email("  TeSt@Example.COM  "),
            "test@example.com",
        )

    def test_two_q6_contracts_remain_distinct(self):
        helper_value = quantize_decimal_6("1.23456789")
        serializer_value = coerce_float_6("1.23456789")

        self.assertEqual(helper_value, Decimal("1.234568"))
        self.assertIsInstance(helper_value, Decimal)
        self.assertEqual(serializer_value, 1.234568)
        self.assertIsInstance(serializer_value, float)

    def test_staff_role_labels_keep_existing_values(self):
        self.assertEqual(other_staff_role_label("INTERN"), "Intern Pharmacist")
        self.assertEqual(other_staff_role_label("ASSISTANT"), "Pharmacy Assistant")
        self.assertEqual(user_work_role_label(None), "candidate")

    def test_shared_serializer_contracts_remain_importable(self):
        for module, name in (
            (serializer_lifecycle, "verification_fields_changed"),
            (serializer_lifecycle, "_file_has_changed"),
            (serializer_lifecycle, "_delete_file_if_unreferenced"),
            (serializer_lifecycle, "_should_clear_flag"),
            (serializer_lifecycle, "_update_locked_user_fields"),
            (serializer_lifecycle, "RemoveOldFilesMixin"),
            (serializer_mixins, "UploadValidationMixin"),
            (presentation, "_build_absolute_media_url"),
        ):
            self.assertTrue(hasattr(module, name), name)
