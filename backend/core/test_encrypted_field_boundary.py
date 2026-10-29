"""Historical encryption, migration path and stored-value contracts."""
import ast
import base64
import hashlib
import os
import pickle
import subprocess
import sys
from pathlib import Path

from cryptography.fernet import Fernet
from django.apps import apps
from django.db import connection
from django.test import SimpleTestCase, TestCase, override_settings

from client_profile.fields import EncryptedTextField, ENCRYPTED_VALUE_PREFIX
from client_profile.characterization_support import make_user
from onboarding.models import OtherStaffOnboarding, PharmacistOnboarding

FIXTURE_KEY = 'field-boundary-fixture-key'
# Replaced with a fixed pre-extraction saved value when this module is prepared.
SAVED_CIPHERTEXT = 'enc1$gAAAAABq4zEcaY0aY7BnMvoqRmr-JjnERRJB81IDp7RE6jjLN27m_GRKLqjYUADNAjrcf7k17EcFhNfzbCH4Eruw2pWS29tjMD3-gc8Mxq7mCxA-FjDgNsc='


@override_settings(SECRET_KEY=FIXTURE_KEY)
class EncryptedFieldBehaviourTests(SimpleTestCase):
    def test_saved_ciphertext_decrypts_and_field_keeps_historical_deconstruction_pickle_path(self):
        field = EncryptedTextField(blank=True, null=True)
        self.assertEqual(field.to_python(SAVED_CIPHERTEXT), 'fixture-tax-reference')
        self.assertEqual(field.from_db_value(SAVED_CIPHERTEXT, None, None), 'fixture-tax-reference')
        self.assertEqual(field.deconstruct()[1], 'client_profile.fields.EncryptedTextField')
        self.assertEqual(field.deconstruct()[3], {'blank': True, 'null': True})
        self.assertIs(pickle.loads(pickle.dumps(EncryptedTextField)), EncryptedTextField)

    def test_plaintext_empty_none_nonstrings_and_corrupt_values_keep_legacy_behavior(self):
        field = EncryptedTextField()
        for value in (None, '', 'legacy unencrypted value', 'enc1$corrupt', 42, b'bytes'):
            with self.subTest(value=value):
                self.assertEqual(field.to_python(value), value)
                self.assertEqual(field.from_db_value(value, None, None), value)
        self.assertIsNone(field.get_prep_value(None))
        self.assertEqual(field.get_prep_value(''), '')
        self.assertEqual(field.get_prep_value('enc1$corrupt'), 'enc1$corrupt')

    def test_new_values_keep_key_derivation_and_valid_ciphertext_preparation_reencrypts_plaintext(self):
        field = EncryptedTextField()
        for value in ('123456789', 'Unicode قيمة', 123):
            encrypted = field.get_prep_value(value)
            self.assertTrue(encrypted.startswith('enc1$'))
            fernet = Fernet(base64.urlsafe_b64encode(hashlib.sha256(FIXTURE_KEY.encode()).digest()))
            self.assertEqual(fernet.decrypt(encrypted[5:].encode()).decode(), str(value))
            # TextField.get_prep_value calls to_python first: valid ciphertext
            # is decrypted and re-encrypted with a fresh Fernet nonce.
            prepared_again = field.get_prep_value(encrypted)
            self.assertEqual(fernet.decrypt(prepared_again[5:].encode()).decode(), str(value))
        self.assertEqual(ENCRYPTED_VALUE_PREFIX, 'enc1$')

    def test_wrong_key_preserves_the_saved_encrypted_value(self):
        with override_settings(SECRET_KEY='different-fixture-key'):
            self.assertEqual(EncryptedTextField().to_python(SAVED_CIPHERTEXT), SAVED_CIPHERTEXT)


@override_settings(SECRET_KEY=FIXTURE_KEY)
class EncryptedFieldStorageTests(TestCase):
    def test_both_historical_models_keep_field_identity_encrypted_storage_and_legacy_reads(self):
        for model, role in ((PharmacistOnboarding, 'PHARMACIST'), (OtherStaffOnboarding, 'OTHER_STAFF')):
            with self.subTest(model=model.__name__):
                self.assertIs(apps.get_model('client_profile', model.__name__), model)
                field = model._meta.get_field('tfn_number')
                self.assertIs(type(field), EncryptedTextField)
                self.assertEqual(field.deconstruct()[1], 'client_profile.fields.EncryptedTextField')
                profile = model.objects.create(user=make_user(role), tfn_number='fixture-tax-reference')
                table = connection.ops.quote_name(model._meta.db_table)
                with connection.cursor() as cursor:
                    cursor.execute(f'SELECT tfn_number FROM {table} WHERE id = %s', [profile.pk])
                    stored = cursor.fetchone()[0]
                self.assertTrue(stored.startswith('enc1$'))
                self.assertNotEqual(stored, 'fixture-tax-reference')
                profile.refresh_from_db()
                self.assertEqual(profile.tfn_number, 'fixture-tax-reference')
                for raw, expected in ((SAVED_CIPHERTEXT, 'fixture-tax-reference'), ('legacy plaintext', 'legacy plaintext'), ('enc1$corrupt', 'enc1$corrupt'), (None, None), ('', '')):
                    with connection.cursor() as cursor:
                        cursor.execute(f'UPDATE {table} SET tfn_number = %s WHERE id = %s', [raw, profile.pk])
                    profile.refresh_from_db()
                    self.assertEqual(profile.tfn_number, expected)


class EncryptedFieldOwnershipTests(SimpleTestCase):
    def test_legacy_field_and_helper_exports_are_canonical_objects(self):
        from client_profile import fields as historical
        from infrastructure import encrypted_fields as owner

        for name in ('EncryptedTextField', 'ENCRYPTED_VALUE_PREFIX', '_build_fernet',
                     'base64', 'hashlib', 'Fernet', 'InvalidToken', 'settings', 'models'):
            self.assertIs(getattr(historical, name), getattr(owner, name))
        self.assertEqual(owner.EncryptedTextField.__module__, 'client_profile.fields')

    def test_generic_encryption_imports_no_business_domain(self):
        from infrastructure import encrypted_fields as owner

        imports = set()
        for node in ast.walk(ast.parse(Path(owner.__file__).read_text())):
            if isinstance(node, ast.Import):
                imports.update(alias.name for alias in node.names)
            elif isinstance(node, ast.ImportFrom):
                self.assertEqual(node.level, 0)
                imports.add(node.module)
        self.assertEqual(imports, {'base64', 'hashlib', 'cryptography.fernet', 'django.conf', 'django.db'})

    def test_historical_migration_state_uses_the_same_field_class_and_path_without_sql(self):
        from django.db.migrations.loader import MigrationLoader

        state = MigrationLoader(None).project_state()
        for model_name in ('pharmacistonboarding', 'otherstaffonboarding'):
            field = state.models[('client_profile', model_name)].fields['tfn_number']
            self.assertIs(type(field), EncryptedTextField)
            self.assertEqual(field.deconstruct()[1], 'client_profile.fields.EncryptedTextField')

    def test_neutral_first_and_legacy_first_imports_keep_metadata_before_model_discovery(self):
        child = '''
import importlib, sys
from unittest import mock
for name in sys.argv[1:]:
    importlib.import_module(name)
with mock.patch('django.db.backends.utils.CursorWrapper.execute', side_effect=AssertionError('startup SQL')), mock.patch('celery.app.base.Celery.send_task', side_effect=AssertionError('startup delivery')):
    import django
    django.setup()
from client_profile.fields import EncryptedTextField as old
from infrastructure.encrypted_fields import EncryptedTextField as new
from onboarding.models import OtherStaffOnboarding, PharmacistOnboarding
assert old is new
assert new().deconstruct()[1] == 'client_profile.fields.EncryptedTextField'
for model in (OtherStaffOnboarding, PharmacistOnboarding):
    assert type(model._meta.get_field('tfn_number')) is new
print('encryption migration identity ready')
'''
        for order in (('infrastructure.encrypted_fields',), ('client_profile.fields',)):
            with self.subTest(order=order):
                result = subprocess.run([sys.executable, '-c', child, *order],
                    cwd=Path(__file__).resolve().parents[1],
                    env={**os.environ, 'DJANGO_SETTINGS_MODULE': 'core.contract_test_settings'},
                    capture_output=True, text=True, timeout=60)
                self.assertEqual(result.returncode, 0, result.stderr[-3000:])
                self.assertIn('encryption migration identity ready', result.stdout)
