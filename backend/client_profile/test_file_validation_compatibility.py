from django.test import SimpleTestCase

import client_profile.file_validation as legacy
import core.file_validation as core_validation


class FileValidationCompatibilityTests(SimpleTestCase):
    def test_legacy_module_reexports_core_validation_contract(self):
        names = [
            "UploadPolicy",
            "IMAGE_UPLOAD_POLICY",
            "DOCUMENT_UPLOAD_POLICY",
            "ATTACHMENT_UPLOAD_POLICY",
            "validate_uploaded_file",
            "validate_upload_mapping",
        ]
        for name in names:
            self.assertIs(getattr(legacy, name), getattr(core_validation, name))
