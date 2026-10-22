"""No-DB guards: cross-app bindings that broke cycles must stay deferred.

Only the import timing changes; the called permission is the existing
workforce function. Never reimplement owner/manager/org policy in attendance.
"""
import ast
import unittest
from pathlib import Path

from module_import_graph import extract_edges

ROOT = Path(__file__).resolve().parents[1]
APPROVALS = ROOT / 'backend' / 'attendance' / 'approvals.py'
VIEWS = ROOT / 'backend' / 'attendance' / 'views.py'


class AttendanceWorkforceDependencyTest(unittest.TestCase):
    def test_attendance_resolves_workforce_permission_only_at_call_time(self):
        tree = ast.parse(APPROVALS.read_text(encoding='utf-8'))
        direct = [n for n in tree.body if isinstance(n, ast.ImportFrom)
                  and n.module == 'workforce.roster.permissions']
        self.assertEqual(direct, [])
        function = next(n for n in tree.body
                        if isinstance(n, ast.FunctionDef) and n.name == 'is_authorized_attendance_manager')
        permissions = [n for n in ast.walk(function)
                       if isinstance(n, ast.ImportFrom) and n.module == 'workforce.roster.permissions']
        self.assertEqual(len(permissions), 1)
        self.assertEqual([x.name for x in permissions[0].names], ['is_authorized_attendance_manager'])
        self.assertEqual(permissions[0].names[0].asname, 'check')

    def test_views_uses_single_attendance_permission_bridge(self):
        tree = ast.parse(VIEWS.read_text(encoding='utf-8'))
        workforce = [n for n in tree.body if isinstance(n, ast.ImportFrom)
                     and n.module == 'workforce.roster.permissions']
        self.assertEqual(workforce, [])
        approval_imports = [n for n in tree.body if isinstance(n, ast.ImportFrom)
                            and n.module == 'attendance.approvals']
        self.assertTrue(any(any(alias.name == 'is_authorized_attendance_manager'
                                for alias in stmt.names) for stmt in approval_imports))


class TalentUsersDependencyTest(unittest.TestCase):
    def test_rating_and_reward_imports_stay_at_call_sites(self):
        cases = (
            ('talent/views/explorer.py', 'ExplorerPostViewSet', 'get_queryset',
             'ratings.models', ['Rating']),
            ('users/serializers.py', 'UserRegistrationSerializer', 'create',
             'rewards.services', ['claim_referral_code', 'RewardError']),
        )
        for path, class_name, method_name, module, names in cases:
            with self.subTest(path=path):
                tree = ast.parse((ROOT / 'backend' / path).read_text(encoding='utf-8'))
                cls = next(n for n in tree.body
                           if isinstance(n, ast.ClassDef) and n.name == class_name)
                method = next(n for n in cls.body
                              if isinstance(n, ast.FunctionDef) and n.name == method_name)
                imports = [n for n in ast.walk(method)
                           if isinstance(n, ast.ImportFrom) and n.module == module]
                self.assertEqual(len(imports), 1)
                self.assertEqual([alias.name for alias in imports[0].names], names)

    def test_no_module_level_talent_ratings_or_users_rewards_edge(self):
        direct, delayed, _ = extract_edges()
        for edge in (('talent', 'ratings'), ('users', 'rewards')):
            with self.subTest(edge=edge):
                self.assertNotIn(edge, direct)
                self.assertIn(edge, delayed)


if __name__ == '__main__':
    unittest.main()
