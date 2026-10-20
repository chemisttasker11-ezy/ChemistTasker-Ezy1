"""Pure standard-library acceptance of Django import graph semantics."""
import ast
import tempfile
import unittest
from pathlib import Path

from module_import_graph import (
    approved_mutual_pairs, build_report, extract_edges, is_runtime, mutual_pairs
)


class ModuleImportGraphTests(unittest.TestCase):
    def test_excludes_migrations_tests_but_preserves_runtime_nested_modules(self):
        for path in ("alpha/migrations/0001_initial.py", "alpha/tests/test_access.py", "alpha/test_permissions.py"):
            self.assertFalse(is_runtime(Path(path)))
        self.assertTrue(is_runtime(Path("alpha/services/reconciliation.py")))

    def test_extracts_module_vs_delayed_imports_without_importing_app_code(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            for app in ("alpha", "beta", "gamma"):
                directory = root / app
                directory.mkdir()
                (directory / "__init__.py").touch()
            (root / "alpha" / "domain.py").write_text(
                "import beta.models\n"
                "def operation():\n"
                "    from gamma.models import Profile\n"
            )
            (root / "beta" / "views.py").write_text("from alpha.domain import run\n")
            direct, delayed, evidence = extract_edges(root)
            self.assertEqual(direct, {("alpha", "beta"), ("beta", "alpha")})
            self.assertEqual(delayed, {("alpha", "gamma")})
            self.assertEqual(evidence[("alpha", "gamma", "delayed")][0]["line"], 3)

    def test_new_mutual_pairs_fail_against_guard_owned_baseline(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            for app in ("alpha", "beta", "gamma"):
                p = root / app
                p.mkdir()
                (p / "__init__.py").touch()
            (root / "alpha" / "api.py").write_text("import beta.api\n")
            (root / "beta" / "api.py").write_text("import alpha.api\n")
            guard = root / "ownership.py"
            guard.write_text("ALLOWED_MUTUAL_APP_PAIRS = {('alpha', 'gamma')}\n")
            report = build_report(root, guard)
            self.assertEqual(report["new_unapproved_mutual_pairs"], [["alpha", "beta"]])
            guard.write_text("ALLOWED_MUTUAL_APP_PAIRS = {('alpha', 'beta')}\n")
            self.assertEqual(build_report(root, guard)["new_unapproved_mutual_pairs"], [])

    def test_existing_mutual_pairs_are_not_misrepresented_as_acyclic(self):
        self.assertEqual(mutual_pairs({("x", "y"), ("y", "x"), ("z", "x")}), {("x", "y")})

    def test_real_guard_allowlist_is_parseable_without_django_import(self):
        self.assertGreaterEqual(len(approved_mutual_pairs()), 1)


if __name__ == "__main__":
    unittest.main()
