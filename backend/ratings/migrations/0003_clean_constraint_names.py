"""Give the constraints, indexes and identity sequences of the ratings tables the names a new database gets.

The tables were created as client_profile_* and renamed by 0002_clean_table_and_index_names;
PostgreSQL kept the names of the objects attached to them. Database only: no table, column or row changes, and
the migration state is unchanged. See core.migration_operations.RenameDatabaseNames."""
from django.db import migrations

from core.migration_operations import RenameDatabaseNames

# (kind, table, old name, new name)
RENAMES = [
    ('sequence', 'ratings_rating', 'client_profile_rating_id_seq', 'ratings_rating_id_seq'),
    ('constraint', 'ratings_rating', 'client_profile_ratin_ratee_pharmacy_id_b42afb37_fk_client_pr', 'ratings_rating_ratee_pharmacy_id_7b781f0a_fk_client_pr'),
    ('constraint', 'ratings_rating', 'client_profile_rating_pkey', 'ratings_rating_pkey'),
    ('constraint', 'ratings_rating', 'client_profile_rating_ratee_user_id_0f42170f_fk_users_user_id', 'ratings_rating_ratee_user_id_90654885_fk_users_user_id'),
    ('constraint', 'ratings_rating', 'client_profile_rating_rater_user_id_a4055104_fk_users_user_id', 'ratings_rating_rater_user_id_b0e6b9eb_fk_users_user_id'),
    ('constraint', 'ratings_rating', 'client_profile_rating_stars_check', 'ratings_rating_stars_check'),
    ('index', 'ratings_rating', 'client_profile_rating_direction_2214b43e', 'ratings_rating_direction_f76450b7'),
    ('index', 'ratings_rating', 'client_profile_rating_direction_2214b43e_like', 'ratings_rating_direction_f76450b7_like'),
    ('index', 'ratings_rating', 'client_profile_rating_ratee_pharmacy_id_b42afb37', 'ratings_rating_ratee_pharmacy_id_7b781f0a'),
    ('index', 'ratings_rating', 'client_profile_rating_ratee_user_id_0f42170f', 'ratings_rating_ratee_user_id_90654885'),
    ('index', 'ratings_rating', 'client_profile_rating_rater_user_id_a4055104', 'ratings_rating_rater_user_id_b0e6b9eb'),
    ('sequence', 'ratings_ratingreport', 'client_profile_ratingreport_id_seq', 'ratings_ratingreport_id_seq'),
    ('constraint', 'ratings_ratingreport', 'client_profile_ratin_rating_id_f0c14625_fk_client_pr', 'ratings_ratingreport_rating_id_7175060c_fk_ratings_rating_id'),
    ('constraint', 'ratings_ratingreport', 'client_profile_ratin_reporter_id_26571fe5_fk_users_use', 'ratings_ratingreport_reporter_id_ae846ae1_fk_users_user_id'),
    ('constraint', 'ratings_ratingreport', 'client_profile_ratingreport_pkey', 'ratings_ratingreport_pkey'),
    ('index', 'ratings_ratingreport', 'client_profile_ratingreport_rating_id_f0c14625', 'ratings_ratingreport_rating_id_7175060c'),
    ('index', 'ratings_ratingreport', 'client_profile_ratingreport_reporter_id_26571fe5', 'ratings_ratingreport_reporter_id_ae846ae1'),
    ('index', 'ratings_ratingreport', 'client_profile_ratingreport_status_1f1359bf', 'ratings_ratingreport_status_ab817a6b'),
    ('index', 'ratings_ratingreport', 'client_profile_ratingreport_status_1f1359bf_like', 'ratings_ratingreport_status_ab817a6b_like'),
]


class Migration(migrations.Migration):

    dependencies = [
        ('ratings', '0002_clean_table_and_index_names'),
    ]

    operations = [
        RenameDatabaseNames(RENAMES),
    ]
