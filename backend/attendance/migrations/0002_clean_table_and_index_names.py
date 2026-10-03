"""Give the attendance tables and indexes clean names. This is the only DDL of the move: ALTER TABLE ... RENAME and ALTER INDEX ... RENAME (metadata operations, no data is rewritten).
It runs after client_profile released the models and every other app re-pointed its relations, so no table is renamed
while another migration still has to create a foreign key to the old table name."""
from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('attendance', '0001_initial'),
        ('client_profile', '0069_move_attendance_out'),
    ]

    operations = [
        migrations.RenameIndex(
            model_name='attendancecorrection',
            new_name='attendance__origina_6aab03_idx',
            old_name='client_prof_origina_4d8e58_idx',
        ),
        migrations.RenameIndex(
            model_name='attendanceevent',
            new_name='attendance__session_ff4a26_idx',
            old_name='client_prof_session_e49418_idx',
        ),
        migrations.RenameIndex(
            model_name='attendanceevent',
            new_name='attendance__event_t_1f2a9c_idx',
            old_name='client_prof_event_t_a5db2c_idx',
        ),
        migrations.RenameIndex(
            model_name='attendancesession',
            new_name='attendance__pharmac_8d9f42_idx',
            old_name='client_prof_pharmac_a0d4b1_idx',
        ),
        migrations.RenameIndex(
            model_name='attendancesession',
            new_name='attendance__user_id_fb305f_idx',
            old_name='client_prof_user_id_a5feb4_idx',
        ),
        migrations.RenameIndex(
            model_name='attendancesession',
            new_name='attendance__assignm_1c896f_idx',
            old_name='client_prof_assignm_cf13b2_idx',
        ),
        migrations.RenameIndex(
            model_name='kioskattendanceevent',
            new_name='attendance__device__78679d_idx',
            old_name='client_prof_device__7f4585_idx',
        ),
        migrations.RenameIndex(
            model_name='kioskattendanceevent',
            new_name='attendance__process_8fd7a3_idx',
            old_name='client_prof_process_842c08_idx',
        ),
        migrations.RenameIndex(
            model_name='kioskdevice',
            new_name='attendance__pharmac_6e45c6_idx',
            old_name='client_prof_pharmac_e1b4ea_idx',
        ),
        migrations.RenameIndex(
            model_name='kioskpairingauthorization',
            new_name='attendance__consume_ee7eff_idx',
            old_name='client_prof_consume_aa4d81_idx',
        ),
        migrations.RenameIndex(
            model_name='pharmacyqrsession',
            new_name='attendance__pharmac_a4e917_idx',
            old_name='client_prof_pharmac_26f482_idx',
        ),
        migrations.RenameIndex(
            model_name='pharmacyqrsession',
            new_name='attendance__code_42ef30_idx',
            old_name='client_prof_code_0d9ec5_idx',
        ),
        migrations.RenameIndex(
            model_name='provisionalattendance',
            new_name='attendance__status_3a2a9b_idx',
            old_name='client_prof_status_761caf_idx',
        ),
        migrations.AlterModelTable(
            name='attendancecorrection',
            table=None,
        ),
        migrations.AlterModelTable(
            name='attendanceevent',
            table=None,
        ),
        migrations.AlterModelTable(
            name='attendancesession',
            table=None,
        ),
        migrations.AlterModelTable(
            name='kioskattendanceevent',
            table=None,
        ),
        migrations.AlterModelTable(
            name='kioskdevice',
            table=None,
        ),
        migrations.AlterModelTable(
            name='kioskpairingauthorization',
            table=None,
        ),
        migrations.AlterModelTable(
            name='pharmacyqrsession',
            table=None,
        ),
        migrations.AlterModelTable(
            name='provisionalattendance',
            table=None,
        ),
        migrations.AlterModelTable(
            name='workerpin',
            table=None,
        ),
    ]
