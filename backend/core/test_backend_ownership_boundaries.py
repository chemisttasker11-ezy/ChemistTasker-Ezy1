"""Backend ownership boundaries: client_profile is an enforced compatibility kernel.

These tests make the domain split permanent:

* Runtime code outside the kernel may not import from `client_profile` (function-local imports included) unless the
  import is listed in ALLOWED_LEGACY_IMPORTS with the reason it has to stay. Migrations and tests are exempt.
* Runtime string references that start with `client_profile` (dynamic imports, task names, model labels, paths) must
  be the kernel's Django app label, a model label that Django resolves to that label, a registered legacy Celery task
  name, or an entry of ALLOWED_STRING_REFERENCES.
* The kernel can only shrink: no new runtime module, no new top-level definition, no model, no growth of code lines.
* No new pair of apps may import each other at module level.
* Model tables, owning modules, legacy model/helper import paths and Celery task names keep their identity.

When one of these fails, put the code in its owning app (docs/architecture/BACKEND_DOMAIN_DEPENDENCIES.md) instead of
widening a list. When a test fails because the kernel or an allowed list shrank, remove the stale entry.
"""
import ast
import importlib
import inspect
import io
import re
import tokenize
from pathlib import Path

from django.apps import apps
from django.db.models.base import ModelBase
from django.test import SimpleTestCase

BACKEND = Path(__file__).resolve().parent.parent
KERNEL = "client_profile"
# kernel modules that only tests use
KERNEL_TEST_SUPPORT = {"client_profile/characterization_support.py"}


def _is_test_or_migration(rel):
    parts = rel.split("/")
    name = parts[-1]
    return (
        "migrations" in parts
        or "tests" in parts
        or parts[0] == "attendance_tests"
        or name.startswith("test")
        or name == "tests.py"
        or name.endswith("test_settings.py")
    )


def runtime_files():
    """Every shipped Python file of the backend (relative to backend/) with its parsed AST."""
    for path in sorted(BACKEND.rglob("*.py")):
        rel = path.relative_to(BACKEND).as_posix()
        if rel.split("/")[0] in ("verification_outputs", "media", "staticfiles") or _is_test_or_migration(rel):
            continue
        yield rel, path, ast.parse(path.read_text(encoding="utf-8"), filename=rel)


def is_kernel(rel):
    return rel.split("/")[0] == KERNEL


def kernel_runtime_files():
    for rel, path, tree in runtime_files():
        if is_kernel(rel) and rel not in KERNEL_TEST_SUPPORT:
            yield rel, path, tree


def kernel_imports(tree):
    """(lineno, module, names) of every absolute import of the kernel, at any nesting level."""
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                if alias.name == KERNEL or alias.name.startswith(KERNEL + "."):
                    yield node.lineno, alias.name, {"<module>"}
        elif isinstance(node, ast.ImportFrom) and node.level == 0 and node.module:
            if node.module == KERNEL or node.module.startswith(KERNEL + "."):
                yield node.lineno, node.module, {alias.name for alias in node.names}


def top_level_definitions(tree):
    names = set()
    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            names.add(node.name)
        elif isinstance(node, (ast.Assign, ast.AnnAssign)):
            targets = node.targets if isinstance(node, ast.Assign) else [node.target]
            for target in targets:
                for name in ast.walk(target):
                    if isinstance(name, ast.Name) and not (name.id.startswith("__") and name.id.endswith("__")):
                        names.add(name.id)
    return names - {"__getattr__", "__dir__"}


def code_lines(source, tree):
    """Lines that carry code: no blank, comment-only or docstring lines."""
    docstring_lines = set()
    for node in ast.walk(tree):
        if isinstance(node, (ast.Module, ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)) and node.body:
            first = node.body[0]
            if isinstance(first, ast.Expr) and isinstance(first.value, ast.Constant) and isinstance(first.value.value, str):
                docstring_lines.update(range(first.lineno, first.end_lineno + 1))
    lines = set()
    skip = {tokenize.COMMENT, tokenize.NL, tokenize.NEWLINE, tokenize.INDENT, tokenize.DEDENT, tokenize.ENDMARKER}
    for token in tokenize.generate_tokens(io.StringIO(source).readline):
        if token.type not in skip:
            lines.update(line for line in range(token.start[0], token.end[0] + 1) if line not in docstring_lines)
    return len(lines)


def module_level_app_edges():
    """{(importing app, imported app)} for imports at module level of shipped code."""
    local_apps = {p.parent.name for p in BACKEND.glob("*/__init__.py")}
    edges = set()
    for rel, _path, tree in runtime_files():
        source_app = rel.split("/")[0]
        for node in tree.body:
            if isinstance(node, ast.Import):
                modules = [alias.name for alias in node.names]
            elif isinstance(node, ast.ImportFrom) and node.level == 0 and node.module:
                modules = [node.module]
            else:
                continue
            for module in modules:
                target = module.split(".")[0]
                if target in local_apps and target != source_app:
                    edges.add((source_app, target))
    return edges


# (file, module) -> (names, reason). Keep this list short and every reason specific.
ALLOWED_LEGACY_IMPORTS = {
    ("chat/models.py", "client_profile.models.common"): (
        {"chat_upload_path"},
        "upload_to callable that chat.0001_initial and client_profile.0001 reference by its client_profile path",
    ),
    ("pharmacy_hub/models.py", "client_profile.models.common"): (
        {"hub_attachment_upload_path"},
        "upload_to callable that client_profile.0001 references by its client_profile path",
    ),
    ("onboarding/models.py", "client_profile.fields"): (
        {"EncryptedTextField"},
        "migrations deconstruct the field by its client_profile.fields path; moving it would generate migrations",
    ),
    ("core/websocket_testing.py", "client_profile.characterization_support"): (
        {"make_owner_with_pharmacy", "make_staff_member", "make_user"},
        "test-support factories shared by the chat and notifications WebSocket tests",
    ),
}

# Literal strings starting with client_profile that are neither the app label, a model label nor a task name.
ALLOWED_STRING_REFERENCES = {
    "client_profile.apps.ClientProfileConfig": "INSTALLED_APPS entry of the kernel app",
    "client_profile.urls": "the kernel URLconf, included by core.client_profile_api_urls",
    "client_profile.notifications.*": "historical Celery route pattern (CELERY_TASK_ROUTES)",
    "client_profile.tasks.verify_*": "Celery route pattern of the verification tasks (CELERY_TASK_ROUTES)",
    "client_profile/data/public_holidays.json": "pricing data file still stored in the kernel directory",
    "client_profile/data/updated_award_rates_casual_first_level_correct_mapping.json": (
        "pricing data file still stored in the kernel directory"
    ),
}

# Deployed Celery task names. Workers, beat entries and queued messages address tasks by these strings.
LEGACY_CELERY_TASKS = {
    "client_profile.calendar_tasks.generate_all_birthday_events",
    "client_profile.calendar_tasks.send_9am_work_note_fallback",
    "client_profile.calendar_tasks.send_shift_start_work_note_notifications",
    "client_profile.tasks.email_membership_application_approved",
    "client_profile.tasks.email_membership_application_rejected",
    "client_profile.tasks.email_membership_application_review_updated",
    "client_profile.tasks.email_membership_application_submitted",
    "client_profile.tasks.final_evaluation",
    "client_profile.tasks.run_all_verifications",
    "client_profile.tasks.run_referee_reminder",
    "client_profile.tasks.send_shift_reminders",
    "client_profile.tasks.verify_abn_task",
    "client_profile.tasks.verify_ahpra_task",
    "client_profile.tasks.verify_filefield_task",
    "core.celery_smoke",
    "ethical_marketplace.tasks.process_ethical_escalations",
    "marketplace.tasks.process_goods_escalations",
    "public_hub.tasks.publish_scheduled_content",
    "users.tasks.send_email_task",
    "workforce.tasks.rebuild_timesheet_period_task",
    "workforce.tasks.rebuild_timesheet_task",
}

# Pairs of apps that already import each other at module level: mostly `users` (identity models plus the account API,
# which reads organisations, memberships and shifts) and `core` (settings, URLs, shared utilities). New pairs fail.
ALLOWED_MUTUAL_APP_PAIRS = {
    ("attendance", "workforce"),
    ("chat", "core"),
    ("client_profile", "core"),
    ("client_profile", "onboarding"),
    ("core", "memberships"),
    ("core", "onboarding"),
    ("core", "organizations"),
    ("core", "pharmacy_hub"),
    ("core", "shifts"),
    ("core", "users"),
    ("core", "workforce"),
    ("memberships", "organizations"),
    ("memberships", "users"),
    ("onboarding", "users"),
    ("organizations", "users"),
    ("shifts", "users"),
    ("shifts", "workforce"),
}

# Upper bound of code lines (no blank, comment or docstring lines) in the kernel's runtime modules.
KERNEL_CODE_LINE_CEILING = 1038

# Top-level definitions per kernel runtime module. A module may lose names; it may not gain any.
KERNEL_DEFINITIONS = {
    "client_profile/__init__.py": set(),
    "client_profile/admin.py": {
        "ChainAdmin", "ExplorerOnboardingAdmin", "MembershipAdmin", "OrganizationAdmin", "OtherStaffOnboardingAdmin",
        "OwnerOnboardingAdmin", "OwnerOnboardingAdminForm", "PharmacistOnboardingAdmin",
        "PharmacyAdminAssignmentAdmin", "PharmacyModelAdmin", "RoleScopedOnboardingAdminMixin", "ShiftAdmin",
        "ShiftCounterOfferAdmin", "ShiftCounterOfferSlotInline", "ShiftInterestAdmin", "ShiftOfferAdmin",
        "ShiftRejectionAdmin", "ShiftSlotAssignmentAdmin", "ShiftSlotInline",
    },
    "client_profile/admin_helpers.py": set(),
    "client_profile/apps.py": {"ClientProfileConfig"},
    "client_profile/domains/__init__.py": set(),
    "client_profile/domains/common/__init__.py": set(),
    "client_profile/domains/common/access.py": set(),
    "client_profile/domains/common/helpers.py": set(),
    "client_profile/domains/common/labels.py": set(),
    "client_profile/domains/common/serializers.py": set(),
    "client_profile/domains/dashboards/__init__.py": set(),
    "client_profile/domains/dashboards/serializers.py": {
        "ExplorerDashboardResponseSerializer", "OtherStaffDashboardResponseSerializer",
        "OwnerDashboardResponseSerializer", "PharmacistDashboardResponseSerializer", "ShiftSummarySerializer",
    },
    "client_profile/domains/dashboards/views.py": set(),
    "client_profile/domains/memberships/__init__.py": set(),
    "client_profile/domains/memberships/serializers.py": set(),
    "client_profile/domains/memberships/views.py": set(),
    "client_profile/domains/onboarding/__init__.py": set(),
    "client_profile/domains/onboarding/emails.py": set(),
    "client_profile/domains/onboarding/serializers.py": set(),
    "client_profile/domains/onboarding/views.py": set(),
    "client_profile/domains/orgs/__init__.py": set(),
    "client_profile/domains/orgs/access.py": set(),
    "client_profile/domains/orgs/claims.py": set(),
    "client_profile/domains/orgs/serializers.py": set(),
    "client_profile/domains/orgs/timezone.py": set(),
    "client_profile/domains/orgs/views.py": set(),
    "client_profile/domains/shifts/__init__.py": set(),
    "client_profile/domains/shifts/base.py": set(),
    "client_profile/domains/shifts/browse.py": set(),
    "client_profile/domains/shifts/counter_offers.py": set(),
    "client_profile/domains/shifts/emails.py": set(),
    "client_profile/domains/shifts/engagement.py": set(),
    "client_profile/domains/shifts/finalize.py": set(),
    "client_profile/domains/shifts/leave.py": set(),
    "client_profile/domains/shifts/limits.py": set(),
    "client_profile/domains/shifts/notifications.py": set(),
    "client_profile/domains/shifts/offers.py": set(),
    "client_profile/domains/shifts/pricing.py": set(),
    "client_profile/domains/shifts/serializers.py": set(),
    "client_profile/domains/shifts/travel.py": set(),
    "client_profile/domains/shifts/worker_requests.py": set(),
    "client_profile/fields.py": {"ENCRYPTED_VALUE_PREFIX", "EncryptedTextField", "_build_fernet"},
    "client_profile/file_validation.py": set(),
    "client_profile/models/__init__.py": set(),
    "client_profile/models/common.py": {"chat_upload_path", "hub_attachment_upload_path"},
    "client_profile/models/memberships.py": set(),
    "client_profile/models/onboarding.py": set(),
    "client_profile/models/orgs.py": set(),
    "client_profile/models/shifts.py": set(),
    "client_profile/tasks.py": {"User", "logger"},
    "client_profile/timezone_utils.py": set(),
    "client_profile/urls.py": {"router", "urlpatterns"},
}

# label -> (db_table, module defining the class) of every model of the kernel and of the apps split from it.
MODEL_TABLES = {
    "attendance.AttendanceCorrection": ("attendance_attendancecorrection", "attendance.models"),
    "attendance.AttendanceEvent": ("attendance_attendanceevent", "attendance.models"),
    "attendance.AttendanceSession": ("attendance_attendancesession", "attendance.models"),
    "attendance.KioskAttendanceEvent": ("attendance_kioskattendanceevent", "attendance.models"),
    "attendance.KioskDevice": ("attendance_kioskdevice", "attendance.models"),
    "attendance.KioskPairingAuthorization": ("attendance_kioskpairingauthorization", "attendance.models"),
    "attendance.PharmacyQRSession": ("attendance_pharmacyqrsession", "attendance.models"),
    "attendance.ProvisionalAttendance": ("attendance_provisionalattendance", "attendance.models"),
    "attendance.WorkerPIN": ("attendance_workerpin", "attendance.models"),
    "chat.Conversation": ("chat_conversation", "chat.models"),
    "chat.Message": ("chat_message", "chat.models"),
    "chat.MessageReaction": ("chat_messagereaction", "chat.models"),
    "chat.Participant": ("chat_participant", "chat.models"),
    "client_profile.Chain": ("client_profile_chain", "organizations.models"),
    "client_profile.ExplorerOnboarding": ("client_profile_exploreronboarding", "onboarding.models"),
    "client_profile.LeaveRequest": ("client_profile_leaverequest", "shifts.models"),
    "client_profile.Membership": ("client_profile_membership", "memberships.models"),
    "client_profile.MembershipApplication": ("client_profile_membershipapplication", "memberships.models"),
    "client_profile.MembershipInviteLink": ("client_profile_membershipinvitelink", "memberships.models"),
    "client_profile.OnboardingNotification": ("client_profile_onboardingnotification", "onboarding.models"),
    "client_profile.Organization": ("client_profile_organization", "organizations.models"),
    "client_profile.OtherStaffOnboarding": ("client_profile_otherstaffonboarding", "onboarding.models"),
    "client_profile.OwnerOnboarding": ("client_profile_owneronboarding", "onboarding.models"),
    "client_profile.PharmacistOnboarding": ("client_profile_pharmacistonboarding", "onboarding.models"),
    "client_profile.Pharmacy": ("client_profile_pharmacy", "organizations.models"),
    "client_profile.PharmacyAdmin": ("client_profile_pharmacyadmin", "organizations.models"),
    "client_profile.PharmacyClaim": ("client_profile_pharmacyclaim", "organizations.models"),
    "client_profile.RefereeResponse": ("client_profile_refereeresponse", "onboarding.models"),
    "client_profile.Shift": ("client_profile_shift", "shifts.models"),
    "client_profile.ShiftCounterOffer": ("client_profile_shiftcounteroffer", "shifts.models"),
    "client_profile.ShiftCounterOfferSlot": ("client_profile_shiftcounterofferslot", "shifts.models"),
    "client_profile.ShiftDescriptionTemplate": ("client_profile_shiftdescriptiontemplate", "shifts.models"),
    "client_profile.ShiftInterest": ("client_profile_shiftinterest", "shifts.models"),
    "client_profile.ShiftOffer": ("client_profile_shiftoffer", "shifts.models"),
    "client_profile.ShiftProfileAccessAudit": ("client_profile_shiftprofileaccessaudit", "shifts.models"),
    "client_profile.ShiftRejection": ("client_profile_shiftrejection", "shifts.models"),
    "client_profile.ShiftSaved": ("client_profile_shiftsaved", "shifts.models"),
    "client_profile.ShiftSlot": ("client_profile_shiftslot", "shifts.models"),
    "client_profile.ShiftSlotAssignment": ("client_profile_shiftslotassignment", "shifts.models"),
    "client_profile.WorkerShiftRequest": ("client_profile_workershiftrequest", "shifts.models"),
    "invoicing.Invoice": ("invoicing_invoice", "invoicing.models"),
    "invoicing.InvoiceLineItem": ("invoicing_invoicelineitem", "invoicing.models"),
    "notifications.Notification": ("notifications_notification", "notifications.models"),
    "pharmacy_hub.PharmacyCommunityGroup": ("pharmacy_hub_pharmacycommunitygroup", "pharmacy_hub.models"),
    "pharmacy_hub.PharmacyCommunityGroupMembership": ("pharmacy_hub_pharmacycommunitygroupmembership", "pharmacy_hub.models"),
    "pharmacy_hub.PharmacyHubAttachment": ("pharmacy_hub_pharmacyhubattachment", "pharmacy_hub.models"),
    "pharmacy_hub.PharmacyHubComment": ("pharmacy_hub_pharmacyhubcomment", "pharmacy_hub.models"),
    "pharmacy_hub.PharmacyHubCommentReaction": ("pharmacy_hub_pharmacyhubcommentreaction", "pharmacy_hub.models"),
    "pharmacy_hub.PharmacyHubPoll": ("pharmacy_hub_pharmacyhubpoll", "pharmacy_hub.models"),
    "pharmacy_hub.PharmacyHubPollComment": ("pharmacy_hub_pharmacyhubpollcomment", "pharmacy_hub.models"),
    "pharmacy_hub.PharmacyHubPollOption": ("pharmacy_hub_pharmacyhubpolloption", "pharmacy_hub.models"),
    "pharmacy_hub.PharmacyHubPollReaction": ("pharmacy_hub_pharmacyhubpollreaction", "pharmacy_hub.models"),
    "pharmacy_hub.PharmacyHubPollVote": ("pharmacy_hub_pharmacyhubpollvote", "pharmacy_hub.models"),
    "pharmacy_hub.PharmacyHubPost": ("pharmacy_hub_pharmacyhubpost", "pharmacy_hub.models"),
    "pharmacy_hub.PharmacyHubPostMention": ("pharmacy_hub_pharmacyhubpostmention", "pharmacy_hub.models"),
    "pharmacy_hub.PharmacyHubReaction": ("pharmacy_hub_pharmacyhubreaction", "pharmacy_hub.models"),
    "ratings.Rating": ("ratings_rating", "ratings.models"),
    "ratings.RatingReport": ("ratings_ratingreport", "ratings.models"),
    "rewards.PillLedgerEntry": ("rewards_pillledgerentry", "rewards.models"),
    "rewards.PillReferralCode": ("rewards_pillreferralcode", "rewards.models"),
    "rewards.PillReferralEvent": ("rewards_pillreferralevent", "rewards.models"),
    "rewards.PillRewardRule": ("rewards_pillrewardrule", "rewards.models"),
    "talent.ExplorerPost": ("talent_explorerpost", "talent.models"),
    "talent.ExplorerPostReaction": ("talent_explorerpostreaction", "talent.models"),
    "talent.UserAvailability": ("talent_useravailability", "talent.models"),
    "team_calendar.CalendarEvent": ("team_calendar_calendarevent", "team_calendar.models"),
    "team_calendar.WorkNote": ("team_calendar_worknote", "team_calendar.models"),
    "team_calendar.WorkNoteAssignee": ("team_calendar_worknoteassignee", "team_calendar.models"),
    "team_calendar.WorkNoteCompletion": ("team_calendar_worknotecompletion", "team_calendar.models"),
    "workforce.CoverageRequirement": ("workforce_coveragerequirement", "workforce.models"),
    "workforce.EmploymentEngagement": ("workforce_employmentengagement", "workforce.models"),
    "workforce.ManagerAttendanceEventAudit": ("workforce_managerattendanceeventaudit", "workforce.models"),
    "workforce.MembershipWorkSettings": ("workforce_membershipworksettings", "workforce.models"),
    "workforce.RosterAcknowledgement": ("workforce_rosteracknowledgement", "workforce.models"),
    "workforce.RosterActionAudit": ("workforce_rosteractionaudit", "workforce.models"),
    "workforce.RosterOperation": ("workforce_rosteroperation", "workforce.models"),
    "workforce.RosterPeriod": ("workforce_rosterperiod", "workforce.models"),
    "workforce.RosterPublicationAudit": ("workforce_rosterpublicationaudit", "workforce.models"),
    "workforce.RosterRevisionState": ("workforce_rosterrevisionstate", "workforce.models"),
    "workforce.RosterTemplate": ("workforce_rostertemplate", "workforce.models"),
    "workforce.Timesheet": ("workforce_timesheet", "workforce.models"),
    "workforce.TimesheetApproval": ("workforce_timesheetapproval", "workforce.models"),
    "workforce.TimesheetCheck": ("workforce_timesheetcheck", "workforce.models"),
    "workforce.TimesheetCheckDecision": ("workforce_timesheetcheckdecision", "workforce.models"),
    "workforce.TimesheetComment": ("workforce_timesheetcomment", "workforce.models"),
    "workforce.TimesheetCorrectionRequest": ("workforce_timesheetcorrectionrequest", "workforce.models"),
    "workforce.TimesheetManifest": ("workforce_timesheetmanifest", "workforce.models"),
    "workforce.TimesheetPeriod": ("workforce_timesheetperiod", "workforce.models"),
    "workforce.TimesheetRevision": ("workforce_timesheetrevision", "workforce.models"),
    "workforce.TimesheetSegment": ("workforce_timesheetsegment", "workforce.models"),
    "workforce.WorkforceLeaveRequest": ("workforce_workforceleaverequest", "workforce.models"),
}


class LegacyImportBoundaryTests(SimpleTestCase):
    def test_runtime_code_outside_the_kernel_does_not_import_it(self):
        violations = []
        seen = {}
        for rel, _path, tree in runtime_files():
            if is_kernel(rel):
                continue
            for lineno, module, names in kernel_imports(tree):
                key = (rel, module)
                allowed_names, _reason = ALLOWED_LEGACY_IMPORTS.get(key, (set(), ""))
                seen.setdefault(key, set()).update(names)
                extra = sorted(names - allowed_names)
                if extra:
                    violations.append(f"{rel}:{lineno} from {module} import {', '.join(extra)}")
        self.assertEqual(
            violations,
            [],
            "Import these names from their owning app (docs/architecture/BACKEND_DOMAIN_DEPENDENCIES.md), "
            "not from the client_profile compatibility kernel.",
        )
        stale = {
            key: {
                "allowed": sorted(allowed_names),
                "actually_imported": sorted(seen.get(key, set())),
            }
            for key, (allowed_names, _reason) in ALLOWED_LEGACY_IMPORTS.items()
            if seen.get(key, set()) != allowed_names
        }
        self.assertEqual(stale, {}, "ALLOWED_LEGACY_IMPORTS must match the exact imports still required")

    def test_every_allowed_legacy_import_has_a_reason(self):
        for key, (names, reason) in ALLOWED_LEGACY_IMPORTS.items():
            self.assertTrue(names and len(reason) > 20, key)

    def test_string_references_to_the_kernel_are_labels_tasks_or_allowed(self):
        from core.celery import app as celery_app

        celery_app.loader.import_default_modules()
        registered = set(celery_app.tasks)
        violations, seen = [], set()
        for rel, _path, tree in runtime_files():
            if is_kernel(rel):
                continue
            for node in ast.walk(tree):
                if not (isinstance(node, ast.Constant) and isinstance(node.value, str)):
                    continue
                value = node.value
                if not value.startswith(KERNEL) or value == KERNEL or re.search(r"\s", value):
                    continue
                if value in ALLOWED_STRING_REFERENCES:
                    seen.add(value)
                    continue
                if value in registered and value.startswith(("client_profile.tasks.", "client_profile.calendar_tasks.")):
                    continue
                model_label = re.fullmatch(r"client_profile\.([A-Z]\w*)", value)
                if model_label:
                    model = apps.get_model(KERNEL, model_label.group(1))
                    if model._meta.app_label == KERNEL:
                        continue
                violations.append(f"{rel}:{node.lineno} {value!r}")
        self.assertEqual(violations, [])
        self.assertEqual(sorted(set(ALLOWED_STRING_REFERENCES) - seen), [], "stale ALLOWED_STRING_REFERENCES entries")

    def test_no_new_mutual_app_dependencies(self):
        edges = module_level_app_edges()
        mutual = {tuple(sorted(edge)) for edge in edges if (edge[1], edge[0]) in edges}
        self.assertEqual(sorted(mutual - ALLOWED_MUTUAL_APP_PAIRS), [], "new pair of apps importing each other")
        self.assertEqual(sorted(ALLOWED_MUTUAL_APP_PAIRS - mutual), [], "resolved pairs: remove them from the list")


class KernelContractionRatchetTests(SimpleTestCase):
    def test_no_new_kernel_modules(self):
        modules = {rel for rel, _path, _tree in kernel_runtime_files()}
        self.assertEqual(
            modules,
            set(KERNEL_DEFINITIONS),
            "client_profile module baseline must tighten whenever the compatibility kernel shrinks",
        )

    def test_no_new_kernel_definitions(self):
        mismatches = {}
        for rel, _path, tree in kernel_runtime_files():
            actual = top_level_definitions(tree)
            expected = KERNEL_DEFINITIONS.get(rel, set())
            if actual != expected:
                mismatches[rel] = {
                    "expected": sorted(expected),
                    "actual": sorted(actual),
                }
        self.assertEqual(
            mismatches,
            {},
            "client_profile definition baseline must tighten whenever the compatibility kernel shrinks",
        )

    def test_kernel_defines_no_models(self):
        offenders = []
        for rel, _path, tree in kernel_runtime_files():
            for node in ast.walk(tree):
                if isinstance(node, ast.ClassDef):
                    bases = {ast.unparse(base) for base in node.bases}
                    if bases & {"models.Model", "Model"}:
                        offenders.append(f"{rel}:{node.lineno} {node.name}")
        self.assertEqual(offenders, [])
        for model in apps.get_app_config(KERNEL).get_models():
            self.assertFalse(model.__module__.startswith(KERNEL + "."), model._meta.label)

    def test_kernel_code_does_not_grow(self):
        total = sum(code_lines(path.read_text(encoding="utf-8"), tree) for _rel, path, tree in kernel_runtime_files())
        self.assertEqual(
            total,
            KERNEL_CODE_LINE_CEILING,
            "client_profile code-line baseline must tighten whenever the compatibility kernel shrinks",
        )


class IdentityPreservationTests(SimpleTestCase):
    def test_model_tables_and_owning_modules_are_unchanged(self):
        for label, (db_table, module) in MODEL_TABLES.items():
            model = apps.get_model(label)
            self.assertEqual(model._meta.db_table, db_table, label)
            self.assertEqual(model.__module__, module, label)
            self.assertEqual(model._meta.app_label, label.split(".")[0], label)

    def test_legacy_model_imports_are_the_registered_models(self):
        legacy = importlib.import_module("client_profile.models")
        exported = {name: obj for name, obj in vars(legacy).items() if isinstance(obj, ModelBase)}
        self.assertTrue(exported)
        for name, obj in exported.items():
            self.assertIs(obj, apps.get_model(KERNEL, name), name)

    def test_legacy_helper_paths_resolve_to_their_owners(self):
        pairs = [
            ("client_profile.models", "_unique_upload_path", "core.uploads", "unique_upload_path"),
            ("client_profile.models", "_safe_ext", "core.uploads", "safe_extension"),
            ("client_profile.models", "GENDER_CHOICES", "onboarding.models", "GENDER_CHOICES"),
            ("client_profile.domains.common.access", "_count_active_memberships", "memberships.serializers", "_count_active_memberships"),
            ("client_profile.domains.common.access", "MAX_ACTIVE_PHARMACY_MEMBERSHIPS", "memberships.serializers", "MAX_ACTIVE_PHARMACY_MEMBERSHIPS"),
        ]
        for name in ("PHARMACIST_AWARD_LEVEL_CHOICES", "OTHERSTAFF_CLASSIFICATION_CHOICES", "INTERN_HALF_CHOICES", "STUDENT_YEAR_CHOICES"):
            pairs.append(("client_profile.models", name, "memberships.models", name))
        for name in ("Http400", "IsPharmacistOrOtherStaff", "_get_request_ip", "_normalized_role_code", "_otherstaff_onboarding_role"):
            pairs.append(("client_profile.domains.common.access", name, "shifts.access", name))
        for legacy, legacy_name, owner, owner_name in pairs:
            self.assertIs(
                getattr(importlib.import_module(legacy), legacy_name),
                getattr(importlib.import_module(owner), owner_name),
                f"{legacy}.{legacy_name}",
            )

    def test_callables_referenced_by_migrations_stay_importable(self):
        pattern = re.compile(r"\bclient_profile\.(?:models|fields)(?:\.common)?\.[A-Za-z_]\w*")
        references = set()
        for path in BACKEND.glob("*/migrations/*.py"):
            references.update(pattern.findall(path.read_text(encoding="utf-8")))
        self.assertTrue(references)
        for reference in sorted(references):
            module, name = reference.rsplit(".", 1)
            target = getattr(importlib.import_module(module), name)
            if inspect.ismodule(target):  # `import client_profile.models.common` at the top of a migration
                continue
            self.assertTrue(callable(target), reference)

    def test_legacy_celery_task_names_stay_registered(self):
        from core.celery import app as celery_app

        celery_app.loader.import_default_modules()
        self.assertEqual(sorted(LEGACY_CELERY_TASKS - set(celery_app.tasks)), [])
