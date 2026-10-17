from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("billing", "0002_stripewebhookevent")]

    operations = [
        migrations.AddField(
            model_name="shiftpayment", name="needs_reconciliation",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="shiftpayment", name="reconciliation_reason",
            field=models.CharField(blank=True, default="", max_length=80),
        ),
    ]
