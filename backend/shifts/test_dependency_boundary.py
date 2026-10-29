"""Contracts for the queue and parsing services consumed by shift writers."""
from importlib import import_module
import ast
import pickle
from pathlib import Path
from unittest import mock

from celery import current_app
from django.test import SimpleTestCase, TestCase, override_settings
from rest_framework.exceptions import ValidationError

from core import serializer_values, task_queue
from shifts.context import json_list


DISPATCH_MODULES = (
    'announcements', 'assignment', 'base', 'browse', 'cancellation',
    'candidates', 'counter_offers', 'emails', 'interest', 'offers',
    'tasks', 'worker_requests',
)


class ShiftParsingBoundaryTests(SimpleTestCase):
    def test_list_identity_and_legacy_json_inputs(self):
        value = [{'role': 'PHARMACIST', 'count': 1}]
        self.assertIs(json_list(value, 'Support on shift'), value)
        self.assertEqual(json_list('[1, "two", null]', 'Tags'), [1, 'two', None])
        self.assertEqual(json_list('', 'Tags'), [])
        self.assertIs(serializer_values.json_list, json_list)

    def test_invalid_json_and_non_list_keep_distinct_errors(self):
        for value, message in (
            ('[', 'Tags must be a JSON list.'),
            (' ', 'Tags must be a JSON list.'),
            ('{}', 'Tags must be a list.'),
            ('null', 'Tags must be a list.'),
            (None, 'Tags must be a list.'),
            (False, 'Tags must be a list.'),
            ((), 'Tags must be a list.'),
        ):
            with self.subTest(value=value), self.assertRaises(ValidationError) as error:
                json_list(value, 'Tags')
            self.assertEqual([str(item) for item in error.exception.detail], [message])


class ShiftDependencyOwnershipTests(SimpleTestCase):
    def test_shift_runtime_imports_no_composition_module_at_any_depth(self):
        from core.test_backend_ownership_boundaries import runtime_files

        reverse_imports = []
        for relative, _path, tree in runtime_files():
            if not relative.startswith('shifts/'):
                continue
            for node in ast.walk(tree):
                if isinstance(node, ast.Import):
                    modules = [alias.name for alias in node.names]
                elif isinstance(node, ast.ImportFrom) and not node.level:
                    modules = [node.module or '']
                else:
                    continue
                if any(module == 'core' or module.startswith('core.') for module in modules):
                    reverse_imports.append((relative, node.lineno))
        self.assertEqual(reverse_imports, [])

    def test_parser_owner_is_neutral_and_historical_import_and_pickle_resolve(self):
        from infrastructure import serializer_values as owner
        from organizations import pharmacy_profile
        from core.test_backend_ownership_boundaries import BACKEND

        self.assertIs(json_list, owner.json_list)
        self.assertIs(pharmacy_profile.json_list, owner.json_list)
        self.assertIs(pickle.loads(b'ccore.serializer_values\njson_list\n.'), owner.json_list)
        backend_packages = {path.parent.name for path in BACKEND.glob('*/__init__.py')}
        for node in ast.walk(ast.parse(Path(owner.__file__).read_text())):
            if isinstance(node, ast.Import):
                self.assertFalse({alias.name.split('.')[0] for alias in node.names} & backend_packages)
            elif isinstance(node, ast.ImportFrom):
                self.assertEqual(node.level, 0)
                self.assertNotIn((node.module or '').split('.')[0], backend_packages)


@override_settings(CELERY_TASK_ALWAYS_EAGER=False)
class ShiftQueueBoundaryTests(TestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        current_app.loader.import_default_modules()

    def test_all_shift_dispatch_bindings_preserve_alias_payload_return_and_commit_notice(self):
        for module in DISPATCH_MODULES:
            dispatch = import_module(f'shifts.{module}').async_task
            self.assertIs(dispatch, task_queue.async_task)
            result = object()
            with self.subTest(module=module), mock.patch.object(
                current_app, 'send_task', return_value=result,
            ) as send, mock.patch('users.tasks._dispatch_notification') as notice:
                with self.captureOnCommitCallbacks(execute=False) as callbacks:
                    actual = dispatch('users.tasks.send_async_email', subject='Shift update',
                                      recipient_list=['worker@example.test'], context={'shift_link': '/shift/7'},
                                      q_options={'timeout': 0})
                self.assertIs(actual, result)
                send.assert_called_once_with('users.tasks.send_email_task', args=(), kwargs={
                    'subject': 'Shift update', 'recipient_list': ['worker@example.test'],
                    'context': {'shift_link': '/shift/7'},
                }, time_limit=0)
                notice.assert_not_called()
                self.assertEqual(len(callbacks), 1)
                callbacks[0]()
                self.assertEqual(notice.call_args.args[0]['action_url'], '/shift/7')

    def test_queue_outage_keeps_exception_and_existing_callback_order_for_every_binding(self):
        for module in DISPATCH_MODULES:
            with self.subTest(module=module), mock.patch.object(
                current_app, 'send_task', side_effect=ConnectionError('queue unavailable'),
            ):
                with self.captureOnCommitCallbacks(execute=False) as callbacks:
                    with self.assertRaisesMessage(ConnectionError, 'queue unavailable'):
                        import_module(f'shifts.{module}').async_task('users.tasks.send_async_email')
                self.assertEqual(len(callbacks), 1)
