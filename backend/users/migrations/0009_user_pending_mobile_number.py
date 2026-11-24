from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("users", "0008_two_factor_device_sessions")]

    operations = [
        migrations.AddField(
            model_name="user",
            name="pending_mobile_number",
            field=models.CharField(blank=True, max_length=20, null=True),
        ),
    ]
