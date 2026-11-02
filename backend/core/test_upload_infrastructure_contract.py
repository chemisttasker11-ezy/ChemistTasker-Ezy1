"""Upload validation remains identical through its historical path and lower-level owner."""
import ast
import pickle
from pathlib import Path

from django.test import SimpleTestCase

from core import file_validation as legacy
from infrastructure import file_validation as owner


def legacy_upload_import_lines(tree):
    """Find historical imports in either Python import form, including aliases."""
    lines = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            if any(alias.name == 'core.file_validation' or alias.name.startswith('core.file_validation.')
                   for alias in node.names):
                lines.append(node.lineno)
        elif isinstance(node, ast.ImportFrom) and node.level == 0:
            if (node.module == 'core.file_validation'
                    or (node.module or '').startswith('core.file_validation.')
                    or (node.module == 'core' and any(alias.name == 'file_validation' for alias in node.names))):
                lines.append(node.lineno)
    return lines


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
            callers.extend((path, line) for line in legacy_upload_import_lines(tree))
        self.assertEqual(callers, [])

    def test_import_guard_covers_both_forms_aliases_and_nested_imports(self):
        for source in (
            'from core.file_validation import validate_uploaded_file',
            'import core.file_validation',
            'import os, core.file_validation as validation',
            'from core import file_validation as validation',
            'def deferred():\n    import core.file_validation',
        ):
            with self.subTest(source=source):
                self.assertEqual(len(legacy_upload_import_lines(ast.parse(source))), 1)
        self.assertEqual(legacy_upload_import_lines(ast.parse(
            'from infrastructure.file_validation import validate_uploaded_file\n'
            'from core import serializer_values\n'
            'import infrastructure.file_validation as validation\n'
            'note = "import core.file_validation"'
        )), [])

    def test_compatibility_adapter_contains_no_duplicate_validation_implementation(self):
        tree = ast.parse(Path(legacy.__file__).read_text())
        self.assertFalse(any(isinstance(n, (ast.FunctionDef, ast.ClassDef, ast.Assign)) for n in tree.body))
