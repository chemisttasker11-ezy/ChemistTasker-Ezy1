"""Upload-path helpers shared by the domain models.

`client_profile.models.common` re-exports these under their historical names (`_safe_ext`, `_unique_upload_path`).
They live outside the `client_profile.models` package so a domain model module can use them without importing the
client_profile model facade, which itself imports every domain model module.
"""
import os
import uuid


def safe_extension(filename):
    _base, ext = os.path.splitext(filename or "")
    return ext.lower()


def unique_upload_path(prefix, filename):
    return f"{prefix}/{uuid.uuid4().hex}{safe_extension(filename)}"
