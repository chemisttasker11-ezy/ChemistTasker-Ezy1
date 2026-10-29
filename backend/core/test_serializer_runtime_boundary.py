"""Behavior controls run against the unchanged serializer helpers before relocation."""
import importlib
import ast
import os
import pickle
from pathlib import Path
import subprocess
import sys
from types import SimpleNamespace
from unittest import mock

from django.test import SimpleTestCase, TestCase
from rest_framework.exceptions import ValidationError

from core import serializer_lifecycle as legacy


class SerializerRuntimeBehaviorTests(SimpleTestCase):
    def cleanup_owner(self):
        return importlib.import_module(legacy._delete_file_if_unreferenced.__module__)

    def file(self, name="old/document.pdf"):
        return SimpleNamespace(name=name, storage=mock.Mock(), delete=mock.Mock())

    def model(self, exists=False):
        class FileOwner:
            objects = mock.Mock()
        FileOwner.objects.filter.return_value.exists.return_value = exists
        FileOwner.objects.filter.return_value.exclude.return_value.exists.return_value = exists
        return FileOwner

    def test_registry_keeps_exact_model_fields_and_order_without_queries(self):
        expected = {
            "OwnerOnboarding": ["profile_photo"],
            "PharmacistOnboarding": ["profile_photo", "government_id", "identity_secondary_file", "resume"],
            "OtherStaffOnboarding": ["profile_photo", "government_id", "identity_secondary_file", "ahpra_proof", "hours_proof", "certificate", "university_id", "cpr_certificate", "s8_certificate", "resume"],
            "ExplorerOnboarding": ["profile_photo", "government_id", "identity_secondary_file", "resume"],
            "Organization": ["cover_image"],
            "Pharmacy": ["methadone_s8_protocols", "qld_sump_docs", "sops", "induction_guides", "cover_image"],
            "Chain": ["logo"], "Message": ["attachment"], "PharmacyHubAttachment": ["file"],
        }
        actual = legacy._known_file_references()
        self.assertEqual([(model.__name__, field) for model, field in actual],
                         [(name, field) for name, fields in expected.items() for field in fields])
        for model, field in actual:
            self.assertEqual(model._meta.get_field(field).name, field)

    def test_other_reference_prevents_storage_deletion(self):
        model, file = self.model(exists=True), self.file()
        with mock.patch.object(self.cleanup_owner(), "_known_file_references", return_value=[(model, "document")]):
            self.assertFalse(legacy._delete_file_if_unreferenced(file))
        model.objects.filter.assert_called_once_with(document=file.name)
        file.storage.delete.assert_not_called()

    def test_current_instance_is_excluded_but_replacement_is_not_cleared(self):
        model, file = self.model(), self.file()
        instance = model()
        instance.pk, instance.document = 7, "new/document.pdf"
        with mock.patch.object(self.cleanup_owner(), "_known_file_references", return_value=[(model, "document")]):
            self.assertTrue(legacy._delete_file_if_unreferenced(file, current_instance=instance))
        model.objects.filter.return_value.exclude.assert_called_once_with(pk=7)
        file.storage.delete.assert_called_once_with(file.name)
        file.delete.assert_not_called()
        self.assertEqual(instance.document, "new/document.pdf")

    def test_foreign_instance_does_not_exclude_a_reference(self):
        model, file = self.model(), self.file()
        with mock.patch.object(self.cleanup_owner(), "_known_file_references", return_value=[(model, "document")]):
            self.assertTrue(legacy._delete_file_if_unreferenced(file, current_instance=SimpleNamespace(pk=7)))
        model.objects.filter.return_value.exclude.assert_not_called()

    def test_query_failure_propagates_before_storage_work(self):
        model, file = self.model(), self.file()
        model.objects.filter.side_effect = RuntimeError("reference query failed")
        with mock.patch.object(self.cleanup_owner(), "_known_file_references", return_value=[(model, "document")]):
            with self.assertRaisesRegex(RuntimeError, "reference query failed"):
                legacy._delete_file_if_unreferenced(file)
        file.storage.delete.assert_not_called()

    def test_storage_failure_retains_existing_false_result(self):
        file = self.file()
        file.storage.delete.side_effect = OSError("storage unavailable")
        with mock.patch.object(self.cleanup_owner(), "_known_file_references", return_value=[]):
            self.assertFalse(legacy._delete_file_if_unreferenced(file))

    def test_empty_file_skips_registry_and_storage(self):
        file = self.file(name="")
        with mock.patch.object(self.cleanup_owner(), "_known_file_references") as references:
            self.assertFalse(legacy._delete_file_if_unreferenced(file))
        references.assert_not_called()
        file.storage.delete.assert_not_called()

    def test_missing_bound_storage_uses_default_storage(self):
        file = SimpleNamespace(name="old/document.pdf")
        with mock.patch.object(self.cleanup_owner(), "_known_file_references", return_value=[]), \
                mock.patch.object(self.cleanup_owner(), "default_storage") as storage:
            self.assertTrue(legacy._delete_file_if_unreferenced(file))
        storage.delete.assert_called_once_with(file.name)

    def test_locked_identity_change_is_refused_without_saving(self):
        user = SimpleNamespace(first_name="Original", last_name="Name", mobile_number="0400000000",
                               is_mobile_verified=True, save=mock.Mock())
        with self.assertRaises(ValidationError) as error:
            legacy._update_locked_user_fields(user, {"first_name": "Other", "mobile_number": "0411111111"})
        self.assertEqual(set(error.exception.detail), {"first_name", "phone_number"})
        user.save.assert_not_called()

    def test_unverified_mobile_change_resets_otp_and_saves_exact_fields(self):
        user = SimpleNamespace(first_name="", last_name="", mobile_number=None, is_mobile_verified=False,
                               mobile_otp_code="123456", mobile_otp_created_at="old", save=mock.Mock())
        legacy._update_locked_user_fields(user, {"first_name": " First ", "mobile_number": " 0400000000 "})
        self.assertEqual((user.first_name, user.mobile_number, user.mobile_otp_code, user.mobile_otp_created_at),
                         ("First", "0400000000", None, None))
        user.save.assert_called_once_with(update_fields=["first_name", "mobile_number", "mobile_otp_code", "mobile_otp_created_at"])

    def test_unchanged_identity_does_not_save(self):
        user = SimpleNamespace(first_name="First", last_name="Last", mobile_number="0400000000",
                               is_mobile_verified=True, save=mock.Mock())
        legacy._update_locked_user_fields(user, {"first_name": " First ", "mobile_number": "0400000000"})
        user.save.assert_not_called()


class SerializerRuntimeOwnershipTests(SimpleTestCase):
    def test_historical_facades_reexport_canonical_objects(self):
        from core import numbers, serializer_mixins
        from core.integrations import abr
        from infrastructure import numbers as numeric_owner, serializer_lifecycle, serializer_mixins as mixin_owner
        from infrastructure.integrations import abr as abr_owner
        from users import identity_updates

        groups = (
            (legacy, serializer_lifecycle, ["verification_fields_changed", "_file_has_changed", "_delete_file_if_unreferenced", "_known_file_references", "_should_clear_flag", "RemoveOldFilesMixin"]),
            (legacy, identity_updates, ["_normalize_identity_value", "_update_locked_user_fields"]),
            (numbers, numeric_owner, ["quantize_decimal_6", "coerce_float_6"]),
            (serializer_mixins, mixin_owner, ["UploadValidationMixin"]),
            (abr, abr_owner, ["abn_lookup", "_parse_abn_html_fields"]),
        )
        for facade, owner, names in groups:
            for name in names:
                with self.subTest(path=f"{facade.__name__}.{name}"):
                    value = getattr(owner, name)
                    self.assertIs(getattr(facade, name), value)
                    historical_pickle = f"c{facade.__name__}\n{name}\n.".encode()
                    self.assertIs(pickle.loads(historical_pickle), value)
                    self.assertIs(pickle.loads(pickle.dumps(value)), value)

    def test_infrastructure_has_no_domain_or_composition_imports(self):
        root = Path(__file__).resolve().parents[1]
        modules = ["serializer_lifecycle.py", "serializer_mixins.py", "numbers.py", "integrations/abr.py"]
        domain_names = {"core", "composition", "users", "onboarding", "organizations", "chat", "pharmacy_hub", "client_profile"}
        for module in modules:
            tree = ast.parse((root / "infrastructure" / module).read_text())
            imports = [node.module for node in ast.walk(tree) if isinstance(node, ast.ImportFrom) and node.module]
            imports += [alias.name for node in ast.walk(tree) if isinstance(node, ast.Import) for alias in node.names]
            self.assertFalse({name.split(".")[0] for name in imports} & domain_names, module)

    def test_cold_worker_startup_binds_registry_without_http_queries_or_dispatch(self):
        script = '''
import sys
from unittest import mock
import django
with mock.patch('django.db.backends.utils.CursorWrapper.execute', side_effect=AssertionError('startup SQL')), mock.patch('django.db.backends.utils.CursorWrapper.executemany', side_effect=AssertionError('startup SQL')), mock.patch('celery.app.base.Celery.send_task', side_effect=AssertionError('startup delivery')), mock.patch('requests.sessions.Session.request', side_effect=AssertionError('startup HTTP')):
    django.setup()
    assert 'composition.urls' not in sys.modules
    from infrastructure.serializer_lifecycle import _known_file_references
    from composition.file_references import FILE_REFERENCES, configure_file_cleanup
    assert _known_file_references() == list(FILE_REFERENCES)
    configure_file_cleanup()
    assert _known_file_references() == list(FILE_REFERENCES)
    from onboarding.models import PharmacistOnboarding
    assert (PharmacistOnboarding, 'government_id') in _known_file_references()
    from django.urls import get_resolver
    get_resolver().url_patterns
    assert _known_file_references() == list(FILE_REFERENCES)
print('worker and HTTP registry ready without I/O')
'''
        result = subprocess.run([sys.executable, "-c", script], cwd=Path(__file__).resolve().parents[1],
                                env={**os.environ, "DJANGO_SETTINGS_MODULE": "core.contract_test_settings"},
                                capture_output=True, text=True, timeout=60)
        self.assertEqual(result.returncode, 0, result.stderr[-4000:])
        self.assertIn("worker and HTTP registry ready without I/O", result.stdout)

    def test_registry_returns_a_copy_and_missing_configuration_fails_closed(self):
        from infrastructure import serializer_lifecycle as owner
        references = owner._known_file_references()
        references.clear()
        self.assertEqual(len(owner._known_file_references()), 28)
        from django.core.exceptions import ImproperlyConfigured
        with mock.patch.object(owner, "_file_references", None):
            with self.assertRaises(ImproperlyConfigured):
                owner._delete_file_if_unreferenced(self.file())

    def file(self):
        return SimpleNamespace(name="old/document.pdf", storage=mock.Mock())


class FileReferenceDatabaseTests(TestCase):
    def profile_with_file(self):
        from client_profile.characterization_support import make_user
        from onboarding.models import OwnerOnboarding
        return OwnerOnboarding.objects.create(user=make_user("OWNER"), role="MANAGER",
                                              profile_photo="shared/reference.pdf")

    def test_another_domain_reference_protects_the_storage_object(self):
        from organizations.models import Organization
        profile = self.profile_with_file()
        Organization.objects.create(name="Reference holder", cover_image=profile.profile_photo.name)
        with mock.patch.object(profile.profile_photo.storage, "delete") as delete:
            self.assertFalse(legacy._delete_file_if_unreferenced(profile.profile_photo, current_instance=profile))
        delete.assert_not_called()

    def test_sole_current_reference_is_excluded_without_clearing_the_model_field(self):
        profile = self.profile_with_file()
        original = profile.profile_photo.name
        with mock.patch.object(profile.profile_photo.storage, "delete") as delete:
            self.assertTrue(legacy._delete_file_if_unreferenced(profile.profile_photo, current_instance=profile))
        delete.assert_called_once_with(original)
        self.assertEqual(profile.profile_photo.name, original)
        profile.refresh_from_db()
        self.assertEqual(profile.profile_photo.name, original)

