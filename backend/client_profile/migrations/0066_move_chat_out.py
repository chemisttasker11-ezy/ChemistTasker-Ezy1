"""Remove the chat models from client_profile's migration state: STATE ONLY, no SQL runs.
They live on in the 'chat' app (see chat.0001_initial); the tables are untouched here."""
from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('client_profile', '0065_move_notifications_out'),
        ('chat', '0001_initial'),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.DeleteModel(name='MessageReaction'),
                migrations.DeleteModel(name='Participant'),
                migrations.DeleteModel(name='Conversation'),
                migrations.DeleteModel(name='Message'),
            ],
            database_operations=[],
        ),
    ]
