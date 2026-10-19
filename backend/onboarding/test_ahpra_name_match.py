"""Owner-approved AHPRA name matching rule."""
from django.test import SimpleTestCase

from onboarding.verification.ahpra import ahpra_name_match, evaluate_ahpra_record


class AhpraNameMatchTests(SimpleTestCase):
    CASES = [
        ("Mr Eslam Ahmed Abdelmonaam Abas", " eslam ", "Abas", True),
        ("Mr Eslam Ahmed Abdelmonaam Abas", "Eslam Ahmed", "Abas", True),
        ("Mr Eslam Ahmed Abdelmonaam Abas", "Eslam", "Ahmed", False),
        ("Mr Omar Abdel-Gawad", "Omar", "Gawad", True),
        ("Mr Omar Abdel-Gawad", "Omar", "Abdel", True),
        ("Mr Omar Abdel-Gawad", "Omar", "Abdel Gawad", True),
        ("Mr Omar Abdel-Gawad", "Omar", "Abdel-Gawad", True),
        ("Mr Omar Abdel–Gawad", "Omar", "AbdelGawad", True),
        ("Ms Siobhan O'Brien", "Siobhan", "OBrien", True),
        ("Ms Siobhan O’Brien", "Siobhan", "O Brien", True),
        ("Mrs Basma Ahmed Soliman Ahmed", "Basma", "Soliman Ahmed", True),
        ("Mrs Basma Ahmed Soliman Ahmed", "Bassma", "Ahmed", False),
        ("Mr Omar Abdel Gawad", "Omar", "Abdel", True),
        ("Dr Zoé Martin", "Zoe", "MARTIN", True),
        ("Mr Omar Abdel Gawad", "", "Gawad", False),
        ("Mr Omar Abdel Gawad", "Omar", "   ", False),
        ("Mr Omar Abdel Gawad", None, None, False),
        ("", "Omar", "Gawad", False),
        ("Mr Omar", "Omar", "Omar", False),
    ]

    def test_rule_table(self):
        for register, first, last, expected in self.CASES:
            with self.subTest(register=register, first=first, last=last):
                self.assertIs(ahpra_name_match(register, first, last), expected)

    def test_evaluate_sends_mismatch_to_review(self):
        record = {"practitioner_name": "Mr Eslam Ahmed Abdelmonaam Abas"}
        outcome, note = evaluate_ahpra_record(record, first_name="Eslam", last_name="Ahmed", role="pharmacist")
        self.assertEqual(outcome, "review")
        self.assertIn("Name mismatch", note)
