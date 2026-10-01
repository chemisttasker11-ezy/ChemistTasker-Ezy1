"""Give the chat tables and indexes clean names. This is the only DDL of the move: ALTER TABLE ... RENAME and ALTER INDEX ... RENAME (metadata operations, no data is rewritten).
It runs after client_profile released the models and every other app re-pointed its relations, so no table is renamed
while another migration still has to create a foreign key to the old table name."""
from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('chat', '0001_initial'),
        ('client_profile', '0066_move_chat_out'),
    ]

    operations = [
        migrations.RenameIndex(
            model_name='conversation',
            new_name='chat_conver_created_cdce89_idx',
            old_name='client_prof_created_886564_idx',
        ),
        migrations.RenameIndex(
            model_name='conversation',
            new_name='chat_conver_updated_09e193_idx',
            old_name='client_prof_updated_6ccea6_idx',
        ),
        migrations.RenameIndex(
            model_name='conversation',
            new_name='chat_conver_pharmac_b07e3d_idx',
            old_name='client_prof_pharmac_16fdb4_idx',
        ),
        migrations.RenameIndex(
            model_name='conversation',
            new_name='chat_conver_dm_key_231112_idx',
            old_name='client_prof_dm_key_26c86a_idx',
        ),
        migrations.RenameIndex(
            model_name='message',
            new_name='chat_messag_convers_3154fc_idx',
            old_name='client_prof_convers_3300e2_idx',
        ),
        migrations.RenameIndex(
            model_name='message',
            new_name='chat_messag_sender__c4389c_idx',
            old_name='client_prof_sender__c0e43d_idx',
        ),
        migrations.RenameIndex(
            model_name='message',
            new_name='chat_messag_convers_0a488e_idx',
            old_name='client_prof_convers_57cca8_idx',
        ),
        migrations.RenameIndex(
            model_name='participant',
            new_name='chat_partic_convers_df8586_idx',
            old_name='client_prof_convers_e7c34a_idx',
        ),
        migrations.RenameIndex(
            model_name='participant',
            new_name='chat_partic_members_8faad0_idx',
            old_name='client_prof_members_7e6b9f_idx',
        ),
        migrations.AlterModelTable(
            name='conversation',
            table=None,
        ),
        migrations.AlterModelTable(
            name='message',
            table=None,
        ),
        migrations.AlterModelTable(
            name='messagereaction',
            table=None,
        ),
        migrations.AlterModelTable(
            name='participant',
            table=None,
        ),
    ]
