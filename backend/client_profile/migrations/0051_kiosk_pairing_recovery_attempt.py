import uuid

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("client_profile", "0050_align_kiosk_schema_state")]

    operations = [
        migrations.AddField(
            model_name="kioskpairingauthorization",
            name="client_attempt_id",
            field=models.UUIDField(
                blank=True,
                help_text="Stable native pairing attempt used for proof-bound recovery after a lost response.",
                null=True,
                unique=True,
            ),
        ),
    ]
