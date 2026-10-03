"""Every task the web code dispatches by name must resolve in a web process.

`core.task_queue.async_task` sends tasks by name and refuses names Celery does not know. A web process only knows the
tasks whose modules something happened to import, so a refactor that stops importing a task module (as PR #111 did
for `onboarding.tasks` and `memberships.tasks`) made identity and ABN submission and the membership e-mails fail.

The test scans the backend for `async_task(...)` / `send_task(...)` calls with a literal task name, starts a fresh
interpreter that loads Django and the URLconf the way a web worker does, and resolves each name there. Test-process
state cannot hide a failure because nothing is imported in the child beyond what a web request path imports.
"""
import ast
import json
import os
import subprocess
import sys
from pathlib import Path

from django.conf import settings
from django.test import SimpleTestCase

BACKEND = Path(settings.BASE_DIR)
DISPATCHERS = {"async_task", "send_task"}

CHILD = r"""
import json, os, sys
import django
django.setup()
from django.urls import get_resolver
get_resolver().url_patterns  # import every view, as a web worker does on its first request
from core.task_queue import registered_task_name
missing = []
for name in json.loads(sys.argv[1]):
    try:
        registered_task_name(name)
    except LookupError:
        missing.append(name)
print(json.dumps(missing))
"""


def dispatched_task_names():
    names = set()
    for path in BACKEND.rglob("*.py"):
        if "migrations" in path.parts or path.name.startswith("test") or "tests" in path.parts:
            continue
        try:
            tree = ast.parse(path.read_text(encoding="utf-8"))
        except (SyntaxError, UnicodeDecodeError):
            continue
        for node in ast.walk(tree):
            if not isinstance(node, ast.Call) or not node.args:
                continue
            func = node.func
            name = func.attr if isinstance(func, ast.Attribute) else getattr(func, "id", None)
            first = node.args[0]
            if name in DISPATCHERS and isinstance(first, ast.Constant) and isinstance(first.value, str):
                names.add(first.value)
    return sorted(names)


class TaskDispatchRegistrationTests(SimpleTestCase):
    def test_the_scan_finds_the_web_dispatched_tasks(self):
        names = dispatched_task_names()
        for expected in (
            "users.tasks.send_async_email",
            "client_profile.tasks.verify_filefield_task",
            "client_profile.tasks.verify_abn_task",
            "client_profile.tasks.email_membership_application_submitted",
        ):
            self.assertIn(expected, names)

    def test_every_dispatched_task_resolves_in_a_fresh_web_process(self):
        names = dispatched_task_names()
        env = {**os.environ, "DJANGO_SETTINGS_MODULE": os.environ.get("DJANGO_SETTINGS_MODULE", "core.settings")}
        result = subprocess.run(
            [sys.executable, "-c", CHILD, json.dumps(names)],
            cwd=BACKEND, env=env, capture_output=True, text=True, timeout=180,
        )
        self.assertEqual(result.returncode, 0, result.stderr[-2000:])
        missing = json.loads(result.stdout.strip().splitlines()[-1])
        self.assertEqual(missing, [], "task names dispatched by the web code that a web process cannot resolve")
