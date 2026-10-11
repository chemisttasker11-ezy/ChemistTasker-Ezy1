"""Canonical capability identity and matching guardrails for future recommendation scoring."""
from django.test import SimpleTestCase
from rest_framework.exceptions import ValidationError

from onboarding.services.skill_identity import (
    canonical_skill, evaluate_match, normalize_skills, registry,
)


class SkillIdentityTests(SimpleTestCase):
    def test_registry_has_unique_nonempty_capability_definitions(self):
        skills = registry()["skills"]
        self.assertEqual(len(skills), 70)
        self.assertEqual(len({skill["code"] for skill in skills}), 70)
        for skill in skills:
            self.assertGreater(len(skill["definition"]), 24)
            self.assertIn("PHARMACIST", skill["eligibility"])
            self.assertIn("STUDENT", skill["eligibility"])

    def test_legacy_labels_and_aliases_are_same_identity(self):
        self.assertEqual(canonical_skill("DAA"), "WEBSTER_PACKING_DAA")
        self.assertEqual(canonical_skill("Webster packing"), "WEBSTER_PACKING_DAA")
        self.assertEqual(canonical_skill("vacciNATOR"), "VACCINATION")
        self.assertEqual(
            canonical_skill("Dose administration aid (DAA/Webster) packing"),
            "WEBSTER_PACKING_DAA",
        )

    def test_missing_licence_cannot_be_fabricated_as_known_skill(self):
        with self.assertRaises(ValidationError):
            normalize_skills(["Unlicensed random skill"], strict=True)
        with self.assertRaises(ValidationError):
            normalize_skills(["DAA_FINAL_CHECK"], strict=True, allowed_role="TECHNICIAN")

    def test_unknown_requirement_prevents_false_positive(self):
        result = evaluate_match(["DAA", "something unknown"], ["FRED"], ["WEBSTER_PACKING_DAA", "FRED"])
        self.assertFalse(result["matches_required"])
        self.assertEqual(result["unknown_required"], ["something unknown"])
        self.assertEqual(result["matched_preferred"], ["FRED"])

    def test_final_check_not_same_as_packing(self):
        result = evaluate_match(["DAA_FINAL_CHECK"], [], ["WEBSTER_PACKING_DAA"])
        self.assertFalse(result["matches_required"])
        self.assertEqual(result["missing_required"], ["DAA_FINAL_CHECK"])
