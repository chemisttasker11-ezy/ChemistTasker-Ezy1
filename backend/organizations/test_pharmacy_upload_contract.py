"""Pharmacy document and multipart-array wire contract shared by Expo and Vite.

These are HTTP boundary tests against the actual Django serializer and storage.
The file bytes live only under a disposable test MEDIA_ROOT.
"""
import json
from tempfile import TemporaryDirectory

from django.test import TestCase, override_settings
from django.core.files.uploadedfile import SimpleUploadedFile

from client_profile.characterization_support import client_for, make_owner_with_pharmacy


def sample_pdf(filename):
    return SimpleUploadedFile(filename, b"%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF\n", content_type="application/pdf")


class PharmacyMultipartContractTests(TestCase):
    def setUp(self):
        media = TemporaryDirectory()
        self.addCleanup(media.cleanup)
        settings_override = override_settings(MEDIA_ROOT=media.name)
        settings_override.enable()
        self.addCleanup(settings_override.disable)
        self.owner, self.pharmacy = make_owner_with_pharmacy("Multipart Pharmacy")
        self.client = client_for(self.owner)
        self.url = f"/api/v1/pharmacies/{self.pharmacy.pk}/"

    def test_certificate_and_json_arrays_survive_multipart_patch_and_read_back(self):
        response = self.client.patch(self.url, {
            "methadone_s8_protocols": sample_pdf("protocol.pdf"),
            "employment_types": json.dumps(["PART_TIME", "LOCUMS"]),
            "roles_needed": json.dumps(["PHARMACIST", "INTERN"]),
            "software": json.dumps([]),
            "services": json.dumps([]),
        }, format="multipart")
        self.assertEqual(response.status_code, 200, response.content)
        self.pharmacy.refresh_from_db()
        self.assertEqual(self.pharmacy.employment_types, ["PART_TIME", "LOCUMS"])
        self.assertEqual(self.pharmacy.roles_needed, ["PHARMACIST", "INTERN"])
        self.assertEqual(self.pharmacy.software, [])
        self.assertEqual(self.pharmacy.services, [])
        self.assertTrue(self.pharmacy.methadone_s8_protocols.name.endswith(".pdf"))
        read_back = self.client.get(self.url)
        self.assertEqual(read_back.status_code, 200, read_back.content)
        self.assertIn("protocol", read_back.data["methadone_s8_protocols"])
        self.assertEqual(read_back.data["employment_types"], ["PART_TIME", "LOCUMS"])
        self.assertEqual(read_back.data["roles_needed"], ["PHARMACIST", "INTERN"])

    def test_no_new_file_does_not_clear_existing_certificate(self):
        created = self.client.patch(self.url, {
            "methadone_s8_protocols": sample_pdf("existing.pdf"),
        }, format="multipart")
        self.assertEqual(created.status_code, 200, created.content)
        self.pharmacy.refresh_from_db()
        old_name = self.pharmacy.methadone_s8_protocols.name
        updated = self.client.patch(self.url, {"about": "Keep existing document"}, format="json")
        self.assertEqual(updated.status_code, 200, updated.content)
        self.pharmacy.refresh_from_db()
        self.assertEqual(self.pharmacy.methadone_s8_protocols.name, old_name)

    def test_other_document_fields_keep_their_existing_names(self):
        response = self.client.patch(self.url, {
            "sops": sample_pdf("sops.pdf"),
            "induction_guides": sample_pdf("induction.pdf"),
            "qld_sump_docs": sample_pdf("sump.pdf"),
        }, format="multipart")
        self.assertEqual(response.status_code, 200, response.content)
        self.pharmacy.refresh_from_db()
        for field in ("sops", "induction_guides", "qld_sump_docs"):
            self.assertTrue(getattr(self.pharmacy, field).name.endswith(".pdf"), field)

    def test_invalid_document_is_rejected_without_mutating_profile(self):
        original_name = self.pharmacy.name
        invalid = SimpleUploadedFile("blocked.exe", b"not a PDF", content_type="application/pdf")
        response = self.client.patch(self.url, {
            "name": "Should not persist",
            "methadone_s8_protocols": invalid,
        }, format="multipart")
        self.assertEqual(response.status_code, 400, response.content)
        self.pharmacy.refresh_from_db()
        self.assertEqual(self.pharmacy.name, original_name)
        self.assertFalse(self.pharmacy.methadone_s8_protocols)

    def test_json_update_without_files_keeps_arrays(self):
        response = self.client.patch(self.url, {
            "employment_types": ["FULL_TIME", "LOCUMS"],
            "roles_needed": ["PHARMACIST", "STUDENT"],
        }, format="json")
        self.assertEqual(response.status_code, 200, response.content)
        self.pharmacy.refresh_from_db()
        self.assertEqual(self.pharmacy.employment_types, ["FULL_TIME", "LOCUMS"])
        self.assertEqual(self.pharmacy.roles_needed, ["PHARMACIST", "STUDENT"])
