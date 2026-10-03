"""Give the constraints, indexes and identity sequences of the attendance tables the names a new database gets.

The tables were created as client_profile_* and renamed by 0002_clean_table_and_index_names;
PostgreSQL kept the names of the objects attached to them. Database only: no table, column or row changes, and
the migration state is unchanged. See core.migration_operations.RenameDatabaseNames."""
from django.db import migrations

from core.migration_operations import RenameDatabaseNames

# (kind, table, old name, new name)
RENAMES = [
    ('sequence', 'attendance_attendancecorrection', 'client_profile_attendancecorrection_id_seq', 'attendance_attendancecorrection_id_seq'),
    ('constraint', 'attendance_attendancecorrection', 'client_profile_atten_corrected_by_id_b05bd3ce_fk_users_use', 'attendance_attendanc_corrected_by_id_11c91953_fk_users_use'),
    ('constraint', 'attendance_attendancecorrection', 'client_profile_atten_original_event_id_db417226_fk_client_pr', 'attendance_attendanc_original_event_id_3c0949f5_fk_attendanc'),
    ('constraint', 'attendance_attendancecorrection', 'client_profile_attendancecorrection_pkey', 'attendance_attendancecorrection_pkey'),
    ('index', 'attendance_attendancecorrection', 'client_profile_attendancecorrection_corrected_by_id_b05bd3ce', 'attendance_attendancecorrection_corrected_by_id_11c91953'),
    ('index', 'attendance_attendancecorrection', 'client_profile_attendancecorrection_original_event_id_db417226', 'attendance_attendancecorrection_original_event_id_3c0949f5'),
    ('sequence', 'attendance_attendanceevent', 'client_profile_attendanceevent_id_seq', 'attendance_attendanceevent_id_seq'),
    ('constraint', 'attendance_attendanceevent', 'client_profile_atten_device_id_d10d46af_fk_client_pr', 'attendance_attendanc_device_id_4d3d36d2_fk_attendanc'),
    ('constraint', 'attendance_attendanceevent', 'client_profile_atten_qr_session_id_8e8304d1_fk_client_pr', 'attendance_attendanc_qr_session_id_e40f9a57_fk_attendanc'),
    ('constraint', 'attendance_attendanceevent', 'client_profile_atten_session_id_795a8361_fk_client_pr', 'attendance_attendanc_session_id_fbd82134_fk_attendanc'),
    ('constraint', 'attendance_attendanceevent', 'client_profile_attendanceevent_pkey', 'attendance_attendanceevent_pkey'),
    ('index', 'attendance_attendanceevent', 'client_profile_attendanceevent_device_id_d10d46af', 'attendance_attendanceevent_device_id_4d3d36d2'),
    ('index', 'attendance_attendanceevent', 'client_profile_attendanceevent_qr_session_id_8e8304d1', 'attendance_attendanceevent_qr_session_id_e40f9a57'),
    ('index', 'attendance_attendanceevent', 'client_profile_attendanceevent_session_id_795a8361', 'attendance_attendanceevent_session_id_fbd82134'),
    ('sequence', 'attendance_attendancesession', 'client_profile_attendancesession_id_seq', 'attendance_attendancesession_id_seq'),
    ('constraint', 'attendance_attendancesession', 'client_profile_atten_assignment_id_71ba183e_fk_client_pr', 'attendance_attendanc_assignment_id_47c95871_fk_client_pr'),
    ('constraint', 'attendance_attendancesession', 'client_profile_atten_pharmacy_id_675628af_fk_client_pr', 'attendance_attendanc_pharmacy_id_8f0112e4_fk_client_pr'),
    ('constraint', 'attendance_attendancesession', 'client_profile_atten_source_membership_id_7f60ed45_fk_client_pr', 'attendance_attendanc_source_membership_id_deec21bf_fk_client_pr'),
    ('constraint', 'attendance_attendancesession', 'client_profile_atten_user_id_d6a7c44a_fk_users_use', 'attendance_attendancesession_user_id_a2c46b1b_fk_users_user_id'),
    ('constraint', 'attendance_attendancesession', 'client_profile_attendancesession_pkey', 'attendance_attendancesession_pkey'),
    ('index', 'attendance_attendancesession', 'client_profile_attendancesession_assignment_id_71ba183e', 'attendance_attendancesession_assignment_id_47c95871'),
    ('index', 'attendance_attendancesession', 'client_profile_attendancesession_pharmacy_id_675628af', 'attendance_attendancesession_pharmacy_id_8f0112e4'),
    ('index', 'attendance_attendancesession', 'client_profile_attendancesession_source_membership_id_7f60ed45', 'attendance_attendancesession_source_membership_id_deec21bf'),
    ('index', 'attendance_attendancesession', 'client_profile_attendancesession_user_id_d6a7c44a', 'attendance_attendancesession_user_id_a2c46b1b'),
    ('sequence', 'attendance_kioskattendanceevent', 'client_profile_kioskattendanceevent_id_seq', 'attendance_kioskattendanceevent_id_seq'),
    ('constraint', 'attendance_kioskattendanceevent', 'client_profile_kiosk_attendance_event_id_d5d21a2e_fk_client_pr', 'attendance_kioskatte_attendance_event_id_020592bd_fk_attendanc'),
    ('constraint', 'attendance_kioskattendanceevent', 'client_profile_kiosk_device_id_7dc015df_fk_client_pr', 'attendance_kioskatte_device_id_f0c6e42c_fk_attendanc'),
    ('constraint', 'attendance_kioskattendanceevent', 'client_profile_kiosk_employee_id_681752b2_fk_users_use', 'attendance_kioskatte_employee_id_9c8ab3fc_fk_users_use'),
    ('constraint', 'attendance_kioskattendanceevent', 'client_profile_kioskattendanceevent_attendance_event_id_key', 'attendance_kioskattendanceevent_attendance_event_id_key'),
    ('constraint', 'attendance_kioskattendanceevent', 'client_profile_kioskattendanceevent_device_sequence_check', 'attendance_kioskattendanceevent_device_sequence_check'),
    ('constraint', 'attendance_kioskattendanceevent', 'client_profile_kioskattendanceevent_event_id_key', 'attendance_kioskattendanceevent_event_id_key'),
    ('constraint', 'attendance_kioskattendanceevent', 'client_profile_kioskattendanceevent_monotonic_elapsed_ms_check', 'attendance_kioskattendanceevent_monotonic_elapsed_ms_check'),
    ('constraint', 'attendance_kioskattendanceevent', 'client_profile_kioskattendanceevent_pkey', 'attendance_kioskattendanceevent_pkey'),
    ('constraint', 'attendance_kioskattendanceevent', 'client_profile_kioskattendanceevent_submitted_employee_id_check', 'attendance_kioskattendanceevent_submitted_employee_id_check'),
    ('index', 'attendance_kioskattendanceevent', 'client_profile_kioskattendanceevent_device_id_7dc015df', 'attendance_kioskattendanceevent_device_id_f0c6e42c'),
    ('index', 'attendance_kioskattendanceevent', 'client_profile_kioskattendanceevent_employee_id_681752b2', 'attendance_kioskattendanceevent_employee_id_9c8ab3fc'),
    ('sequence', 'attendance_kioskdevice', 'client_profile_kioskdevice_id_seq', 'attendance_kioskdevice_id_seq'),
    ('constraint', 'attendance_kioskdevice', 'client_profile_kiosk_activated_by_id_dd550b87_fk_users_use', 'attendance_kioskdevi_activated_by_id_73046afc_fk_users_use'),
    ('constraint', 'attendance_kioskdevice', 'client_profile_kiosk_pharmacy_id_89080311_fk_client_pr', 'attendance_kioskdevi_pharmacy_id_bbe9d766_fk_client_pr'),
    ('constraint', 'attendance_kioskdevice', 'client_profile_kioskdevice_device_token_key', 'attendance_kioskdevice_device_token_key'),
    ('constraint', 'attendance_kioskdevice', 'client_profile_kioskdevice_installation_id_52db9c33_uniq', 'attendance_kioskdevice_installation_id_key'),
    ('constraint', 'attendance_kioskdevice', 'client_profile_kioskdevice_last_contiguous_sequence_check', 'attendance_kioskdevice_last_contiguous_sequence_check'),
    ('constraint', 'attendance_kioskdevice', 'client_profile_kioskdevice_pkey', 'attendance_kioskdevice_pkey'),
    ('index', 'attendance_kioskdevice', 'client_profile_kioskdevice_activated_by_id_dd550b87', 'attendance_kioskdevice_activated_by_id_73046afc'),
    ('index', 'attendance_kioskdevice', 'client_profile_kioskdevice_device_token_3eea2181_like', 'attendance_kioskdevice_device_token_760d0531_like'),
    ('index', 'attendance_kioskdevice', 'client_profile_kioskdevice_pharmacy_id_89080311', 'attendance_kioskdevice_pharmacy_id_bbe9d766'),
    ('sequence', 'attendance_kioskpairingauthorization', 'client_profile_kioskpairingauthorization_id_seq', 'attendance_kioskpairingauthorization_id_seq'),
    ('constraint', 'attendance_kioskpairingauthorization', 'client_profile_kiosk_authorized_by_id_c9fa0c09_fk_users_use', 'attendance_kioskpair_authorized_by_id_0d24205a_fk_users_use'),
    ('constraint', 'attendance_kioskpairingauthorization', 'client_profile_kiosk_pharmacy_id_5428cb1d_fk_client_pr', 'attendance_kioskpair_pharmacy_id_5ee33db4_fk_client_pr'),
    ('constraint', 'attendance_kioskpairingauthorization', 'client_profile_kiosk_resulting_device_id_704f3fa9_fk_client_pr', 'attendance_kioskpair_resulting_device_id_452329e4_fk_attendanc'),
    ('constraint', 'attendance_kioskpairingauthorization', 'client_profile_kioskpairingauthorizatio_resulting_device_id_key', 'attendance_kioskpairingauthorization_resulting_device_id_key'),
    ('constraint', 'attendance_kioskpairingauthorization', 'client_profile_kioskpairingauthorization_client_attempt_id_key', 'attendance_kioskpairingauthorization_client_attempt_id_key'),
    ('constraint', 'attendance_kioskpairingauthorization', 'client_profile_kioskpairingauthorization_code_digest_key', 'attendance_kioskpairingauthorization_code_digest_key'),
    ('constraint', 'attendance_kioskpairingauthorization', 'client_profile_kioskpairingauthorization_pkey', 'attendance_kioskpairingauthorization_pkey'),
    ('index', 'attendance_kioskpairingauthorization', 'client_profile_kioskpair_code_digest_b5380849_like', 'attendance_kioskpairingauthorization_code_digest_4fee33b0_like'),
    ('index', 'attendance_kioskpairingauthorization', 'client_profile_kioskpairin_authorized_by_id_c9fa0c09', 'attendance_kioskpairingauthorization_authorized_by_id_0d24205a'),
    ('index', 'attendance_kioskpairingauthorization', 'client_profile_kioskpairingauthorization_expires_at_86c8d771', 'attendance_kioskpairingauthorization_expires_at_98e05135'),
    ('index', 'attendance_kioskpairingauthorization', 'client_profile_kioskpairingauthorization_pharmacy_id_5428cb1d', 'attendance_kioskpairingauthorization_pharmacy_id_5ee33db4'),
    ('sequence', 'attendance_pharmacyqrsession', 'client_profile_pharmacyqrsession_id_seq', 'attendance_pharmacyqrsession_id_seq'),
    ('constraint', 'attendance_pharmacyqrsession', 'client_profile_pharm_pharmacy_id_18e0bb77_fk_client_pr', 'attendance_pharmacyq_pharmacy_id_31695ee6_fk_client_pr'),
    ('constraint', 'attendance_pharmacyqrsession', 'client_profile_pharmacyqrsession_code_key', 'attendance_pharmacyqrsession_code_key'),
    ('constraint', 'attendance_pharmacyqrsession', 'client_profile_pharmacyqrsession_pkey', 'attendance_pharmacyqrsession_pkey'),
    ('index', 'attendance_pharmacyqrsession', 'client_profile_pharmacyqrsession_code_7dba139f_like', 'attendance_pharmacyqrsession_code_40b11ca1_like'),
    ('index', 'attendance_pharmacyqrsession', 'client_profile_pharmacyqrsession_pharmacy_id_18e0bb77', 'attendance_pharmacyqrsession_pharmacy_id_31695ee6'),
    ('sequence', 'attendance_provisionalattendance', 'client_profile_provisionalattendance_id_seq', 'attendance_provisionalattendance_id_seq'),
    ('constraint', 'attendance_provisionalattendance', 'client_profile_provi_backfill_assignment__d7df8afb_fk_client_pr', 'attendance_provision_backfill_assignment__2bd13f1e_fk_client_pr'),
    ('constraint', 'attendance_provisionalattendance', 'client_profile_provi_backfill_shift_id_25b38742_fk_client_pr', 'attendance_provision_backfill_shift_id_dbc9fc18_fk_client_pr'),
    ('constraint', 'attendance_provisionalattendance', 'client_profile_provi_decided_by_id_9dc17c68_fk_users_use', 'attendance_provision_decided_by_id_73c29164_fk_users_use'),
    ('constraint', 'attendance_provisionalattendance', 'client_profile_provi_session_id_df4c8ad5_fk_client_pr', 'attendance_provision_session_id_8bdc754d_fk_attendanc'),
    ('constraint', 'attendance_provisionalattendance', 'client_profile_provisionalattendance_pkey', 'attendance_provisionalattendance_pkey'),
    ('constraint', 'attendance_provisionalattendance', 'client_profile_provisionalattendance_session_id_key', 'attendance_provisionalattendance_session_id_key'),
    ('index', 'attendance_provisionalattendance', 'client_profile_provisional_backfill_assignment_id_d7df8afb', 'attendance_provisionalatte_backfill_assignment_id_2bd13f1e'),
    ('index', 'attendance_provisionalattendance', 'client_profile_provisionalattendance_backfill_shift_id_25b38742', 'attendance_provisionalattendance_backfill_shift_id_dbc9fc18'),
    ('index', 'attendance_provisionalattendance', 'client_profile_provisionalattendance_decided_by_id_9dc17c68', 'attendance_provisionalattendance_decided_by_id_73c29164'),
    ('sequence', 'attendance_workerpin', 'client_profile_workerpin_id_seq', 'attendance_workerpin_id_seq'),
    ('constraint', 'attendance_workerpin', 'client_profile_worke_membership_id_aef911d0_fk_client_pr', 'attendance_workerpin_membership_id_73f27684_fk_client_pr'),
    ('constraint', 'attendance_workerpin', 'client_profile_workerpin_membership_id_key', 'attendance_workerpin_membership_id_key'),
    ('constraint', 'attendance_workerpin', 'client_profile_workerpin_pkey', 'attendance_workerpin_pkey'),
    # foreign keys of other apps' tables that reference these tables
    ('constraint', 'workforce_managerattendanceeventaudit', 'workforce_manageratt_event_id_b22ba941_fk_client_pr', 'workforce_manageratt_event_id_b22ba941_fk_attendanc'),
]


class Migration(migrations.Migration):

    dependencies = [
        ('attendance', '0002_clean_table_and_index_names'),
    ]

    operations = [
        RenameDatabaseNames(RENAMES),
    ]
