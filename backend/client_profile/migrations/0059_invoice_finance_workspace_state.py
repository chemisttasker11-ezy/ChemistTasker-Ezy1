from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("client_profile", "0058_ratingreport"),
        ("worker_finance", "0004_portable_revision_constraint"),
    ]

    operations = [
        migrations.AlterModelOptions(name="invoice", options={"ordering": ["-created_at", "-id"]}),
        migrations.AddField(model_name="invoice", name="calculation", field=models.JSONField(blank=True, default=dict)),
        migrations.AddField(model_name="invoice", name="customer", field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.RESTRICT, related_name="invoices", to="worker_finance.customer")),
        migrations.AddField(model_name="invoice", name="kind", field=models.CharField(default="invoice", max_length=16)),
        migrations.AddField(model_name="invoice", name="last_review_note", field=models.TextField(blank=True, default="")),
        migrations.AddField(model_name="invoice", name="last_reviewed_at", field=models.DateTimeField(blank=True, null=True)),
        migrations.AddField(model_name="invoice", name="legacy_snapshot", field=models.BooleanField(default=False)),
        migrations.AddField(model_name="invoice", name="locked_at", field=models.DateTimeField(blank=True, null=True)),
        migrations.AddField(model_name="invoice", name="parent", field=models.OneToOneField(blank=True, null=True, on_delete=django.db.models.deletion.RESTRICT, related_name="super_document", to="client_profile.invoice")),
        migrations.AddField(model_name="invoice", name="payload", field=models.JSONField(blank=True, default=dict)),
        migrations.AddField(model_name="invoice", name="request_key", field=models.UUIDField(blank=True, null=True)),
        migrations.AddField(model_name="invoice", name="review_status", field=models.CharField(choices=[("NONE", "No owner review decision"), ("APPROVED_FOR_PAYMENT", "Approved for payment"), ("REVISION_REQUESTED", "Revision requested")], default="NONE", max_length=32)),
        migrations.AddField(model_name="invoice", name="source", field=models.CharField(default="external", max_length=16)),
        migrations.AddField(model_name="invoice", name="updated_at", field=models.DateTimeField(auto_now=True)),
        migrations.AddField(model_name="invoice", name="version", field=models.PositiveIntegerField(default=1)),
        migrations.AddField(model_name="invoice", name="voided_at", field=models.DateTimeField(blank=True, null=True)),
        migrations.AddConstraint(
            model_name="invoice",
            constraint=models.UniqueConstraint(condition=models.Q(("request_key__isnull", False)), fields=("user", "request_key"), name="invoice_user_request_key"),
        ),
    ]
