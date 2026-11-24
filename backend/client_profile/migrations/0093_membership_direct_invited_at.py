from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("client_profile", "0092_indemnity_cover")]

    operations = [
        migrations.AddField(
            model_name="membership",
            name="direct_invited_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
