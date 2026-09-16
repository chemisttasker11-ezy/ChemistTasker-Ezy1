"""Offline kiosk device identity and append-only signed event ledger."""

import uuid

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


def populate_kiosk_installation_ids(apps, schema_editor):
    KioskDevice = apps.get_model("client_profile", "KioskDevice")
    for row in KioskDevice.objects.all():
        row.installation_id = uuid.uuid4()
        row.save(update_fields=["installation_id"])


class Migration(migrations.Migration):
    dependencies = [
        ("client_profile", "0045_roster_slot_ownership"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name="kioskdevice",
            name="installation_id",
            field=models.UUIDField(default=uuid.uuid4, editable=False, null=True),
        ),
        migrations.RunPython(populate_kiosk_installation_ids, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="kioskdevice",
            name="installation_id",
            field=models.UUIDField(default=uuid.uuid4, editable=False, unique=True),
        ),
        migrations.AddField(
            model_name="kioskdevice",
            name="platform",
            field=models.CharField(blank=True, default="", max_length=24),
        ),
        migrations.AddField(
            model_name="kioskdevice",
            name="public_signing_key",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="kioskdevice",
            name="app_version",
            field=models.CharField(blank=True, default="", max_length=40),
        ),
        migrations.AddField(
            model_name="kioskdevice",
            name="last_seen_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="kioskdevice",
            name="last_sync_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="kioskdevice",
            name="revoked_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="kioskdevice",
            name="last_contiguous_sequence",
            field=models.PositiveBigIntegerField(default=0),
        ),
        migrations.AddField(
            model_name="kioskdevice",
            name="last_event_hash",
            field=models.CharField(blank=True, default="", max_length=64),
        ),
        migrations.AlterField(
            model_name="attendanceevent",
            name="source",
            field=models.CharField(
                choices=[
                    ("QR_KIOSK", "QR Kiosk"),
                    ("MOBILE_QR", "Mobile QR"),
                    ("KIOSK_PIN", "Kiosk PIN"),
                    ("IN_APP", "In-App"),
                    ("MANAGER", "Manager"),
                    ("OFFLINE_KIOSK", "Offline Kiosk"),
                ],
                max_length=16,
            ),
        ),
        migrations.CreateModel(
            name="KioskAttendanceEvent",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("event_id", models.UUIDField(db_index=True, unique=True)),
                ("device_sequence", models.PositiveBigIntegerField()),
                ("shift_id", models.BigIntegerField(blank=True, null=True)),
                ("event_type", models.CharField(choices=[("CLOCK_IN", "Clock In"), ("CLOCK_OUT", "Clock Out"), ("BREAK_START", "Break Start"), ("BREAK_END", "Break End")], max_length=16)),
                ("device_timestamp", models.DateTimeField()),
                ("trusted_time_estimate", models.DateTimeField(blank=True, null=True)),
                ("monotonic_elapsed_ms", models.PositiveBigIntegerField()),
                ("boot_session_id", models.CharField(max_length=80)),
                ("previous_event_hash", models.CharField(blank=True, default="", max_length=64)),
                ("event_hash", models.CharField(max_length=64)),
                ("device_signature", models.TextField()),
                ("canonical_payload", models.JSONField()),
                ("integrity_flags", models.JSONField(blank=True, default=list)),
                ("processing_status", models.CharField(choices=[("ACCEPTED", "Accepted"), ("NEEDS_REVIEW", "Needs review"), ("REJECTED", "Rejected")], max_length=20)),
                ("rejection_reason", models.TextField(blank=True, default="")),
                ("received_at", models.DateTimeField(auto_now_add=True)),
                ("attendance_event", models.OneToOneField(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="offline_source_event", to="client_profile.attendanceevent")),
                ("device", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="offline_attendance_events", to="client_profile.kioskdevice")),
                ("employee", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="kiosk_offline_events", to=settings.AUTH_USER_MODEL)),
            ],
            options={
                "ordering": ["device_id", "device_sequence"],
                "indexes": [
                    models.Index(fields=["device", "device_sequence"], name="client_prof_device__849c72_idx"),
                    models.Index(fields=["processing_status", "received_at"], name="client_prof_process_3d0b35_idx"),
                ],
                "constraints": [
                    models.UniqueConstraint(fields=("device", "device_sequence"), name="kiosk_event_unique_device_sequence"),
                ],
            },
        ),
    ]
