from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("workforce", "0002_employmentengagement"),
    ]

    operations = [
        migrations.AddField(
            model_name="employmentengagement",
            name="award_rate_snapshot",
            field=models.JSONField(blank=True, default=dict),
        ),
    ]
