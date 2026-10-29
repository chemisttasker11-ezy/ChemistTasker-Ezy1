"""Pure standard-library acceptance of Django import graph semantics."""
import ast
import tempfile
import unittest
from pathlib import Path

from module_import_graph import (
    approved_mutual_pairs, build_report, extract_edges, is_runtime, mutual_pairs,
    strongly_connected_components, unapproved_internal_cycle_edges, check_cycle_baseline
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

    def test_three_app_cycle_is_detected_without_direct_mutual_pair(self):
        edges = {("alpha", "beta"), ("beta", "gamma"), ("gamma", "alpha")}
        self.assertEqual(mutual_pairs(edges), set())
        self.assertEqual(strongly_connected_components(edges), [("alpha", "beta", "gamma")])
        self.assertEqual(unapproved_internal_cycle_edges(edges, set()), sorted(edges))

    def test_existing_approved_two_way_pair_is_not_new_debt(self):
        edges = {("alpha", "beta"), ("beta", "alpha"), ("beta", "gamma")}
        allowed = {("alpha", "beta")}
        self.assertEqual(unapproved_internal_cycle_edges(edges, allowed), [])


    def test_module_import_time_in_try_if_and_class_is_not_delayed(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            for app in ("alpha", "beta", "gamma", "delta", "epsilon"):
                p = root / app
                p.mkdir()
                (p / "__init__.py").touch()
            (root / "alpha" / "service.py").write_text(
                "try:\n    from beta.models import Model\nexcept ImportError:\n    import gamma.models\n"
                "if True:\n    import delta.models\n"
                "class Registry:\n    from epsilon.models import Model\n"
                "def later():\n    from beta.tasks import queue\n"
            )
            direct, delayed, evidence = extract_edges(root)
            self.assertEqual(direct, {
                ("alpha", "beta"), ("alpha", "gamma"), ("alpha", "delta"), ("alpha", "epsilon"),
            })
            self.assertEqual(delayed, {("alpha", "beta")})
            self.assertEqual(evidence[("alpha", "epsilon", "module")][0]["line"], 8)

    def test_type_checking_imports_excluded_from_runtime_graph(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            for app in ("alpha", "beta", "gamma", "delta"):
                p = root / app
                p.mkdir()
                (p / "__init__.py").touch()
            (root / "alpha" / "service.py").write_text(
                "from typing import TYPE_CHECKING\n"
                "import typing\n"
                "if TYPE_CHECKING:\n    import beta.models\nelse:\n    import gamma.models\n"
                "if not typing.TYPE_CHECKING:\n    import delta.models\n"
            )
            direct, delayed, _ = extract_edges(root)
            self.assertEqual(direct, {("alpha", "gamma"), ("alpha", "delta")})
            self.assertFalse(delayed)

    def test_reviewed_cycle_baseline_rejects_new_edge_inside_legacy_scc(self):
        baseline = {
            "schema": "chemisttasker-backend-cycle-baseline-v1",
            "strongly_connected_components": [["alpha", "beta", "gamma"]],
            "unapproved_cycle_edges": [["alpha", "beta"]],
        }
        report = {
            "strongly_connected_components": [["alpha", "beta", "gamma"]],
            "unapproved_cycle_edges": [["alpha", "beta"], ["gamma", "alpha"]],
        }
        self.assertEqual(
            check_cycle_baseline(report, baseline)["new_unapproved_cycle_edges"],
            [("gamma", "alpha")],
        )

    def test_reviewed_cycle_baseline_accepts_shrinking_debt_not_expanded_scc(self):
        baseline = {
            "schema": "chemisttasker-backend-cycle-baseline-v1",
            "strongly_connected_components": [["alpha", "beta", "gamma"], ["delta", "epsilon"]],
            "unapproved_cycle_edges": [["alpha", "beta"], ["gamma", "alpha"]],
        }
        smaller = {
            "strongly_connected_components": [["alpha", "beta"]],
            "unapproved_cycle_edges": [["alpha", "beta"]],
        }
        self.assertEqual(check_cycle_baseline(smaller, baseline), {
            "new_unapproved_cycle_edges": [],
            "new_strongly_connected_components": [],
        })
        grown = {
            "strongly_connected_components": [["alpha", "beta", "delta"]],
            "unapproved_cycle_edges": [["alpha", "beta"]],
        }
        self.assertEqual(
            check_cycle_baseline(grown, baseline)["new_strongly_connected_components"],
            [["alpha", "beta", "delta"]],
        )

    def test_real_guard_allowlist_is_parseable_without_django_import(self):
        self.assertEqual(approved_mutual_pairs(), set())


if __name__ == "__main__":
    unittest.main()
