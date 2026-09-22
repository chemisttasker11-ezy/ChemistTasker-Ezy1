from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("client_profile", "0057_shift_roster_container"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="RatingReport",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("reason", models.TextField(max_length=2000)),
                ("status", models.CharField(choices=[("OPEN", "Open"), ("REVIEWED", "Reviewed"), ("CLOSED", "Closed")], db_index=True, default="OPEN", max_length=16)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("rating", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="reports", to="client_profile.rating")),
                ("reporter", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="rating_reports_submitted", to=settings.AUTH_USER_MODEL)),
            ],
            options={"ordering": ["-created_at"]},
        ),
        migrations.AddConstraint(
            model_name="ratingreport",
            constraint=models.UniqueConstraint(
                condition=models.Q(("status", "OPEN")),
                fields=("rating", "reporter"),
                name="uniq_open_rating_report_per_reporter",
            ),
        ),
    ]
