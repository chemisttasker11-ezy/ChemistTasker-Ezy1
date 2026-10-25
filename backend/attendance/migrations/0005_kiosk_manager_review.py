"""Append-only manager decisions for signed kiosk evidence; no rewrite of events."""
from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion

class Migration(migrations.Migration):
    dependencies = [
        ("attendance", "0004_favourite_cover"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]
    operations = [
        migrations.CreateModel(
            name="KioskAttendanceReview",
            fields=[
                ("id", models.BigAutoField(primary_key=True, serialize=False, auto_created=True, verbose_name="ID")),
                ("decision", models.CharField(max_length=10, choices=[("APPROVED", "Approved"), ("REJECTED", "Rejected")])),
                ("reason", models.TextField()),
                ("effective_timestamp", models.DateTimeField(null=True, blank=True)),
                ("reviewed_at", models.DateTimeField(auto_now_add=True)),
                ("evidence", models.OneToOneField(on_delete=django.db.models.deletion.PROTECT, related_name="manager_review", to="attendance.kioskattendanceevent")),
                ("manager", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="kiosk_attendance_reviews", to=settings.AUTH_USER_MODEL)),
                ("attendance_event", models.OneToOneField(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="kiosk_manager_review", to="attendance.attendanceevent")),
            ],
        ),
    ]
