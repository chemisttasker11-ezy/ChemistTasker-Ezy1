"""Give the rewards tables and indexes clean names. This is the only DDL of the move: ALTER TABLE ... RENAME and ALTER INDEX ... RENAME (metadata operations, no data is rewritten)."""
from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('rewards', '0001_initial'),
    ]

    operations = [
        migrations.RenameIndex(
            model_name='pillledgerentry',
            new_name='rewards_pil_user_id_baecad_idx',
            old_name='client_prof_user_id_23b4a4_idx',
        ),
        migrations.RenameIndex(
            model_name='pillledgerentry',
            new_name='rewards_pil_source_59b5db_idx',
            old_name='client_prof_source_af5042_idx',
        ),
        migrations.RenameIndex(
            model_name='pillledgerentry',
            new_name='rewards_pil_entry_t_da1448_idx',
            old_name='client_prof_entry_t_391ea2_idx',
        ),
        migrations.RenameIndex(
            model_name='pillreferralcode',
            new_name='rewards_pil_user_id_2b3b13_idx',
            old_name='client_prof_user_id_5fe2fc_idx',
        ),
        migrations.RenameIndex(
            model_name='pillreferralcode',
            new_name='rewards_pil_code_588393_idx',
            old_name='client_prof_code_dc885c_idx',
        ),
        migrations.RenameIndex(
            model_name='pillreferralevent',
            new_name='rewards_pil_referre_97cc04_idx',
            old_name='client_prof_referre_f912b5_idx',
        ),
        migrations.RenameIndex(
            model_name='pillreferralevent',
            new_name='rewards_pil_referre_fe4cb6_idx',
            old_name='client_prof_referre_78394f_idx',
        ),
        migrations.RenameIndex(
            model_name='pillreferralevent',
            new_name='rewards_pil_shift_i_00005c_idx',
            old_name='client_prof_shift_i_8c79ea_idx',
        ),
        migrations.RenameIndex(
            model_name='pillreferralevent',
            new_name='rewards_pil_status_453657_idx',
            old_name='client_prof_status_4a072e_idx',
        ),
        migrations.RenameIndex(
            model_name='pillrewardrule',
            new_name='rewards_pil_code_d92776_idx',
            old_name='client_prof_code_ec338e_idx',
        ),
        migrations.RenameIndex(
            model_name='pillrewardrule',
            new_name='rewards_pil_event_t_8d7fe1_idx',
            old_name='client_prof_event_t_f7bb42_idx',
        ),
        migrations.RenameIndex(
            model_name='pillrewardrule',
            new_name='rewards_pil_audienc_803886_idx',
            old_name='client_prof_audienc_d7e96f_idx',
        ),
        migrations.AlterModelTable(
            name='pillledgerentry',
            table=None,
        ),
        migrations.AlterModelTable(
            name='pillreferralcode',
            table=None,
        ),
        migrations.AlterModelTable(
            name='pillreferralevent',
            table=None,
        ),
        migrations.AlterModelTable(
            name='pillrewardrule',
            table=None,
        ),
    ]
