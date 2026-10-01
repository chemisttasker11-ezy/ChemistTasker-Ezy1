"""Give the talent tables and indexes clean names. This is the only DDL of the move: ALTER TABLE ... RENAME and ALTER INDEX ... RENAME (metadata operations, no data is rewritten).
It runs after client_profile released the models and every other app re-pointed its relations, so no table is renamed
while another migration still has to create a foreign key to the old table name."""
from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('talent', '0001_initial'),
        ('client_profile', '0063_move_talent_out'),
    ]

    operations = [
        migrations.RenameIndex(
            model_name='explorerpost',
            new_name='talent_expl_created_e0f2e7_idx',
            old_name='client_prof_created_80bbb4_idx',
        ),
        migrations.RenameIndex(
            model_name='explorerpost',
            new_name='talent_expl_explore_819c16_idx',
            old_name='client_prof_explore_cc31b1_idx',
        ),
        migrations.RenameIndex(
            model_name='explorerpostreaction',
            new_name='talent_expl_post_id_0ceb78_idx',
            old_name='client_prof_post_id_bd9cb2_idx',
        ),
        migrations.RenameIndex(
            model_name='explorerpostreaction',
            new_name='talent_expl_user_id_a953af_idx',
            old_name='client_prof_user_id_0b557f_idx',
        ),
        migrations.RenameIndex(
            model_name='useravailability',
            new_name='talent_user_user_id_065f67_idx',
            old_name='client_prof_user_id_e880ba_idx',
        ),
        migrations.AlterModelTable(
            name='explorerpost',
            table=None,
        ),
        migrations.AlterModelTable(
            name='explorerpostreaction',
            table=None,
        ),
        migrations.AlterModelTable(
            name='useravailability',
            table=None,
        ),
    ]
