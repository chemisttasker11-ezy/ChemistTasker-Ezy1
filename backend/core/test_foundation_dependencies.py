"""Operational foundations cannot import feature implementations, even lazily."""
import ast

from django.test import SimpleTestCase
from core.test_backend_ownership_boundaries import runtime_files


FEATURE_DEPENDENCIES = {
    'onboarding': {'shifts', 'chat', 'rewards', 'talent'},
    'organizations': {'shifts', 'workforce'},
    'memberships': {'shifts', 'workforce'},
    'users': {'billing', 'chat', 'public_hub', 'rewards', 'shifts', 'talent'},
    'core': {'public_hub', 'chat', 'marketplace', 'shifts', 'worker_finance'},
    'client_profile': {'shifts', 'chat', 'pharmacy_hub'},
}

# 2026-11-02: exact historical/project composition contracts, not business workflows.
# These keep URL ordering, model/task import identity and migration/pickle paths.
COMPATIBILITY_SYMBOLS = {
    ('core/urls.py', 'public_hub.attachment_access'): ('HubMediaAccess',),
    ('core/urls.py', 'public_hub.media'): ('deny_raw_media',),
    ('core/api_v1_urls.py', 'worker_finance'): ('legacy',),
    ('core/routing.py', 'chat.routing'): ('websocket_urlpatterns',),
    ('client_profile/models/common.py', 'chat.uploads'): ('chat_upload_path',),
    ('client_profile/models/common.py', 'pharmacy_hub.uploads'): ('hub_attachment_upload_path',),
    ('client_profile/models/shifts.py', 'shifts.models'): (
        'LeaveRequest', 'Shift', 'ShiftCounterOffer', 'ShiftCounterOfferSlot',
        'ShiftDescriptionTemplate', 'ShiftInterest', 'ShiftOffer', 'ShiftProfileAccessAudit',
        'ShiftRejection', 'ShiftSaved', 'ShiftSlot', 'ShiftSlotAssignment', 'WorkerShiftRequest',
        '_assert_roster_assignment_mutable', '_assert_roster_shift_mutable',
        '_assert_roster_slot_mutable', '_published_period_for_slot', '_published_roster_period',
    ),
    ('client_profile/domains/common/access.py', 'shifts.access'): (
        'Http400', 'IsPharmacistOrOtherStaff', '_get_request_ip',
        '_normalized_role_code', '_otherstaff_onboarding_role',
    ),
    ('client_profile/tasks.py', 'shifts.tasks'): ('send_shift_reminders',),
}
COMPATIBILITY_IMPORTS = {
    (relative, module + '.' + name)
    for (relative, module), names in COMPATIBILITY_SYMBOLS.items()
    for name in names
}


class FoundationDependencyTests(SimpleTestCase):
    def test_compatibility_facades_reject_additional_imported_names(self):
        from unittest import mock

        files = list(runtime_files())
        for relative, source in (
            ('core/api_v1_urls.py', 'from worker_finance import views'),
            ('client_profile/domains/common/access.py', 'from shifts.access import ShiftActionRefused'),
            ('core/api_v1_urls.py', 'def delayed():\n    from worker_finance import views'),
        ):
            with self.subTest(relative=relative, source=source):
                injected = (relative, None, ast.parse(source))
                with mock.patch(__name__ + '.runtime_files', return_value=[*files, injected]):
                    with self.assertRaisesRegex(AssertionError, 'Move the operation'):
                        self.test_only_exact_compatibility_facades_import_feature_owners()

    def test_only_exact_compatibility_facades_import_feature_owners(self):
        violations, retained = [], set()
        for relative, _path, tree in runtime_files():
            forbidden = FEATURE_DEPENDENCIES.get(relative.split('/')[0], set())
            for node in ast.walk(tree):
                if isinstance(node, ast.Import):
                    modules = [alias.name for alias in node.names]
                elif isinstance(node, ast.ImportFrom) and not node.level:
                    modules = [(node.module or '') + '.' + alias.name for alias in node.names]
                else:
                    continue
                for module in modules:
                    if module.split('.')[0] not in forbidden:
                        continue
                    key = relative, module
                    if key in COMPATIBILITY_IMPORTS:
                        retained.add(key)
                    else:
                        violations.append((relative, node.lineno, module))
        self.assertEqual(violations, [], 'Move the operation to its owner and bind it at app startup.')
        self.assertEqual(retained, COMPATIBILITY_IMPORTS, 'Remove stale compatibility exceptions.')
