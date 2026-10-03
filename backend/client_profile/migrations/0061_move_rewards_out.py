"""Remove the rewards models from client_profile's migration state: STATE ONLY, no SQL runs.
They live on in the 'rewards' app (see rewards.0001_initial); the tables are untouched here."""
from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('client_profile', '0060_owner_marketplace_identity'),
        ('rewards', '0001_initial'),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.DeleteModel(name='PillLedgerEntry'),
                migrations.DeleteModel(name='PillReferralEvent'),
                migrations.DeleteModel(name='PillReferralCode'),
                migrations.DeleteModel(name='PillRewardRule'),
            ],
            database_operations=[],
        ),
    ]
