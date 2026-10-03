"""What the shared onboarding tabs do for each role: identity, payment, referees, profile (resume) and profile photo.

The pharmacist, other-staff, explorer and owner serializers each carry their own copy of these tabs. These tests drive
the real `<role>/onboarding/me/` endpoints and assert the stored onboarding, the deleted files, the validation errors and
the queued work (verification tasks, referee and admin e-mails captured at Celery send_task; referee reminders at
their scheduler), so they hold while the tabs move to shared services.
"""
import io
from contextlib import contextmanager
from unittest import mock

from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.utils import timezone
from PIL import Image

from client_profile.characterization_support import client_for, make_user
from onboarding.models import ExplorerOnboarding, OtherStaffOnboarding, OwnerOnboarding, PharmacistOnboarding

API = "/api/client-profile/"
STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.InMemoryStorage"},
    "staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"},
}
PDF = b"%PDF-1.7\nsynthetic-test-content"

ROLES = {
    # label: (user role, model, url, extra onboarding fields)
    "pharmacist": ("PHARMACIST", PharmacistOnboarding, "pharmacist/onboarding/me/", {}),
    "otherstaff": ("OTHER_STAFF", OtherStaffOnboarding, "otherstaff/onboarding/me/", {"role_type": "ASSISTANT"}),
    "explorer": ("EXPLORER", ExplorerOnboarding, "explorer/onboarding/me/", {}),
    "owner": ("OWNER", OwnerOnboarding, "owner/onboarding/me/", {"phone_number": "0400000000", "role": "MANAGER"}),
}


def pdf(name="doc.pdf"):
    return SimpleUploadedFile(name, PDF, content_type="application/pdf")


def png(name="me.png"):
    buffer = io.BytesIO()
    Image.new("RGB", (2, 2), "white").save(buffer, format="PNG")
    return SimpleUploadedFile(name, buffer.getvalue(), content_type="image/png")


@contextmanager
def captured_work():
    """Queued Celery work by name, and referee reminders by (model, ref index)."""
    work = {"tasks": [], "emails": [], "reminders": []}

    def record(name, args=None, kwargs=None, **options):
        kwargs = kwargs or {}
        if name == "users.tasks.send_email_task":
            work["emails"].append((kwargs.get("template_name"), tuple(kwargs.get("recipient_list") or [])))
        else:
            work["tasks"].append((name, tuple(args or ()), dict(kwargs)))

    def remind(model_name, pk, ref_idx, hours=None):
        work["reminders"].append((model_name, ref_idx))

    with mock.patch("celery.app.base.Celery.send_task", side_effect=record), \
            mock.patch("onboarding.verification.reminders.schedule_referee_reminder", side_effect=remind):
        yield work


@override_settings(STORAGES=STORAGES)
class TabFixture(TestCase):
    def onboarding(self, label, **fields):
        role, model, url, extra = ROLES[label]
        user = make_user(role, is_otp_verified=True)
        obj = model.objects.create(user=user, **{**extra, **fields})
        return user, obj, url

    def patch(self, user, url, data, *, multipart=False):
        with captured_work() as work:
            response = client_for(user).patch(f"{API}{url}", data, format="multipart" if multipart else "json")
        return response, work


class IdentityTabTests(TabFixture):
    def save_identity(self, user, url, **data):
        return self.patch(user, url, {"tab": "identity", **data})

    def test_meta_is_normalised_per_document_type(self):
        cases = {
            "DRIVER_LICENSE": ({"state": "NSW", "expiry": "2030-01-01", "junk": 1}, {"state": "NSW", "expiry": "2030-01-01"}),
            "AUS_PASSPORT": ({"expiry": "2030-01-01", "country": "NZ"}, {"expiry": "2030-01-01", "country": "Australia"}),
            "VISA": ({"visa_type_number": "482", "valid_to": "2030-01-01", "passport_country": "IN",
                      "passport_expiry": "2031-01-01", "state": "NSW"},
                     {"visa_type_number": "482", "valid_to": "2030-01-01", "passport_country": "IN",
                      "passport_expiry": "2031-01-01"}),
            "OTHER_PASSPORT": ({"country": "IN", "expiry": "2030-01-01", "visa_type_number": "482",
                                "valid_to": "2030-02-02", "passport_country": "x"},
                               {"country": "IN", "expiry": "2030-01-01", "visa_type_number": "482",
                                "valid_to": "2030-02-02"}),
            "AGE_PROOF": ({"state": "VIC", "expiry": "2030-01-01", "x": 1}, {"state": "VIC", "expiry": "2030-01-01"}),
        }
        for label in ROLES:
            for doc_type, (incoming, stored) in cases.items():
                with self.subTest(role=label, doc_type=doc_type):
                    user, obj, url = self.onboarding(label, government_id_type=doc_type)
                    response, work = self.save_identity(user, url, identity_meta=incoming)
                    self.assertEqual(response.status_code, 200, response.data)
                    obj.refresh_from_db()
                    self.assertEqual(obj.identity_meta, stored)
                    self.assertEqual(work["tasks"], [])

    def test_changing_the_type_wipes_meta_and_resets_verification(self):
        for label in ROLES:
            with self.subTest(role=label):
                user, obj, url = self.onboarding(label, government_id_type="DRIVER_LICENSE", gov_id_verified=True,
                                                 gov_id_verification_note="ok", identity_meta={"state": "NSW"})
                response, _ = self.save_identity(user, url, government_id_type="AGE_PROOF")
                self.assertEqual(response.status_code, 200, response.data)
                obj.refresh_from_db()
                self.assertEqual((obj.government_id_type, obj.identity_meta, obj.gov_id_verified,
                                  obj.gov_id_verification_note), ("AGE_PROOF", {}, False, ""))

    def test_current_behaviour_resaving_an_unchanged_identity(self):
        # CURRENT BEHAVIOUR (bug for two roles): re-sending the same single-file type with unchanged meta keeps a
        # verified ID for pharmacists and owners, but other staff and explorers are marked unverified (their copy
        # treats "no secondary file to clear" as a change).
        expected_verified = {"pharmacist": True, "owner": True, "otherstaff": False, "explorer": False}
        for label, still_verified in expected_verified.items():
            with self.subTest(role=label):
                meta = {"state": "NSW", "expiry": "2030-01-01"}
                user, obj, url = self.onboarding(label, government_id_type="DRIVER_LICENSE", gov_id_verified=True,
                                                 identity_meta=meta)
                response, _ = self.save_identity(user, url, government_id_type="DRIVER_LICENSE", identity_meta=meta)
                self.assertEqual(response.status_code, 200, response.data)
                obj.refresh_from_db()
                self.assertEqual(obj.gov_id_verified, still_verified)

    def test_files_replace_clear_and_secondary_cleanup(self):
        for label in ROLES:
            with self.subTest(role=label):
                user, obj, url = self.onboarding(label, government_id_type="VISA", gov_id_verified=True)
                response, _ = self.patch(user, url, {"tab": "identity", "government_id": pdf("visa.pdf"),
                                                     "identity_secondary_file": pdf("passport.pdf")}, multipart=True)
                self.assertEqual(response.status_code, 200, response.data)
                obj.refresh_from_db()
                first_primary, first_secondary = obj.government_id.name, obj.identity_secondary_file.name
                self.assertTrue(default_storage.exists(first_primary))
                self.assertFalse(obj.gov_id_verified)

                response, _ = self.patch(user, url, {"tab": "identity", "government_id": pdf("visa2.pdf")},
                                         multipart=True)
                obj.refresh_from_db()
                self.assertNotEqual(obj.government_id.name, first_primary)
                self.assertFalse(default_storage.exists(first_primary))

                response, _ = self.save_identity(user, url, government_id_type="DRIVER_LICENSE")
                obj.refresh_from_db()
                self.assertFalse(obj.identity_secondary_file)
                self.assertFalse(default_storage.exists(first_secondary))

    def test_submit_validates_per_type_and_queues_verification(self):
        for label in ROLES:
            with self.subTest(role=label):
                user, obj, url = self.onboarding(label, verified=True)
                response, work = self.save_identity(user, url, submitted_for_verification=True)
                self.assertEqual(response.status_code, 400)
                self.assertEqual(set(response.data), {"government_id_type", "government_id"})
                self.assertEqual(work["tasks"], [])

                obj.refresh_from_db()
                obj.government_id.save("id.pdf", ContentFile(PDF), save=True)
                response, work = self.save_identity(user, url, government_id_type="OTHER_PASSPORT",
                                                    identity_meta={"country": "IN"}, submitted_for_verification=True)
                self.assertEqual(response.status_code, 400)
                self.assertEqual(set(response.data), {"identity_meta.expiry", "identity_secondary_file",
                                                      "identity_meta.visa_type_number", "identity_meta.valid_to"})
                obj.refresh_from_db()
                # the edit is saved even though submission was refused; owners keep their approval
                self.assertEqual(obj.government_id_type, "OTHER_PASSPORT")
                self.assertEqual(obj.verified, label == "owner")

                response, work = self.save_identity(user, url, government_id_type="AUS_PASSPORT",
                                                    identity_meta={"expiry": "2030-01-01"},
                                                    submitted_for_verification=True)
                self.assertEqual(response.status_code, 200, response.data)
                self.assertEqual(work["tasks"], [(
                    "client_profile.tasks.verify_filefield_task",
                    (obj._meta.model_name, obj.pk, "government_id", user.first_name, user.last_name, user.email),
                    {"verification_field": "gov_id_verified", "note_field": "gov_id_verification_note"},
                )])


class PaymentTabTests(TabFixture):
    def test_a_new_abn_clears_the_old_verification(self):
        # Regression: the "ABN changed" check ran after the new ABN was written to the instance, so a changed ABN
        # kept abn_verified, the entity confirmation and the note that belonged to the old ABN.
        for label in ("pharmacist", "otherstaff"):
            with self.subTest(role=label):
                user, obj, url = self.onboarding(label, abn="11111111111", abn_verified=True,
                                                 abn_entity_confirmed=True, abn_entity_name="Old Pty Ltd",
                                                 abn_verification_note="ok")
                response, _ = self.patch(user, url, {"tab": "payment", "payment_preference": "ABN",
                                                     "abn": "51824753556"})
                self.assertEqual(response.status_code, 200, response.data)
                obj.refresh_from_db()
                self.assertEqual((obj.abn, obj.abn_verified, obj.abn_entity_confirmed, obj.abn_verification_note),
                                 ("51824753556", False, False, ""))

                response, _ = self.patch(user, url, {"tab": "payment", "abn": "51824753556"})
                obj.refresh_from_db()
                self.assertEqual(obj.abn_verification_note, "", "re-sending the same ABN is not a change")

    def test_abn_confirmation_gst_sync_and_submit(self):
        for label in ("pharmacist", "otherstaff"):
            with self.subTest(role=label):
                user, obj, url = self.onboarding(label, abn="51824753556", abn_entity_name="Pharmacy Pty Ltd",
                                                 abn_gst_registered=True)
                response, work = self.patch(user, url, {"tab": "payment", "payment_preference": "ABN"})
                self.assertEqual(response.status_code, 200, response.data)
                obj.refresh_from_db()
                self.assertEqual((obj.payment_preference, obj.gst_registered), ("ABN", True))
                self.assertEqual(work["tasks"], [])

                response, _ = self.patch(user, url, {"tab": "payment", "abn_entity_confirmed": True})
                obj.refresh_from_db()
                self.assertEqual((obj.abn_verified, obj.abn_verification_note),
                                 (True, "User confirmed ABN entity details."))
                response, _ = self.patch(user, url, {"tab": "payment", "abn_entity_confirmed": False})
                obj.refresh_from_db()
                self.assertFalse(obj.abn_verified)

                obj.verified = True
                obj.save(update_fields=["verified"])
                response, work = self.patch(user, url, {"tab": "payment", "submitted_for_verification": True})
                self.assertEqual(response.status_code, 200, response.data)
                obj.refresh_from_db()
                self.assertFalse(obj.verified)
                self.assertEqual(work["tasks"], [(
                    "client_profile.tasks.verify_abn_task",
                    (obj._meta.model_name, obj.pk, "51824753556", user.first_name, user.last_name, user.email),
                    {"note_field": "abn_verification_note"},
                )])

    def test_tfn_path_requires_super_details_and_is_masked(self):
        for label in ("pharmacist", "otherstaff"):
            with self.subTest(role=label):
                user, obj, url = self.onboarding(label)
                response, work = self.patch(user, url, {"tab": "payment", "payment_preference": "TFN",
                                                        "submitted_for_verification": True})
                self.assertEqual(response.status_code, 400)
                self.assertEqual(set(response.data), {"tfn", "super_fund_name", "super_usi", "super_member_number"})
                response, work = self.patch(user, url, {
                    "tab": "payment", "payment_preference": "TFN", "tfn": " 123456782 ", "super_fund_name": "Fund",
                    "super_usi": "USI1", "super_member_number": "M1", "submitted_for_verification": True,
                })
                self.assertEqual(response.status_code, 200, response.data)
                self.assertEqual(response.data["tfn_masked"], "*** *** 782")
                self.assertNotIn("tfn", response.data)
                obj.refresh_from_db()
                self.assertEqual(obj.tfn_number, "123456782")
                self.assertEqual(work["tasks"], [])


class RefereesTabTests(TabFixture):
    REFS = {
        "referee1_name": "Ann", "referee1_relation": "manager", "referee1_email": " Ann@Example.com ",
        "referee1_workplace": "Shop", "referee2_name": "Bob", "referee2_relation": "colleague",
        "referee2_email": "bob@example.com", "referee2_workplace": "Shop",
    }

    def test_submit_requires_both_referees_and_emails_them(self):
        for label in ("pharmacist", "otherstaff", "explorer"):
            with self.subTest(role=label):
                user, obj, url = self.onboarding(label)
                response, work = self.patch(user, url, {"tab": "referees", "submitted_for_verification": True})
                self.assertEqual(response.status_code, 400)
                self.assertEqual(len(response.data), 8)
                self.assertEqual(work["emails"], [])

                response, work = self.patch(user, url, {"tab": "referees", "submitted_for_verification": True,
                                                        **self.REFS})
                self.assertEqual(response.status_code, 200, response.data)
                obj.refresh_from_db()
                self.assertEqual(obj.referee1_email, "ann@example.com")
                self.assertIsNotNone(obj.referee1_last_sent)
                self.assertEqual(sorted(work["emails"]), [("emails/referee_request.html", ("ann@example.com",)),
                                                          ("emails/referee_request.html", ("bob@example.com",))])
                self.assertEqual(sorted(work["reminders"]), [(obj._meta.model_name, 1), (obj._meta.model_name, 2)])

    def test_confirmed_referee_is_locked_and_a_changed_one_is_reset(self):
        for label in ("pharmacist", "otherstaff", "explorer"):
            with self.subTest(role=label):
                user, obj, url = self.onboarding(label, referee1_name="Ann", referee1_confirmed=True,
                                                 referee2_name="Bob", referee2_rejected=True,
                                                 referee2_last_sent=timezone.now())
                response, work = self.patch(user, url, {"tab": "referees", "referee1_name": "Changed",
                                                        "referee2_name": "Robert"})
                self.assertEqual(response.status_code, 200, response.data)
                obj.refresh_from_db()
                self.assertEqual((obj.referee1_name, obj.referee1_confirmed), ("Ann", True))
                self.assertEqual((obj.referee2_name, obj.referee2_rejected, obj.referee2_last_sent),
                                 ("Robert", False, None))
                self.assertEqual(work["emails"], [])


class ProfileTabTests(TabFixture):
    def test_short_bio_and_resume_replace_and_clear(self):
        for label in ("pharmacist", "otherstaff", "explorer"):
            with self.subTest(role=label):
                user, obj, url = self.onboarding(label, verified=True)
                response, _ = self.patch(user, url, {"tab": "profile", "short_bio": "Hello", "resume": pdf("cv.pdf")},
                                         multipart=True)
                self.assertEqual(response.status_code, 200, response.data)
                obj.refresh_from_db()
                first = obj.resume.name
                self.assertEqual(obj.short_bio, "Hello")
                self.assertTrue(obj.verified)

                response, _ = self.patch(user, url, {"tab": "profile", "resume": pdf("cv2.pdf"),
                                                     "submitted_for_verification": True}, multipart=True)
                obj.refresh_from_db()
                self.assertFalse(default_storage.exists(first))
                self.assertFalse(obj.verified)


class ProfilePhotoTests(TabFixture):
    def test_photo_replace_and_clear_on_the_basic_tab(self):
        for label in ROLES:
            with self.subTest(role=label):
                user, obj, url = self.onboarding(label)
                response, _ = self.patch(user, url, {"tab": "basic", "profile_photo": png()}, multipart=True)
                self.assertEqual(response.status_code, 200, response.data)
                obj.refresh_from_db()
                first = obj.profile_photo.name
                self.assertTrue(default_storage.exists(first))
                self.assertTrue(response.data["profile_photo_url"])

                response, _ = self.patch(user, url, {"tab": "basic", "profile_photo_clear": "true"}, multipart=True)
                self.assertEqual(response.status_code, 200, response.data)
                obj.refresh_from_db()
                self.assertFalse(obj.profile_photo)
                self.assertFalse(default_storage.exists(first))
