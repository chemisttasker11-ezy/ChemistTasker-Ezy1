"""Explicit declared holiday locality for a pharmacy's work base.

No automatic geocoding or postcode inference: partial LGAs require human
confirmation against the official jurisdictional source.
"""
from django.db import migrations, models

class Migration(migrations.Migration):
    dependencies = [("client_profile", "0087_pharmacy_idempotency_fingerprint")]
    operations = [
        migrations.AddField(
            model_name="pharmacy",
            name="public_holiday_region",
            field=models.CharField(
                max_length=64, blank=True, default="",
                help_text=(
                    "Verified declared holiday district for this pharmacy's ordinary "
                    "work base (e.g. QLD_GOLD_COAST). Empty means local scope is "
                    "unverified, never that local holidays do not apply."
                ),
            ),
        ),
    ]
