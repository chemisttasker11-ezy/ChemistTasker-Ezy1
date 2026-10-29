"""Upload validation remains identical through its historical path and lower-level owner."""
import ast
import pickle
from pathlib import Path

from django.test import SimpleTestCase

from core import file_validation as legacy
from infrastructure import file_validation as owner


class UploadInfrastructureContracts(SimpleTestCase):
    def test_historical_and_canonical_paths_share_every_policy_and_validator(self):
        names = ('UploadPolicy', 'IMAGE_UPLOAD_POLICY', 'DOCUMENT_UPLOAD_POLICY', 'ATTACHMENT_UPLOAD_POLICY',
                 '_read_head', '_sniff_kind', 'validate_uploaded_file', 'validate_upload_mapping')
        for name in names:
            with self.subTest(name=name):
                self.assertIs(getattr(legacy, name), getattr(owner, name))

    def test_historical_pickle_class_path_still_resolves(self):
        self.assertIs(pickle.loads(b'ccore.file_validation\nUploadPolicy\n.'), owner.UploadPolicy)
        policy = owner.UploadPolicy('test', ('pdf',), ('application/pdf',), 100)
        self.assertEqual(pickle.loads(pickle.dumps(policy)), policy)

    def test_infrastructure_imports_no_composition_or_business_domain(self):
        tree = ast.parse(Path(owner.__file__).read_text())
        imported = set()
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                imported.update(a.name.split('.')[0] for a in node.names)
            elif isinstance(node, ast.ImportFrom):
                self.assertEqual(node.level, 0)
                imported.add(node.module.split('.')[0])
        self.assertEqual(imported, {'os', 'zipfile', 'dataclasses', 'rest_framework'})

    def test_runtime_consumers_no_longer_reach_upload_validation_through_core(self):
        from core.test_backend_ownership_boundaries import runtime_files
        callers = []
        for path, _file, tree in runtime_files():
            for node in ast.walk(tree):
                if isinstance(node, ast.ImportFrom) and node.module == 'core.file_validation':
                    callers.append(path)
        self.assertEqual(callers, [])

    def test_compatibility_adapter_contains_no_duplicate_validation_implementation(self):
        tree = ast.parse(Path(legacy.__file__).read_text())
        self.assertFalse(any(isinstance(n, (ast.FunctionDef, ast.ClassDef, ast.Assign)) for n in tree.body))
