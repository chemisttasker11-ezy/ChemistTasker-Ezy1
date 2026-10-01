"""Remove the talent models from client_profile's migration state: STATE ONLY, no SQL runs.
They live on in the 'talent' app (see talent.0001_initial); the tables are untouched here."""
from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('client_profile', '0062_move_ratings_out'),
        ('talent', '0001_initial'),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.DeleteModel(name='UserAvailability'),
                migrations.DeleteModel(name='ExplorerPostReaction'),
                migrations.DeleteModel(name='ExplorerPost'),
            ],
            database_operations=[],
        ),
    ]
