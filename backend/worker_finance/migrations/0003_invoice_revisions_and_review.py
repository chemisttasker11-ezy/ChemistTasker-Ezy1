from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("worker_finance", "0002_alter_invoicerecord_parent"),
    ]

    operations = [
        migrations.AlterField(
            model_name="catalogueitem",
            name="code",
            field=models.CharField(blank=True, default="", max_length=40),
        ),
        migrations.RemoveConstraint(
            model_name="catalogueitem",
            name="finance_item_owner_code",
        ),
        migrations.AddIndex(
            model_name="catalogueitem",
            index=models.Index(fields=["owner", "active"], name="finance_item_owner_active"),
        ),
        migrations.AddField(
            model_name="invoicerecord",
            name="review_status",
            field=models.CharField(
                choices=[
                    ("NONE", "No owner review decision"),
                    ("APPROVED_FOR_PAYMENT", "Approved for payment"),
                    ("REVISION_REQUESTED", "Revision requested"),
                ],
                default="NONE",
                max_length=32,
            ),
        ),
        migrations.AddField(
            model_name="invoicerecord",
            name="last_review_note",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="invoicerecord",
            name="last_reviewed_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.CreateModel(
            name="InvoiceRevision",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("version", models.PositiveIntegerField()),
                ("payload", models.JSONField(default=dict)),
                ("calculation", models.JSONField(default=dict)),
                ("invoice_status", models.CharField(default="draft", max_length=16)),
                ("review_status", models.CharField(default="NONE", max_length=32)),
                ("source_snapshot", models.JSONField(blank=True, default=dict)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("record", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="revisions", to="worker_finance.invoicerecord")),
            ],
            options={"ordering": ["-version"]},
        ),
        migrations.AddConstraint(
            model_name="invoicerevision",
            constraint=models.UniqueConstraint(fields=("record", "version"), name="finance_inv_revision_ver"),
        ),
        migrations.CreateModel(
            name="InvoiceReviewRequest",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("requested_version", models.PositiveIntegerField()),
                ("note", models.TextField()),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("resolved_at", models.DateTimeField(blank=True, null=True)),
                ("resolved_by_version", models.PositiveIntegerField(blank=True, null=True)),
                ("record", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="review_requests", to="worker_finance.invoicerecord")),
                ("requested_by", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="invoice_revision_requests", to=settings.AUTH_USER_MODEL)),
            ],
            options={"ordering": ["-created_at", "-id"]},
        ),
    ]
