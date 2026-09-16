from django.conf import settings
from django.db import migrations, models


def backfill_submitted_employee_ids(apps, schema_editor):
    KioskAttendanceEvent = apps.get_model("client_profile", "KioskAttendanceEvent")
    for event in KioskAttendanceEvent.objects.only("id", "employee_id").iterator():
        event.submitted_employee_id = event.employee_id
        event.save(update_fields=["submitted_employee_id"])


class Migration(migrations.Migration):
    dependencies = [
        ("client_profile", "0046_kiosk_offline_protocol"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name="kioskattendanceevent",
            name="submitted_employee_id",
            field=models.PositiveBigIntegerField(null=True),
        ),
        migrations.RunPython(
            backfill_submitted_employee_ids,
            migrations.RunPython.noop,
        ),
        migrations.AlterField(
            model_name="kioskattendanceevent",
            name="submitted_employee_id",
            field=models.PositiveBigIntegerField(),
        ),
        migrations.AlterField(
            model_name="kioskattendanceevent",
            name="employee",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=models.PROTECT,
                related_name="kiosk_offline_events",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
    ]
