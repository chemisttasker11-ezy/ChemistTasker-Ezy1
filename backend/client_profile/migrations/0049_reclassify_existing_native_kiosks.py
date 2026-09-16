import base64

from django.db import migrations


def reclassify_existing_native_kiosks(apps, schema_editor):
    KioskDevice = apps.get_model("client_profile", "KioskDevice")
    candidates = KioskDevice.objects.filter(
        client_kind="WEB_ONLINE",
        platform__in=["windows", "macos", "linux"],
    ).exclude(public_signing_key="")
    valid_ids = []
    for device in candidates.only("id", "public_signing_key"):
        try:
            if len(base64.b64decode(device.public_signing_key, validate=True)) == 32:
                valid_ids.append(device.id)
        except (TypeError, ValueError):
            continue
    KioskDevice.objects.filter(pk__in=valid_ids).update(client_kind="NATIVE_OFFLINE")


class Migration(migrations.Migration):
    dependencies = [("client_profile", "0048_kiosk_pairing_authorization")]

    operations = [
        migrations.RunPython(reclassify_existing_native_kiosks, migrations.RunPython.noop),
    ]
