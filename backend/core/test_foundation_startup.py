"""Foundation services must be ready for workers without resolving HTTP routes."""
import os
import subprocess
import sys
from pathlib import Path

from django.test import SimpleTestCase


class FoundationStartupTests(SimpleTestCase):
    def test_membership_ports_are_ready_before_urls_without_startup_io(self):
        script = '''
import sys
from unittest import mock
import django
with mock.patch('django.db.backends.utils.CursorWrapper.execute', side_effect=AssertionError('startup SQL')), \
     mock.patch('celery.app.base.Celery.send_task', side_effect=AssertionError('startup delivery')), \
     mock.patch('celery.app.task.Task.apply_async', side_effect=AssertionError('startup task')), \
     mock.patch('requests.sessions.Session.request', side_effect=AssertionError('startup HTTP')), \
     mock.patch('django.urls.get_resolver', side_effect=AssertionError('startup URL resolution')), \
     mock.patch('django.urls.base.get_resolver', side_effect=AssertionError('startup URL resolution')):
    django.setup()
    assert 'composition.urls' not in sys.modules
    from organizations.membership_port import membership_operations
    from users.membership_port import membership_services
    from memberships import organization_management, identity_reads, account_management
    assert membership_operations().create_admin is organization_management.create_admin
    assert membership_services().accepted_for_user is identity_reads.accepted_for_user
    assert membership_services().convert_manager_account is account_management.convert_manager_account
    from users.feature_port import user_features
    from organizations.feature_port import pharmacy_features
    from memberships.employment_port import employment_services
    from onboarding.feature_port import verification_features
    from core.sitemap_port import sitemap_sources
    for services in (user_features(), pharmacy_features(), employment_services(),
                     verification_features(), sitemap_sources()):
        assert services.__dataclass_params__.frozen
        assert all(callable(getattr(services, name)) for name in services.__dataclass_fields__)
print('foundation membership services ready without URLs or I/O')
'''
        result = subprocess.run(
            [sys.executable, '-B', '-c', script],
            cwd=Path(__file__).resolve().parents[1],
            env={**os.environ, 'DJANGO_SETTINGS_MODULE': 'core.contract_test_settings'},
            capture_output=True, text=True, timeout=90,
        )
        self.assertEqual(result.returncode, 0, result.stderr[-4000:])
        self.assertIn('foundation membership services ready', result.stdout)

    def test_bindings_preserve_live_lookup_and_synchronous_refusal(self):
        from unittest import mock
        from users.feature_port import user_features
        from onboarding.feature_port import verification_features
        from organizations.feature_port import pharmacy_features
        from shifts.access import ShiftActionRefused

        with mock.patch('billing.utils.is_billing_active', return_value='current billing') as billing:
            self.assertEqual(user_features().is_billing_active(), 'current billing')
            billing.assert_called_once_with()
        refusal = ShiftActionRefused({'code': 'test refusal'})
        with mock.patch('shifts.cancellation.cancel_upcoming_assignments', side_effect=refusal) as cancel:
            with self.assertRaises(ShiftActionRefused) as raised:
                verification_features().cancel_upcoming_assignments('worker', reason='paused')
            self.assertIs(raised.exception, refusal)
            cancel.assert_called_once_with('worker', reason='paused')
        with mock.patch('workforce.permissions.can_manage_roster_pharmacy', return_value=False) as authority:
            self.assertFalse(pharmacy_features().can_manage_roster_pharmacy('worker', 'pharmacy'))
            authority.assert_called_once_with('worker', 'pharmacy')
