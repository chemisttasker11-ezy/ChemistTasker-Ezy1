"""Public error surface: unexpected Python exceptions never reach API clients.

Static rules over all shipped backend code:
* no debug markers (`[DBG`) in string literals,
* no traceback printing (use `logger.exception`, which keeps the traceback in the logs),
* a broad handler (`except Exception` / `BaseException` / bare) may log its exception or re-raise it, but may not put
  it into a response, a return value, a new exception or a stored value.

API regressions force representative failures and check that the response keeps its envelope and status, carries a
stable message, and contains none of the UNSAFE_MARKERS. Expected domain errors (validation, permission, not found)
keep their specific messages.
"""
import ast
import json
from datetime import date, timedelta
from types import SimpleNamespace
from unittest import mock

from django.contrib.auth import get_user_model
from django.db import OperationalError
from django.test import RequestFactory, SimpleTestCase, TestCase

from client_profile.characterization_support import client_for, make_owner_with_pharmacy, make_user
from core.test_backend_ownership_boundaries import runtime_files
from memberships.models import Membership
from shifts.models import Shift, ShiftSlot

User = get_user_model()
API = "/api/client-profile/"

# Text that only an internal error produces. Each is specific enough not to occur in a legitimate message.
UNSAFE_MARKERS = (
    "Traceback",
    "[DBG",
    'File "',
    "OperationalError",
    "IntegrityError",
    "ProgrammingError",
    "DoesNotExist",
    "matching query does not exist",
    "get_object() failed",
    "django.db",
    "psycopg",
    "/usr/src/",
    "api_key=",
    "password=",
    "SECRET-",
)
BROAD = {"Exception", "BaseException"}
LOGGING_CALL_PREFIXES = ("logger.", "logging.", "log.", "LOGGER.")


def _caught_names(handler):
    if handler.type is None:
        return {"<bare>"}
    nodes = handler.type.elts if isinstance(handler.type, ast.Tuple) else [handler.type]
    return {ast.unparse(node).rsplit(".", 1)[-1] for node in nodes}


def _exposures(handler):
    """Uses of the caught exception other than logging it or re-raising it."""
    name = handler.name
    found = []

    def uses(node):
        return any(isinstance(n, ast.Name) and n.id == name for n in ast.walk(node))

    for statement in handler.body:
        for node in ast.walk(statement):
            if isinstance(node, ast.Call) and ast.unparse(node.func).startswith(LOGGING_CALL_PREFIXES):
                continue
            if isinstance(node, ast.Raise):
                if node.exc is not None and not (isinstance(node.exc, ast.Name) and node.exc.id == name) and uses(node.exc):
                    found.append(node)
            elif isinstance(node, ast.Return) and node.value is not None and uses(node.value):
                found.append(node)
            elif isinstance(node, (ast.Assign, ast.AugAssign, ast.AnnAssign)) and node.value is not None and uses(node.value):
                found.append(node)
            elif isinstance(node, ast.Call) and not ast.unparse(node.func).startswith(LOGGING_CALL_PREFIXES):
                if any(uses(arg) for arg in list(node.args) + [kw.value for kw in node.keywords]):
                    found.append(node)
    # a call nested in a logging call is reported by ast.walk as well: drop those
    logging_calls = [
        n for s in handler.body for n in ast.walk(s)
        if isinstance(n, ast.Call) and ast.unparse(n.func).startswith(LOGGING_CALL_PREFIXES)
    ]
    inside_logging = {id(n) for call in logging_calls for n in ast.walk(call)}
    return [node for node in found if id(node) not in inside_logging]


def assert_no_internal_detail(testcase, response):
    body = response.content.decode("utf-8", "replace")
    for marker in UNSAFE_MARKERS:
        testcase.assertNotIn(marker, body)


class StaticErrorSurfaceTests(SimpleTestCase):
    def test_no_debug_markers_in_string_literals(self):
        offenders = [
            f"{rel}:{node.lineno}"
            for rel, _path, tree in runtime_files()
            for node in ast.walk(tree)
            if isinstance(node, ast.Constant) and isinstance(node.value, str) and "[DBG" in node.value
        ]
        self.assertEqual(offenders, [])

    def test_no_traceback_printing(self):
        offenders = [
            f"{rel}:{node.lineno}"
            for rel, _path, tree in runtime_files()
            for node in ast.walk(tree)
            if isinstance(node, ast.Call)
            and ast.unparse(node.func) in {"traceback.print_exc", "traceback.format_exc", "traceback.print_exception", "traceback.print_tb"}
        ]
        self.assertEqual(offenders, [], "use logger.exception(...) instead")

    def test_broad_handlers_never_expose_the_exception(self):
        offenders = []
        for rel, _path, tree in runtime_files():
            for handler in ast.walk(tree):
                if not isinstance(handler, ast.ExceptHandler):
                    continue
                if not (_caught_names(handler) & (BROAD | {"<bare>"})) or not handler.name:
                    continue
                for node in _exposures(handler):
                    offenders.append(f"{rel}:{node.lineno} {ast.unparse(node)[:100]}")
        self.assertEqual(offenders, [], "log unexpected exceptions and return a stable message")


class ShiftClaimErrorSurfaceTests(TestCase):
    def setUp(self):
        self.owner, self.pharmacy = make_owner_with_pharmacy()
        self.worker = make_user("PHARMACIST")

    def _claim(self, shift_id):
        return client_for(self.worker).post(f"{API}community-shifts/{shift_id}/claim-shift/", {}, format="json")

    def test_unknown_shift_is_refused_without_lookup_details(self):
        response = self._claim(987654)
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.data["code"], "shift_not_accessible")
        self.assertEqual(response.data["detail"], "You do not have permission to access this shift.")
        assert_no_internal_detail(self, response)

    def test_refusal_has_a_stable_code_and_logs_the_reason(self):
        worker = make_user("OTHER_STAFF")  # no onboarding record: the role cannot be determined
        Membership.objects.create(
            user=worker, pharmacy=self.pharmacy, role="ASSISTANT", employment_type="CASUAL",
            status=Membership.Status.ACCEPTED, is_active=True,
        )
        shift = Shift.objects.create(
            pharmacy=self.pharmacy, created_by=self.owner, role_needed="ASSISTANT", employment_type="LOCUM",
            visibility="LOCUM_CASUAL", post_anonymously=False,
        )
        ShiftSlot.objects.create(
            shift=shift, date=date.today() + timedelta(days=7), start_time="09:00", end_time="17:00",
        )
        with self.assertLogs("shifts.browse", level="INFO") as logs:
            response = client_for(worker).post(f"{API}community-shifts/{shift.id}/claim-shift/", {}, format="json")
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.data["code"], "shift_claim_onboarding_incomplete")
        self.assertEqual(
            response.data["detail"], "Cannot determine your specific role. Please complete your onboarding."
        )
        assert_no_internal_detail(self, response)
        self.assertIn("reason=no_otherstaff_onboarding", " ".join(logs.output))


class ShiftRatePreviewErrorSurfaceTests(TestCase):
    def test_unexpected_rate_failure_is_not_echoed(self):
        owner, pharmacy = make_owner_with_pharmacy()
        slots = [
            {"date": "2026-01-05", "startTime": "09:00", "endTime": "17:00"},
            "not-a-slot",
            {"date": "05/01/2026", "startTime": "09:00", "endTime": "17:00"},
        ]
        with mock.patch("shifts.pricing.calculate_shift_rates", side_effect=RuntimeError("SECRET-internal pricing state")), \
                self.assertLogs("shifts.browse", level="ERROR"):
            response = client_for(owner).post(
                f"{API}shifts/calculate-rates/",
                {"pharmacy": pharmacy.id, "role": "PHARMACIST", "slots": slots},
                format="json",
            )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data[0], {"error": "Unable to calculate the rate for this slot.", "rate": "0.00"})
        self.assertEqual(response.data[1], {"error": "Invalid slot payload", "rate": "0.00"})
        self.assertEqual(response.data[2]["error"], "Invalid date format, use YYYY-MM-DD")
        self.assertNotIn("does not match format", response.data[2]["error"])
        assert_no_internal_detail(self, response)

    def test_pricing_value_error_is_not_treated_as_user_date_error(self):
        owner, pharmacy = make_owner_with_pharmacy()
        slots = [{"date": "2026-01-05", "startTime": "09:00", "endTime": "17:00"}]
        with mock.patch(
            "shifts.pricing.calculate_shift_rates",
            side_effect=ValueError("SECRET-internal award mapping is invalid"),
        ), self.assertLogs("shifts.browse", level="ERROR"):
            response = client_for(owner).post(
                f"{API}shifts/calculate-rates/",
                {"pharmacy": pharmacy.id, "role": "PHARMACIST", "slots": slots},
                format="json",
            )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data[0], {"error": "Unable to calculate the rate for this slot.", "rate": "0.00"})
        assert_no_internal_detail(self, response)


class MembershipInviteErrorSurfaceTests(TestCase):
    def setUp(self):
        self.owner, self.pharmacy = make_owner_with_pharmacy()
        self.email = "invitee.error-surface@example.com"

    def _invite(self, **overrides):
        payload = {"email": self.email, "pharmacy": self.pharmacy.id, "role": "ASSISTANT", "employment_type": "CASUAL"}
        payload.update(overrides)
        return client_for(self.owner).post(f"{API}memberships/", payload, format="json")

    def test_unexpected_membership_failure_is_stable_and_leaves_no_user(self):
        failure = OperationalError('could not connect to server: host "db.internal" password=SECRET-x')
        with mock.patch("memberships.views.MembershipSerializer.save", side_effect=failure), \
                self.assertLogs("memberships.views", level="ERROR"):
            response = self._invite()
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data, {"detail": "Failed to create the membership."})
        assert_no_internal_detail(self, response)
        self.assertFalse(User.objects.filter(email__iexact=self.email).exists())

    def test_unexpected_user_creation_failure_is_stable(self):
        with mock.patch("memberships.views.User.objects.create_user", side_effect=RuntimeError("SECRET-db detail")), \
                self.assertLogs("memberships.views", level="ERROR"):
            response = self._invite()
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data, {"detail": "Failed to create the user account for this invitation."})
        assert_no_internal_detail(self, response)

    def test_validation_failure_keeps_its_message_and_leaves_no_user(self):
        response = self._invite(employment_type="NOT_A_TYPE")
        self.assertEqual(response.status_code, 400)
        self.assertTrue(response.data["detail"])
        assert_no_internal_detail(self, response)
        self.assertFalse(User.objects.filter(email__iexact=self.email).exists())

    def test_successful_invite_still_creates_the_user_and_membership(self):
        response = self._invite()
        self.assertEqual(response.status_code, 201, response.data)
        self.assertTrue(Membership.objects.filter(user__email__iexact=self.email, pharmacy=self.pharmacy).exists())


class AttendanceErrorSurfaceTests(TestCase):
    def setUp(self):
        self.manager = make_user("OWNER")
        self.url = f"{API}attendance/manager/approve/"

    def _approve(self, provisional_id):
        return client_for(self.manager).post(self.url, {"provisional_id": provisional_id}, format="json")

    def test_unexpected_failure_returns_the_stable_message(self):
        with mock.patch(
            "attendance.views.approve_provisional_attendance",
            side_effect=RuntimeError('SECRET-relation "attendance_provisionalattendance" is locked'),
        ), self.assertLogs("attendance.views", level="ERROR"):
            response = self._approve(5)
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data, {"error": "Unable to approve the attendance. Please try again."})
        assert_no_internal_detail(self, response)

    def test_unknown_id_is_reported_as_not_found(self):
        response = self._approve(987654)
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data, {"error": "Provisional attendance not found."})
        assert_no_internal_detail(self, response)

    def test_non_integer_id_is_a_validation_error(self):
        response = self._approve("abc")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data, {"error": "provisional_id must be an integer."})


class HealthCheckErrorSurfaceTests(SimpleTestCase):
    def test_database_error_is_not_echoed(self):
        from core.urls import health_check

        failure = OperationalError('could not connect to server: Connection refused. Is the server running on host "db.internal"')
        broken = mock.Mock()
        broken.cursor.side_effect = failure
        with mock.patch("core.urls.connection", broken), self.assertLogs("core.urls", level="ERROR"):
            response = health_check(RequestFactory().get("/health/"))
        self.assertEqual(response.status_code, 500)
        self.assertEqual(json.loads(response.content), {"status": "error", "detail": "Database unavailable."})
        assert_no_internal_detail(self, response)


class EngagementPreviewErrorSurfaceTests(SimpleTestCase):
    def _preview(self, failure):
        from shifts.serializers import ShiftOfferSerializer

        user = SimpleNamespace(id=7, is_authenticated=True)
        offer = SimpleNamespace(pk=3, user_id=7, user=user, shift=SimpleNamespace(pharmacy=None))
        serializer = ShiftOfferSerializer(context={"request": SimpleNamespace(user=user)})
        with mock.patch("shifts.engagement.build_shift_engagement_terms", side_effect=failure):
            return serializer.get_engagement_terms_preview(offer)

    def test_unexpected_failure_is_not_echoed(self):
        with self.assertLogs("shifts.serializers", level="ERROR"):
            preview = self._preview(KeyError("SECRET-internal rate table"))
        self.assertEqual(preview, {"blocked": True, "error": "Engagement terms are unavailable."})

    def test_rule_violation_keeps_its_message(self):
        from django.core.exceptions import ValidationError

        preview = self._preview(ValidationError({"agreed_rate": "The final agreed hourly rate must be recorded."}))
        self.assertEqual(preview, {"blocked": True, "error": {"agreed_rate": ["The final agreed hourly rate must be recorded."]}})


class VerificationNoteErrorSurfaceTests(SimpleTestCase):
    def test_ahpra_provider_exception_is_redacted_in_logs(self):
        from onboarding.verification import ahpra as tasks  # owner of the AHPRA lookup

        failure = RuntimeError("provider failed https://example.invalid/?api_key=SECRET-KEY")
        client = mock.Mock()
        client.get.side_effect = failure
        with mock.patch.object(tasks, "ScrapingBeeClient", return_value=client), \
                mock.patch.object(tasks.time, "sleep"), \
                self.assertLogs("onboarding.verification.ahpra", level="WARNING") as logs, \
                self.assertRaises(RuntimeError):
            tasks.ahpra_lookup("PHA0001234567", "/tmp/not-written.html", api_key="SECRET-KEY")
        log_text = " ".join(logs.output)
        self.assertIn("error_type=RuntimeError", log_text)
        self.assertNotIn("SECRET-KEY", log_text)
        self.assertNotIn("api_key=", log_text)

    def test_ahpra_lookup_error_is_not_stored_in_the_user_visible_note(self):
        from onboarding import tasks  # owner of the verify_ahpra_task implementation

        target = SimpleNamespace(ahpra_number="", ahpra_verification_note="", save=lambda **kwargs: None)
        failure = Exception("HTTPSConnectionPool: Max retries exceeded with url: /api/v1/?api_key=SECRET-KEY&url=x")
        with mock.patch.object(tasks, "fetch_instance_with_retries", return_value=target), \
                mock.patch.object(tasks, "ahpra_lookup", side_effect=failure), \
                mock.patch.object(tasks, "_update_ahpra_fields") as update, \
                self.assertLogs("onboarding.tasks", level="ERROR") as logs:
            tasks.verify_ahpra_task("PharmacistOnboarding", 1, "1234567", "Ann", "Lee", "ann@example.com")
        update.assert_called_once()
        note = update.call_args.args[3]
        self.assertEqual(note, "AHPRA lookup failed. Please try again later.")
        log_text = " ".join(logs.output)
        self.assertIn("AHPRA lookup failed for pk=1", log_text)
        self.assertIn("error_type=Exception", log_text)
        self.assertNotIn("SECRET-KEY", log_text)
        self.assertNotIn("https://example.invalid/?api_key=SECRET-KEY", log_text)
        self.assertNotIn("Max retries exceeded with url:", log_text)
