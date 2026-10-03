"""Point worker_finance's relations to the moved invoicing models at their new app: STATE ONLY.

The foreign-key columns and constraints are untouched (the tables did not change); only the migration state learns that
delivery.invoice, invoicereviewrequest.invoice, invoicerevision.invoice, payment.invoice now refer to the invoicing app."""
from django.db import migrations
from django.db import models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('worker_finance', '0006_remove_invoice_record'),
        ('invoicing', '0001_initial'),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.AlterField(
                    model_name='delivery',
                    name='invoice',
                    field=models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='deliveries', to='invoicing.invoice'),
                ),
                migrations.AlterField(
                    model_name='invoicereviewrequest',
                    name='invoice',
                    field=models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='review_requests', to='invoicing.invoice'),
                ),
                migrations.AlterField(
                    model_name='invoicerevision',
                    name='invoice',
                    field=models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='revisions', to='invoicing.invoice'),
                ),
                migrations.AlterField(
                    model_name='payment',
                    name='invoice',
                    field=models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='payments', to='invoicing.invoice'),
                ),
            ],
            database_operations=[],
        ),
    ]
