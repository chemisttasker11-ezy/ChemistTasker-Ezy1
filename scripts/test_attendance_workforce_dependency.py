"""No-DB guards: preserve permission bridges and owned feature boundaries.

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
    def test_rating_import_stays_at_its_call_site(self):
        cases = (
            ('talent/views/explorer.py', 'ExplorerPostViewSet', 'get_queryset',
             'ratings.models', ['Rating']),
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
        self.assertNotIn(('talent', 'ratings'), direct)
        self.assertIn(('talent', 'ratings'), delayed)
        # Identity now uses an explicitly composed feature contract at every depth.
        self.assertNotIn(('users', 'rewards'), direct)
        self.assertNotIn(('users', 'rewards'), delayed)

    def test_registration_still_calls_the_identity_owned_referral_contract(self):
        tree = ast.parse((ROOT / 'backend/users/serializers.py').read_text(encoding='utf-8'))
        cls = next(n for n in tree.body if isinstance(n, ast.ClassDef) and n.name == 'UserRegistrationSerializer')
        method = next(n for n in cls.body if isinstance(n, ast.FunctionDef) and n.name == 'create')
        calls = [n for n in ast.walk(method) if isinstance(n, ast.Call)
                 and isinstance(n.func, ast.Attribute) and n.func.attr == 'claim_signup_referral'
                 and isinstance(n.func.value, ast.Call) and isinstance(n.func.value.func, ast.Name)
                 and n.func.value.func.id == 'user_features']
        self.assertEqual(len(calls), 1)


if __name__ == '__main__':
    unittest.main()
