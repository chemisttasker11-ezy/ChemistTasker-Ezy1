"""Give the team_calendar tables and indexes clean names. This is the only DDL of the move: ALTER TABLE ... RENAME and ALTER INDEX ... RENAME (metadata operations, no data is rewritten).
It runs after client_profile released the models and every other app re-pointed its relations, so no table is renamed
while another migration still has to create a foreign key to the old table name."""
from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('team_calendar', '0001_initial'),
        ('client_profile', '0064_move_team_calendar_out'),
    ]

    operations = [
        migrations.RenameIndex(
            model_name='calendarevent',
            new_name='team_calend_pharmac_e97e80_idx',
            old_name='client_prof_pharmac_fdbdd1_idx',
        ),
        migrations.RenameIndex(
            model_name='calendarevent',
            new_name='team_calend_organiz_a394a2_idx',
            old_name='client_prof_organiz_9ff239_idx',
        ),
        migrations.RenameIndex(
            model_name='calendarevent',
            new_name='team_calend_source_f7bcc8_idx',
            old_name='client_prof_source_c3c076_idx',
        ),
        migrations.RenameIndex(
            model_name='worknote',
            new_name='team_calend_pharmac_24cbce_idx',
            old_name='client_prof_pharmac_6dcb3d_idx',
        ),
        migrations.RenameIndex(
            model_name='worknote',
            new_name='team_calend_pharmac_02e26a_idx',
            old_name='client_prof_pharmac_0ae5e5_idx',
        ),
        migrations.RenameIndex(
            model_name='worknote',
            new_name='team_calend_date_2ff838_idx',
            old_name='client_prof_date_13053a_idx',
        ),
        migrations.RenameIndex(
            model_name='worknoteassignee',
            new_name='team_calend_members_0f0281_idx',
            old_name='client_prof_members_1bb3a1_idx',
        ),
        migrations.RenameIndex(
            model_name='worknoteassignee',
            new_name='team_calend_work_no_c50857_idx',
            old_name='client_prof_work_no_eb54a2_idx',
        ),
        migrations.RenameIndex(
            model_name='worknotecompletion',
            new_name='team_calend_work_no_45cb16_idx',
            old_name='client_prof_work_no_ebc9d8_idx',
        ),
        migrations.RenameIndex(
            model_name='worknotecompletion',
            new_name='team_calend_members_f15c90_idx',
            old_name='client_prof_members_d368bd_idx',
        ),
        migrations.AlterModelTable(
            name='calendarevent',
            table=None,
        ),
        migrations.AlterModelTable(
            name='worknote',
            table=None,
        ),
        migrations.AlterModelTable(
            name='worknoteassignee',
            table=None,
        ),
        migrations.AlterModelTable(
            name='worknotecompletion',
            table=None,
        ),
    ]
