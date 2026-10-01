"""Remove the roster models from client_profile's migration state: STATE ONLY, no SQL runs.
They live on in workforce (see workforce.0007_move_roster_in); ShiftSlot.roster_period now points there.
The tables and the foreign-key constraint are untouched here."""
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('client_profile', '0069_move_attendance_out'),
        ('workforce', '0007_move_roster_in'),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.AlterField(
                    model_name='shiftslot',
                    name='roster_period',
                    field=models.ForeignKey(blank=True, help_text='Explicit ownership of a roster slot, retained when it is vacant.', null=True, on_delete=django.db.models.deletion.PROTECT, related_name='planned_slots', to='workforce.rosterperiod'),
                ),
                migrations.DeleteModel(name='RosterActionAudit'),
                migrations.DeleteModel(name='RosterTemplate'),
                migrations.DeleteModel(name='RosterAcknowledgement'),
                migrations.DeleteModel(name='RosterPublicationAudit'),
                migrations.DeleteModel(name='RosterPeriod'),
            ],
            database_operations=[],
        ),
    ]
