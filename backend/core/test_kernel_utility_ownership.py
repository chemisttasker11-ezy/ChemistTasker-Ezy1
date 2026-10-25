from decimal import Decimal
from io import BytesIO
import zipfile

from django.test import SimpleTestCase
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.exceptions import ValidationError
from core.file_validation import ATTACHMENT_UPLOAD_POLICY, DOCUMENT_UPLOAD_POLICY, validate_uploaded_file

from core.numbers import coerce_float_6, quantize_decimal_6
from users.normalization import normalize_email, sanitize_email_text
from users.role_labels import other_staff_role_label


class KernelUtilityOwnershipTests(SimpleTestCase):
    def test_uploads_reject_unconfirmed_bytes_despite_allowed_declared_type(self):
        for policy in (ATTACHMENT_UPLOAD_POLICY, DOCUMENT_UPLOAD_POLICY):
            for name, mime in (("file.pdf", "application/pdf"), ("file.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"), ("file.png", "image/png")):
                for content in (b"", b"<script>private()</script>"):
                    with self.subTest(policy=policy.label, name=name, content=content):
                        upload = SimpleUploadedFile(name, content, content_type=mime)
                        with self.assertRaises(ValidationError):
                            validate_uploaded_file(upload, policy)

    def test_uploads_accept_byte_confirmed_documents_and_restore_stream(self):
        docx = BytesIO()
        with zipfile.ZipFile(docx, "w") as archive:
            archive.writestr("[Content_Types].xml", "<Types/>")
            archive.writestr("word/document.xml", "<document/>")
        for name, content in (("file.pdf", b"%PDF-1.7\nfixture"), ("file.docx", docx.getvalue()), ("file.png", b"\x89PNG\r\n\x1a\nfixture"), ("file.jpg", b"\xff\xd8\xfffixture"), ("file.webp", b"RIFFxxxxWEBPfixture"), ("file.gif", b"GIF89afixture")):
            with self.subTest(name=name):
                upload = SimpleUploadedFile(name, content, content_type="application/octet-stream")
                validate_uploaded_file(upload, ATTACHMENT_UPLOAD_POLICY)
                self.assertEqual(upload.tell(), 0)

    def test_shared_helpers_keep_exact_semantics(self):
        self.assertEqual(sanitize_email_text(" Te\u200bst @Example.COM "), "Test@Example.COM")
        self.assertEqual(normalize_email("  TeSt@Example.COM  "), "test@example.com")
        self.assertEqual(quantize_decimal_6("1.23456789"), Decimal("1.234568"))
        self.assertEqual(coerce_float_6("1.23456789"), 1.234568)

    def test_role_label_is_owned_by_users(self):
        self.assertEqual(other_staff_role_label("INTERN"), "Intern Pharmacist")
