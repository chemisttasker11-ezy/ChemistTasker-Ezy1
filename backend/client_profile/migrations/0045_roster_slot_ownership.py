"""Additive roster slot metadata; rehearse after migration-history recovery."""
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [("client_profile", "0044_roster_v2_and_attendance_v1")]
    operations = [
        migrations.AddField(
            model_name="shiftslot", name="roster_period",
            field=models.ForeignKey(
                to="client_profile.rosterperiod", null=True, blank=True,
                on_delete=django.db.models.deletion.PROTECT, related_name="planned_slots",
                help_text="Explicit ownership of a roster slot, retained when it is vacant.",
            ),
        ),
        migrations.AddField(
            model_name="shiftslot", name="planned_break_minutes",
            field=models.PositiveSmallIntegerField(default=0),
        ),
    ]
