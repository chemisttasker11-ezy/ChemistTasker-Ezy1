from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("client_profile", "0051_kiosk_pairing_recovery_attempt")]

    operations = [
        migrations.AddField(
            model_name="membershipapplication",
            name="date_of_birth",
            field=models.DateField(
                help_text="Candidate date of birth used for age-dependent Award rates and identity matching.",
                null=True,
            ),
        ),
    ]
