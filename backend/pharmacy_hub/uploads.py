"""Pharmacy hub attachment storage paths."""
from infrastructure.uploads import unique_upload_path as _unique_upload_path


def hub_attachment_upload_path(instance, filename):
    return _unique_upload_path("pharmacy_hub/attachments", filename)
