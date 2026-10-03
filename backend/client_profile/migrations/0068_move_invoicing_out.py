"""Remove the invoicing models from client_profile's migration state: STATE ONLY, no SQL runs.
They live on in the 'invoicing' app (see invoicing.0001_initial); the tables are untouched here."""
from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('client_profile', '0067_move_pharmacy_hub_out'),
        ('invoicing', '0001_initial'),
        ('worker_finance', '0007_repoint_invoicing_relations'),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.DeleteModel(name='InvoiceLineItem'),
                migrations.DeleteModel(name='Invoice'),
            ],
            database_operations=[],
        ),
    ]
