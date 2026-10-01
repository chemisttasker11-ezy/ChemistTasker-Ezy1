"""Give the roster tables and indexes their workforce names. This is the only DDL of the move: ALTER TABLE ... RENAME and ALTER INDEX ... RENAME (metadata operations, no data is rewritten).
It runs after client_profile released the models and re-pointed ShiftSlot.roster_period, so no table is renamed
while another migration still has to create a foreign key to the old table name."""
from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('workforce', '0007_move_roster_in'),
        ('client_profile', '0070_move_roster_out'),
    ]

    operations = [
        migrations.RenameIndex(
            model_name='rosteracknowledgement',
            new_name='workforce_r_roster__8053e3_idx',
            old_name='client_prof_roster__e782ef_idx',
        ),
        migrations.RenameIndex(
            model_name='rosteractionaudit',
            new_name='workforce_r_pharmac_261c76_idx',
            old_name='client_prof_pharmac_59c715_idx',
        ),
        migrations.RenameIndex(
            model_name='rosteractionaudit',
            new_name='workforce_r_created_d2bcdd_idx',
            old_name='client_prof_created_e1cfd4_idx',
        ),
        migrations.RenameIndex(
            model_name='rosterperiod',
            new_name='workforce_r_pharmac_116a94_idx',
            old_name='client_prof_pharmac_ceea0b_idx',
        ),
        migrations.RenameIndex(
            model_name='rosterperiod',
            new_name='workforce_r_status_e5f0cf_idx',
            old_name='client_prof_status_d7a61f_idx',
        ),
        migrations.RenameIndex(
            model_name='rosterpublicationaudit',
            new_name='workforce_r_roster__4bfe20_idx',
            old_name='client_prof_roster__e1eaf8_idx',
        ),
        migrations.RenameIndex(
            model_name='rostertemplate',
            new_name='workforce_r_pharmac_511e3e_idx',
            old_name='client_prof_pharmac_c86377_idx',
        ),
        migrations.AlterModelTable(
            name='rosteracknowledgement',
            table=None,
        ),
        migrations.AlterModelTable(
            name='rosteractionaudit',
            table=None,
        ),
        migrations.AlterModelTable(
            name='rosterperiod',
            table=None,
        ),
        migrations.AlterModelTable(
            name='rosterpublicationaudit',
            table=None,
        ),
        migrations.AlterModelTable(
            name='rostertemplate',
            table=None,
        ),
    ]
