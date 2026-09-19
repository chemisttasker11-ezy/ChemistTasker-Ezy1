from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("client_profile", "0054_membership_application_review_payroll_optin"),
    ]

    operations = [
        migrations.AlterField(
            model_name="shift",
            name="employment_type",
            field=models.CharField(
                choices=[
                    ("FULL_TIME", "Full-Time"),
                    ("PART_TIME", "Part-Time"),
                    ("CASUAL", "Casual employee"),
                    ("LOCUM", "Locum"),
                ],
                default="LOCUM",
                max_length=20,
            ),
        ),
    ]
