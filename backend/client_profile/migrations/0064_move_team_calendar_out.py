"""Remove the team_calendar models from client_profile's migration state: STATE ONLY, no SQL runs.
They live on in the 'team_calendar' app (see team_calendar.0001_initial); the tables are untouched here."""
from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('client_profile', '0063_move_talent_out'),
        ('team_calendar', '0001_initial'),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.DeleteModel(name='WorkNoteCompletion'),
                migrations.DeleteModel(name='WorkNoteAssignee'),
                migrations.DeleteModel(name='WorkNote'),
                migrations.DeleteModel(name='CalendarEvent'),
            ],
            database_operations=[],
        ),
    ]
