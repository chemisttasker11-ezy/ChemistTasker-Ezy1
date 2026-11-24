from django.db import migrations, models
import onboarding.models


class Migration(migrations.Migration):
    dependencies = [('client_profile', '0091_gov_id_check_result')]

    operations = [
        migrations.AddField(model_name=model, name=name, field=field)
        for model in ('pharmacistonboarding', 'otherstaffonboarding')
        for name, field in (
            ('indemnity_insurer', models.CharField(blank=True, max_length=255)),
            ('indemnity_expiry', models.DateField(blank=True, null=True)),
            ('indemnity_certificate', models.FileField(blank=True, null=True, upload_to=onboarding.models.indemnity_certificate_upload_path)),
        )
    ]
