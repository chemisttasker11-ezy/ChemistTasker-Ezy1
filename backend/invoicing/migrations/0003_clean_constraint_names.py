"""Give the constraints, indexes and identity sequences of the invoicing tables the names a new database gets.

The tables were created as client_profile_* and renamed by 0002_clean_table_and_index_names;
PostgreSQL kept the names of the objects attached to them. Database only: no table, column or row changes, and
the migration state is unchanged. See core.migration_operations.RenameDatabaseNames."""
from django.db import migrations

from core.migration_operations import RenameDatabaseNames

# (kind, table, old name, new name)
RENAMES = [
    ('sequence', 'invoicing_invoice', 'client_profile_invoice_id_seq', 'invoicing_invoice_id_seq'),
    ('constraint', 'invoicing_invoice', 'client_profile_invoi_customer_id_dfb07516_fk_worker_fi', 'invoicing_invoice_customer_id_c1b6ead9_fk_worker_fi'),
    ('constraint', 'invoicing_invoice', 'client_profile_invoi_parent_id_ad29fd06_fk_client_pr', 'invoicing_invoice_parent_id_6fcbae5b_fk_invoicing_invoice_id'),
    ('constraint', 'invoicing_invoice', 'client_profile_invoi_pharmacy_id_034a3114_fk_client_pr', 'invoicing_invoice_pharmacy_id_c27ecb99_fk_client_pr'),
    ('constraint', 'invoicing_invoice', 'client_profile_invoice_parent_id_key', 'invoicing_invoice_parent_id_key'),
    ('constraint', 'invoicing_invoice', 'client_profile_invoice_pkey', 'invoicing_invoice_pkey'),
    ('constraint', 'invoicing_invoice', 'client_profile_invoice_user_id_ddf23628_fk_users_user_id', 'invoicing_invoice_user_id_64d1c7dd_fk_users_user_id'),
    ('constraint', 'invoicing_invoice', 'client_profile_invoice_version_check', 'invoicing_invoice_version_check'),
    ('index', 'invoicing_invoice', 'client_profile_invoice_customer_id_dfb07516', 'invoicing_invoice_customer_id_c1b6ead9'),
    ('index', 'invoicing_invoice', 'client_profile_invoice_pharmacy_id_034a3114', 'invoicing_invoice_pharmacy_id_c27ecb99'),
    ('index', 'invoicing_invoice', 'client_profile_invoice_user_id_ddf23628', 'invoicing_invoice_user_id_64d1c7dd'),
    ('sequence', 'invoicing_invoicelineitem', 'client_profile_invoicelineitem_id_seq', 'invoicing_invoicelineitem_id_seq'),
    ('constraint', 'invoicing_invoicelineitem', 'client_profile_invoi_invoice_id_1e398f2f_fk_client_pr', 'invoicing_invoicelin_invoice_id_90a99945_fk_invoicing'),
    ('constraint', 'invoicing_invoicelineitem', 'client_profile_invoi_shift_id_68e8345e_fk_client_pr', 'invoicing_invoicelin_shift_id_3ed17301_fk_client_pr'),
    ('constraint', 'invoicing_invoicelineitem', 'client_profile_invoi_source_assignment_id_8d22f405_fk_client_pr', 'invoicing_invoicelin_source_assignment_id_c20f6c57_fk_client_pr'),
    ('constraint', 'invoicing_invoicelineitem', 'client_profile_invoicelineitem_pkey', 'invoicing_invoicelineitem_pkey'),
    ('index', 'invoicing_invoicelineitem', 'client_profile_invoicelineitem_invoice_id_1e398f2f', 'invoicing_invoicelineitem_invoice_id_90a99945'),
    ('index', 'invoicing_invoicelineitem', 'client_profile_invoicelineitem_shift_id_68e8345e', 'invoicing_invoicelineitem_shift_id_3ed17301'),
    ('index', 'invoicing_invoicelineitem', 'client_profile_invoicelineitem_source_assignment_id_8d22f405', 'invoicing_invoicelineitem_source_assignment_id_c20f6c57'),
    # foreign keys of other apps' tables that reference these tables
    ('constraint', 'worker_finance_delivery', 'worker_finance_deliv_invoice_id_5099d393_fk_client_pr', 'worker_finance_deliv_invoice_id_5099d393_fk_invoicing'),
    ('constraint', 'worker_finance_invoicereviewrequest', 'worker_finance_invoi_invoice_id_efd1bc49_fk_client_pr', 'worker_finance_invoi_invoice_id_efd1bc49_fk_invoicing'),
    ('constraint', 'worker_finance_invoicerevision', 'worker_finance_invoi_invoice_id_04153aa8_fk_client_pr', 'worker_finance_invoi_invoice_id_04153aa8_fk_invoicing'),
    ('constraint', 'worker_finance_payment', 'worker_finance_payme_invoice_id_318769ff_fk_client_pr', 'worker_finance_payme_invoice_id_318769ff_fk_invoicing'),
]


class Migration(migrations.Migration):

    dependencies = [
        ('invoicing', '0002_clean_table_and_index_names'),
    ]

    operations = [
        RenameDatabaseNames(RENAMES),
    ]
