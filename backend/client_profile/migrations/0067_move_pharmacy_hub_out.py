"""Remove the pharmacy_hub models from client_profile's migration state: STATE ONLY, no SQL runs.
They live on in the 'pharmacy_hub' app (see pharmacy_hub.0001_initial); the tables are untouched here."""
from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('client_profile', '0066_move_chat_out'),
        ('pharmacy_hub', '0001_initial'),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.DeleteModel(name='PharmacyHubPollReaction'),
                migrations.DeleteModel(name='PharmacyHubPollComment'),
                migrations.DeleteModel(name='PharmacyHubPollVote'),
                migrations.DeleteModel(name='PharmacyHubPollOption'),
                migrations.DeleteModel(name='PharmacyHubPoll'),
                migrations.DeleteModel(name='PharmacyHubAttachment'),
                migrations.DeleteModel(name='PharmacyHubReaction'),
                migrations.DeleteModel(name='PharmacyHubCommentReaction'),
                migrations.DeleteModel(name='PharmacyHubComment'),
                migrations.DeleteModel(name='PharmacyHubPostMention'),
                migrations.DeleteModel(name='PharmacyHubPost'),
                migrations.DeleteModel(name='PharmacyCommunityGroupMembership'),
                migrations.DeleteModel(name='PharmacyCommunityGroup'),
            ],
            database_operations=[],
        ),
    ]
