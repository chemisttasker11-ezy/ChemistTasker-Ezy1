"""Replay contract: optional Idempotency-Key; unique (user, operation, key) receipt;
409 payload mismatch includes existing shift_id; replay rechecks current authorization.
"""
from django.apps import apps
from django.db import connection, IntegrityError, transaction
from django.db.migrations.executor import MigrationExecutor
from django.test import TransactionTestCase

from client_profile.characterization_support import make_user, make_owner_with_pharmacy
from shifts.models import Shift, ShiftCounterOffer


class ShiftSubmissionReceiptMigrationTests(TransactionTestCase):
    def test_receipt_exists_and_migrates_forward_back_forward_without_backfill(self):
        # Discover by its contract, avoiding an import error or a guessed class name.
        candidates = [model for model in apps.get_app_config('client_profile').get_models()
                      if {'user', 'operation', 'key', 'shift'} <= {f.name for f in model._meta.fields}
                      and any('offer' in f.name for f in model._meta.fields)]
        self.assertEqual(len(candidates), 1, 'client_profile shift/offer replay receipt model/table is missing')
        receipt = candidates[0]
        self.assertIn(receipt._meta.db_table, connection.introspection.table_names())
        unique = [set(c.fields) for c in receipt._meta.constraints if getattr(c, 'fields', None)]
        unique += [set(fields) for fields in receipt._meta.unique_together]
        self.assertIn({'user', 'operation', 'key'}, unique)
        self.assertTrue(receipt._meta.get_field('shift').null)
        self.assertTrue(next(f for f in receipt._meta.fields if 'offer' in f.name).null)
        owner, pharmacy = make_owner_with_pharmacy('Before receipt migration')
        legacy_shift = Shift.objects.create(pharmacy=pharmacy, created_by=owner, role_needed='PHARMACIST')
        legacy_offer = ShiftCounterOffer.objects.create(shift=legacy_shift, user=make_user('PHARMACIST'))

        executor = MigrationExecutor(connection)
        leaves = executor.loader.graph.leaf_nodes()
        creates = [(node, migration) for node, migration in executor.loader.disk_migrations.items()
                   if node[0] == 'client_profile' and any(
                       op.__class__.__name__ == 'CreateModel' and op.name.lower() == receipt._meta.model_name
                       for op in migration.operations)]
        self.assertEqual(len(creates), 1, 'receipt needs an additive CreateModel migration')
        node, _ = creates[0]
        parents = list(executor.loader.graph.node_map[node].parents)
        backwards = [parent.key for parent in parents]
        try:
            executor.migrate(backwards)
            self.assertNotIn(receipt._meta.db_table, connection.introspection.table_names())
            executor = MigrationExecutor(connection)
            executor.migrate(leaves)
            self.assertIn(receipt._meta.db_table, connection.introspection.table_names())
            self.assertEqual(receipt.objects.count(), 0, 'new receipt table must not backfill old submissions')
            self.assertTrue(Shift.objects.filter(pk=legacy_shift.pk).exists())
            self.assertTrue(ShiftCounterOffer.objects.filter(pk=legacy_offer.pk).exists())
            user = make_user('OWNER')
            receipt.objects.create(user=user, operation='shift.create', key='same-key')
            with self.assertRaises(IntegrityError), transaction.atomic():
                receipt.objects.create(user=user, operation='shift.create', key='same-key')
            receipt.objects.create(user=make_user('OWNER'), operation='shift.create', key='same-key')
            receipt.objects.create(user=user, operation='shift.counter_offer.create', key='same-key')
            self.assertEqual(receipt.objects.count(), 3)
            executor = MigrationExecutor(connection)
            executor.migrate(backwards)
            self.assertNotIn(receipt._meta.db_table, connection.introspection.table_names())
            MigrationExecutor(connection).migrate(leaves)
            self.assertEqual(receipt.objects.count(), 0)
            self.assertTrue(Shift.objects.filter(pk=legacy_shift.pk).exists())
            self.assertTrue(ShiftCounterOffer.objects.filter(pk=legacy_offer.pk).exists())
        finally:
            MigrationExecutor(connection).migrate(leaves)
