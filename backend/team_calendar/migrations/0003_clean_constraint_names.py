"""Give the constraints, indexes and identity sequences of the team_calendar tables the names a new database gets.

The tables were created as client_profile_* and renamed by 0002_clean_table_and_index_names;
PostgreSQL kept the names of the objects attached to them. Database only: no table, column or row changes, and
the migration state is unchanged. See core.migration_operations.RenameDatabaseNames."""
from django.db import migrations

from core.migration_operations import RenameDatabaseNames

# (kind, table, old name, new name)
RENAMES = [
    ('sequence', 'team_calendar_calendarevent', 'client_profile_calendarevent_id_seq', 'team_calendar_calendarevent_id_seq'),
    ('constraint', 'team_calendar_calendarevent', 'client_profile_calen_created_by_id_a984027a_fk_users_use', 'team_calendar_calend_created_by_id_531ac95a_fk_users_use'),
    ('constraint', 'team_calendar_calendarevent', 'client_profile_calen_organization_id_700b6c1f_fk_client_pr', 'team_calendar_calend_organization_id_3d9dc2ad_fk_client_pr'),
    ('constraint', 'team_calendar_calendarevent', 'client_profile_calen_pharmacy_id_e77469a2_fk_client_pr', 'team_calendar_calend_pharmacy_id_338dde78_fk_client_pr'),
    ('constraint', 'team_calendar_calendarevent', 'client_profile_calen_source_membership_id_318b0932_fk_client_pr', 'team_calendar_calend_source_membership_id_035c1ba0_fk_client_pr'),
    ('constraint', 'team_calendar_calendarevent', 'client_profile_calendarevent_pkey', 'team_calendar_calendarevent_pkey'),
    ('index', 'team_calendar_calendarevent', 'client_profile_calendarevent_created_by_id_a984027a', 'team_calendar_calendarevent_created_by_id_531ac95a'),
    ('index', 'team_calendar_calendarevent', 'client_profile_calendarevent_date_58d295a0', 'team_calendar_calendarevent_date_d8397a47'),
    ('index', 'team_calendar_calendarevent', 'client_profile_calendarevent_organization_id_700b6c1f', 'team_calendar_calendarevent_organization_id_3d9dc2ad'),
    ('index', 'team_calendar_calendarevent', 'client_profile_calendarevent_pharmacy_id_e77469a2', 'team_calendar_calendarevent_pharmacy_id_338dde78'),
    ('index', 'team_calendar_calendarevent', 'client_profile_calendarevent_source_membership_id_318b0932', 'team_calendar_calendarevent_source_membership_id_035c1ba0'),
    ('sequence', 'team_calendar_worknote', 'client_profile_worknote_id_seq', 'team_calendar_worknote_id_seq'),
    ('constraint', 'team_calendar_worknote', 'client_profile_workn_pharmacy_id_d58cbda0_fk_client_pr', 'team_calendar_workno_pharmacy_id_17ba89c0_fk_client_pr'),
    ('constraint', 'team_calendar_worknote', 'client_profile_worknote_created_by_id_2a53aecf_fk_users_user_id', 'team_calendar_worknote_created_by_id_12b87e26_fk_users_user_id'),
    ('constraint', 'team_calendar_worknote', 'client_profile_worknote_pkey', 'team_calendar_worknote_pkey'),
    ('index', 'team_calendar_worknote', 'client_profile_worknote_created_by_id_2a53aecf', 'team_calendar_worknote_created_by_id_12b87e26'),
    ('index', 'team_calendar_worknote', 'client_profile_worknote_date_c7829771', 'team_calendar_worknote_date_e164758a'),
    ('index', 'team_calendar_worknote', 'client_profile_worknote_pharmacy_id_d58cbda0', 'team_calendar_worknote_pharmacy_id_17ba89c0'),
    ('sequence', 'team_calendar_worknoteassignee', 'client_profile_worknoteassignee_id_seq', 'team_calendar_worknoteassignee_id_seq'),
    ('constraint', 'team_calendar_worknoteassignee', 'client_profile_workn_membership_id_05c589f3_fk_client_pr', 'team_calendar_workno_membership_id_5b4521a5_fk_client_pr'),
    ('constraint', 'team_calendar_worknoteassignee', 'client_profile_workn_work_note_id_f93cfb9d_fk_client_pr', 'team_calendar_workno_work_note_id_6fdedcfd_fk_team_cale'),
    ('constraint', 'team_calendar_worknoteassignee', 'client_profile_worknotea_work_note_id_membership__920cd733_uniq', 'team_calendar_worknoteas_work_note_id_membership__0a7f0114_uniq'),
    ('constraint', 'team_calendar_worknoteassignee', 'client_profile_worknoteassignee_pkey', 'team_calendar_worknoteassignee_pkey'),
    ('index', 'team_calendar_worknoteassignee', 'client_profile_worknoteassignee_membership_id_05c589f3', 'team_calendar_worknoteassignee_membership_id_5b4521a5'),
    ('index', 'team_calendar_worknoteassignee', 'client_profile_worknoteassignee_work_note_id_f93cfb9d', 'team_calendar_worknoteassignee_work_note_id_6fdedcfd'),
    ('sequence', 'team_calendar_worknotecompletion', 'client_profile_worknotecompletion_id_seq', 'team_calendar_worknotecompletion_id_seq'),
    ('constraint', 'team_calendar_worknotecompletion', 'client_profile_workn_completed_by_id_66a24444_fk_users_use', 'team_calendar_workno_completed_by_id_4772b094_fk_users_use'),
    ('constraint', 'team_calendar_worknotecompletion', 'client_profile_workn_membership_id_4f3397b9_fk_client_pr', 'team_calendar_workno_membership_id_4477563f_fk_client_pr'),
    ('constraint', 'team_calendar_worknotecompletion', 'client_profile_workn_work_note_id_68bf5e85_fk_client_pr', 'team_calendar_workno_work_note_id_5c712081_fk_team_cale'),
    ('constraint', 'team_calendar_worknotecompletion', 'client_profile_worknotec_work_note_id_membership__a6d92a47_uniq', 'team_calendar_worknoteco_work_note_id_membership__c27b2c8d_uniq'),
    ('constraint', 'team_calendar_worknotecompletion', 'client_profile_worknotecompletion_pkey', 'team_calendar_worknotecompletion_pkey'),
    ('index', 'team_calendar_worknotecompletion', 'client_profile_worknotecompletion_completed_by_id_66a24444', 'team_calendar_worknotecompletion_completed_by_id_4772b094'),
    ('index', 'team_calendar_worknotecompletion', 'client_profile_worknotecompletion_membership_id_4f3397b9', 'team_calendar_worknotecompletion_membership_id_4477563f'),
    ('index', 'team_calendar_worknotecompletion', 'client_profile_worknotecompletion_occurrence_date_0c34eed0', 'team_calendar_worknotecompletion_occurrence_date_07c376b3'),
    ('index', 'team_calendar_worknotecompletion', 'client_profile_worknotecompletion_work_note_id_68bf5e85', 'team_calendar_worknotecompletion_work_note_id_5c712081'),
]


class Migration(migrations.Migration):

    dependencies = [
        ('team_calendar', '0002_clean_table_and_index_names'),
    ]

    operations = [
        RenameDatabaseNames(RENAMES),
    ]
