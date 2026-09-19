from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("worker_finance", "0003_invoice_revisions_and_review")]

    operations = [
        migrations.RemoveConstraint(
            model_name="invoicerevision",
            name="finance_invoice_revision_version",
        ),
        migrations.AddConstraint(
            model_name="invoicerevision",
            constraint=models.UniqueConstraint(
                fields=("record", "version"), name="finance_inv_revision_ver"
            ),
        ),
    ]
