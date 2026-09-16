from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


def classify_existing_native_devices(apps, schema_editor):
    KioskDevice = apps.get_model("client_profile", "KioskDevice")
    KioskDevice.objects.filter(
        platform__in=["windows", "macos", "linux"],
    ).exclude(public_signing_key="").update(client_kind="NATIVE_OFFLINE")


class Migration(migrations.Migration):
    dependencies = [
        ("client_profile", "0047_kiosk_event_preserve_unresolved_worker"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name="kioskdevice",
            name="client_kind",
            field=models.CharField(choices=[("WEB_ONLINE", "Web online"), ("NATIVE_OFFLINE", "Native offline")], default="WEB_ONLINE", max_length=24),
        ),
        migrations.RunPython(classify_existing_native_devices, migrations.RunPython.noop),
        migrations.CreateModel(
            name="KioskPairingAuthorization",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("code_digest", models.CharField(max_length=64, unique=True)),
                ("device_name", models.CharField(default="Counter Terminal", max_length=120)),
                ("allowed_client_kind", models.CharField(choices=[("WEB_ONLINE", "Web online"), ("NATIVE_OFFLINE", "Native offline")], default="NATIVE_OFFLINE", max_length=24)),
                ("expires_at", models.DateTimeField(db_index=True)),
                ("consumed_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("authorized_by", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="authorized_kiosk_pairings", to=settings.AUTH_USER_MODEL)),
                ("pharmacy", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="kiosk_pairing_authorizations", to="client_profile.pharmacy")),
                ("resulting_device", models.OneToOneField(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="pairing_authorization", to="client_profile.kioskdevice")),
            ],
            options={"indexes": [models.Index(fields=["consumed_at", "expires_at"], name="client_prof_consume_2c52d9_idx")]},
        ),
    ]
