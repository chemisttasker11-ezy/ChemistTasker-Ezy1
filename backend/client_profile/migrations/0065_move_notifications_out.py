"""Remove the notifications models from client_profile's migration state: STATE ONLY, no SQL runs.
They live on in the 'notifications' app (see notifications.0001_initial); the tables are untouched here."""
from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('client_profile', '0064_move_team_calendar_out'),
        ('notifications', '0001_initial'),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.DeleteModel(name='Notification'),
            ],
            database_operations=[],
        ),
    ]
