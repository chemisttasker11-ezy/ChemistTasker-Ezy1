"""Give the constraints, indexes and identity sequences of the notifications tables the names a new database gets.

The tables were created as client_profile_* and renamed by 0002_clean_table_and_index_names;
PostgreSQL kept the names of the objects attached to them. Database only: no table, column or row changes, and
the migration state is unchanged. See core.migration_operations.RenameDatabaseNames."""
from django.db import migrations

from core.migration_operations import RenameDatabaseNames

# (kind, table, old name, new name)
RENAMES = [
    ('sequence', 'notifications_notification', 'client_profile_notification_id_seq', 'notifications_notification_id_seq'),
    ('constraint', 'notifications_notification', 'client_profile_notification_pkey', 'notifications_notification_pkey'),
    ('constraint', 'notifications_notification', 'client_profile_notification_user_id_17742522_fk_users_user_id', 'notifications_notification_user_id_b5e8c0ff_fk_users_user_id'),
    ('index', 'notifications_notification', 'client_profile_notification_user_id_17742522', 'notifications_notification_user_id_b5e8c0ff'),
]


class Migration(migrations.Migration):

    dependencies = [
        ('notifications', '0002_clean_table_and_index_names'),
    ]

    operations = [
        RenameDatabaseNames(RENAMES),
    ]
