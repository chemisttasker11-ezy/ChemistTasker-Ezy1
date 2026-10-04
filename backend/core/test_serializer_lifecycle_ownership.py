from types import SimpleNamespace
from unittest import mock

from django.test import SimpleTestCase

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
    def test_storage_cleanup_does_not_clear_a_replacement_field_on_the_instance(self):
        storage = mock.Mock()
        old_file = SimpleNamespace(name="old/certificate.pdf", storage=storage, delete=mock.Mock())
        instance = SimpleNamespace(certificate="new/certificate.pdf")

        with mock.patch("core.serializer_lifecycle._known_file_references", return_value=[]):
            deleted = _delete_file_if_unreferenced(old_file, current_instance=instance)

        self.assertTrue(deleted)
        storage.delete.assert_called_once_with("old/certificate.pdf")
        old_file.delete.assert_not_called()
        self.assertEqual(instance.certificate, "new/certificate.pdf")

    def test_lifecycle_helpers_are_defined_by_their_owners(self):
        expected = {
            verification_fields_changed: "core.serializer_lifecycle",
            _file_has_changed: "core.serializer_lifecycle",
            _delete_file_if_unreferenced: "core.serializer_lifecycle",
            _should_clear_flag: "core.serializer_lifecycle",
            _update_locked_user_fields: "core.serializer_lifecycle",
            RemoveOldFilesMixin: "core.serializer_lifecycle",
            UploadValidationMixin: "core.serializer_mixins",
            _build_absolute_media_url: "users.presentation",
            _get_user_short_bio: "users.presentation",
        }
        for value, module in expected.items():
            self.assertEqual(value.__module__, module, value.__name__)
