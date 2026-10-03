"""Give the notifications tables and indexes clean names. This is the only DDL of the move: ALTER TABLE ... RENAME and ALTER INDEX ... RENAME (metadata operations, no data is rewritten).
It runs after client_profile released the models and every other app re-pointed its relations, so no table is renamed
while another migration still has to create a foreign key to the old table name."""
from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('notifications', '0001_initial'),
        ('client_profile', '0065_move_notifications_out'),
    ]

    operations = [
        migrations.RenameIndex(
            model_name='notification',
            new_name='notificatio_user_id_47e85c_idx',
            old_name='client_prof_user_id_2537cd_idx',
        ),
        migrations.RenameIndex(
            model_name='notification',
            new_name='notificatio_user_id_c62b26_idx',
            old_name='client_prof_user_id_ab57c4_idx',
        ),
        migrations.AlterModelTable(
            name='notification',
            table=None,
        ),
    ]
