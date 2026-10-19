"""Tests for AHPRA verification core: number formatting, evaluation, retry/skip rules, roles, and HTML parsing."""
import datetime
import os
import tempfile
from unittest import mock

from django.test import TestCase

from client_profile.characterization_support import make_user
from onboarding.models import OtherStaffOnboarding, PharmacistOnboarding
from onboarding.tasks import verify_ahpra_task
from onboarding.verification.ahpra import (
    evaluate_ahpra_record,
    parse_ahpra_html,
)
from onboarding.verification.ahpra_numbers import full_registration_number


class AhpraNumberFormatTests(TestCase):
    def test_full_registration_number_valid_cases(self):
        # PHA + 10 digits
        self.assertEqual(full_registration_number("PHA0001234567"), "PHA0001234567")
        # 7-10 digits: left-padded with zeros to 10 digits
        self.assertEqual(full_registration_number("1234567"), "PHA0001234567")
        self.assertEqual(full_registration_number("12345678"), "PHA0012345678")
        self.assertEqual(full_registration_number("123456789"), "PHA0123456789")
        self.assertEqual(full_registration_number("0001234567"), "PHA0001234567")
        self.assertEqual(full_registration_number("1234567890"), "PHA1234567890")
        # Spaces, dashes, lowercase
        self.assertEqual(full_registration_number("pha 000-1234567"), "PHA0001234567")
        self.assertEqual(full_registration_number("PHA-000-123-4567"), "PHA0001234567")
        self.assertEqual(full_registration_number("  123-4567  "), "PHA0001234567")

    def test_full_registration_number_invalid_cases(self):
        # PHA with fewer than 10 digits
        self.assertIsNone(full_registration_number("PHA1234567"))
        # Fewer than 7 digits
        self.assertIsNone(full_registration_number("123456"))
        self.assertIsNone(full_registration_number("1"))
        # More than 10 digits
        self.assertIsNone(full_registration_number("12345678901"))
        # PHA with more than 10 digits
        self.assertIsNone(full_registration_number("PHA00012345678"))
        # Wrong prefix
        self.assertIsNone(full_registration_number("MED0001234567"))
        # Empty, None, whitespace, non-numeric
        self.assertIsNone(full_registration_number(""))
        self.assertIsNone(full_registration_number(None))
        self.assertIsNone(full_registration_number("   "))
        self.assertIsNone(full_registration_number("invalid-pha"))


class EvaluateAhpraRecordTests(TestCase):
    def base_record(self, **overrides):
        record = {
            "practitioner_name": "Jane Doe",
            "profession": "Pharmacist",
            "registration_type": "General",
            "registration_status": "Registered",
            "expiry_date": "30/11/2099",
            "conditions": False,
            "undertakings": False,
            "reprimands": False,
        }
        record.update(overrides)
        return record

    def test_name_mismatch_returns_review(self):
        record = self.base_record()
        outcome, note = evaluate_ahpra_record(
            record, first_name="John", last_name="Smith", role="pharmacist"
        )
        self.assertEqual(outcome, "review")
        self.assertIn("Name mismatch", note)

    def test_profession_present_and_not_pharmacy_returns_rejected(self):
        record = self.base_record(profession="Medical Practitioner")
        outcome, note = evaluate_ahpra_record(
            record, first_name="Jane", last_name="Doe", role="pharmacist"
        )
        self.assertEqual(outcome, "rejected")
        self.assertIn("Profession", note)

        # But pharmacy or pharmacist is accepted
        record_pharmacy = self.base_record(profession="Pharmacy")
        outcome, _ = evaluate_ahpra_record(
            record_pharmacy, first_name="Jane", last_name="Doe", role="pharmacist"
        )
        self.assertEqual(outcome, "verified")

        # Missing profession is accepted
        record_none = self.base_record(profession="")
        outcome, _ = evaluate_ahpra_record(
            record_none, first_name="Jane", last_name="Doe", role="pharmacist"
        )
        self.assertEqual(outcome, "verified")

    def test_status_suspended_cancelled_surrendered_not_registered_returns_rejected(self):
        for bad_status in ("Suspended", "Cancelled", "Surrendered", "Not registered"):
            record = self.base_record(registration_status=bad_status)
            outcome, note = evaluate_ahpra_record(
                record, first_name="Jane", last_name="Doe", role="pharmacist"
            )
            self.assertEqual(outcome, "rejected", f"Expected rejected for status {bad_status}")
            self.assertIn(bad_status.lower(), note.lower())

    def test_status_other_non_registered_returns_review(self):
        record = self.base_record(registration_status="Expired")
        outcome, note = evaluate_ahpra_record(
            record, first_name="Jane", last_name="Doe", role="pharmacist"
        )
        self.assertEqual(outcome, "review")

    def test_role_pharmacist_branches(self):
        # Pharmacist must have General
        record_gen = self.base_record(registration_type="General")
        outcome, _ = evaluate_ahpra_record(
            record_gen, first_name="Jane", last_name="Doe", role="pharmacist"
        )
        self.assertEqual(outcome, "verified")

        # Pharmacist with Provisional -> review
        record_prov = self.base_record(registration_type="Provisional")
        outcome, note = evaluate_ahpra_record(
            record_prov, first_name="Jane", last_name="Doe", role="pharmacist"
        )
        self.assertEqual(outcome, "review")
        self.assertIn("General", note)

        # Pharmacist with Limited/other -> review
        record_ltd = self.base_record(registration_type="Limited")
        outcome, _ = evaluate_ahpra_record(
            record_ltd, first_name="Jane", last_name="Doe", role="pharmacist"
        )
        self.assertEqual(outcome, "review")

    def test_role_intern_branches(self):
        # Intern with Provisional -> verified
        record_prov = self.base_record(registration_type="Provisional")
        outcome, _ = evaluate_ahpra_record(
            record_prov, first_name="Jane", last_name="Doe", role="intern"
        )
        self.assertEqual(outcome, "verified")

        # Intern with General -> verified
        record_gen = self.base_record(registration_type="General")
        outcome, _ = evaluate_ahpra_record(
            record_gen, first_name="Jane", last_name="Doe", role="intern"
        )
        self.assertEqual(outcome, "verified")

        # Intern with Limited/other -> review
        record_other = self.base_record(registration_type="Non-practising")
        outcome, note = evaluate_ahpra_record(
            record_other, first_name="Jane", last_name="Doe", role="intern"
        )
        self.assertEqual(outcome, "review")
        self.assertIn("Provisional", note)

    def test_other_role_returns_review(self):
        record = self.base_record(registration_type="General")
        outcome, _ = evaluate_ahpra_record(
            record, first_name="Jane", last_name="Doe", role="assistant"
        )
        self.assertEqual(outcome, "review")

    def test_conditions_undertakings_reprimands_return_review(self):
        for flag in ("conditions", "undertakings", "reprimands"):
            record = self.base_record(**{flag: True})
            outcome, note = evaluate_ahpra_record(
                record, first_name="Jane", last_name="Doe", role="pharmacist"
            )
            self.assertEqual(outcome, "review", f"Expected review for {flag}")
            self.assertIn(flag, note)

    def test_expiry_date_in_past_returns_review(self):
        record_past_str = self.base_record(expiry_date="01/01/2020")
        outcome, note = evaluate_ahpra_record(
            record_past_str, first_name="Jane", last_name="Doe", role="pharmacist"
        )
        self.assertEqual(outcome, "review")
        self.assertIn("expired", note.lower())

        record_past_date = self.base_record(expiry_date=datetime.date(2020, 1, 1))
        outcome, note = evaluate_ahpra_record(
            record_past_date, first_name="Jane", last_name="Doe", role="pharmacist"
        )
        self.assertEqual(outcome, "review")
        self.assertIn("expired", note.lower())

    def test_everything_fine_returns_verified(self):
        record = self.base_record()
        outcome, note = evaluate_ahpra_record(
            record, first_name="Jane", last_name="Doe", role="pharmacist"
        )
        self.assertEqual(outcome, "verified")
        self.assertEqual(note, "AHPRA registration is valid and current.")


class ParseAhpraHtmlTests(TestCase):
    def test_parse_ahpra_html_with_condition_row(self):
        sample_html = (
            '<html><body>'
            '<div class="practitioner-detail-header">'
            '  <h2 class="practitioner-name">Dr John Smith</h2>'
            '  <div class="reg-types"><span>General</span></div>'
            '</div>'
            '<div class="practitioner-detail-body">'
            '  <div class="practitioner-detail-section">'
            '    <div class="section-row">'
            '      <div class="field-title">Profession</div>'
            '      <div class="field-entry">Pharmacist</div>'
            '    </div>'
            '    <div class="section-row">'
            '      <div class="field-title">Registration status</div>'
            '      <div class="field-entry">Registered</div>'
            '    </div>'
            '    <div class="section-row">'
            '      <div class="field-title">Expiry Date</div>'
            '      <div class="field-entry">30/11/2099</div>'
            '    </div>'
            '    <div class="section-row">'
            '      <div class="field-title">Conditions</div>'
            '      <div class="field-entry">Must practice under direct supervision</div>'
            '    </div>'
            '    <div class="section-row">'
            '      <div class="field-title">Undertakings</div>'
            '      <div class="field-entry">None</div>'
            '    </div>'
            '    <div class="section-row">'
            '      <div class="field-title">Reprimands</div>'
            '      <div class="field-entry">Nil</div>'
            '    </div>'
            '  </div>'
            '</div>'
            '</body></html>'
        )

        with tempfile.NamedTemporaryFile("w", encoding="utf-8", suffix=".html", delete=False) as f:
            f.write(sample_html)
            path = f.name

        try:
            parsed = parse_ahpra_html(path)
            self.assertEqual(parsed["practitioner_name"], "Dr John Smith")
            self.assertEqual(parsed["registration_type"], "General")
            self.assertEqual(parsed["registration_status"], "Registered")
            self.assertEqual(parsed["expiry_date"], "30/11/2099")
            self.assertEqual(parsed["profession"], "Pharmacist")
            self.assertTrue(parsed["conditions"])
            self.assertFalse(parsed["undertakings"])
            self.assertFalse(parsed["reprimands"])
        finally:
            if os.path.exists(path):
                os.remove(path)


class VerifyAhpraTaskIntegrationTests(TestCase):
    def setUp(self):
        self.user = make_user("PHARMACIST", first_name="Jane", last_name="Doe")
        self.pharmacist = PharmacistOnboarding.objects.create(
            user=self.user,
            ahpra_number="1234567",
        )

    def write_html_page(self, path, reg_type="General", status="Registered", expiry="30/11/2099"):
        html = (
            f'<div class="practitioner-detail-header">'
            f'  <h2 class="practitioner-name">{self.user.get_full_name()}</h2>'
            f'  <div class="reg-types"><span>{reg_type}</span></div>'
            f'</div>'
            f'<div class="practitioner-detail-body">'
            f'  <div class="practitioner-detail-section">'
            f'    <div class="section-row">'
            f'      <div class="field-title">Registration status</div>'
            f'      <div class="field-entry">{status}</div>'
            f'    </div>'
            f'    <div class="section-row">'
            f'      <div class="field-title">Expiry Date</div>'
            f'      <div class="field-entry">{expiry}</div>'
            f'    </div>'
            f'  </div>'
            f'</div>'
        )
        with open(path, "w", encoding="utf-8") as f:
            f.write(html)
        return path

    def test_retry_and_skip_rule(self):
        lookup_calls = []

        def failing_lookup(number, path, api_key=None):
            lookup_calls.append("failing")
            raise RuntimeError("ScrapingBee unavailable")

        def successful_lookup(number, path, api_key=None):
            lookup_calls.append("success")
            return self.write_html_page(path)

        # Run 1: lookup fails -> record note, stays unverified, no registration status stored
        with mock.patch("onboarding.tasks.ahpra_lookup", side_effect=failing_lookup):
            verify_ahpra_task("PharmacistOnboarding", self.pharmacist.pk, "1234567", "Jane", "Doe", self.user.email)

        self.pharmacist.refresh_from_db()
        self.assertFalse(self.pharmacist.ahpra_verified)
        self.assertEqual(self.pharmacist.ahpra_verification_note, "AHPRA lookup failed. Please try again later.")
        self.assertFalse(self.pharmacist.ahpra_registration_status)
        self.assertEqual(len(lookup_calls), 1)

        # Run 2: retry must NOT be blocked despite existing note
        with mock.patch("onboarding.tasks.ahpra_lookup", side_effect=successful_lookup):
            verify_ahpra_task("PharmacistOnboarding", self.pharmacist.pk, "1234567", "Jane", "Doe", self.user.email)

        self.pharmacist.refresh_from_db()
        self.assertTrue(self.pharmacist.ahpra_verified)
        self.assertEqual(self.pharmacist.ahpra_registration_status, "Registered")
        self.assertEqual(len(lookup_calls), 2)

        # Run 3: now that successful result is stored, subsequent run skips
        with mock.patch("onboarding.tasks.ahpra_lookup", side_effect=successful_lookup):
            verify_ahpra_task("PharmacistOnboarding", self.pharmacist.pk, "1234567", "Jane", "Doe", self.user.email)

        self.assertEqual(len(lookup_calls), 2, "Successful result must cause future runs to skip")

    def test_intern_with_provisional_registration_accepted(self):
        intern_user = make_user("OTHER_STAFF", first_name="Alex", last_name="Taylor")
        intern = OtherStaffOnboarding.objects.create(
            user=intern_user,
            role_type="INTERN",
            ahpra_number="0009876543",
        )

        def mock_lookup(number, path, api_key=None):
            html = (
                f'<div class="practitioner-detail-header">'
                f'  <h2 class="practitioner-name">Alex Taylor</h2>'
                f'  <div class="reg-types"><span>Provisional</span></div>'
                f'</div>'
                f'<div class="practitioner-detail-body">'
                f'  <div class="practitioner-detail-section">'
                f'    <div class="section-row">'
                f'      <div class="field-title">Registration status</div>'
                f'      <div class="field-entry">Registered</div>'
                f'    </div>'
                f'    <div class="section-row">'
                f'      <div class="field-title">Expiry Date</div>'
                f'      <div class="field-entry">30/11/2099</div>'
                f'    </div>'
                f'  </div>'
                f'</div>'
            )
            with open(path, "w", encoding="utf-8") as f:
                f.write(html)
            return path

        with mock.patch("onboarding.tasks.ahpra_lookup", side_effect=mock_lookup):
            verify_ahpra_task(
                "OtherStaffOnboarding", intern.pk, "0009876543", "Alex", "Taylor", intern_user.email
            )

        intern.refresh_from_db()
        self.assertTrue(intern.ahpra_verified)
        self.assertEqual(intern.ahpra_verification_note, "AHPRA registration is valid and current.")

    def test_student_skipped_without_lookup(self):
        student_user = make_user("OTHER_STAFF", first_name="Sam", last_name="Kim")
        student = OtherStaffOnboarding.objects.create(
            user=student_user,
            role_type="STUDENT",
            ahpra_number="1234567",
        )

        lookup_mock = mock.Mock()
        with mock.patch("onboarding.tasks.ahpra_lookup", lookup_mock):
            verify_ahpra_task(
                "OtherStaffOnboarding", student.pk, "1234567", "Sam", "Kim", student_user.email
            )

        lookup_mock.assert_not_called()
        student.refresh_from_db()
        self.assertFalse(student.ahpra_verified)
        self.assertIn("education provider", student.ahpra_verification_note)

    def test_invalid_number_records_failure_and_stops_without_lookup(self):
        lookup_mock = mock.Mock()
        with mock.patch("onboarding.tasks.ahpra_lookup", lookup_mock):
            verify_ahpra_task(
                "PharmacistOnboarding", self.pharmacist.pk, "123", "Jane", "Doe", self.user.email
            )

        lookup_mock.assert_not_called()
        self.pharmacist.refresh_from_db()
        self.assertFalse(self.pharmacist.ahpra_verified)
        self.assertIn("Invalid AHPRA registration number format", self.pharmacist.ahpra_verification_note)
        # Stored number format remains unchanged
        self.assertEqual(self.pharmacist.ahpra_number, "1234567")
