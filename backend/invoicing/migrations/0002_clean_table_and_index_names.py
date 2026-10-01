"""Give the invoicing tables and indexes clean names. This is the only DDL of the move: ALTER TABLE ... RENAME and ALTER INDEX ... RENAME (metadata operations, no data is rewritten).
It runs after client_profile released the models and every other app re-pointed its relations, so no table is renamed
while another migration still has to create a foreign key to the old table name."""
from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('invoicing', '0001_initial'),
        ('client_profile', '0068_move_invoicing_out'),
    ]

    operations = [
        migrations.RenameIndex(
            model_name='invoice',
            new_name='invoicing_i_user_id_1cca61_idx',
            old_name='client_prof_user_id_55aa0f_idx',
        ),
        migrations.RenameIndex(
            model_name='invoice',
            new_name='invoicing_i_pharmac_dd1b8e_idx',
            old_name='client_prof_pharmac_f6e784_idx',
        ),
        migrations.RenameIndex(
            model_name='invoicelineitem',
            new_name='invoicing_i_invoice_b75d1a_idx',
            old_name='client_prof_invoice_90df15_idx',
        ),
        migrations.RenameIndex(
            model_name='invoicelineitem',
            new_name='invoicing_i_shift_i_a773bf_idx',
            old_name='client_prof_shift_i_62fd31_idx',
        ),
        migrations.AlterModelTable(
            name='invoice',
            table=None,
        ),
        migrations.AlterModelTable(
            name='invoicelineitem',
            table=None,
        ),
    ]
