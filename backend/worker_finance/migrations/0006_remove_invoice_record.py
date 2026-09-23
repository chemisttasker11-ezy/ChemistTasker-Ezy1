from django.db import migrations, models
import django.db.models.deletion


def create_legacy_revisions(apps, schema_editor):
    Invoice = apps.get_model("client_profile", "Invoice")
    InvoiceRevision = apps.get_model("worker_finance", "InvoiceRevision")
    for invoice in Invoice.objects.filter(legacy_snapshot=True).iterator():
        InvoiceRevision.objects.get_or_create(
            invoice_id=invoice.pk,
            version=1,
            defaults={
                "payload": invoice.payload,
                "calculation": invoice.calculation,
                "invoice_status": invoice.status,
                "review_status": invoice.review_status,
                "source_snapshot": invoice.source_snapshot or {},
            },
        )


class Migration(migrations.Migration):
    dependencies = [
        ("worker_finance", "0005_consolidate_invoice_record"),
    ]

    operations = [
        migrations.RemoveConstraint(model_name="invoicerevision", name="finance_inv_revision_ver"),
        migrations.RemoveConstraint(model_name="payment", name="finance_payment_request"),
        migrations.RemoveConstraint(model_name="delivery", name="finance_delivery_version"),
        migrations.RemoveField(model_name="invoicerevision", name="record"),
        migrations.RemoveField(model_name="invoicereviewrequest", name="record"),
        migrations.RemoveField(model_name="payment", name="record"),
        migrations.RemoveField(model_name="delivery", name="record"),
        migrations.AlterField(model_name="invoicerevision", name="invoice", field=models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="revisions", to="client_profile.invoice")),
        migrations.AlterField(model_name="invoicereviewrequest", name="invoice", field=models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="review_requests", to="client_profile.invoice")),
        migrations.AlterField(model_name="payment", name="invoice", field=models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="payments", to="client_profile.invoice")),
        migrations.AlterField(model_name="delivery", name="invoice", field=models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="deliveries", to="client_profile.invoice")),
        migrations.AddConstraint(model_name="invoicerevision", constraint=models.UniqueConstraint(fields=("invoice", "version"), name="finance_inv_revision_ver")),
        migrations.AddConstraint(model_name="payment", constraint=models.UniqueConstraint(fields=("invoice", "request_key"), name="finance_payment_request")),
        migrations.AddConstraint(model_name="delivery", constraint=models.UniqueConstraint(fields=("invoice", "version"), name="finance_delivery_version")),
        migrations.DeleteModel(name="InvoiceRecord"),
        migrations.RunPython(create_legacy_revisions, migrations.RunPython.noop),
    ]
