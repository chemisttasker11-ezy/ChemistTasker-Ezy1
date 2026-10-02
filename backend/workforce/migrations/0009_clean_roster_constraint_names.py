"""Give the constraints, indexes and identity sequences of the roster tables the names a new database gets.

The tables were created as client_profile_* and renamed by 0008_clean_roster_table_and_index_names;
PostgreSQL kept the names of the objects attached to them. Database only: no table, column or row changes, and
the migration state is unchanged. See core.migration_operations.RenameDatabaseNames."""
from django.db import migrations

from core.migration_operations import RenameDatabaseNames

# (kind, table, old name, new name)
RENAMES = [
    ('sequence', 'workforce_rosteracknowledgement', 'client_profile_rosteracknowledgement_id_seq', 'workforce_rosteracknowledgement_id_seq'),
    ('constraint', 'workforce_rosteracknowledgement', 'client_profile_roste_roster_period_id_144a920f_fk_client_pr', 'workforce_rosterackn_roster_period_id_5a44b40c_fk_workforce'),
    ('constraint', 'workforce_rosteracknowledgement', 'client_profile_roste_user_id_3bca043d_fk_users_use', 'workforce_rosterackn_user_id_22829e4d_fk_users_use'),
    ('constraint', 'workforce_rosteracknowledgement', 'client_profile_rosterack_roster_period_id_user_id_9182d1a4_uniq', 'workforce_rosteracknowle_roster_period_id_user_id_b9fed618_uniq'),
    ('constraint', 'workforce_rosteracknowledgement', 'client_profile_rosteracknowledgement_pkey', 'workforce_rosteracknowledgement_pkey'),
    ('index', 'workforce_rosteracknowledgement', 'client_profile_rosteracknowledgement_roster_period_id_144a920f', 'workforce_rosteracknowledgement_roster_period_id_5a44b40c'),
    ('index', 'workforce_rosteracknowledgement', 'client_profile_rosteracknowledgement_user_id_3bca043d', 'workforce_rosteracknowledgement_user_id_22829e4d'),
    ('sequence', 'workforce_rosteractionaudit', 'client_profile_rosteractionaudit_id_seq', 'workforce_rosteractionaudit_id_seq'),
    ('constraint', 'workforce_rosteractionaudit', 'client_profile_roste_performed_by_id_8db02582_fk_users_use', 'workforce_rosteracti_performed_by_id_1c3387b3_fk_users_use'),
    ('constraint', 'workforce_rosteractionaudit', 'client_profile_roste_pharmacy_id_04f6ce90_fk_client_pr', 'workforce_rosteracti_pharmacy_id_439df237_fk_client_pr'),
    ('constraint', 'workforce_rosteractionaudit', 'client_profile_roste_shift_assignment_id_2f43d7ac_fk_client_pr', 'workforce_rosteracti_shift_assignment_id_3305f476_fk_client_pr'),
    ('constraint', 'workforce_rosteractionaudit', 'client_profile_roste_target_user_id_8e9cc3bd_fk_users_use', 'workforce_rosteracti_target_user_id_d8de812a_fk_users_use'),
    ('constraint', 'workforce_rosteractionaudit', 'client_profile_rosteractionaudit_pkey', 'workforce_rosteractionaudit_pkey'),
    ('index', 'workforce_rosteractionaudit', 'client_profile_rosteractionaudit_performed_by_id_8db02582', 'workforce_rosteractionaudit_performed_by_id_1c3387b3'),
    ('index', 'workforce_rosteractionaudit', 'client_profile_rosteractionaudit_pharmacy_id_04f6ce90', 'workforce_rosteractionaudit_pharmacy_id_439df237'),
    ('index', 'workforce_rosteractionaudit', 'client_profile_rosteractionaudit_shift_assignment_id_2f43d7ac', 'workforce_rosteractionaudit_shift_assignment_id_3305f476'),
    ('index', 'workforce_rosteractionaudit', 'client_profile_rosteractionaudit_target_user_id_8e9cc3bd', 'workforce_rosteractionaudit_target_user_id_d8de812a'),
    ('sequence', 'workforce_rosterperiod', 'client_profile_rosterperiod_id_seq', 'workforce_rosterperiod_id_seq'),
    ('constraint', 'workforce_rosterperiod', 'client_profile_roste_copied_from_id_caa78d24_fk_client_pr', 'workforce_rosterperi_copied_from_id_eb06f27b_fk_workforce'),
    ('constraint', 'workforce_rosterperiod', 'client_profile_roste_created_by_id_3362af46_fk_users_use', 'workforce_rosterperiod_created_by_id_6baa43dd_fk_users_user_id'),
    ('constraint', 'workforce_rosterperiod', 'client_profile_roste_pharmacy_id_ff295c99_fk_client_pr', 'workforce_rosterperi_pharmacy_id_7c7a62aa_fk_client_pr'),
    ('constraint', 'workforce_rosterperiod', 'client_profile_roste_published_by_id_6b97ecab_fk_users_use', 'workforce_rosterperi_published_by_id_ea40eff2_fk_users_use'),
    ('constraint', 'workforce_rosterperiod', 'client_profile_rosterper_pharmacy_id_week_start_6b5b0aea_uniq', 'workforce_rosterperiod_pharmacy_id_week_start_f348d613_uniq'),
    ('constraint', 'workforce_rosterperiod', 'client_profile_rosterperiod_pkey', 'workforce_rosterperiod_pkey'),
    ('index', 'workforce_rosterperiod', 'client_profile_rosterperiod_copied_from_id_caa78d24', 'workforce_rosterperiod_copied_from_id_eb06f27b'),
    ('index', 'workforce_rosterperiod', 'client_profile_rosterperiod_created_by_id_3362af46', 'workforce_rosterperiod_created_by_id_6baa43dd'),
    ('index', 'workforce_rosterperiod', 'client_profile_rosterperiod_pharmacy_id_ff295c99', 'workforce_rosterperiod_pharmacy_id_7c7a62aa'),
    ('index', 'workforce_rosterperiod', 'client_profile_rosterperiod_published_by_id_6b97ecab', 'workforce_rosterperiod_published_by_id_ea40eff2'),
    ('sequence', 'workforce_rosterpublicationaudit', 'client_profile_rosterpublicationaudit_id_seq', 'workforce_rosterpublicationaudit_id_seq'),
    ('constraint', 'workforce_rosterpublicationaudit', 'client_profile_roste_published_by_id_d127432a_fk_users_use', 'workforce_rosterpubl_published_by_id_909ca2ca_fk_users_use'),
    ('constraint', 'workforce_rosterpublicationaudit', 'client_profile_roste_roster_period_id_6193f62f_fk_client_pr', 'workforce_rosterpubl_roster_period_id_e4ef872c_fk_workforce'),
    ('constraint', 'workforce_rosterpublicationaudit', 'client_profile_rosterpublicationaudit_pkey', 'workforce_rosterpublicationaudit_pkey'),
    ('constraint', 'workforce_rosterpublicationaudit', 'client_profile_rosterpublicationaudit_revision_number_check', 'workforce_rosterpublicationaudit_revision_number_check'),
    ('constraint', 'workforce_rosterpublicationaudit', 'client_profile_rosterpublicationaudit_total_assignments_check', 'workforce_rosterpublicationaudit_total_assignments_check'),
    ('index', 'workforce_rosterpublicationaudit', 'client_profile_rosterpublicationaudit_published_by_id_d127432a', 'workforce_rosterpublicationaudit_published_by_id_909ca2ca'),
    ('index', 'workforce_rosterpublicationaudit', 'client_profile_rosterpublicationaudit_roster_period_id_6193f62f', 'workforce_rosterpublicationaudit_roster_period_id_e4ef872c'),
    ('sequence', 'workforce_rostertemplate', 'client_profile_rostertemplate_id_seq', 'workforce_rostertemplate_id_seq'),
    ('constraint', 'workforce_rostertemplate', 'client_profile_roste_created_by_id_3e484646_fk_users_use', 'workforce_rostertemp_created_by_id_1f72a3d4_fk_users_use'),
    ('constraint', 'workforce_rostertemplate', 'client_profile_roste_pharmacy_id_681def93_fk_client_pr', 'workforce_rostertemp_pharmacy_id_2c643adc_fk_client_pr'),
    ('constraint', 'workforce_rostertemplate', 'client_profile_rostertemplate_pkey', 'workforce_rostertemplate_pkey'),
    ('index', 'workforce_rostertemplate', 'client_profile_rostertemplate_created_by_id_3e484646', 'workforce_rostertemplate_created_by_id_1f72a3d4'),
    ('index', 'workforce_rostertemplate', 'client_profile_rostertemplate_pharmacy_id_681def93', 'workforce_rostertemplate_pharmacy_id_2c643adc'),
    # foreign keys of other apps' tables that reference these tables
    ('constraint', 'client_profile_shiftslot', 'client_profile_shift_roster_period_id_bc804152_fk_client_pr', 'client_profile_shift_roster_period_id_bc804152_fk_workforce'),
    ('constraint', 'workforce_rosteroperation', 'workforce_rosteroper_period_id_feb88804_fk_client_pr', 'workforce_rosteroper_period_id_feb88804_fk_workforce'),
    ('constraint', 'workforce_rosterrevisionstate', 'workforce_rosterrevi_period_id_11d8ce47_fk_client_pr', 'workforce_rosterrevi_period_id_11d8ce47_fk_workforce'),
]


class Migration(migrations.Migration):

    dependencies = [
        ('workforce', '0008_clean_roster_table_and_index_names'),
    ]

    operations = [
        RenameDatabaseNames(RENAMES),
    ]
