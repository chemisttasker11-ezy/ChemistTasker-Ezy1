"""Historical encryption-field imports and Django migration/deconstruction identity."""
from infrastructure.encrypted_fields import (
    ENCRYPTED_VALUE_PREFIX, EncryptedTextField, _build_fernet,
    base64, hashlib, Fernet, InvalidToken, settings, models,
)

# Bind metadata at the compatibility owner; generic encryption imports no domain.
EncryptedTextField.__module__ = __name__
