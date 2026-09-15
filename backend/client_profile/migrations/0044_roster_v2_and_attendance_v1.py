"""Quarantine marker for the unapplied roster/attendance proposal.

The historical migration graph required to author this migration correctly is
not present in this checkout. Keeping a migration module here prevents Django
from treating ``client_profile`` as an unmigrated app and silently using
``syncdb`` semantics. The operation always fails before any schema statement.
"""
from django.db import migrations


QUARANTINE_MESSAGE = (
    "client_profile.0044_roster_v2_and_attendance_v1 is quarantined: recover "
    "the authoritative users, client_profile, and billing migration sources, "
    "determine the real dependency leaves, then replace this marker with a "
    "reviewed state-aware migration. No roster/attendance schema was applied."
)


def stop_quarantined_migration(apps, schema_editor):
    raise RuntimeError(QUARANTINE_MESSAGE)


class Migration(migrations.Migration):
    # The true dependencies are deliberately not guessed from migration names.
    dependencies = []

    operations = [
        migrations.RunPython(
            stop_quarantined_migration,
            reverse_code=stop_quarantined_migration,
        ),
    ]
