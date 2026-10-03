"""Move the roster models from client_profile into workforce: STATE ONLY.

No SQL is executed here. The tables already exist under their client_profile_* names (0008 gives them workforce names).
The workforce relations to the roster period (revision state, operation ledger) follow the model, and the ContentType
rows are re-labelled in place so permissions, admin history and generic relations stay attached.
"""
from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


MODELS = ['rosterperiod', 'rosterpublicationaudit', 'rosteracknowledgement', 'rostertemplate', 'rosteractionaudit']


def move_content_types(apps, schema_editor):
    ContentType = apps.get_model('contenttypes', 'ContentType')
    for model in MODELS:
        old = ContentType.objects.filter(app_label='client_profile', model=model).first()
        if old is not None and not ContentType.objects.filter(app_label='workforce', model=model).exists():
            old.app_label = 'workforce'
            old.save(update_fields=['app_label'])


def restore_content_types(apps, schema_editor):
    ContentType = apps.get_model('contenttypes', 'ContentType')
    for model in MODELS:
        new = ContentType.objects.filter(app_label='workforce', model=model).first()
        if new is not None and not ContentType.objects.filter(app_label='client_profile', model=model).exists():
            new.app_label = 'client_profile'
            new.save(update_fields=['app_label'])


class Migration(migrations.Migration):

    dependencies = [
        ('workforce', '0006_repoint_attendance_relations'),
        ('client_profile', '0069_move_attendance_out'),
        ('contenttypes', '0002_remove_content_type_name'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
            migrations.CreateModel(
                name='RosterPeriod',
                fields=[
                    ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                    ('week_start', models.DateField(help_text='Monday of the roster week (ISO weekday 1).')),
                    ('status', models.CharField(choices=[('DRAFT', 'Draft'), ('PUBLISHED', 'Published'), ('ARCHIVED', 'Archived')], default='DRAFT', max_length=12)),
                    ('published_at', models.DateTimeField(blank=True, null=True)),
                    ('created_at', models.DateTimeField(auto_now_add=True)),
                    ('updated_at', models.DateTimeField(auto_now=True)),
                    ('copied_from', models.ForeignKey(blank=True, help_text='Source period when created via copy-week.', null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='copies', to='workforce.rosterperiod')),
                    ('created_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='created_roster_periods', to=settings.AUTH_USER_MODEL)),
                    ('pharmacy', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='roster_periods', to='client_profile.pharmacy')),
                    ('published_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='published_roster_periods', to=settings.AUTH_USER_MODEL)),
                ],
                options={
                    'ordering': ['-week_start'],
                    'indexes': [models.Index(fields=['pharmacy', 'week_start'], name='client_prof_pharmac_ceea0b_idx'), models.Index(fields=['status'], name='client_prof_status_d7a61f_idx')],
                    'constraints': [],
                    'unique_together': {('pharmacy', 'week_start')},
                    'db_table': 'client_profile_rosterperiod',
                },
            ),
            migrations.CreateModel(
                name='RosterPublicationAudit',
                fields=[
                    ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                    ('published_at', models.DateTimeField(auto_now_add=True)),
                    ('revision_number', models.PositiveIntegerField(default=1)),
                    ('total_assignments', models.PositiveIntegerField(default=0)),
                    ('validation_snapshot', models.JSONField(blank=True, default=dict)),
                    ('published_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='roster_publication_audits', to=settings.AUTH_USER_MODEL)),
                    ('roster_period', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='publication_audits', to='workforce.rosterperiod')),
                ],
                options={
                    'ordering': ['-published_at', '-id'],
                    'indexes': [models.Index(fields=['roster_period', 'published_at'], name='client_prof_roster__e1eaf8_idx')],
                    'constraints': [],
                    'db_table': 'client_profile_rosterpublicationaudit',
                },
            ),
            migrations.CreateModel(
                name='RosterAcknowledgement',
                fields=[
                    ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                    ('acknowledged_at', models.DateTimeField(auto_now_add=True)),
                    ('notes', models.TextField(blank=True, default='')),
                    ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='roster_acknowledgements', to=settings.AUTH_USER_MODEL)),
                    ('roster_period', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='acknowledgements', to='workforce.rosterperiod')),
                ],
                options={
                    'indexes': [models.Index(fields=['roster_period', 'user'], name='client_prof_roster__e782ef_idx')],
                    'constraints': [],
                    'unique_together': {('roster_period', 'user')},
                    'db_table': 'client_profile_rosteracknowledgement',
                },
            ),
            migrations.CreateModel(
                name='RosterTemplate',
                fields=[
                    ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                    ('name', models.CharField(max_length=120)),
                    ('template_data', models.JSONField(default=list, help_text='Array of objects: [{day_of_week: 0-6, start_time, end_time, role, user_id?}, ...]')),
                    ('created_at', models.DateTimeField(auto_now_add=True)),
                    ('updated_at', models.DateTimeField(auto_now=True)),
                    ('created_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='created_roster_templates', to=settings.AUTH_USER_MODEL)),
                    ('pharmacy', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='roster_templates', to='client_profile.pharmacy')),
                ],
                options={
                    'indexes': [models.Index(fields=['pharmacy'], name='client_prof_pharmac_c86377_idx')],
                    'constraints': [],
                    'db_table': 'client_profile_rostertemplate',
                },
            ),
            migrations.CreateModel(
                name='RosterActionAudit',
                fields=[
                    ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                    ('action_type', models.CharField(choices=[('SWAP_REQUESTED', 'Swap Requested'), ('SWAP_APPROVED', 'Swap Approved'), ('SWAP_REJECTED', 'Swap Rejected'), ('COVER_REQUESTED', 'Cover Requested'), ('COVER_APPROVED', 'Cover Approved'), ('COVER_REJECTED', 'Cover Rejected'), ('WORKER_RELEASED', 'Worker Released'), ('LEAVE_REQUESTED', 'Leave Requested'), ('LEAVE_APPROVED', 'Leave Approved')], max_length=32)),
                    ('details', models.JSONField(blank=True, default=dict)),
                    ('created_at', models.DateTimeField(auto_now_add=True)),
                    ('performed_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='roster_actions_performed', to=settings.AUTH_USER_MODEL)),
                    ('pharmacy', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='roster_action_audits', to='client_profile.pharmacy')),
                    ('target_user', models.ForeignKey(blank=True, help_text='Target worker for swap or replacement cover.', null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='roster_actions_targeted', to=settings.AUTH_USER_MODEL)),
                    ('shift_assignment', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='roster_action_audits', to='client_profile.shiftslotassignment')),
                ],
                options={
                    'ordering': ['-created_at'],
                    'indexes': [models.Index(fields=['pharmacy', 'action_type'], name='client_prof_pharmac_59c715_idx'), models.Index(fields=['created_at'], name='client_prof_created_e1cfd4_idx')],
                    'constraints': [],
                    'db_table': 'client_profile_rosteractionaudit',
                },
            ),
                migrations.AlterField(
                    model_name='rosteroperation',
                    name='period',
                    field=models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='workforce_operations', to='workforce.rosterperiod'),
                ),
                migrations.AlterField(
                    model_name='rosterrevisionstate',
                    name='period',
                    field=models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='workforce_revision_state', to='workforce.rosterperiod'),
                ),
            ],
            database_operations=[],
        ),
        migrations.RunPython(move_content_types, restore_content_types),
    ]
