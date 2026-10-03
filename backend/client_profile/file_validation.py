"""Backward-compatible upload validation imports.

Cross-cutting upload validation is owned by `core.file_validation`. This
module preserves the historical client_profile import path.
"""
from core.file_validation import (
    ATTACHMENT_UPLOAD_POLICY,
    DOCUMENT_UPLOAD_POLICY,
    IMAGE_UPLOAD_POLICY,
    UploadPolicy,
    validate_upload_mapping,
    validate_uploaded_file,
)

__all__ = [
    "UploadPolicy",
    "IMAGE_UPLOAD_POLICY",
    "DOCUMENT_UPLOAD_POLICY",
    "ATTACHMENT_UPLOAD_POLICY",
    "validate_uploaded_file",
    "validate_upload_mapping",
]
