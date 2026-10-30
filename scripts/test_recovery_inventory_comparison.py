"""Controls against the actual PostgreSQL dump/restore deparse observed in CI."""
import copy
import json
from pathlib import Path
import runpy
import unittest

ROOT = Path(__file__).resolve().parent
compare = runpy.run_path(str(ROOT / 'compare-recovery-inventories.py'))['compare']
EVIDENCE = json.loads((ROOT / 'recovery-inventory-fixture.json').read_text())


class RecoveryComparisonContracts(unittest.TestCase):
    def test_actual_postgres_equivalent_casts_preserve_schema(self):
        compare(EVIDENCE['before'], EVIDENCE['after'])

    def test_identity_and_reverse_comparisons(self):
        compare(EVIDENCE['before'], EVIDENCE['before'])
        compare(EVIDENCE['after'], EVIDENCE['before'])

    def test_another_predicate_is_never_hidden_by_the_cast_exception(self):
        actual = copy.deepcopy(EVIDENCE['after'])
        actual['constraints'][0][2] = actual['constraints'][0][2].replace('REJECTED', 'APPROVED')
        with self.assertRaises(AssertionError):
            compare(EVIDENCE['before'], actual)

    def test_missing_constraint_or_changed_identity_fails(self):
        for constraints in ([], [['different_table', *EVIDENCE['after']['constraints'][0][1:]]]):
            with self.subTest(constraints=constraints), self.assertRaises(AssertionError):
                compare(EVIDENCE['before'], dict(EVIDENCE['after'], constraints=constraints))

    def test_data_schema_or_sequence_change_fails(self):
        for key in ('tables', 'columns', 'sequences'):
            with self.subTest(key=key), self.assertRaises(AssertionError):
                compare(EVIDENCE['before'], dict(EVIDENCE['after'], **{key: 'changed'}))
