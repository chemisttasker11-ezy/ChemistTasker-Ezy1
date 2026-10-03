"""Characterization of the deployed Celery task contracts (PR C: client_profile/tasks.py decomposition).

These tests pin what workers, beat, queued messages and callers rely on, and the current behaviour of the task
implementations. They reach the implementation through the registered task objects (``task.run.__globals__``) and
the Celery registry, never through a module path, so the same tests prove equivalence before and after the
implementation moves to its owning app. Known defects are pinned as they are (``CURRENT BEHAVIOUR``) and changed only
by a dedicated behaviour-fix commit.
"""
import inspect
import unittest
from datetime import date, datetime, time, timedelta
from datetime import timezone as dt_timezone
from types import SimpleNamespace
from unittest import mock

from django.contrib.auth import get_user_model
from django.test import SimpleTestCase, TestCase, override_settings
from django.utils import timezone

from client_profile.characterization_support import make_owner_with_pharmacy, make_user

User = get_user_model()

LEGACY_TASKS = {
    # name: (signature, decorator queue, effective queue for string dispatch, effective queue for task.apply_async)
    "client_profile.tasks.verify_filefield_task": (
        "(model_name, object_pk, file_field, first_name=None, last_name=None, email=None, verification_field=None, **kwargs)",
        "ocr", "ocr", "ocr",
    ),
    "client_profile.tasks.verify_abn_task": (
        "(model_name, object_pk, abn_number, first_name, last_name, email, **kwargs)", "ocr", "ocr", "ocr",
    ),
    "client_profile.tasks.verify_ahpra_task": (
        "(model_name, object_pk, ahpra_number, first_name, last_name, email, **kwargs)", "ocr", "ocr", "ocr",
    ),
    "client_profile.tasks.run_all_verifications": (
        "(model_name, object_pk, is_create=False)", "default", "default", "default",
    ),
    "client_profile.tasks.final_evaluation": (
        "(model_name, object_pk, retry_count=0, is_reminder=False)", "default", "default", "default",
    ),
    "client_profile.tasks.send_shift_reminders": ("()", "notifications", "notifications", "notifications"),
    "client_profile.tasks.run_referee_reminder": (
        "(model_name: str, pk: int, ref_idx: int) -> None", "notifications", "notifications", "notifications",
    ),
    "client_profile.tasks.email_membership_application_submitted": (
        "(app_id: int)", "notifications", "notifications", "notifications",
    ),
    # CURRENT BEHAVIOUR: no CELERY_TASK_ROUTES entry, so a by-name dispatch (core.task_queue.async_task ->
    # send_task) lands on CELERY_TASK_DEFAULT_QUEUE ("default"), not on the decorator's "notifications" queue.
    # Both queues are consumed by the worker; the mismatch is characterised here and changed only deliberately.
    "client_profile.tasks.email_membership_application_review_updated": (
        "(app_id: int, changes: list[dict] | None = None)", "notifications", "default", "notifications",
    ),
    "client_profile.tasks.email_membership_application_approved": (
        "(app_id: int)", "notifications", "notifications", "notifications",
    ),
    "client_profile.tasks.email_membership_application_rejected": (
        "(app_id: int)", "notifications", "default", "notifications",
    ),
}

LEGACY_BEAT = {
    "marketplace-escalations-every-minute": ("marketplace.tasks.process_goods_escalations", {}),
    "ethical-marketplace-escalations-every-minute": ("ethical_marketplace.tasks.process_ethical_escalations", {}),
    "calendar-birthdays-daily": ("client_profile.calendar_tasks.generate_all_birthday_events", {"queue": "notifications"}),
    "calendar-work-notes-hourly": ("client_profile.calendar_tasks.send_shift_start_work_note_notifications", {"queue": "notifications"}),
    "calendar-work-notes-9am-fallback": ("client_profile.calendar_tasks.send_9am_work_note_fallback", {"queue": "notifications"}),
    "shift-reminders-hourly": ("client_profile.tasks.send_shift_reminders", {"queue": "notifications"}),
    "publish-editorial-revisions": ("public_hub.tasks.publish_scheduled_content", {}),
}


_LOADED = []


def celery_app():
    from core.celery import app

    if not _LOADED:  # load once, before any test patches django.apps
        app.loader.import_default_modules()
        _LOADED.append(True)
    return app


def task(name):
    return celery_app().tasks[name]


def impl(task_name, name):
    """A module-level name as the task implementation sees it (wherever that implementation lives)."""
    return task(task_name).run.__globals__[name]


def patch_impl(task_name, **names):
    """Patch module-level names in the module that defines the task implementation."""
    return mock.patch.dict(task(task_name).run.__globals__, names)


class TaskIdentityContractTests(SimpleTestCase):
    def test_every_legacy_task_is_registered_once_under_its_historical_name(self):
        app = celery_app()
        for name in LEGACY_TASKS:
            self.assertIn(name, app.tasks)
            self.assertEqual(app.tasks[name].name, name)

    def test_legacy_python_imports_are_the_registered_task_objects(self):
        from client_profile import tasks as legacy

        app = celery_app()
        for name in LEGACY_TASKS:
            attribute = name.rsplit(".", 1)[1]
            imported = getattr(legacy, attribute)
            imported = getattr(imported, "_get_current_object", lambda: imported)()  # shared_task returns a proxy
            self.assertIs(imported, app.tasks[name], name)

    def test_one_implementation_function_per_task_name(self):
        # a canonical task and a compatibility wrapper registered under the same name would differ here
        app = celery_app()
        functions = {}
        for name in LEGACY_TASKS:
            functions.setdefault(app.tasks[name].run, []).append(name)
        self.assertTrue(all(len(names) == 1 for names in functions.values()))

    def test_no_task_name_is_declared_twice_in_shipped_code(self):
        # Celery keeps the last registration under a name silently; a compatibility wrapper registered under a
        # canonical task's name would replace it depending on import order.
        import ast as ast_module

        from core.test_backend_ownership_boundaries import runtime_files

        declared = {}
        for rel, _path, tree in runtime_files():
            for node in ast_module.walk(tree):
                if not isinstance(node, (ast_module.FunctionDef, ast_module.AsyncFunctionDef)):
                    continue
                for decorator in node.decorator_list:
                    if not isinstance(decorator, ast_module.Call):
                        continue
                    for keyword in decorator.keywords:
                        if keyword.arg == "name" and isinstance(keyword.value, ast_module.Constant):
                            declared.setdefault(keyword.value.value, []).append(f"{rel}:{node.lineno}")
        self.assertTrue(set(LEGACY_TASKS) <= set(declared))
        self.assertEqual({name: where for name, where in declared.items() if len(where) > 1}, {})

    def test_verification_pipeline_is_dispatched_only_by_itself(self):
        # CURRENT BEHAVIOUR (product decision, not a defect): run_all_verifications / final_evaluation are a retained,
        # supported pipeline, but no user flow dispatches them. In particular a manual AHPRA change (admin or onboarding
        # serializer) does not enqueue final_evaluation. Wiring a dispatcher in is a separate, deliberate change.
        import ast as ast_module

        from core.test_backend_ownership_boundaries import runtime_files

        names = {"client_profile.tasks.run_all_verifications", "client_profile.tasks.final_evaluation"}
        sites = set()
        for rel, _path, tree in runtime_files():
            for node in ast_module.walk(tree):
                if isinstance(node, ast_module.Constant) and node.value in names:
                    sites.add(rel)
                elif isinstance(node, ast_module.Attribute) and node.attr in {"delay", "apply_async", "s", "si"}:
                    if ast_module.unparse(node.value) in {"final_evaluation", "run_all_verifications"}:
                        sites.add(rel)
        # the pipeline schedules itself; settings only route the names
        self.assertEqual(sites, {"onboarding/tasks.py", "core/settings.py"})

    def test_signatures_are_unchanged(self):
        for name, (signature, *_queues) in LEGACY_TASKS.items():
            self.assertEqual(str(inspect.signature(task(name).run)), signature, name)

    def test_queues_and_effective_routes_are_unchanged(self):
        router = celery_app().amqp.router

        def routed(name, task_type=None):
            # apply_async merges the task's own options (its decorator queue) before routing; send_task does not
            options = task_type._get_exec_options() if task_type is not None else {}
            queue = router.route(dict(options), name, args=(), kwargs={}, task_type=task_type).get("queue")
            return getattr(queue, "name", queue)

        for name, (_signature, decorator_queue, by_name, by_object) in LEGACY_TASKS.items():
            self.assertEqual(task(name).queue, decorator_queue, name)
            self.assertEqual(routed(name), by_name, f"{name} via send_task")
            self.assertEqual(routed(name, task(name)), by_object, f"{name} via apply_async")

    def test_beat_entries_are_unchanged(self):
        beat = celery_app().conf.beat_schedule
        self.assertEqual(
            {key: (entry["task"], entry.get("options", {})) for key, entry in beat.items()},
            LEGACY_BEAT,
        )

    def test_string_dispatch_resolves_every_legacy_name(self):
        from core import task_queue

        app = celery_app()
        for name in LEGACY_TASKS:
            with mock.patch.object(app, "send_task") as send_task, \
                    mock.patch.object(task_queue, "current_app", app):
                task_queue.async_task(name, 1, 2, flag=True)
            send_task.assert_called_once_with(name, args=(1, 2), kwargs={"flag": True})


ABR_HTML = """
<div itemtype="http://schema.org/LocalBusiness"><table><tbody>
<tr><th>Entity name:</th><td><span itemprop="legalName">EXAMPLE&nbsp;PHARMACY PTY LTD</span></td></tr>
<tr><th>ABN status:</th><td>Active from 18 Aug 2020</td></tr>
<tr><th>Entity type:</th><td>Australian Private Company</td></tr>
<tr><th>Goods &amp; Services Tax (GST):</th><td>Registered from 1 September 2023 to 30 Jun 2024</td></tr>
</tbody></table></div>
"""


class AbrIntegrationContractTests(SimpleTestCase):
    def helpers(self):
        name = "client_profile.tasks.verify_abn_task"
        return impl(name, "abn_lookup"), impl(name, "_parse_abn_html_fields")

    def test_parse_registered_gst_with_end_date(self):
        _lookup, parse = self.helpers()
        self.assertEqual(parse(ABR_HTML), {
            "entity_name": "EXAMPLE PHARMACY PTY LTD",
            "abn_status": "Active from 18 Aug 2020",
            "entity_type": "Australian Private Company",
            "gst_text": "Registered from 1 September 2023 to 30 Jun 2024",
            "abn_gst_registered": True,
            "abn_gst_from": date(2023, 9, 1),
            "abn_gst_to": date(2024, 6, 30),
        })

    def test_parse_not_registered_for_gst(self):
        _lookup, parse = self.helpers()
        html = ABR_HTML.replace("Registered from 1 September 2023 to 30 Jun 2024", "Not currently registered for GST")
        parsed = parse(html)
        self.assertEqual(
            (parsed["abn_gst_registered"], parsed["abn_gst_from"], parsed["abn_gst_to"]), (False, None, None)
        )

    def test_parse_empty_and_malformed_html(self):
        _lookup, parse = self.helpers()
        self.assertEqual(parse(""), {})
        self.assertEqual(parse(None), {})
        self.assertEqual(parse("<html><body>no table</body></html>"), {})

    def test_lookup_success_returns_legal_name_and_html(self):
        lookup, _parse = self.helpers()
        response = mock.Mock(text=ABR_HTML)
        with mock.patch("requests.get", return_value=response) as get:
            # CURRENT BEHAVIOUR: the lookup returns the raw legal name; only the parser normalises the non-breaking space
            self.assertEqual(lookup("51824753556"), ("EXAMPLE\xa0PHARMACY PTY LTD", ABR_HTML))
        get.assert_called_once_with("https://abr.business.gov.au/ABN/View?id=51824753556", timeout=20)
        response.raise_for_status.assert_called_once_with()

    def test_lookup_provider_failure_returns_empty_result(self):
        lookup, _parse = self.helpers()
        with mock.patch("requests.get", side_effect=OSError("network down")):
            self.assertEqual(lookup("51824753556"), ("", None))

    def test_synchronous_consumers_use_the_same_helpers(self):
        from organizations import views as organization_views
        from worker_finance import views as finance_views  # noqa: F401  (imports the helpers inside a view)

        lookup, parse = self.helpers()
        self.assertIs(organization_views.abn_lookup, lookup)
        self.assertIs(organization_views._parse_abn_html_fields, parse)


class ReminderMarkerContractTests(SimpleTestCase):
    TASK = "client_profile.tasks.run_referee_reminder"

    def test_redis_key_formats_are_unchanged(self):
        referee_key = impl(self.TASK, "_referee_reminder_key")
        final_key = impl("client_profile.tasks.final_evaluation", "_final_evaluation_reminder_key")
        self.assertEqual(referee_key("PharmacistOnboarding", 7, 2), "celery:referee-reminder:PharmacistOnboarding:7:2")
        self.assertEqual(final_key("OtherStaffOnboarding", 9), "celery:final-evaluation-reminder:OtherStaffOnboarding:9")

    def test_schedule_sets_marker_with_ttl_and_enqueues_once(self):
        schedule = impl(self.TASK, "schedule_referee_reminder")
        redis_client = mock.Mock()
        redis_client.set.return_value = True
        now = datetime(2026, 1, 5, 10, 0, tzinfo=dt_timezone.utc)
        with mock.patch.dict(schedule.__globals__, {"_reminder_redis": lambda: redis_client}), \
                mock.patch.object(task(self.TASK), "apply_async") as apply_async, \
                mock.patch("django.utils.timezone.now", return_value=now):
            schedule("PharmacistOnboarding", 7, 1, hours=2)
        redis_client.set.assert_called_once_with(
            "celery:referee-reminder:PharmacistOnboarding:7:1", "1", ex=2 * 3600 + 3600, nx=True
        )
        apply_async.assert_called_once_with(
            args=("PharmacistOnboarding", 7, 1), eta=now + timedelta(hours=2), queue="notifications"
        )

    def test_schedule_default_delay_is_48_hours(self):
        schedule = impl(self.TASK, "schedule_referee_reminder")
        self.assertEqual(schedule.__globals__["REFEREE_REMINDER_HOURS"], 48.0)
        redis_client = mock.Mock()
        redis_client.set.return_value = True
        with mock.patch.dict(schedule.__globals__, {"_reminder_redis": lambda: redis_client}), \
                mock.patch.object(task(self.TASK), "apply_async"):
            schedule("PharmacistOnboarding", 7, 1)
        self.assertEqual(redis_client.set.call_args.kwargs["ex"], 48 * 3600 + 3600)

    def test_failed_enqueue_removes_the_marker_and_propagates(self):
        # SET NX + enqueue behave as one operation: a marker without a queued task would block every later schedule
        schedule = impl(self.TASK, "schedule_referee_reminder")
        redis_client = mock.Mock()
        redis_client.set.return_value = True
        with mock.patch.dict(schedule.__globals__, {"_reminder_redis": lambda: redis_client}), \
                mock.patch.object(task(self.TASK), "apply_async", side_effect=ConnectionError("broker down")), \
                self.assertLogs(schedule.__module__, level="ERROR"), \
                self.assertRaises(ConnectionError):
            schedule("PharmacistOnboarding", 7, 1)
        redis_client.delete.assert_called_once_with("celery:referee-reminder:PharmacistOnboarding:7:1")

    def test_existing_marker_prevents_a_second_enqueue(self):
        schedule = impl(self.TASK, "schedule_referee_reminder")
        redis_client = mock.Mock()
        redis_client.set.return_value = None  # NX refused: a reminder is already scheduled
        with mock.patch.dict(schedule.__globals__, {"_reminder_redis": lambda: redis_client}), \
                mock.patch.object(task(self.TASK), "apply_async") as apply_async:
            schedule("PharmacistOnboarding", 7, 1)
        apply_async.assert_not_called()

    def test_cancel_deletes_the_marker(self):
        cancel = impl(self.TASK, "cancel_referee_reminder")
        cancel_all = cancel.__globals__["cancel_all_referee_reminders"]
        redis_client = mock.Mock()
        redis_client.delete.return_value = 1
        with mock.patch.dict(cancel.__globals__, {"_reminder_redis": lambda: redis_client}):
            self.assertEqual(cancel("PharmacistOnboarding", 7, 2), 1)
            self.assertEqual(cancel_all("PharmacistOnboarding", 7), 2)
        self.assertEqual(
            [c.args[0] for c in redis_client.delete.call_args_list],
            [
                "celery:referee-reminder:PharmacistOnboarding:7:2",
                "celery:referee-reminder:PharmacistOnboarding:7:1",
                "celery:referee-reminder:PharmacistOnboarding:7:2",
            ],
        )

    def test_synchronous_consumers_use_the_same_reminder_functions(self):
        from onboarding import views as onboarding_views

        self.assertIs(onboarding_views.cancel_referee_reminder, impl(self.TASK, "cancel_referee_reminder"))


class FinalEvaluationContractTests(SimpleTestCase):
    TASK = "client_profile.tasks.final_evaluation"

    def run_task(self, obj, *, marker=False, **kwargs):
        model = mock.Mock()
        model.objects.get.return_value = obj
        model.DoesNotExist = Exception
        fake_apps = SimpleNamespace(get_model=lambda label, name: model)
        calls = SimpleNamespace(set=[], delete=[], sent=[])
        final_evaluation = task(self.TASK)
        with mock.patch("django.apps.apps", fake_apps), \
                patch_impl(
                    self.TASK,
                    _marker_get=lambda key: marker,
                    _marker_set=lambda key, timeout, **kw: calls.set.append((key, timeout)),
                    _marker_delete=lambda key: calls.delete.append(key),
                    notification_already_sent=lambda o, kind: False,
                    mark_notification_sent=lambda o, kind: calls.sent.append(kind),
                ), \
                mock.patch("core.task_queue.async_task") as async_task, \
                mock.patch("onboarding.emails.send_referee_emails") as referee_emails, \
                mock.patch.object(final_evaluation, "apply_async") as apply_async:
            final_evaluation.run("PharmacistOnboarding", 5, **kwargs)
        return calls, async_task, referee_emails, apply_async

    def pharmacist(self, **values):
        defaults = dict(
            pk=5, user=SimpleNamespace(email="p@example.com", first_name="Pat", id=11, role="PHARMACIST"), user_id=11,
            payment_preference="TFN", abn="", tfn_number="", verified=False,
            gov_id_verified=True, gov_id_verification_note="", ahpra_verified=True, ahpra_verification_note="",
            referee1_confirmed=True, referee2_confirmed=True, referee1_rejected=False, referee2_rejected=False,
        )
        defaults.update(values)
        obj = SimpleNamespace(**defaults)
        obj.save = mock.Mock()
        return obj

    def test_pending_automated_check_reschedules_in_20_seconds_without_retry_count(self):
        obj = self.pharmacist(ahpra_verified=False)
        calls, async_task, _emails, apply_async = self.run_task(obj)
        apply_async.assert_called_once()
        self.assertEqual(apply_async.call_args.kwargs["args"], ("PharmacistOnboarding", 5))
        # CURRENT BEHAVIOUR (known defect, fixed separately): the re-check does not pass retry_count + 1
        self.assertNotIn("kwargs", apply_async.call_args.kwargs)
        self.assertEqual(apply_async.call_args.kwargs["queue"], "default")
        async_task.assert_not_called()

    def test_retry_guard_stops_and_cancels_reminders(self):
        obj = self.pharmacist(ahpra_verified=False)
        calls, _async_task, _emails, apply_async = self.run_task(obj, retry_count=16)
        apply_async.assert_not_called()
        self.assertEqual(calls.delete, ["celery:final-evaluation-reminder:PharmacistOnboarding:5"])

    def test_pending_referee_schedules_one_48_hour_reminder(self):
        obj = self.pharmacist(referee2_confirmed=False)
        calls, _async_task, _emails, apply_async = self.run_task(obj)
        self.assertEqual(calls.set, [("celery:final-evaluation-reminder:PharmacistOnboarding:5", 48 * 3600 + 3600)])
        apply_async.assert_called_once()
        self.assertEqual(apply_async.call_args.kwargs["kwargs"], {"is_reminder": True})
        obj.save.assert_called_once_with(update_fields=["verified"])

    def test_reminder_run_without_marker_is_skipped(self):
        obj = self.pharmacist(referee2_confirmed=False)
        _calls, _async_task, emails, apply_async = self.run_task(obj, is_reminder=True, marker=False)
        emails.assert_not_called()
        apply_async.assert_not_called()

    # --- Target behaviour of the supported pipeline (C-H1). Marked expectedFailure until the fix commit lands. ---
    # State first, then a bounded 20-second re-check loop (retry_count advances), and a limit that stops ONLY that
    # loop: the 48-hour referee reminder marker survives, and a profile that completes on the last run still gets a
    # final state.

    @unittest.expectedFailure
    def test_target_quick_recheck_advances_retry_count(self):
        for current in (0, 5, 15):  # re-check while retry_count <= 15 (same boundary as the old > 15 guard)
            obj = self.pharmacist(ahpra_verified=False)
            _calls, _async_task, _emails, apply_async = self.run_task(obj, retry_count=current)
            apply_async.assert_called_once()
            self.assertEqual(apply_async.call_args.kwargs["kwargs"], {"retry_count": current + 1})
            self.assertEqual(apply_async.call_args.kwargs["queue"], "default")

    @unittest.expectedFailure
    def test_target_limit_stops_only_the_quick_loop(self):
        obj = self.pharmacist(ahpra_verified=False)
        calls, _async_task, _emails, apply_async = self.run_task(obj, retry_count=16)
        apply_async.assert_not_called()
        self.assertEqual(calls.delete, [])  # nothing cancelled: the profile is still pending

    @unittest.expectedFailure
    def test_target_limit_keeps_the_48_hour_reminder(self):
        obj = self.pharmacist(ahpra_verified=False, referee2_confirmed=False)
        calls, _async_task, _emails, apply_async = self.run_task(obj, retry_count=16, marker=True)
        self.assertEqual(calls.delete, [])
        apply_async.assert_not_called()  # marker exists: no second reminder, and the quick loop is over

    @unittest.expectedFailure
    def test_target_state_is_evaluated_before_the_limit(self):
        obj = self.pharmacist()  # everything verified by the time this late run executes
        with mock.patch("django.db.transaction.on_commit"):
            calls, async_task, _emails, _apply_async = self.run_task(obj, retry_count=16)
        self.assertTrue(obj.verified)
        self.assertEqual(calls.sent, ["verified"])

        obj = self.pharmacist(gov_id_verified=False, gov_id_verification_note="Name mismatch")
        calls, _async_task, _emails, _apply_async = self.run_task(obj, retry_count=16)
        self.assertEqual(calls.sent, ["failed"])

    @unittest.expectedFailure
    def test_target_reminder_run_starts_its_own_bounded_loop(self):
        obj = self.pharmacist(ahpra_verified=False, referee2_confirmed=False)
        calls, _async_task, emails, apply_async = self.run_task(obj, is_reminder=True, marker=True)
        emails.assert_called_once()
        quick = [c for c in apply_async.call_args_list if c.kwargs.get("kwargs", {}).get("retry_count") is not None]
        self.assertEqual([c.kwargs["kwargs"] for c in quick], [{"retry_count": 1}])

    def test_failed_check_marks_unverified_and_notifies_once(self):
        obj = self.pharmacist(gov_id_verified=False, gov_id_verification_note="Name mismatch")
        calls, async_task, _emails, apply_async = self.run_task(obj)
        self.assertFalse(obj.verified)
        self.assertEqual(calls.sent, ["failed"])
        self.assertEqual(async_task.call_args.args[0], "users.tasks.send_async_email")
        self.assertEqual(async_task.call_args.kwargs["context"]["verification_reasons"], ["Name mismatch"])
        apply_async.assert_not_called()

    def test_success_marks_verified_and_notifies_once(self):
        obj = self.pharmacist()
        with mock.patch("django.db.transaction.on_commit"):
            calls, async_task, _emails, _apply_async = self.run_task(obj)
        self.assertTrue(obj.verified)
        self.assertEqual(calls.sent, ["verified"])
        self.assertEqual(async_task.call_args.kwargs["template_name"], "emails/profile_verified.html")


class FetchInstanceContractTests(SimpleTestCase):
    def test_found_object_is_returned(self):
        fetch = impl("client_profile.tasks.verify_abn_task", "fetch_instance_with_retries")
        model = mock.Mock()
        model.objects.get.return_value = "object"
        self.assertEqual(fetch(model, 3, max_retries=2, sleep_sec=0), "object")

    def model(self, side_effect):
        from django.core.exceptions import ObjectDoesNotExist

        class Missing(ObjectDoesNotExist):
            pass

        model = mock.Mock()
        model.DoesNotExist = Missing
        model.objects.get.side_effect = [Missing() if item is None else item for item in side_effect]
        return model

    def test_object_that_appears_late_is_returned_after_retries(self):
        fetch = impl("client_profile.tasks.verify_abn_task", "fetch_instance_with_retries")
        model = self.model([None, None, "object"])
        with self.assertLogs(fetch.__module__, level="WARNING") as logs:
            self.assertEqual(fetch(model, 3, max_retries=5, sleep_sec=0), "object")
        self.assertEqual(model.objects.get.call_count, 3)
        self.assertEqual(len(logs.records), 2)

    def test_object_that_never_appears_raises_does_not_exist_after_max_retries(self):
        fetch = impl("client_profile.tasks.verify_abn_task", "fetch_instance_with_retries")
        model = self.model([None, None, None])
        with self.assertLogs(fetch.__module__, level="WARNING"), self.assertRaises(model.DoesNotExist):
            fetch(model, 3, max_retries=3, sleep_sec=0)
        self.assertEqual(model.objects.get.call_count, 3)


class DocumentVerificationContractTests(SimpleTestCase):
    TASK = "client_profile.tasks.verify_filefield_task"

    def run_task(self, obj, *, ocr=None, local_path=None, **kwargs):
        model = mock.Mock()
        fake_apps = SimpleNamespace(get_model=lambda label, name: model)
        overrides = {"apps": fake_apps, "fetch_instance_with_retries": lambda m, pk: obj}
        if local_path is not None:
            overrides["get_local_file_or_download"] = lambda field: local_path
        if ocr is not None:
            overrides["azure_ocr"] = ocr
        with patch_impl(self.TASK, **overrides):
            task(self.TASK).run(
                "PharmacistOnboarding", 5, "government_id", "Ann", "Lee", "ann@example.com", "gov_id_verified",
                **kwargs,
            )

    def onboarding(self, **values):
        fields = dict(
            user=SimpleNamespace(first_name="Ann", last_name="Lee", email="ann@example.com"),
            government_id=None, gov_id_verified=None, gov_id_verification_note="",
        )
        fields.update(values)
        obj = SimpleNamespace(**fields)
        obj.save = mock.Mock()
        return obj

    def test_existing_note_skips_the_run(self):
        obj = self.onboarding(gov_id_verification_note="done")
        self.run_task(obj, note_field="gov_id_verification_note")
        obj.save.assert_not_called()

    def test_missing_file_is_not_verified_with_a_fixed_note(self):
        obj = self.onboarding()
        self.run_task(obj, note_field="gov_id_verification_note")
        self.assertIs(obj.gov_id_verified, False)
        self.assertEqual(obj.gov_id_verification_note, "No file uploaded for this verification.")

    def test_name_match_and_mismatch(self):
        import tempfile

        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as handle:
            handle.write(b"\x89PNG")
            path = handle.name
        obj = self.onboarding(government_id="file")
        self.run_task(obj, local_path=path, ocr=lambda p: {"lines": ["ANN LEE"]}, note_field="gov_id_verification_note")
        self.assertIs(obj.gov_id_verified, True)
        self.assertEqual(obj.gov_id_verification_note, "")
        import os

        self.assertFalse(os.path.exists(path))  # a temporary download is removed

        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as handle:
            path = handle.name
        obj = self.onboarding(government_id="file")
        self.run_task(obj, local_path=path, ocr=lambda p: {"lines": ["SOMEONE ELSE"]}, note_field="gov_id_verification_note")
        self.assertIs(obj.gov_id_verified, False)
        self.assertEqual(obj.gov_id_verification_note, "Name mismatch found in your uploaded document")

    def test_ocr_failure_note_is_fixed_and_secret_free(self):
        import tempfile

        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as handle:
            path = handle.name

        secret = "SECRET-" + "OCR"  # built at runtime: a traceback shows source lines, never runtime values

        def failing(_path):
            raise RuntimeError(f"https://ocr.example/?key={secret}")

        obj = self.onboarding(government_id="file")
        with self.assertLogs(task(self.TASK).run.__module__, level="WARNING") as logs:
            self.run_task(obj, local_path=path, ocr=failing, note_field="gov_id_verification_note")
        self.assertEqual(obj.gov_id_verification_note, "OCR processing failed.")
        self.assertNotIn("SECRET-OCR", " ".join(logs.output))

    def test_pdf_detection(self):
        import tempfile

        is_pdf = impl(self.TASK, "ocr_input_path_for_file").__globals__["is_pdf_file"]
        with tempfile.NamedTemporaryFile(suffix=".bin", delete=False) as handle:
            handle.write(b"%PDF-1.7")
        self.assertTrue(is_pdf(handle.name))
        self.assertTrue(is_pdf("/missing/file.PDF"))
        self.assertFalse(is_pdf("/missing/file.png"))


@override_settings(FRONTEND_BASE_URL="https://app.example")
class MembershipNotificationContractTests(TestCase):
    def setUp(self):
        from memberships.models import MembershipApplication, MembershipInviteLink
        from organizations.models import Organization, PharmacyAdmin
        from users.models import OrganizationMembership

        self.owner, self.pharmacy = make_owner_with_pharmacy()
        organization = Organization.objects.create(name="Contract Org", slug="contract-org")
        self.pharmacy.organization = organization
        self.pharmacy.save(update_fields=["organization"])
        self.admin = make_user("OWNER")
        PharmacyAdmin.objects.create(user=self.admin, pharmacy=self.pharmacy)
        self.org_admin = make_user("OWNER")
        OrganizationMembership.objects.create(user=self.org_admin, organization=organization, role="ORG_ADMIN")
        link = MembershipInviteLink.objects.create(
            pharmacy=self.pharmacy, created_by=self.owner, category="FULL_PART_TIME",
            expires_at=timezone.now() + timedelta(days=7),
        )
        self.applicant = make_user("OTHER_STAFF")
        self.app = MembershipApplication.objects.create(
            invite_link=link, pharmacy=self.pharmacy, category="FULL_PART_TIME", role="ASSISTANT",
            first_name="Ann", last_name="Lee", mobile_number="0400000001", email=self.applicant.email,
            submitted_by=self.applicant,
        )

    def run_task(self, name, *args):
        sent = []
        with patch_impl(name, send_async_email=lambda **kwargs: sent.append(kwargs)):
            task(name).run(*args)
        return sent

    def test_submitted_notifies_owner_admin_and_org_admin_with_role_urls(self):
        sent = self.run_task("client_profile.tasks.email_membership_application_submitted", self.app.id)
        by_email = {mail["recipient_list"][0]: mail for mail in sent}
        self.assertEqual(set(by_email), {self.owner.email, self.admin.email, self.org_admin.email})
        detail = f"?workspace=internal&pharmacy_id={self.pharmacy.id}&view=detail&pharmacyId={self.pharmacy.id}"
        self.assertEqual(
            by_email[self.owner.email]["context"]["manage_url"],
            f"https://app.example/dashboard/owner/manage-pharmacies{detail}",
        )
        self.assertEqual(
            by_email[self.org_admin.email]["context"]["manage_url"],
            f"https://app.example/dashboard/organization/manage-pharmacies{detail}",
        )
        owner_mail = by_email[self.owner.email]
        self.assertEqual(owner_mail["subject"], f"New membership application — {self.pharmacy.name}")
        self.assertEqual(owner_mail["template_name"], "emails/membership_application_submitted.html")
        self.assertEqual(owner_mail["notification"]["user_ids"], [self.owner.id])
        self.assertEqual(owner_mail["notification"]["payload"], {
            "application_id": self.app.id, "pharmacy_id": self.pharmacy.id,
            "category": "FULL_PART_TIME", "role": "ASSISTANT",
        })
        self.assertEqual(owner_mail["context"]["category"], "Full/Part-time (Pharmacy staff)")

    def test_owner_who_is_also_admin_keeps_the_owner_role(self):
        from organizations.models import PharmacyAdmin

        PharmacyAdmin.objects.filter(user=self.admin).delete()
        PharmacyAdmin.objects.create(user=self.owner, pharmacy=self.pharmacy)
        sent = self.run_task("client_profile.tasks.email_membership_application_submitted", self.app.id)
        owner_mail = [m for m in sent if m["recipient_list"] == [self.owner.email]]
        self.assertEqual(len(owner_mail), 1)
        self.assertIn("/dashboard/owner/", owner_mail[0]["context"]["manage_url"])

    def test_review_updated_lists_changed_fields(self):
        changes = [{"field": "role", "from": "ASSISTANT", "to": "TECHNICIAN"}, {"field": ""}, {"field": "pay_rate", "to": 1}]
        sent = self.run_task("client_profile.tasks.email_membership_application_review_updated", self.app.id, changes)
        self.assertEqual(len(sent), 1)
        mail = sent[0]
        self.assertEqual([c["label"] for c in mail["context"]["changes"]], ["Role", "Pay Rate"])
        self.assertEqual(mail["notification"]["body"], "The pharmacy reviewed and updated: Role, Pay Rate.")
        self.assertEqual(mail["notification"]["user_ids"], [self.applicant.id])
        self.assertEqual(self.run_task("client_profile.tasks.email_membership_application_review_updated", self.app.id, []), [])

    def test_approved_and_rejected_applicant_notifications(self):
        approved = self.run_task("client_profile.tasks.email_membership_application_approved", self.app.id)[0]
        self.assertEqual(approved["subject"], f"Your application to {self.pharmacy.name} was approved")
        self.assertEqual(approved["context"]["category"], "Pharmacy staff")
        self.assertIsNone(approved["context"]["employment_terms"])
        self.assertEqual(approved["notification"]["user_ids"], [self.applicant.id])
        rejected = self.run_task("client_profile.tasks.email_membership_application_rejected", self.app.id)[0]
        self.assertEqual(rejected["notification"]["payload"], {"application_id": self.app.id, "status": "REJECTED"})
        self.assertTrue(rejected["context"]["membership_url"].endswith("/memberships"))

    def test_missing_application_is_a_no_op(self):
        for name in (
            "client_profile.tasks.email_membership_application_submitted",
            "client_profile.tasks.email_membership_application_approved",
            "client_profile.tasks.email_membership_application_rejected",
        ):
            self.assertEqual(self.run_task(name, 987654), [])


class ShiftReminderContractTests(TestCase):
    TASK = "client_profile.tasks.send_shift_reminders"

    def setUp(self):
        from shifts.models import Shift, ShiftSlot, ShiftSlotAssignment

        self.owner, self.pharmacy = make_owner_with_pharmacy()
        self.pharmacy.timezone = "Australia/Sydney"  # UTC+11 in January
        self.pharmacy.save(update_fields=["timezone"])
        self.worker = make_user("PHARMACIST")
        self.now = datetime(2026, 1, 5, 0, 30, tzinfo=dt_timezone.utc)  # 11:30 local
        shift = Shift.objects.create(pharmacy=self.pharmacy, created_by=self.owner, role_needed="PHARMACIST", employment_type="LOCUM")

        def assign(day, start):
            slot = ShiftSlot.objects.create(shift=shift, date=day, start_time=start, end_time=time(23, 59))
            return ShiftSlotAssignment.objects.create(shift=shift, slot=slot, slot_date=day, user=self.worker)

        self.inside = assign(date(2026, 1, 5), time(23, 45))   # local start 12h15 ahead: inside [12h, 13h)
        self.before = assign(date(2026, 1, 5), time(23, 15))   # 11h45 ahead: outside
        self.after = assign(date(2026, 1, 6), time(0, 30))     # 13h00 ahead: outside (window end is exclusive)

    def test_only_assignments_starting_12_to_13_hours_ahead_are_reminded(self):
        dispatched = []
        with mock.patch("django.utils.timezone.now", return_value=self.now), \
                patch_impl(self.TASK, async_task=lambda *a, **kw: dispatched.append((a, kw))):
            task(self.TASK).run()
        self.assertEqual(len(dispatched), 1)
        args, kwargs = dispatched[0]
        self.assertEqual(args, ("users.tasks.send_async_email",))
        self.assertEqual(kwargs["recipient_list"], [self.worker.email])
        self.assertEqual(kwargs["template_name"], "emails/shift_reminder.html")
        self.assertEqual(kwargs["subject"], f"Reminder: Your upcoming shift at {self.pharmacy.name}")
        self.assertEqual(kwargs["context"]["slot_time"], "2026-01-05 23:45–23:59")
