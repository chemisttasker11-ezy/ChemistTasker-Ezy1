import uuid
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("client_profile", "0049_reclassify_existing_native_kiosks")]
    operations = [
        migrations.RenameIndex(
            model_name="kioskattendanceevent",
            old_name="client_prof_device__849c72_idx",
            new_name="client_prof_device__7f4585_idx",
        ),
        migrations.RenameIndex(
            model_name="kioskattendanceevent",
            old_name="client_prof_process_3d0b35_idx",
            new_name="client_prof_process_842c08_idx",
        ),
        migrations.RenameIndex(
            model_name="kioskpairingauthorization",
            old_name="client_prof_consume_2c52d9_idx",
            new_name="client_prof_consume_aa4d81_idx",
        ),
        migrations.AlterField(
            model_name="kioskdevice", name="installation_id",
            field=models.UUIDField(default=uuid.uuid4, editable=False, unique=True,
                help_text="Stable public identifier generated for this kiosk installation."),
        ),
        migrations.AlterField(
            model_name="kioskdevice", name="public_signing_key",
            field=models.TextField(blank=True, default="",
                help_text="Base64-encoded Ed25519 public key. The private key remains on the device."),
        ),
    ]
