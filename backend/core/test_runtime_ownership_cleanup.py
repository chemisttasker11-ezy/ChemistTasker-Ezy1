"""Historical upload names remain valid while models import their actual owners."""
import importlib
import pickle
from types import SimpleNamespace
from unittest import mock
from django.test import SimpleTestCase

class UploadPathBehaviourTests(SimpleTestCase):
    def test_paths_preserve_prefix_extension_and_uuid(self):
        from core import uploads
        from client_profile.models.common import chat_upload_path, hub_attachment_upload_path
        with mock.patch.object(uploads.uuid, 'uuid4', return_value=SimpleNamespace(hex='fixed')):
            self.assertEqual(uploads.unique_upload_path('proof', 'Report.PDF'), 'proof/fixed.pdf')
            self.assertEqual(chat_upload_path(SimpleNamespace(conversation_id=7), 'PHOTO.PNG'), 'chat/7/fixed.png')
            self.assertEqual(chat_upload_path(SimpleNamespace(conversation_id=None), 'noextension'), 'chat/new/fixed')
            self.assertEqual(hub_attachment_upload_path(None, 'report.PDF'), 'pharmacy_hub/attachments/fixed.pdf')
        self.assertEqual(uploads.safe_extension(None), '')

    def test_historical_callables_keep_pickle_and_migration_identity(self):
        from client_profile.models import common
        from django.db.migrations.loader import MigrationLoader
        state = MigrationLoader(None).project_state()
        for name in ('chat_upload_path', 'hub_attachment_upload_path'):
            fn = getattr(common, name)
            self.assertIs(pickle.loads(pickle.dumps(fn)), fn)
        chat_field = state.models[('chat', 'message')].fields['attachment']
        self.assertIs(chat_field.upload_to, common.chat_upload_path)


class UploadOwnershipTests(SimpleTestCase):
    def test_historical_exports_are_identical_to_domain_owners(self):
        from core import uploads as old
        from infrastructure import uploads as new
        from client_profile.models import common
        from chat.uploads import chat_upload_path
        from pharmacy_hub.uploads import hub_attachment_upload_path
        for name in ('os', 'uuid', 'unique_upload_path', 'safe_extension'):
            self.assertIs(getattr(old, name), getattr(new, name))
        self.assertIs(common.chat_upload_path, chat_upload_path)
        self.assertIs(common.hub_attachment_upload_path, hub_attachment_upload_path)
        from chat.models import Message
        from pharmacy_hub.models import PharmacyHubAttachment
        self.assertIs(Message._meta.get_field('attachment').upload_to, chat_upload_path)
        self.assertIs(PharmacyHubAttachment._meta.get_field('file').upload_to, hub_attachment_upload_path)

    def test_runtime_consumers_use_owned_dispatch_and_path_implementations(self):
        import ast
        from core.test_backend_ownership_boundaries import runtime_files
        for relative, _, tree in runtime_files():
            if relative.startswith('core/'):
                continue
            for node in ast.walk(tree):
                if isinstance(node, ast.ImportFrom):
                    self.assertNotIn(node.module, ('core.task_queue', 'core.uploads'), relative)
                if isinstance(node, ast.Import):
                    self.assertFalse(any(a.name in ('core.task_queue', 'core.uploads') for a in node.names), relative)

    def test_fresh_domain_first_and_legacy_first_paths_keep_migration_identity(self):
        import os
        import subprocess
        import sys
        from pathlib import Path
        child = '''
import importlib,sys
for name in sys.argv[1:]: importlib.import_module(name)
import django
django.setup()
from chat.models import Message
from chat.uploads import chat_upload_path
from pharmacy_hub.models import PharmacyHubAttachment
from pharmacy_hub.uploads import hub_attachment_upload_path
from client_profile.models.common import chat_upload_path as historical
assert historical is chat_upload_path
assert chat_upload_path.__module__ == 'client_profile.models.common'
assert hub_attachment_upload_path.__module__ == 'client_profile.models.common'
assert Message._meta.get_field('attachment').upload_to is historical
assert PharmacyHubAttachment._meta.get_field('file').upload_to is hub_attachment_upload_path
'''
        for order in (('chat.uploads', 'pharmacy_hub.uploads'), ('core.uploads',)):
            result = subprocess.run([sys.executable, '-c', child, *order],
                cwd=Path(__file__).resolve().parents[1], env=os.environ,
                capture_output=True, text=True, timeout=60)
            self.assertEqual(result.returncode, 0, result.stderr[-3000:])
