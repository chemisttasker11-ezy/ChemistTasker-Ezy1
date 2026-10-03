"""What the role-specific onboarding tabs and the progress calculation do.

Basic (all roles), skills (pharmacist, other staff), rate (pharmacist), regulatory (other staff), interests (explorer),
the first-submission notification and the progress percentage with its verified gate. Driven through the real
`<role>/onboarding/me/` endpoints; e-mails and verification tasks are captured at Celery send_task.
"""
import importlib
import io
from contextlib import ExitStack, contextmanager
from decimal import Decimal
from unittest import mock

from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings

from client_profile.characterization_support import client_for, make_user
from onboarding.models import ExplorerOnboarding, OtherStaffOnboarding, OwnerOnboarding, PharmacistOnboarding

API = "/api/client-profile/"
STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.InMemoryStorage"},
    "staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"},
}
PDF = b"%PDF-1.7\nsynthetic-test-content"
CATALOG = {
    "pharmacist": {"clinical_services": [{"code": "VAX", "requires_certificate": True}, {"code": "SECOND", "requires_certificate": True}, {"code": "DAA"}]},
    "otherstaff": {"dispense_software": [{"code": "FRED", "requires_certificate": True}]},
}
ROLES = {
    "pharmacist": ("PHARMACIST", PharmacistOnboarding, "pharmacist/onboarding/me/", {}),
    "otherstaff": ("OTHER_STAFF", OtherStaffOnboarding, "otherstaff/onboarding/me/", {"role_type": "ASSISTANT"}),
    "explorer": ("EXPLORER", ExplorerOnboarding, "explorer/onboarding/me/", {}),
    "owner": ("OWNER", OwnerOnboarding, "owner/onboarding/me/", {"phone_number": "0400000000", "role": "MANAGER"}),
}


def pdf(name="doc.pdf"):
    return SimpleUploadedFile(name, PDF, content_type="application/pdf")


@contextmanager
def skills_catalog(catalog):
    """Serve `catalog` from the skills catalog loader wherever it lives."""
    with ExitStack() as stack:
        for module_name in ("onboarding.serializers", "onboarding.services.skills"):
            try:
                module = importlib.import_module(module_name)
            except ImportError:
                continue
            if hasattr(module, "_load_skills_catalog"):
                stack.enter_context(mock.patch.object(module, "_load_skills_catalog", return_value=catalog))
        yield


@contextmanager
def captured_work():
    work = {"tasks": [], "emails": []}

    def record(name, args=None, kwargs=None, **options):
        kwargs = kwargs or {}
        if name == "users.tasks.send_email_task":
            work["emails"].append((kwargs.get("template_name"), tuple(kwargs.get("recipient_list") or [])))
        else:
            work["tasks"].append((name, tuple(args or ()), dict(kwargs)))

    with mock.patch("celery.app.base.Celery.send_task", side_effect=record):
        yield work


@override_settings(STORAGES=STORAGES)
class RoleTabFixture(TestCase):
    def onboarding(self, label, user_fields=None, **fields):
        role, model, url, extra = ROLES[label]
        user = make_user(role, is_otp_verified=True, **(user_fields or {}))
        obj = model.objects.create(user=user, **{**extra, **fields})
        return user, obj, url

    def patch(self, user, url, data, *, multipart=False):
        with captured_work() as work, skills_catalog(CATALOG):
            response = client_for(user).patch(f"{API}{url}", data, format="multipart" if multipart else "json")
        return response, work

    def get(self, user, url):
        with captured_work(), skills_catalog(CATALOG):
            return client_for(user).get(f"{API}{url}")


class SubmissionTests(RoleTabFixture):
    def setUp(self):
        self.admin = make_user("OWNER", is_superuser=True, is_staff=True)

    def test_first_basic_submission_notifies_the_admins_once(self):
        for label in ("pharmacist", "otherstaff", "explorer"):
            with self.subTest(role=label):
                user, obj, url = self.onboarding(label, ahpra_number="PHA0001234567" if label == "pharmacist" else None) \
                    if label == "pharmacist" else self.onboarding(label)
                response, work = self.patch(user, url, {"tab": "basic", "submitted_for_verification": True})
                self.assertEqual(response.status_code, 200, response.data)
                obj.refresh_from_db()
                self.assertTrue(obj.submitted_for_verification)
                self.assertEqual(work["emails"], [("emails/admin_onboarding_notification.html", (self.admin.email,))])
                _, again = self.patch(user, url, {"tab": "basic", "submitted_for_verification": True})
                self.assertEqual(again["emails"], [])
                _, other_tab = self.patch(user, url, {"tab": "profile", "submitted_for_verification": True})
                self.assertEqual(other_tab["emails"], [])

    def test_pharmacist_basic_submit_requires_ahpra_after_notifying(self):
        user, obj, url = self.onboarding("pharmacist")
        response, work = self.patch(user, url, {"tab": "basic", "submitted_for_verification": True})
        self.assertEqual((response.status_code, set(response.data)), (400, {"ahpra_number"}))
        obj.refresh_from_db()
        # CURRENT BEHAVIOUR: the first-submission flag and admin e-mail happen before the basic tab refuses
        self.assertTrue(obj.submitted_for_verification)
        self.assertEqual(len(work["emails"]), 1)

    def test_the_submit_flag_is_read_as_a_boolean(self):
        # Regression: the role serializers took the raw request value's truthiness, so the multipart string "false"
        # turned a plain save into a submission (and un-verified the profile).
        for label in ("pharmacist", "otherstaff", "explorer"):
            for flag, submitted in (("false", False), ("0", False), ("true", True), ("1", True)):
                with self.subTest(role=label, flag=flag):
                    user, obj, url = self.onboarding(label, verified=True)
                    response, _ = self.patch(user, url, {"tab": "profile", "short_bio": "Hi",
                                                         "submitted_for_verification": flag}, multipart=True)
                    self.assertEqual(response.status_code, 200, response.data)
                    obj.refresh_from_db()
                    self.assertEqual(obj.verified, not submitted)

    def test_owner_notifies_on_every_basic_save_and_resets_ahpra_on_change(self):
        user, obj, url = self.onboarding("owner", verified=True, ahpra_number="A1", ahpra_verified=True)
        response, work = self.patch(user, url, {"tab": "basic", "number_of_pharmacies": 3})
        self.assertEqual(response.status_code, 200, response.data)
        obj.refresh_from_db()
        self.assertEqual((obj.number_of_pharmacies, obj.verified, obj.ahpra_verified), (3, True, True))
        self.assertEqual(len(work["emails"]), 1)
        response, work = self.patch(user, url, {"tab": "basic", "role": "PHARMACIST", "submitted_for_verification": True})
        obj.refresh_from_db()
        self.assertEqual((obj.role, obj.ahpra_verified, obj.verified, obj.submitted_for_verification),
                         ("PHARMACIST", False, False, True))
        self.assertEqual(len(work["emails"]), 1)
        _, work = self.patch(user, url, {"tab": "basic"})
        self.assertEqual(work["emails"], [])
        _, unknown_tab = self.patch(user, url, {"tab": "payment", "number_of_pharmacies": 4})
        obj.refresh_from_db()
        self.assertEqual(obj.number_of_pharmacies, 4)  # owners only have the basic and identity tabs


class BasicTabTests(RoleTabFixture):
    def test_pharmacist_basic_fields_rounding_and_ahpra_reset(self):
        user, obj, url = self.onboarding("pharmacist", ahpra_number="PHA1", ahpra_verified=True,
                                         ahpra_verification_note="ok")
        response, _ = self.patch(user, url, {
            "tab": "basic", "street_address": "1 Main St", "suburb": "Town", "state": "NSW", "postcode": "2000",
            "latitude": "-33.123456789", "longitude": "151.987654321", "ahpra_number": "PHA2",
            "phone_number": "0411222333",
        })
        self.assertEqual(response.status_code, 200, response.data)
        obj.refresh_from_db()
        user.refresh_from_db()
        self.assertEqual((obj.suburb, obj.ahpra_number, obj.ahpra_verified, obj.ahpra_verification_note),
                         ("Town", "PHA2", False, ""))
        self.assertEqual((obj.latitude, obj.longitude), (Decimal("-33.123457"), Decimal("151.987654")))
        self.assertEqual(user.mobile_number, "0411222333")

    def test_other_staff_and_explorer_basic_fields(self):
        user, obj, url = self.onboarding("otherstaff")
        response, _ = self.patch(user, url, {"tab": "basic", "role_type": "INTERN", "intern_half": "FIRST_HALF",
                                             "suburb": "Town", "submitted_for_verification": True})
        self.assertEqual(response.status_code, 200, response.data)
        obj.refresh_from_db()
        self.assertEqual((obj.role_type, obj.intern_half, obj.suburb, obj.verified), ("INTERN", "FIRST_HALF", "Town", False))
        user, obj, url = self.onboarding("explorer")
        response, _ = self.patch(user, url, {"tab": "basic", "role_type": "STUDENT", "suburb": "Town"})
        self.assertEqual(response.status_code, 200, response.data)
        obj.refresh_from_db()
        self.assertEqual((obj.role_type, obj.suburb), ("STUDENT", "Town"))


class SkillsTabTests(RoleTabFixture):
    def test_certificates_are_required_saved_and_removed(self):
        for label, code, message in (
            ("pharmacist", "VAX", "Certificate required for checked skill(s): VAX"),
            ("otherstaff", "FRED", "Certificate required for: FRED"),
        ):
            with self.subTest(role=label):
                user, obj, url = self.onboarding(label)
                response, _ = self.patch(user, url, {"tab": "skills", "skills": [code]})
                self.assertEqual((response.status_code, str(response.data["skills"])), (400, message))
                response, _ = self.patch(user, url, {"tab": "skills", "skills": "not json"}, multipart=True)
                self.assertEqual((response.status_code, str(response.data["skills"])),
                                 (400, "Must be a JSON array or list."))

                response, _ = self.patch(user, url, {"tab": "skills", "skills": f'["{code}", "OTHER"]',
                                                     f"skill_files[{code}]": pdf("cert.pdf")}, multipart=True)
                self.assertEqual(response.status_code, 200, response.data)
                obj.refresh_from_db()
                self.assertEqual(obj.skills, [code, "OTHER"])
                path = obj.skill_certificates[code]["path"]
                self.assertTrue(path.startswith(f"skill_certs/{user.id}/{code}/cert_{code}_"))
                self.assertTrue(default_storage.exists(path))
                self.assertEqual([row["skill_code"] for row in response.data["skill_certificates"]], [code])

                response, _ = self.patch(user, url, {"tab": "skills", "skills": ["OTHER"]})
                obj.refresh_from_db()
                self.assertEqual((obj.skills, obj.skill_certificates), (["OTHER"], {}))
                self.assertFalse(default_storage.exists(path))

    def test_failed_skills_validation_preserves_old_certificate_and_cleans_new_upload(self):
        user, obj, url = self.onboarding("pharmacist")
        response, _ = self.patch(
            user,
            url,
            {"tab": "skills", "skills": '["VAX"]', "skill_files[VAX]": pdf("old.pdf")},
            multipart=True,
        )
        self.assertEqual(response.status_code, 200, response.data)
        obj.refresh_from_db()
        old_path = obj.skill_certificates["VAX"]["path"]
        self.assertTrue(default_storage.exists(old_path))

        response, _ = self.patch(
            user,
            url,
            {
                "tab": "skills",
                "skills": '["VAX", "SECOND"]',
                "skill_files[VAX]": pdf("replacement.pdf"),
            },
            multipart=True,
        )
        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn("SECOND", str(response.data["skills"]))

        obj.refresh_from_db()
        self.assertEqual(obj.skill_certificates["VAX"]["path"], old_path)
        self.assertTrue(default_storage.exists(old_path))
        folder = f"skill_certs/{user.id}/VAX/"
        _dirs, files = default_storage.listdir(folder)
        self.assertEqual(files, [old_path.rsplit("/", 1)[-1]], "failed validation must not orphan the replacement upload")

    def test_other_staff_years_of_experience(self):
        user, obj, url = self.onboarding("otherstaff")
        response, _ = self.patch(user, url, {"tab": "skills", "skills": [], "years_experience": " 2-3 "})
        self.assertEqual(response.status_code, 200, response.data)
        obj.refresh_from_db()
        self.assertEqual(obj.years_experience, "2-3")


class RoleSpecificTabTests(RoleTabFixture):
    def test_pharmacist_rate_preferences(self):
        user, obj, url = self.onboarding("pharmacist", verified=True)
        response, _ = self.patch(user, url, {"tab": "rate", "rate_preference": {"weekday": 60, "sunday": None,
                                                                              "late_night_same_as_day": 1}})
        self.assertEqual(response.status_code, 200, response.data)
        obj.refresh_from_db()
        self.assertEqual(obj.rate_preference, {
            "weekday": "60", "saturday": "", "sunday": "", "public_holiday": "", "early_morning": "",
            "late_night": "", "early_morning_same_as_day": False, "late_night_same_as_day": True,
        })
        self.assertTrue(obj.verified)
        response, _ = self.patch(user, url, {"tab": "rate", "rate_preference": "{bad", "submitted_for_verification": True},
                                 multipart=True)
        # the model JSON field rejects it before the tab's own "Must be a JSON object." check can run
        self.assertEqual((response.status_code, str(response.data["rate_preference"][0])), (400, "Value must be valid JSON."))
        response, _ = self.patch(user, url, {"tab": "rate", "rate_preference": {"weekday": "70"},
                                             "submitted_for_verification": True})
        obj.refresh_from_db()
        self.assertEqual((obj.rate_preference["weekday"], obj.verified), ("70", False))

    def test_other_staff_regulatory_documents(self):
        user, obj, url = self.onboarding("otherstaff", role_type="INTERN")
        response, work = self.patch(user, url, {"tab": "regulatory", "submitted_for_verification": True})
        self.assertEqual((response.status_code, set(response.data)), (400, {"ahpra_proof", "hours_proof"}))
        self.assertEqual(work["tasks"], [])

        response, work = self.patch(user, url, {"tab": "regulatory", "role_type": "ASSISTANT",
                                                "certificate": pdf("cert.pdf")}, multipart=True)
        self.assertEqual(response.status_code, 200, response.data)
        obj.refresh_from_db()
        self.assertEqual(obj.role_type, "ASSISTANT")
        obj.certificate_verified = True
        obj.save(update_fields=["certificate_verified"])
        first = obj.certificate.name

        response, work = self.patch(user, url, {"tab": "regulatory", "certificate": pdf("cert2.pdf"),
                                                "submitted_for_verification": True}, multipart=True)
        self.assertEqual(response.status_code, 200, response.data)
        obj.refresh_from_db()
        self.assertFalse(obj.certificate_verified)
        self.assertFalse(default_storage.exists(first))
        self.assertEqual(work["tasks"], [(
            "client_profile.tasks.verify_filefield_task",
            ("otherstaffonboarding", obj.pk, "certificate", user.first_name, user.last_name, user.email),
            {"verification_field": "certificate_verified", "note_field": "certificate_verification_note"},
        )])

    def test_failed_regulatory_validation_preserves_replaced_file(self):
        user, obj, url = self.onboarding("otherstaff", role_type="INTERN")
        obj.ahpra_proof.save("old-ahpra.pdf", ContentFile(PDF), save=True)
        obj.refresh_from_db()
        old_path = obj.ahpra_proof.name
        self.assertTrue(default_storage.exists(old_path))

        response, _ = self.patch(
            user,
            url,
            {
                "tab": "regulatory",
                "ahpra_proof": pdf("replacement-ahpra.pdf"),
                "submitted_for_verification": True,
            },
            multipart=True,
        )
        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn("hours_proof", response.data)

        obj.refresh_from_db()
        self.assertEqual(obj.ahpra_proof.name, old_path)
        self.assertTrue(default_storage.exists(old_path), "failed validation must not delete the persisted document")

    def test_explorer_interests(self):
        user, obj, url = self.onboarding("explorer", verified=True)
        response, _ = self.patch(user, url, {"tab": "interests", "interests": ["SHADOWING"]})
        self.assertEqual(response.status_code, 200, response.data)
        obj.refresh_from_db()
        self.assertEqual((obj.interests, obj.verified), (["SHADOWING"], True))
        response, _ = self.patch(user, url, {"tab": "interests", "interests": '["PLACEMENT"]',
                                             "submitted_for_verification": "true"}, multipart=True)
        obj.refresh_from_db()
        self.assertEqual((obj.interests, obj.verified), (["PLACEMENT"], False))
        response, _ = self.patch(user, url, {"tab": "interests", "interests": "nope"}, multipart=True)
        self.assertEqual((response.status_code, str(response.data["interests"][0])), (400, "Value must be valid JSON."))


class ProgressTests(RoleTabFixture):
    def test_progress_of_a_new_onboarding(self):
        expected = {"pharmacist": 16, "otherstaff": 25, "explorer": 25, "owner": 71}
        for label, percent in expected.items():
            with self.subTest(role=label):
                user, obj, url = self.onboarding(label, user_fields={"mobile_number": "0400000001"})
                response = self.get(user, url)
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.data["progress_percent"], percent)

    def test_reading_the_onboarding_flips_verified_when_the_gate_passes(self):
        # CURRENT BEHAVIOUR: rendering progress_percent saves verified=True once referees, the role's key check and
        # the phone are verified.
        gates = {
            "pharmacist": {"ahpra_verified": True},
            "otherstaff": {"gov_id_verified": True, "role_type": "ASSISTANT", "certificate_verified": True},
            "explorer": {"gov_id_verified": True},
        }
        for label, fields in gates.items():
            with self.subTest(role=label):
                user, obj, url = self.onboarding(label, user_fields={"is_mobile_verified": True},
                                                 referee1_confirmed=True, referee2_confirmed=True, **fields)
                self.assertFalse(obj.verified)
                self.get(user, url)
                obj.refresh_from_db()
                self.assertTrue(obj.verified)

                user, obj, url = self.onboarding(label, user_fields={"is_mobile_verified": False},
                                                 referee1_confirmed=True, referee2_confirmed=True, **fields)
                self.get(user, url)
                obj.refresh_from_db()
                self.assertFalse(obj.verified)
