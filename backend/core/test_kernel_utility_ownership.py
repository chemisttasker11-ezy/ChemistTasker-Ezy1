from decimal import Decimal

from django.test import SimpleTestCase

from core.numbers import coerce_float_6, quantize_decimal_6
from users.normalization import normalize_email, sanitize_email_text
from users.role_labels import other_staff_role_label


class KernelUtilityOwnershipTests(SimpleTestCase):
    def test_shared_helpers_keep_exact_semantics(self):
        self.assertEqual(sanitize_email_text(" Te\u200bst @Example.COM "), "Test@Example.COM")
        self.assertEqual(normalize_email("  TeSt@Example.COM  "), "test@example.com")
        self.assertEqual(quantize_decimal_6("1.23456789"), Decimal("1.234568"))
        self.assertEqual(coerce_float_6("1.23456789"), 1.234568)

    def test_role_label_is_owned_by_users(self):
        self.assertEqual(other_staff_role_label("INTERN"), "Intern Pharmacist")
