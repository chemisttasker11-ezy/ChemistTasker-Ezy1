"""Give the constraints, indexes and identity sequences of the talent tables the names a new database gets.

The tables were created as client_profile_* and renamed by 0002_clean_table_and_index_names;
PostgreSQL kept the names of the objects attached to them. Database only: no table, column or row changes, and
the migration state is unchanged. See core.migration_operations.RenameDatabaseNames."""
from django.db import migrations

from core.migration_operations import RenameDatabaseNames

# (kind, table, old name, new name)
RENAMES = [
    ('sequence', 'talent_explorerpost', 'client_profile_explorerpost_id_seq', 'talent_explorerpost_id_seq'),
    ('constraint', 'talent_explorerpost', 'client_profile_explo_author_user_id_69ff7c1f_fk_users_use', 'talent_explorerpost_author_user_id_140c8ee7_fk_users_user_id'),
    ('constraint', 'talent_explorerpost', 'client_profile_explo_explorer_profile_id_9dcbe017_fk_client_pr', 'talent_explorerpost_explorer_profile_id_c09b76e7_fk_client_pr'),
    ('constraint', 'talent_explorerpost', 'client_profile_explorerpost_coverage_radius_km_check', 'talent_explorerpost_coverage_radius_km_check'),
    ('constraint', 'talent_explorerpost', 'client_profile_explorerpost_like_count_check', 'talent_explorerpost_like_count_check'),
    ('constraint', 'talent_explorerpost', 'client_profile_explorerpost_pkey', 'talent_explorerpost_pkey'),
    ('constraint', 'talent_explorerpost', 'client_profile_explorerpost_reference_code_key', 'talent_explorerpost_reference_code_key'),
    ('constraint', 'talent_explorerpost', 'client_profile_explorerpost_reply_count_check', 'talent_explorerpost_reply_count_check'),
    ('constraint', 'talent_explorerpost', 'client_profile_explorerpost_view_count_check', 'talent_explorerpost_view_count_check'),
    ('index', 'talent_explorerpost', 'client_profile_explorerpost_author_user_id_69ff7c1f', 'talent_explorerpost_author_user_id_140c8ee7'),
    ('index', 'talent_explorerpost', 'client_profile_explorerpost_explorer_profile_id_9dcbe017', 'talent_explorerpost_explorer_profile_id_c09b76e7'),
    ('index', 'talent_explorerpost', 'client_profile_explorerpost_reference_code_f18573ff_like', 'talent_explorerpost_reference_code_cf4c4860_like'),
    ('sequence', 'talent_explorerpostreaction', 'client_profile_explorerpostreaction_id_seq', 'talent_explorerpostreaction_id_seq'),
    ('constraint', 'talent_explorerpostreaction', 'client_profile_explo_post_id_5d20af83_fk_client_pr', 'talent_explorerpostr_post_id_4702ebd7_fk_talent_ex'),
    ('constraint', 'talent_explorerpostreaction', 'client_profile_explo_user_id_c45844ea_fk_users_use', 'talent_explorerpostreaction_user_id_cca51cf2_fk_users_user_id'),
    ('constraint', 'talent_explorerpostreaction', 'client_profile_explorerp_post_id_user_id_7e365133_uniq', 'talent_explorerpostreaction_post_id_user_id_d1adf8d0_uniq'),
    ('constraint', 'talent_explorerpostreaction', 'client_profile_explorerpostreaction_pkey', 'talent_explorerpostreaction_pkey'),
    ('index', 'talent_explorerpostreaction', 'client_profile_explorerpostreaction_post_id_5d20af83', 'talent_explorerpostreaction_post_id_4702ebd7'),
    ('index', 'talent_explorerpostreaction', 'client_profile_explorerpostreaction_user_id_c45844ea', 'talent_explorerpostreaction_user_id_cca51cf2'),
    ('sequence', 'talent_useravailability', 'client_profile_useravailability_id_seq', 'talent_useravailability_id_seq'),
    ('constraint', 'talent_useravailability', 'client_profile_usera_user_id_0b4b43fb_fk_users_use', 'talent_useravailability_user_id_809b1136_fk_users_user_id'),
    ('constraint', 'talent_useravailability', 'client_profile_useravailability_pkey', 'talent_useravailability_pkey'),
    ('index', 'talent_useravailability', 'client_profile_useravailability_user_id_0b4b43fb', 'talent_useravailability_user_id_809b1136'),
]


class Migration(migrations.Migration):

    dependencies = [
        ('talent', '0002_clean_table_and_index_names'),
    ]

    operations = [
        RenameDatabaseNames(RENAMES),
    ]
