from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("workforce", "0003_employmentengagement_award_snapshot"),
    ]

    operations = [
        migrations.AddField(
            model_name="employmentengagement",
            name="ordinary_hours_pattern",
            field=models.JSONField(blank=True, default=dict),
        ),
    ]
