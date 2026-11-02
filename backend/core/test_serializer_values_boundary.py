"""Characterisation and ownership of the shared JSON-list input parser."""
import ast
import importlib
import pickle
from pathlib import Path

from django.test import SimpleTestCase
from rest_framework.exceptions import ValidationError

from core.serializer_values import json_list


class SerializerValuesBehaviourTests(SimpleTestCase):
    def test_existing_lists_keep_identity_and_contents(self):
        value = [None, 7, 'text', {'key': True}]
        self.assertIs(json_list(value, 'services'), value)

    def test_json_lists_and_empty_string_keep_existing_parsing(self):
        self.assertEqual(json_list('', 'services'), [])
        self.assertEqual(json_list('[null, 7, "text", {"key": true}]', 'services'),
                         [None, 7, 'text', {'key': True}])

    def test_malformed_json_keeps_label_and_existing_error(self):
        with self.assertRaises(ValidationError) as error:
            json_list('[', 'role requirements')
        self.assertEqual([str(detail) for detail in error.exception.detail],
                         ['role requirements must be a JSON list.'])

    def test_non_lists_keep_existing_error(self):
        for value in (None, {}, 1, False, (), '{}', 'null', '1', '"text"'):
            with self.subTest(value=value), self.assertRaises(ValidationError) as error:
                json_list(value, 'services')
            self.assertEqual([str(detail) for detail in error.exception.detail], ['services must be a list.'])


class SerializerValuesOwnershipTests(SimpleTestCase):
    def test_historical_exports_and_pickle_path_share_the_authoritative_implementation(self):
        from core import serializer_values as legacy
        from infrastructure import serializer_values as owner

        for name in ('json', 'serializers', 'json_list'):
            self.assertIs(getattr(legacy, name), getattr(owner, name))
        self.assertIs(pickle.loads(b'ccore.serializer_values\njson_list\n.'), owner.json_list)

    def test_neutral_parser_imports_no_backend_domain_or_composition(self):
        from infrastructure import serializer_values as owner

        tree = ast.parse(Path(owner.__file__).read_text())
        imports = set()
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                imports.update(alias.name for alias in node.names)
            elif isinstance(node, ast.ImportFrom):
                self.assertEqual(node.level, 0)
                imports.add(node.module)
        self.assertEqual(imports, {'json', 'rest_framework'})

    def test_shifts_runtime_has_no_reverse_import_of_core(self):
        from core.test_backend_ownership_boundaries import runtime_files

        callers = []
        for path, _file, tree in runtime_files():
            if not path.startswith('shifts/'):
                continue
            for node in ast.walk(tree):
                if isinstance(node, ast.Import):
                    modules = [alias.name for alias in node.names]
                elif isinstance(node, ast.ImportFrom) and node.level == 0:
                    modules = [node.module or '']
                else:
                    continue
                if any(module == 'core' or module.startswith('core.') for module in modules):
                    callers.append((path, node.lineno))
        self.assertEqual(callers, [])

    def test_all_shift_dispatch_consumers_keep_the_same_adapter_object(self):
        from core.task_queue import async_task
        from users.task_dispatch import async_task as canonical

        self.assertIs(async_task, canonical)
        for module in ('announcements', 'assignment', 'base', 'browse', 'cancellation', 'candidates',
                       'counter_offers', 'emails', 'interest', 'offers', 'tasks', 'worker_requests'):
            with self.subTest(module=module):
                self.assertIs(importlib.import_module(f'shifts.{module}').async_task, canonical)

    def test_historical_parser_facade_owns_no_duplicate_implementation(self):
        from core import serializer_values as legacy

        tree = ast.parse(Path(legacy.__file__).read_text())
        self.assertFalse(any(isinstance(node, (ast.FunctionDef, ast.ClassDef, ast.Assign))
                             for node in tree.body))
