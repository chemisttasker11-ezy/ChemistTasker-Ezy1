"""Remove the ratings models from client_profile's migration state: STATE ONLY, no SQL runs.
They live on in the 'ratings' app (see ratings.0001_initial); the tables are untouched here."""
from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('client_profile', '0061_move_rewards_out'),
        ('ratings', '0001_initial'),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.DeleteModel(name='RatingReport'),
                migrations.DeleteModel(name='Rating'),
            ],
            database_operations=[],
        ),
    ]
