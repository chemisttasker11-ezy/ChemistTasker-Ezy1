import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings
from django.db import models


ENCRYPTED_VALUE_PREFIX = "enc1$"


def _build_fernet() -> Fernet:
    secret = (getattr(settings, "SECRET_KEY", "") or "").encode("utf-8")
    digest = hashlib.sha256(secret).digest()
    key = base64.urlsafe_b64encode(digest)
    return Fernet(key)


class EncryptedTextField(models.TextField):
    """Field-level Fernet encryption with legacy-plaintext compatibility."""

    description = "TextField that encrypts values at rest"

    def from_db_value(self, value, expression, connection):
        return self._decrypt_if_needed(value)

    def to_python(self, value):
        if value is None or isinstance(value, str) is False:
            return value
        return self._decrypt_if_needed(value)

    def get_prep_value(self, value):
        value = super().get_prep_value(value)
        if value in (None, ""):
            return value
        if isinstance(value, str) and value.startswith(ENCRYPTED_VALUE_PREFIX):
            return value
        token = _build_fernet().encrypt(str(value).encode("utf-8")).decode("utf-8")
        return f"{ENCRYPTED_VALUE_PREFIX}{token}"

    def _decrypt_if_needed(self, value):
        if value in (None, "") or not isinstance(value, str):
            return value
        if not value.startswith(ENCRYPTED_VALUE_PREFIX):
            return value
        token = value[len(ENCRYPTED_VALUE_PREFIX):]
        try:
            return _build_fernet().decrypt(token.encode("utf-8")).decode("utf-8")
        except InvalidToken:
            # Graceful fallback so corrupted or legacy rows do not crash model reads.
            return value
