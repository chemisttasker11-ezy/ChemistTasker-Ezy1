"""Compatibility imports for the historical upload-validation path.

Runtime consumers use infrastructure.file_validation. All policies and implementation
objects below are the same objects; this adapter owns no validation rules.
"""
from infrastructure.file_validation import (
    ATTACHMENT_UPLOAD_POLICY,
    DOCUMENT_UPLOAD_POLICY,
    IMAGE_UPLOAD_POLICY,
    UploadPolicy,
    ValidationError,
    _read_head,
    _sniff_kind,
    dataclass,
    os,
    validate_upload_mapping,
    validate_uploaded_file,
    zipfile,
)
