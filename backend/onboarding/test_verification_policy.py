"""The verification policy: what Verified needs per role, tightening with a grace date, and the badge states."""
from datetime import date, timedelta
from types import SimpleNamespace
from unittest import mock

from django.test import SimpleTestCase, override_settings

from onboarding.verification.policy import badges, missing_requirements, refresh_verified, skill_evidence


def profile(role="OTHER_STAFF", role_type="ASSISTANT", *, email=True, mobile=True, skipped=False, **values):
    user = SimpleNamespace(role=role, is_otp_verified=email, is_mobile_verified=mobile, mobile_check_skipped=skipped)
    defaults = dict(user=user, role_type=role_type, verified=False, save=mock.Mock(), gov_id_verified=False,
                    government_id=None, gov_id_verification_note="", ahpra_number=None, ahpra_verified=False,
                    ahpra_verification_note="", referee1_confirmed=False, referee2_confirmed=False, skills=[],
                    skill_certificates={}, certificate=None, certificate_verified=False, certificate_verification_note="",
                    dispensary_qualification="")
    defaults.update(values)
    return SimpleNamespace(**defaults)


class VerifiedRequirementTests(SimpleTestCase):
    def test_pharmacy_team_needs_only_email_and_mobile(self):
        for role_type in ("ASSISTANT", "TECHNICIAN", "STUDENT"):
            obj = profile(role_type=role_type, dispensary_qualification="LEVEL_3")  # no certificate, ID or referees
            self.assertEqual(missing_requirements(obj), [])
            self.assertTrue(refresh_verified(obj))
        self.assertEqual(missing_requirements(profile(mobile=False)), ["mobile"])
        self.assertEqual(missing_requirements(profile(role_type=None)), ["role"])

    def test_pharmacists_and_interns_also_need_ahpra(self):
        self.assertEqual(missing_requirements(profile("PHARMACIST", None)), ["ahpra"])
        self.assertEqual(missing_requirements(profile(role_type="INTERN")), ["ahpra"])
        self.assertEqual(missing_requirements(profile(role_type="INTERN", ahpra_verified=True)), [])

    def test_overseas_newcomer_who_skipped_mobile_needs_id(self):
        obj = profile("EXPLORER", "OVERSEAS", mobile=False, skipped=True)
        self.assertEqual(missing_requirements(obj), ["gov_id"])
        obj.gov_id_verified = True
        self.assertEqual(missing_requirements(obj), [])
        # Only newcomers may skip the mobile check.
        self.assertEqual(missing_requirements(profile(mobile=False, skipped=True)), ["mobile"])

    def test_tightening_keeps_verified_profiles_until_the_grace_date(self):
        today = date.today()
        with override_settings(VERIFICATION_EXTRA_REQUIREMENTS=["referees"], VERIFICATION_GRACE_UNTIL=today + timedelta(days=30)):
            obj = profile(verified=True)
            self.assertTrue(refresh_verified(obj))
            self.assertFalse(refresh_verified(profile()))  # new profiles must meet the tightened rule
        with override_settings(VERIFICATION_EXTRA_REQUIREMENTS=["referees"], VERIFICATION_GRACE_UNTIL=today - timedelta(days=1)):
            self.assertFalse(refresh_verified(obj))
            obj.save.assert_called_once_with(update_fields=["verified"])

    def test_missing_base_requirement_never_demotes_automatically(self):
        obj = profile(verified=True, mobile=False)  # e.g. verified by admin before the mobile check existed
        self.assertTrue(refresh_verified(obj))
        obj.save.assert_not_called()


class BadgeTests(SimpleTestCase):
    def test_document_states(self):
        rows = {row["code"]: row["state"] for row in badges(profile(certificate="cert.pdf", government_id="id.pdf",
                                                                    gov_id_verification_note="Name mismatch",
                                                                    referee1_email="a@example.com"))}
        self.assertEqual(rows, {"QUALIFICATION": "pending", "ID": "failed", "REFERENCES": "pending"})
        intern = {row["code"]: row["state"] for row in badges(profile(role_type="INTERN", ahpra_number="1", ahpra_verified=True))}
        self.assertEqual(intern["AHPRA_PROVISIONAL"], "verified")

    def test_only_certificate_skills_have_evidence(self):
        obj = profile("PHARMACIST", None, skills=["VACCINATION", "FIRST_AID", "PRESCRIPTION_DISPENSING"],
                      skill_certificates={"FIRST_AID": {"path": "x.pdf"}, "VACCINATION": {"path": "y.pdf", "verified": True}})
        self.assertEqual(skill_evidence(obj), {"VACCINATION": "verified", "FIRST_AID": "pending"})
