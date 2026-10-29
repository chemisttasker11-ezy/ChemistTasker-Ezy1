"""Before/after contracts for the historical queue adapter, without provider traffic."""
from datetime import datetime
import ast
import pickle
from pathlib import Path
from unittest import mock

from celery import current_app
from django.db import transaction
from django.test import SimpleTestCase, TestCase, override_settings
from django.utils import timezone

from core import task_queue

EMAIL = 'users.tasks.send_async_email'
REGISTERED_EMAIL = 'users.tasks.send_email_task'
PLAIN_TASK = 'client_profile.tasks.send_shift_reminders'


def loaded_app():
    app = current_app._get_current_object()
    app.loader.import_default_modules()
    return app


class TaskDispatchBehaviourTests(SimpleTestCase):
    @override_settings(CELERY_TASK_ALWAYS_EAGER=False, TIME_ZONE='Australia/Brisbane')
    def test_string_dispatch_preserves_arguments_options_return_value_and_alias(self):
        app = loaded_app()
        eta = datetime(2026, 10, 29, 12, 0)
        result = object()
        with mock.patch.object(app, 'send_task', return_value=result) as send:
            actual = task_queue.async_task(PLAIN_TASK, 7, flag=True, q_options={'eta': eta, 'timeout': 0})
        self.assertIs(actual, result)
        send.assert_called_once_with(PLAIN_TASK, args=(7,), kwargs={'flag': True},
                                     eta=timezone.make_aware(eta), time_limit=0)
        self.assertEqual(task_queue.registered_task_name(EMAIL), REGISTERED_EMAIL)

    @override_settings(CELERY_TASK_ALWAYS_EAGER=True)
    def test_eager_alias_uses_task_object_without_broker(self):
        app = loaded_app()
        result = object()
        with mock.patch.object(app, 'send_task') as send, mock.patch.object(
            app.tasks[REGISTERED_EMAIL], 'apply_async', return_value=result,
        ) as apply:
            actual = task_queue.async_task(EMAIL, suppress_auto_notification=True)
        self.assertIs(actual, result)
        send.assert_not_called()
        apply.assert_called_once_with(args=(), kwargs={})

    def test_task_object_keeps_its_own_keywords_and_aware_eta(self):
        task = mock.Mock()
        eta = timezone.now()
        notification = {'title': 'caller-owned'}
        result = task_queue.async_task(task, 7, notification=notification,
                                       q_options={'eta': eta, 'timeout': 30})
        self.assertIs(result, task.apply_async.return_value)
        task.apply_async.assert_called_once_with(args=(7,), kwargs={'notification': notification},
                                                eta=eta, time_limit=30)

    def test_unknown_task_retries_registry_import_then_raises_same_error(self):
        app = loaded_app()
        name = 'missing.task_dispatch_boundary_contract'
        self.assertNotIn(name, app.tasks)
        with mock.patch.object(app.loader, 'import_default_modules') as load:
            with self.assertRaisesMessage(LookupError, f'Celery task is not registered: {name}'):
                task_queue.registered_task_name(name)
        load.assert_called_once_with()

    def test_non_task_object_is_rejected(self):
        with self.assertRaisesRegex(TypeError, 'Expected a registered Celery task or task name'):
            task_queue.async_task(object())


@override_settings(CELERY_TASK_ALWAYS_EAGER=False)
class EmailNotificationDispatchBehaviourTests(TestCase):
    def test_automatic_notice_is_deferred_and_keeps_action_priority_and_queue_payload(self):
        app = loaded_app()
        context = {'action_url': '/explicit', 'shift_link': '/shift'}
        with mock.patch.object(app, 'send_task') as send, mock.patch('users.tasks._dispatch_notification') as notify:
            with self.captureOnCommitCallbacks(execute=False) as callbacks:
                task_queue.async_task(EMAIL, subject='Welcome', recipient_list=['worker@example.test'],
                                      template_name='emails/welcome_email.html', context=context)
            notify.assert_not_called()
            self.assertEqual(len(callbacks), 1)
            callbacks[0]()
        send.assert_called_once_with(REGISTERED_EMAIL, args=(), kwargs={
            'subject': 'Welcome', 'recipient_list': ['worker@example.test'],
            'template_name': 'emails/welcome_email.html', 'context': context,
        })
        notify.assert_called_once_with({
            'title': 'Welcome', 'body': '', 'action_url': '/explicit',
            'payload': {'notification_kind': 'email_notification', 'template_name': 'emails/welcome_email.html'},
        }, ['worker@example.test'], 'Welcome')

    def test_non_mapping_context_uses_dashboard_and_explicit_notice_overrides_suppression(self):
        app = loaded_app()
        with mock.patch.object(app, 'send_task'), mock.patch('users.tasks._dispatch_notification') as notify:
            with self.captureOnCommitCallbacks(execute=True):
                task_queue.async_task(EMAIL, context=['legacy'], subject='Fallback')
            self.assertEqual(notify.call_args.args[0]['action_url'], '/dashboard')
            notify.reset_mock()
            explicit = {'title': 'Explicit', 'action_url': '/existing'}
            with self.captureOnCommitCallbacks(execute=True):
                task_queue.async_task(EMAIL, notification=explicit, suppress_auto_notification=True)
            notify.assert_called_once_with(explicit, [], '')

    def test_suppressed_automatic_notice_adds_no_callback(self):
        app = loaded_app()
        with mock.patch.object(app, 'send_task') as send:
            with self.captureOnCommitCallbacks(execute=True) as callbacks:
                task_queue.async_task(EMAIL, notification={}, suppress_auto_notification=True)
        self.assertEqual(callbacks, [])
        send.assert_called_once_with(REGISTERED_EMAIL, args=(), kwargs={})

    def test_enqueue_failure_preserves_existing_callback_registration_and_exception(self):
        app = loaded_app()
        # This is the existing failure order, not a reliability-policy correction.
        with mock.patch.object(app, 'send_task', side_effect=ConnectionError('queue unavailable')):
            with self.captureOnCommitCallbacks(execute=False) as callbacks:
                with self.assertRaisesMessage(ConnectionError, 'queue unavailable'):
                    task_queue.async_task(EMAIL, subject='Existing failure order')
        self.assertEqual(len(callbacks), 1)

    def test_database_rollback_drops_notice_without_reversing_existing_queue_attempt(self):
        app = loaded_app()
        with mock.patch.object(app, 'send_task') as send, mock.patch('users.tasks._dispatch_notification') as notify:
            with self.captureOnCommitCallbacks(execute=True) as callbacks:
                with self.assertRaisesMessage(RuntimeError, 'rollback'):
                    with transaction.atomic():
                        task_queue.async_task(EMAIL)
                        raise RuntimeError('rollback')
        self.assertEqual(callbacks, [])
        notify.assert_not_called()
        send.assert_called_once()


class TaskDispatchOwnershipTests(SimpleTestCase):
    def test_historical_queue_exports_are_the_authoritative_objects(self):
        from infrastructure import task_queue as infrastructure
        from users import task_dispatch

        for name in ('async_task', 'registered_task_name', 'CELERY_TASK_ALIASES'):
            self.assertIs(getattr(task_queue, name), getattr(task_dispatch, name))
        for name in ('_celery_options', '_TASK_REGISTRY_LOAD_LOCK', 'current_app'):
            self.assertIs(getattr(task_queue, name), getattr(infrastructure, name))
        self.assertIs(pickle.loads(b'ccore.task_queue\nasync_task\n.'), task_dispatch.async_task)

    def test_generic_queue_mechanics_import_no_business_domain_or_composition(self):
        from infrastructure import task_queue as infrastructure
        from core.test_backend_ownership_boundaries import BACKEND

        apps = {p.parent.name for p in BACKEND.glob('*/__init__.py')}
        tree = ast.parse(Path(infrastructure.__file__).read_text())
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                self.assertFalse({alias.name.split('.')[0] for alias in node.names} & apps)
            elif isinstance(node, ast.ImportFrom):
                self.assertEqual(node.level, 0)
                self.assertNotIn(node.module.split('.')[0], apps)
            elif isinstance(node, ast.Constant) and isinstance(node.value, str):
                self.assertFalse(node.value.startswith(('users.', 'core.', 'client_profile.')))

    def test_users_runtime_has_no_reverse_import_of_core(self):
        from core.test_backend_ownership_boundaries import runtime_files

        callers = []
        for path, _file, tree in runtime_files():
            if not path.startswith('users/'):
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

    def test_historical_facade_owns_no_duplicate_dispatch_implementation(self):
        tree = ast.parse(Path(task_queue.__file__).read_text())
        self.assertFalse(any(isinstance(node, (ast.FunctionDef, ast.ClassDef, ast.Assign))
                             for node in tree.body))
