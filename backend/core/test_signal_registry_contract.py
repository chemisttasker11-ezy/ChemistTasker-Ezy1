"""Model-signal receivers and AppConfig.ready() hooks: what runs when a model changes, and what runs at startup.

RECORDED pins every model-signal receiver the project connects (sender -> receiver). A receiver that appears twice,
from a compatibility path or from a new module shows up here for review instead of silently changing what a save
does. ready() hooks may only import their own app's signals module: no queries, task dispatch or other work at
startup. Third-party receivers (axes) and Django's post_migrate handlers are not pinned.
"""
import ast
import weakref
from pathlib import Path

from django.apps import apps
from django.db.models import signals as model_signals
from django.test import SimpleTestCase

BACKEND = Path(__file__).resolve().parent.parent
PROJECT_PACKAGES = {path.name for path in BACKEND.iterdir() if (path / "__init__.py").exists()}

RECORDED = {
    "pre_save": [
        "ethical_marketplace.EthicalListing -> ethical_marketplace.signals.enforce_ethical_listing_scope",
        "marketplace.ListingAudiencePolicy -> marketplace.signals.validate_listing_audience",
        "marketplace.MarketplaceListing -> marketplace.signals.enforce_listing_seller_policy",
    ],
    "post_save": [
        "attendance.AttendanceCorrection -> workforce.signals.attendance_correction_changed",
        "attendance.AttendanceEvent -> workforce.signals.attendance_event_changed",
        "attendance.AttendanceSession -> workforce.signals.attendance_session_changed",
        "attendance.ProvisionalAttendance -> workforce.signals.provisional_attendance_changed",
        "chat.Message -> chat.signals.broadcast_new_message",
        "client_profile.ExplorerOnboarding -> rewards.signals.award_pill_referrals_when_onboarding_verified",
        "client_profile.Membership -> chat.signals.sync_membership_to_community_chat",
        "client_profile.OtherStaffOnboarding -> rewards.signals.award_pill_referrals_when_onboarding_verified",
        "client_profile.OwnerOnboarding -> rewards.signals.award_pill_referrals_when_onboarding_verified",
        "client_profile.PharmacistOnboarding -> rewards.signals.award_pill_referrals_when_onboarding_verified",
        "client_profile.Shift -> workforce.signals.roster_shift_changed",
        "client_profile.ShiftSlot -> workforce.signals.roster_slot_changed",
        "client_profile.ShiftSlotAssignment -> workforce.signals.assignment_saved",
        "marketplace.ListingAudiencePolicy -> marketplace.signals.initialise_pharmacy_audience",
        "workforce.MembershipWorkSettings -> workforce.signals.work_settings_changed",
        "workforce.RosterPeriod -> workforce.signals.roster_period_changed",
        "workforce.WorkforceLeaveRequest -> workforce.signals.workforce_leave_changed",
    ],
    "pre_delete": [
        "client_profile.ShiftSlotAssignment -> workforce.signals.assignment_before_delete",
    ],
    "post_delete": [
        "client_profile.ShiftSlot -> workforce.signals.roster_slot_changed",
        "client_profile.ShiftSlotAssignment -> workforce.signals.assignment_deleted",
        "workforce.WorkforceLeaveRequest -> workforce.signals.workforce_leave_changed",
    ],
    "m2m_changed": [],
}


def project_receivers():
    senders = {id(model): model._meta.label for model in apps.get_models(include_auto_created=True)}
    senders[id(None)] = "*"
    found = {}
    for name in RECORDED:
        rows = []
        for entry in getattr(model_signals, name).receivers:
            sender_key, ref = entry[0][1], entry[1]
            receiver = ref() if isinstance(ref, (weakref.ReferenceType, weakref.WeakMethod)) else ref
            module = getattr(receiver, "__module__", "") or ""
            if module.split(".")[0] not in PROJECT_PACKAGES:
                continue
            sender = senders.get(sender_key, "<unknown sender>")
            rows.append(f"{sender} -> {module}.{receiver.__qualname__}")
        found[name] = sorted(rows)  # a receiver connected twice appears twice
    return found


def ready_hooks():
    for apps_py in sorted(BACKEND.glob("*/apps.py")):
        tree = ast.parse(apps_py.read_text(encoding="utf-8"))
        for node in ast.walk(tree):
            if isinstance(node, ast.FunctionDef) and node.name == "ready":
                yield apps_py.parent.name, node


class SignalRegistryContractTests(SimpleTestCase):
    def test_model_signal_receivers_are_the_recorded_ones(self):
        self.assertEqual(project_receivers(), RECORDED)

    def test_every_receiver_is_connected_once(self):
        for name, rows in project_receivers().items():
            self.assertEqual(len(rows), len(set(rows)), name)

    def test_receivers_live_in_their_apps_signals_module(self):
        apps_with_ready = {app for app, _node in ready_hooks()}
        for rows in project_receivers().values():
            for row in rows:
                module = row.split(" -> ")[1].rsplit(".", 1)[0]
                app, _, leaf = module.partition(".")
                self.assertEqual(leaf, "signals", row)
                self.assertIn(app, apps_with_ready, row)

    def test_ready_hooks_only_import_their_own_signals_module(self):
        hooks = list(ready_hooks())
        self.assertTrue(hooks)
        for app, node in hooks:
            body = [
                statement for statement in node.body
                if not (isinstance(statement, ast.Expr) and isinstance(statement.value, ast.Constant))
            ]
            self.assertEqual(len(body), 1, f"{app}.apps ready()")
            statement = body[0]
            self.assertIsInstance(statement, ast.ImportFrom, f"{app}.apps ready()")
            self.assertEqual([alias.name for alias in statement.names], ["signals"], f"{app}.apps ready()")
            own_module = (statement.level == 1 and statement.module is None) or (
                statement.level == 0 and statement.module == app
            )
            self.assertTrue(own_module, f"{app}.apps ready() imports {ast.unparse(statement)}")
