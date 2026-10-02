from django.test import SimpleTestCase

from client_profile.domains.common import serializers as legacy
from core.serializer_lifecycle import (
    RemoveOldFilesMixin,
    _delete_file_if_unreferenced,
    _file_has_changed,
    _should_clear_flag,
    _update_locked_user_fields,
    verification_fields_changed,
)
from core.serializer_mixins import UploadValidationMixin
from users.presentation import _build_absolute_media_url, _get_user_short_bio


class SerializerLifecycleOwnershipTests(SimpleTestCase):
    def test_legacy_lifecycle_exports_point_to_core(self):
        expected = {
            "verification_fields_changed": verification_fields_changed,
            "_file_has_changed": _file_has_changed,
            "_delete_file_if_unreferenced": _delete_file_if_unreferenced,
            "_should_clear_flag": _should_clear_flag,
            "_update_locked_user_fields": _update_locked_user_fields,
            "RemoveOldFilesMixin": RemoveOldFilesMixin,
            "UploadValidationMixin": UploadValidationMixin,
            "_build_absolute_media_url": _build_absolute_media_url,
            "_get_user_short_bio": _get_user_short_bio,
        }
        for name, value in expected.items():
            self.assertIs(getattr(legacy, name), value)
