import json
import tempfile
from io import StringIO
from pathlib import Path
from unittest.mock import patch

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase, override_settings

from onboarding.models import AhpraCheck, AhpraRegistration, OtherStaffOnboarding, PharmacistOnboarding


class AhpraE2ETests(TestCase):
    def run_command(self, *args):
        output = StringIO()
        call_command("ahpra_e2e", *args, stdout=output)
        return output.getvalue()

    def test_guard_refuses_non_e2e_settings_before_database_access(self):
        with self.assertNumQueries(0), self.assertRaises(CommandError):
            self.run_command("reset")

    @override_settings(SETTINGS_MODULE="core.ahpra_e2e_settings")
    def test_guard_refuses_non_sqlite_database(self):
        databases = {"default": {"ENGINE": "django.db.backends.postgresql"}}
        with patch.dict(settings.DATABASES, databases), self.assertNumQueries(0), self.assertRaises(CommandError):
            self.run_command("reset")

    @override_settings(SETTINGS_MODULE="core.ahpra_e2e_settings")
    @patch("onboarding.management.commands.ahpra_e2e.verify_ahpra_task")
    def test_seed_report_reset_and_duplicate_ownership(self, verify):
        # Synthetic identities and numbers only; real case files stay outside the repo.
        cases = [dict(first_name="Fixture", last_name="Pharmacist", role="pharmacist", registration_number="PHA0000000001"),
                 dict(first_name="Fixture", last_name="Intern", role="intern", registration_number="PHA0000000002")]

        def queue(model_name, pk, number, *args):
            AhpraCheck.objects.create(model_name=model_name, object_pk=pk, registration_number=number,
                                      reason="onboarding", status="done", outcome="review",
                                      register_data={"supervised_practice": True})

        verify.side_effect = queue
        outsider = get_user_model().objects.create_user(email="untouched@example.test", role="PHARMACIST")
        outside_profile = PharmacistOnboarding.objects.create(user=outsider)
        outside_check = AhpraCheck.objects.create(model_name="PharmacistOnboarding", object_pk=outside_profile.pk,
                                                  registration_number="PHA0000000003", reason="onboarding")
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "cases.json"
            path.write_text(json.dumps(cases + [cases[0]]), encoding="utf-8")
            output = self.run_command("seed", "--cases", str(path))
        self.assertIn("Case 3: skipped", output)
        self.assertEqual(verify.call_count, 2)
        pharmacist = PharmacistOnboarding.objects.get(user__email="ahpra-e2e-1@example.invalid")
        intern = OtherStaffOnboarding.objects.get(user__email="ahpra-e2e-2@example.invalid")
        self.assertEqual(intern.role_type, "INTERN")
        self.assertEqual(intern.user.role, "OTHER_STAFF")
        self.assertEqual(intern.ahpra_number, cases[1]["registration_number"])
        verify.assert_any_call("PharmacistOnboarding", pharmacist.pk, cases[0]["registration_number"],
                               "Fixture", "Pharmacist", pharmacist.user.email)
        self.assertEqual(AhpraRegistration.objects.count(), 2)
        self.assertEqual(get_user_model().objects.filter(email__endswith="@example.invalid").count(), 2)
        pharmacist.ahpra_verification_note = "x" * 120
        pharmacist.save(update_fields=["ahpra_verification_note"])
        report = self.run_command("report")
        self.assertIn("Fixture Intern\tintern\tdone\treview\tFalse", report)
        self.assertIn("x" * 100 + "\tTrue", report)
        self.assertNotIn("x" * 101, report)
        self.run_command("reset")
        self.assertFalse(OtherStaffOnboarding.objects.exists())
        self.assertEqual(list(PharmacistOnboarding.objects.values_list("pk", flat=True)), [outside_profile.pk])
        self.assertEqual(list(AhpraCheck.objects.values_list("pk", flat=True)), [outside_check.pk])
        self.assertFalse(AhpraRegistration.objects.exists())
        self.assertEqual(list(get_user_model().objects.values_list("pk", flat=True)), [outsider.pk])

    @override_settings(SETTINGS_MODULE="core.ahpra_e2e_settings")
    @patch("onboarding.management.commands.ahpra_e2e.verify_ahpra_task")
    def test_invalid_cases_fail_before_creating_users(self, verify):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "cases.json"
            path.write_text('[{"role": "owner"}]', encoding="utf-8")
            with self.assertRaises(CommandError):
                self.run_command("seed", "--cases", str(path))
        self.assertFalse(get_user_model().objects.exists())
        verify.assert_not_called()
