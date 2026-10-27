from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("attendance", "0005_kiosk_manager_review")]

    operations = [
        migrations.AddField(
            model_name="attendanceevent",
            name="request_id",
            field=models.UUIDField(blank=True, db_index=True, null=True),
        ),
    ]
