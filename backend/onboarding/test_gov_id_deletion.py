from io import StringIO
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.core.management import call_command
from django.urls import reverse
from django_otp import DEVICE_ID_SESSION_KEY
from django_otp.plugins.otp_totp.models import TOTPDevice

from client_profile.characterization_support import client_for
from onboarding.models import GovIdCheckMethod
from onboarding.services.gov_id import record_gov_id_result
from onboarding.tasks import verify_filefield_task
from onboarding.test_tab_capabilities_contract import API, ROLES, TabFixture, png


class GovIdDeletionTests(TabFixture):
    def upload_ids(self, profile):
        files = [profile.government_id, profile.identity_secondary_file]
        for file in files:
            file.save("id.png", ContentFile(b"synthetic image"), save=False)
        profile.save(update_fields=["government_id", "identity_secondary_file"])
        return [(file.storage, file.name) for file in files]

    def assert_files(self, files, *, exist):
        for storage, name in files:
            self.assertEqual(storage.exists(name), exist)

    def assert_purged(self, profile, files, *, verified, method, checker=None):
        profile.refresh_from_db()
        self.assert_files(files, exist=False)
        self.assertFalse(profile.government_id)
        self.assertFalse(profile.identity_secondary_file)
        self.assertIs(profile.gov_id_verified, verified)
        self.assertIsNotNone(profile.gov_id_checked_at)
        self.assertEqual(profile.gov_id_check_method, method)
        self.assertEqual(profile.gov_id_checked_by_id, checker)

    def run_ocr(self, profile, *, text=None):
        text = text if text is not None else profile.user.get_full_name()
        with patch("onboarding.tasks.azure_ocr", return_value={"lines": [text]}) as ocr:
            verify_filefield_task.run(
                profile._meta.model_name, profile.pk, "government_id",
                verification_field="gov_id_verified", note_field="gov_id_verification_note",
            )
        return ocr

    def test_automatic_verification_removes_both_files_after_commit_and_keeps_status(self):
        for role in ROLES:
            with self.subTest(role=role):
                user, profile, url = self.onboarding(role, government_id_type="VISA")
                files = self.upload_ids(profile)
                with self.captureOnCommitCallbacks(execute=True):
                    self.run_ocr(profile).assert_called_once()
                    self.assert_files(files, exist=True)
                self.assert_purged(profile, files, verified=True, method=GovIdCheckMethod.AUTOMATIC_OCR)

                self.run_ocr(profile).assert_not_called()
                response = client_for(user).get(f"{API}{url}")
                self.assertEqual(response.status_code, 200, response.data)
                self.assertIsNone(response.data["government_id"])
                self.assertIsNone(response.data["identity_secondary_file"])
                self.assertIs(response.data["gov_id_verified"], True)

    def review_as_admin(self, profile, decision):
        admin = get_user_model().objects.create_superuser(email="reviewer@example.test", password="test-password")
        self.client.force_login(admin)
        session = self.client.session
        session[DEVICE_ID_SESSION_KEY] = TOTPDevice.objects.create(user=admin, confirmed=True).persistent_id
        session.save()

        url = reverse(f"otpadmin:client_profile_{profile._meta.model_name}_change", args=[profile.pk])
        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.post(url, {
                "user": profile.user_id, "phone_number": "0400000000", "role": "MANAGER",
                "number_of_pharmacies": 1, "government_id_type": "AUS_PASSPORT", "identity_meta": "{}",
                "gov_id_verified": decision, "_save": "Save",
            })
        self.assertEqual(response.status_code, 302, response.context["adminform"].form.errors if response.context else None)
        return admin

    def test_admin_approval_removes_files_and_records_reviewer(self):
        _, profile, _ = self.onboarding("owner", government_id_type="AUS_PASSPORT")
        files = self.upload_ids(profile)
        checker = self.review_as_admin(profile, "on")
        self.assert_purged(profile, files, verified=True, method=GovIdCheckMethod.ADMIN_REVIEW, checker=checker.pk)

    def test_admin_rejection_removes_files_and_records_reviewer_and_reupload_works(self):
        user, profile, url = self.onboarding("owner", government_id_type="AUS_PASSPORT")
        files = self.upload_ids(profile)
        checker = self.review_as_admin(profile, "reject")
        self.assert_purged(profile, files, verified=False, method=GovIdCheckMethod.ADMIN_REVIEW, checker=checker.pk)

        response, _ = self.patch(user, url, {"tab": "identity", "government_id": png("id.png")}, multipart=True)
        self.assertEqual(response.status_code, 200, response.data)
        profile.refresh_from_db()
        self.assertFalse(profile.gov_id_verified)
        self.assertIsNone(profile.gov_id_checked_at)
        self.assertEqual(profile.gov_id_check_method, "")
        self.assertIsNone(profile.gov_id_checked_by_id)
        replacement = [(profile.government_id.storage, profile.government_id.name)]
        self.assert_files(replacement, exist=True)

        with self.captureOnCommitCallbacks(execute=True):
            self.run_ocr(profile, text="Different name").assert_called_once()
        self.assert_purged(profile, replacement, verified=False, method=GovIdCheckMethod.AUTOMATIC_OCR)

    def test_storage_failure_leaves_result_and_reference_for_retry(self):
        _, profile, _ = self.onboarding("pharmacist")
        files = self.upload_ids(profile)
        with patch.object(files[0][0], "delete", side_effect=OSError(f"private key: {files[0][1]}")), \
                self.assertLogs("onboarding.services.gov_id", level="WARNING") as logs, \
                self.captureOnCommitCallbacks(execute=True):
            record_gov_id_result(profile, True, GovIdCheckMethod.AUTOMATIC_OCR)
        profile.refresh_from_db()
        self.assertTrue(profile.gov_id_verified)
        self.assertIsNotNone(profile.gov_id_checked_at)
        self.assertEqual(profile.gov_id_check_method, GovIdCheckMethod.AUTOMATIC_OCR)
        self.assertEqual(profile.government_id.name, files[0][1])
        self.assert_files(files, exist=True)
        self.assertNotIn(files[0][1], " ".join(logs.output))

    def test_ocr_does_not_record_a_result_for_a_replacement_upload(self):
        user, profile, url = self.onboarding("pharmacist", government_id_type="AUS_PASSPORT")
        self.upload_ids(profile)

        def replace_document(_path):
            response, _ = self.patch(user, url, {"tab": "identity", "government_id": png("new.png")}, multipart=True)
            self.assertEqual(response.status_code, 200, response.data)
            return {"lines": [user.get_full_name()]}

        with patch("onboarding.tasks.azure_ocr", side_effect=replace_document), \
                self.captureOnCommitCallbacks(execute=True):
            verify_filefield_task.run(
                profile._meta.model_name, profile.pk, "government_id",
                verification_field="gov_id_verified", note_field="gov_id_verification_note",
            )
        previous_name = profile.government_id.name
        profile.refresh_from_db()
        self.assertNotEqual(profile.government_id.name, previous_name)
        self.assertTrue(profile.government_id.storage.exists(profile.government_id.name))
        self.assertFalse(profile.gov_id_verified)
        self.assertIsNone(profile.gov_id_checked_at)

    def test_command_is_dry_run_by_default_and_apply_removes_only_recorded_ids(self):
        _, approved, _ = self.onboarding("pharmacist", gov_id_verified=True)
        _, rejected, _ = self.onboarding("otherstaff", gov_id_verification_note="Name mismatch")
        _, pending, _ = self.onboarding("explorer")
        approved_files = self.upload_ids(approved)
        rejected_files = self.upload_ids(rejected)
        pending_files = self.upload_ids(pending)
        approved.resume.save("resume.pdf", ContentFile(b"synthetic resume"))
        resume = [(approved.resume.storage, approved.resume.name)]

        output = StringIO()
        call_command("delete_recorded_gov_id_files", stdout=output)
        self.assertEqual(output.getvalue().strip(), "Candidates: 4, deleted: 0, failed: 0")
        self.assert_files(approved_files + rejected_files + pending_files + resume, exist=True)

        output = StringIO()
        call_command("delete_recorded_gov_id_files", apply=True, stdout=output)
        self.assertEqual(output.getvalue().strip(), "Candidates: 4, deleted: 4, failed: 0")
        self.assert_files(approved_files + rejected_files, exist=False)
        self.assert_files(pending_files + resume, exist=True)
        for profile in (approved, rejected, pending):
            profile.refresh_from_db()
            self.assertEqual(bool(profile.government_id), profile is pending)
            self.assertEqual(bool(profile.identity_secondary_file), profile is pending)

    def test_shared_legacy_files_remain_available_for_a_pending_profile(self):
        _, source, _ = self.onboarding("explorer")
        files = self.upload_ids(source)
        _, target, _ = self.onboarding(
            "otherstaff", government_id=source.government_id.name,
            identity_secondary_file=source.identity_secondary_file.name,
        )

        with self.captureOnCommitCallbacks(execute=True):
            record_gov_id_result(source, True, GovIdCheckMethod.AUTOMATIC_OCR)
        source.refresh_from_db()
        self.assertFalse(source.government_id)
        self.assertFalse(source.identity_secondary_file)
        self.assert_files(files, exist=True)

        with self.captureOnCommitCallbacks(execute=True):
            record_gov_id_result(target, True, GovIdCheckMethod.AUTOMATIC_OCR)
        self.assert_purged(target, files, verified=True, method=GovIdCheckMethod.AUTOMATIC_OCR)
