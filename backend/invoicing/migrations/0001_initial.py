"""Move the invoicing models out of client_profile: STATE ONLY.

No SQL is executed here. The tables already exist (created by the client_profile baseline migration) under their original
names; this migration only registers the models with the new app. 0002 then gives the tables clean names. The
ContentType rows are re-labelled in place so permissions, admin history and generic relations stay attached.
"""
from django.conf import settings
from django.db import migrations, models
import datetime
import django.db.models.deletion


MODELS = ['invoice', 'invoicelineitem']


def move_content_types(apps, schema_editor):
    ContentType = apps.get_model('contenttypes', 'ContentType')
    for model in MODELS:
        old = ContentType.objects.filter(app_label='client_profile', model=model).first()
        if old is not None and not ContentType.objects.filter(app_label='invoicing', model=model).exists():
            old.app_label = 'invoicing'
            old.save(update_fields=['app_label'])


def restore_content_types(apps, schema_editor):
    ContentType = apps.get_model('contenttypes', 'ContentType')
    for model in MODELS:
        new = ContentType.objects.filter(app_label='invoicing', model=model).first()
        if new is not None and not ContentType.objects.filter(app_label='client_profile', model=model).exists():
            new.app_label = 'client_profile'
            new.save(update_fields=['app_label'])


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('client_profile', '0067_move_pharmacy_hub_out'),
        ('contenttypes', '0002_remove_content_type_name'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
            migrations.CreateModel(
                name='Invoice',
                fields=[
                    ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                    ('pharmacy_name_snapshot', models.CharField(blank=True, default='', max_length=255)),
                    ('pharmacy_address_snapshot', models.TextField(blank=True, default='')),
                    ('pharmacy_abn_snapshot', models.CharField(blank=True, default='', max_length=20)),
                    ('external', models.BooleanField(default=False)),
                    ('custom_bill_to_name', models.CharField(blank=True, max_length=255)),
                    ('custom_bill_to_address', models.TextField(blank=True)),
                    ('issuer_first_name', models.CharField(blank=True, default='', max_length=150)),
                    ('issuer_last_name', models.CharField(blank=True, default='', max_length=150)),
                    ('issuer_abn', models.CharField(blank=True, default='', max_length=20)),
                    ('issuer_email', models.EmailField(blank=True, default='', max_length=254)),
                    ('gst_registered', models.BooleanField(default=False)),
                    ('super_rate_snapshot', models.DecimalField(decimal_places=2, default=12.0, max_digits=5)),
                    ('bill_to_first_name', models.CharField(blank=True, default='', max_length=150)),
                    ('bill_to_last_name', models.CharField(blank=True, default='', max_length=150)),
                    ('bill_to_abn', models.CharField(blank=True, default='', max_length=20)),
                    ('bank_account_name', models.CharField(blank=True, default='', max_length=255)),
                    ('bsb', models.CharField(blank=True, default='', max_length=6)),
                    ('account_number', models.CharField(blank=True, default='', max_length=20)),
                    ('super_fund_name', models.CharField(blank=True, default='', max_length=255)),
                    ('super_usi', models.CharField(blank=True, default='', max_length=50)),
                    ('super_member_number', models.CharField(blank=True, default='', max_length=50)),
                    ('bill_to_email', models.EmailField(blank=True, default='', max_length=254)),
                    ('cc_emails', models.TextField(blank=True, default='', help_text='Comma-separated emails for CC')),
                    ('invoice_date', models.DateField(default=datetime.date.today)),
                    ('due_date', models.DateField(blank=True, null=True)),
                    ('subtotal', models.DecimalField(decimal_places=2, default=0, max_digits=10)),
                    ('gst_amount', models.DecimalField(decimal_places=2, default=0, max_digits=10)),
                    ('super_amount', models.DecimalField(decimal_places=2, default=0, max_digits=10)),
                    ('total', models.DecimalField(decimal_places=2, default=0, max_digits=10)),
                    ('status', models.CharField(choices=[('draft', 'Draft'), ('sent', 'Sent'), ('paid', 'Paid')], default='draft', max_length=10)),
                    ('created_at', models.DateTimeField(auto_now_add=True)),
                    ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='invoices', to=settings.AUTH_USER_MODEL)),
                    ('pharmacy', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='invoices', to='client_profile.pharmacy')),
                    ('source_snapshot', models.JSONField(blank=True, default=dict)),
                    ('calculation', models.JSONField(blank=True, default=dict)),
                    ('customer', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.RESTRICT, related_name='invoices', to='worker_finance.customer')),
                    ('kind', models.CharField(default='invoice', max_length=16)),
                    ('last_review_note', models.TextField(blank=True, default='')),
                    ('last_reviewed_at', models.DateTimeField(blank=True, null=True)),
                    ('legacy_snapshot', models.BooleanField(default=False)),
                    ('locked_at', models.DateTimeField(blank=True, null=True)),
                    ('parent', models.OneToOneField(blank=True, null=True, on_delete=django.db.models.deletion.RESTRICT, related_name='super_document', to='invoicing.invoice')),
                    ('payload', models.JSONField(blank=True, default=dict)),
                    ('request_key', models.UUIDField(blank=True, null=True)),
                    ('review_status', models.CharField(choices=[('NONE', 'No owner review decision'), ('APPROVED_FOR_PAYMENT', 'Approved for payment'), ('REVISION_REQUESTED', 'Revision requested')], default='NONE', max_length=32)),
                    ('source', models.CharField(default='external', max_length=16)),
                    ('updated_at', models.DateTimeField(auto_now=True)),
                    ('version', models.PositiveIntegerField(default=1)),
                    ('voided_at', models.DateTimeField(blank=True, null=True)),
                ],
                options={
                    'indexes': [models.Index(fields=['user'], name='client_prof_user_id_55aa0f_idx'), models.Index(fields=['pharmacy'], name='client_prof_pharmac_f6e784_idx')],
                    'constraints': [models.UniqueConstraint(condition=models.Q(('request_key__isnull', False)), fields=('user', 'request_key'), name='invoice_user_request_key')],
                    'ordering': ['-created_at', '-id'],
                    'db_table': 'client_profile_invoice',
                },
            ),
            migrations.CreateModel(
                name='InvoiceLineItem',
                fields=[
                    ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                    ('description', models.CharField(max_length=255)),
                    ('category_code', models.CharField(choices=[('ProfessionalServices', 'Professional services'), ('Superannuation', 'Superannuation'), ('Transportation', 'Travel expenses'), ('Accommodation', 'Accommodation'), ('Miscellaneous', 'Miscellaneous reimbursements')], default='ProfessionalServices', help_text='ATO category code', max_length=20)),
                    ('unit', models.CharField(choices=[('Hours', 'Hours'), ('Lump Sum', 'Lump Sum')], default='Hours', help_text='Unit of measure', max_length=50)),
                    ('quantity', models.DecimalField(decimal_places=2, max_digits=6)),
                    ('unit_price', models.DecimalField(decimal_places=2, max_digits=10)),
                    ('discount', models.DecimalField(decimal_places=2, default=0, help_text='Discount percentage', max_digits=5)),
                    ('total', models.DecimalField(decimal_places=2, max_digits=10)),
                    ('gst_applicable', models.BooleanField(default=True)),
                    ('super_applicable', models.BooleanField(default=True)),
                    ('is_manual', models.BooleanField(default=False)),
                    ('was_modified', models.BooleanField(default=False)),
                    ('invoice', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='line_items', to='invoicing.invoice')),
                    ('shift', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='invoice_items', to='client_profile.shift')),
                    ('source_assignment', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='invoice_line_items', to='client_profile.shiftslotassignment')),
                ],
                options={
                    'indexes': [models.Index(fields=['invoice'], name='client_prof_invoice_90df15_idx'), models.Index(fields=['shift'], name='client_prof_shift_i_62fd31_idx')],
                    'constraints': [models.UniqueConstraint(condition=models.Q(('category_code', 'ProfessionalServices'), ('source_assignment__isnull', False)), fields=('source_assignment',), name='uniq_professional_invoice_assignment')],
                    'db_table': 'client_profile_invoicelineitem',
                },
            ),
            ],
            database_operations=[],
        ),
        migrations.RunPython(move_content_types, restore_content_types),
    ]
