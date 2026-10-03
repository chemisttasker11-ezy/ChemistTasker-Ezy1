"""Backward-compatible serializer utility imports.

Active application code should import utilities from their authoritative core
or users modules. This module preserves legacy import paths.
"""
from core.numbers import coerce_float_6 as q6
from core.serializer_lifecycle import (
    RemoveOldFilesMixin,
    _delete_file_if_unreferenced,
    _file_has_changed,
    _known_file_references,
    _normalize_identity_value,
    _should_clear_flag,
    _update_locked_user_fields,
    verification_fields_changed,
)
from core.serializer_mixins import UploadValidationMixin
from users.normalization import normalize_email as clean_email
from users.presentation import (
    _build_absolute_media_url,
    _chat_member_identity,
    _get_user_short_bio,
    _resolve_user_profile_photo,
    _split_chat_display_name,
)

__all__ = [
    "verification_fields_changed",
    "_file_has_changed",
    "_known_file_references",
    "_delete_file_if_unreferenced",
    "_should_clear_flag",
    "_normalize_identity_value",
    "_update_locked_user_fields",
    "RemoveOldFilesMixin",
    "_get_user_short_bio",
    "q6",
    "clean_email",
    "UploadValidationMixin",
    "_build_absolute_media_url",
    "_chat_member_identity",
    "_resolve_user_profile_photo",
    "_split_chat_display_name",
]
