"""worker_finance 0008 removes the retired InvoiceRecord's stale ContentType and permissions, and nothing else."""
import importlib
from types import SimpleNamespace
from unittest import mock, skipIf

from django.apps import apps
from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import connection
from django.test import TestCase

migration = importlib.import_module("worker_finance.migrations.0008_remove_stale_invoice_record_contenttype")


class _SchemaEditor:
    connection = connection


@skipIf(getattr(settings, "FINANCE_CONTRACT_TESTS", False), "Needs the full project apps (admin, users, onboarding).")
class StaleInvoiceRecordContentTypeTests(TestCase):
    def setUp(self):
        from django.contrib.auth.models import Permission
        from django.contrib.contenttypes.models import ContentType

        ContentType.objects.clear_cache()
        self.stale = ContentType.objects.create(app_label="worker_finance", model="invoicerecord")
        self.stale_permissions = [
            Permission.objects.create(content_type=self.stale, codename=f"{action}_invoicerecord", name=f"Can {action} invoice record")
            for action in ("add", "change", "delete", "view")
        ]
        self.invoice_type = ContentType.objects.get(app_label="invoicing", model="invoice")
        self.invoice_permissions = set(Permission.objects.filter(content_type=self.invoice_type).values_list("pk", flat=True))
        self.other_types = set(ContentType.objects.exclude(pk=self.stale.pk).values_list("pk", "app_label", "model"))

    def tearDown(self):
        from django.contrib.contenttypes.models import ContentType

        ContentType.objects.clear_cache()

    def run_migration(self):
        migration.remove_stale_invoice_record_contenttype(apps, _SchemaEditor())

    def assert_other_content_types_untouched(self):
        from django.contrib.auth.models import Permission
        from django.contrib.contenttypes.models import ContentType

        self.assertEqual(set(ContentType.objects.exclude(pk=self.stale.pk).values_list("pk", "app_label", "model")), self.other_types)
        self.assertTrue(ContentType.objects.filter(pk=self.invoice_type.pk, app_label="invoicing", model="invoice").exists())
        self.assertEqual(set(Permission.objects.filter(content_type=self.invoice_type).values_list("pk", flat=True)), self.invoice_permissions)

    def test_removes_the_stale_type_its_permissions_and_their_assignments(self):
        from django.contrib.admin.models import ADDITION, LogEntry
        from django.contrib.auth.models import Group, Permission
        from django.contrib.contenttypes.models import ContentType

        user = get_user_model().objects.create_user(email="finance-admin@example.test", role="OWNER")
        group = Group.objects.create(name="finance reviewers")
        group.permissions.add(self.stale_permissions[0])
        user.user_permissions.add(self.stale_permissions[1])
        entry = LogEntry.objects.create(
            user=user, content_type=self.stale, object_id="7", object_repr="Invoice record 7", action_flag=ADDITION,
        )

        self.run_migration()

        self.assertFalse(ContentType.objects.filter(app_label="worker_finance", model="invoicerecord").exists())
        self.assertFalse(Permission.objects.filter(pk__in=[p.pk for p in self.stale_permissions]).exists())
        self.assertFalse(group.permissions.exists())
        self.assertFalse(user.user_permissions.exists())
        entry.refresh_from_db()
        self.assertIsNone(entry.content_type_id)
        self.assertEqual(entry.object_repr, "Invoice record 7")
        self.assert_other_content_types_untouched()

    def test_a_generic_reference_keeps_everything_and_names_the_referencing_model(self):
        from django.contrib.auth.models import Permission
        from django.contrib.contenttypes.models import ContentType
        from onboarding.models import OnboardingNotification

        OnboardingNotification.objects.create(content_type=self.stale, object_id=1, notification_type="verified")

        with self.assertLogs(migration.logger, "WARNING") as logs:
            self.run_migration()

        self.assertTrue(ContentType.objects.filter(pk=self.stale.pk).exists())
        self.assertEqual(Permission.objects.filter(content_type=self.stale).count(), 4)
        self.assertEqual(OnboardingNotification.objects.filter(content_type=self.stale).count(), 1)
        self.assertIn("client_profile.OnboardingNotification.content_type (1)", logs.output[0])
        self.assert_other_content_types_untouched()

    def test_without_the_stale_row_it_changes_nothing(self):
        from django.contrib.auth.models import Permission
        from django.contrib.contenttypes.models import ContentType

        self.stale.delete()
        ContentType.objects.clear_cache()
        types = set(ContentType.objects.values_list("pk", "app_label", "model"))
        permissions = set(Permission.objects.values_list("pk", flat=True))

        self.run_migration()

        self.assertEqual(set(ContentType.objects.values_list("pk", "app_label", "model")), types)
        self.assertEqual(set(Permission.objects.values_list("pk", flat=True)), permissions)

    def test_the_retired_model_is_not_registered(self):
        with self.assertRaises(LookupError):
            apps.get_model("worker_finance", "InvoiceRecord")


    def test_reference_guard_queries_the_database_being_migrated(self):
        manager = mock.Mock()
        using_manager = manager.using.return_value
        using_manager.filter.return_value.count.return_value = 1
        related_model = SimpleNamespace(_meta=SimpleNamespace(label_lower="contenttypes.contenttype"))
        field = SimpleNamespace(name="content_type", related_model=related_model)
        fake_model = SimpleNamespace(
            _meta=SimpleNamespace(label_lower="example.reference", label="example.Reference", concrete_fields=[field]),
            _base_manager=manager,
        )
        fake_apps = SimpleNamespace(get_models=lambda: [fake_model])
        content_type = object()

        blocking = migration._blocking_references(fake_apps, content_type, "replica")

        manager.using.assert_called_once_with("replica")
        using_manager.filter.assert_called_once_with(content_type=content_type)
        self.assertEqual(blocking, {"example.Reference.content_type": 1})
