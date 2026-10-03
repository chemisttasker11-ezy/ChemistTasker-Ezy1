"""Move the rewards models out of client_profile: STATE ONLY.

No SQL is executed here. The tables already exist (created by the client_profile baseline migration) under their original
names; this migration only registers the models with the new app. 0002 then gives the tables clean names. The
ContentType rows are re-labelled in place so permissions, admin history and generic relations stay attached.
"""
from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


MODELS = ['pillrewardrule', 'pillreferralcode', 'pillreferralevent', 'pillledgerentry']


def move_content_types(apps, schema_editor):
    ContentType = apps.get_model('contenttypes', 'ContentType')
    for model in MODELS:
        old = ContentType.objects.filter(app_label='client_profile', model=model).first()
        if old is not None and not ContentType.objects.filter(app_label='rewards', model=model).exists():
            old.app_label = 'rewards'
            old.save(update_fields=['app_label'])


def restore_content_types(apps, schema_editor):
    ContentType = apps.get_model('contenttypes', 'ContentType')
    for model in MODELS:
        new = ContentType.objects.filter(app_label='rewards', model=model).first()
        if new is not None and not ContentType.objects.filter(app_label='client_profile', model=model).exists():
            new.app_label = 'client_profile'
            new.save(update_fields=['app_label'])


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('client_profile', '0060_owner_marketplace_identity'),
        ('worker_finance', '0006_remove_invoice_record'),
        ('contenttypes', '0002_remove_content_type_name'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
            migrations.CreateModel(
                name='PillRewardRule',
                fields=[
                    ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                    ('code', models.SlugField(max_length=80, unique=True)),
                    ('name', models.CharField(max_length=160)),
                    ('description', models.TextField(blank=True, default='')),
                    ('event_type', models.CharField(choices=[('EARN', 'Earn'), ('SPEND', 'Spend')], max_length=12)),
                    ('audience', models.CharField(choices=[('ANY', 'Any authenticated user'), ('SHIFT_POSTER', 'Shift posters'), ('WORKER', 'Workers')], default='ANY', max_length=24)),
                    ('pill_amount', models.PositiveIntegerField(help_text='Readable configurable pill amount for this rule. Spend rules deduct this many pills.')),
                    ('is_active', models.BooleanField(default=True)),
                    ('starts_at', models.DateTimeField(blank=True, null=True)),
                    ('ends_at', models.DateTimeField(blank=True, null=True)),
                    ('metadata', models.JSONField(blank=True, default=dict)),
                    ('created_at', models.DateTimeField(auto_now_add=True)),
                    ('updated_at', models.DateTimeField(auto_now=True)),
                ],
                options={
                    'ordering': ['code'],
                    'indexes': [models.Index(fields=['code'], name='client_prof_code_ec338e_idx'), models.Index(fields=['event_type', 'is_active'], name='client_prof_event_t_f7bb42_idx'), models.Index(fields=['audience', 'is_active'], name='client_prof_audienc_d7e96f_idx')],
                    'constraints': [],
                    'db_table': 'client_profile_pillrewardrule',
                },
            ),
            migrations.CreateModel(
                name='PillReferralCode',
                fields=[
                    ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                    ('code', models.CharField(db_index=True, max_length=32, unique=True)),
                    ('is_active', models.BooleanField(default=True)),
                    ('created_at', models.DateTimeField(auto_now_add=True)),
                    ('updated_at', models.DateTimeField(auto_now=True)),
                    ('user', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='pill_referral_code', to=settings.AUTH_USER_MODEL)),
                ],
                options={
                    'indexes': [models.Index(fields=['user'], name='client_prof_user_id_5fe2fc_idx'), models.Index(fields=['code', 'is_active'], name='client_prof_code_dc885c_idx')],
                    'constraints': [],
                    'db_table': 'client_profile_pillreferralcode',
                },
            ),
            migrations.CreateModel(
                name='PillReferralEvent',
                fields=[
                    ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                    ('referral_type', models.CharField(choices=[('FRIEND', 'Friend referral'), ('SHIFT', 'Shift referral')], max_length=16)),
                    ('referred_email', models.EmailField(blank=True, default='', max_length=254)),
                    ('status', models.CharField(choices=[('PENDING', 'Pending'), ('CLAIMED', 'Claimed'), ('AWARDED', 'Awarded'), ('CANCELLED', 'Cancelled')], default='PENDING', max_length=16)),
                    ('claimed_at', models.DateTimeField(blank=True, null=True)),
                    ('awarded_at', models.DateTimeField(blank=True, null=True)),
                    ('metadata', models.JSONField(blank=True, default=dict)),
                    ('created_at', models.DateTimeField(auto_now_add=True)),
                    ('updated_at', models.DateTimeField(auto_now=True)),
                    ('referral_code', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='events', to='rewards.pillreferralcode')),
                    ('referred_user', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='pill_referrals_received', to=settings.AUTH_USER_MODEL)),
                    ('referrer', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='pill_referrals_sent', to=settings.AUTH_USER_MODEL)),
                    ('shift', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='pill_referral_events', to='client_profile.shift')),
                ],
                options={
                    'indexes': [models.Index(fields=['referrer', 'referral_type'], name='client_prof_referre_f912b5_idx'), models.Index(fields=['referred_user', 'status'], name='client_prof_referre_78394f_idx'), models.Index(fields=['shift', 'referral_type'], name='client_prof_shift_i_8c79ea_idx'), models.Index(fields=['status', 'created_at'], name='client_prof_status_4a072e_idx')],
                    'constraints': [],
                    'db_table': 'client_profile_pillreferralevent',
                },
            ),
            migrations.CreateModel(
                name='PillLedgerEntry',
                fields=[
                    ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                    ('entry_type', models.CharField(choices=[('EARN', 'Earn'), ('SPEND', 'Spend'), ('ADJUSTMENT', 'Adjustment'), ('REVERSAL', 'Reversal')], max_length=16)),
                    ('source', models.CharField(choices=[('FRIEND_REFERRAL', 'Friend referral'), ('SHIFT_REFERRAL', 'Shift referral'), ('SHIFT_POST', 'Shift post'), ('PAYMENT_CREDIT', 'Payment credit'), ('MANUAL', 'Manual')], max_length=32)),
                    ('delta', models.IntegerField(help_text='Signed pill delta. Earn is positive, spend is negative.')),
                    ('balance_after', models.IntegerField()),
                    ('description', models.CharField(blank=True, default='', max_length=255)),
                    ('idempotency_key', models.CharField(db_index=True, max_length=160, unique=True)),
                    ('metadata', models.JSONField(blank=True, default=dict)),
                    ('created_at', models.DateTimeField(auto_now_add=True)),
                    ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='pill_ledger_entries', to=settings.AUTH_USER_MODEL)),
                    ('referral_event', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='ledger_entries', to='rewards.pillreferralevent')),
                    ('rule', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='ledger_entries', to='rewards.pillrewardrule')),
                    ('shift', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='pill_ledger_entries', to='client_profile.shift')),
                ],
                options={
                    'ordering': ['-created_at', '-id'],
                    'indexes': [models.Index(fields=['user', 'created_at'], name='client_prof_user_id_23b4a4_idx'), models.Index(fields=['source', 'created_at'], name='client_prof_source_af5042_idx'), models.Index(fields=['entry_type', 'created_at'], name='client_prof_entry_t_391ea2_idx')],
                    'constraints': [],
                    'db_table': 'client_profile_pillledgerentry',
                },
            ),
            ],
            database_operations=[],
        ),
        migrations.RunPython(move_content_types, restore_content_types),
    ]
