"""Move the team_calendar models out of client_profile: STATE ONLY.

No SQL is executed here. The tables already exist (created by the client_profile baseline migration) under their original
names; this migration only registers the models with the new app. 0002 then gives the tables clean names. The
ContentType rows are re-labelled in place so permissions, admin history and generic relations stay attached.
"""
from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


MODELS = ['calendarevent', 'worknote', 'worknoteassignee', 'worknotecompletion']


def move_content_types(apps, schema_editor):
    ContentType = apps.get_model('contenttypes', 'ContentType')
    for model in MODELS:
        old = ContentType.objects.filter(app_label='client_profile', model=model).first()
        if old is not None and not ContentType.objects.filter(app_label='team_calendar', model=model).exists():
            old.app_label = 'team_calendar'
            old.save(update_fields=['app_label'])


def restore_content_types(apps, schema_editor):
    ContentType = apps.get_model('contenttypes', 'ContentType')
    for model in MODELS:
        new = ContentType.objects.filter(app_label='team_calendar', model=model).first()
        if new is not None and not ContentType.objects.filter(app_label='client_profile', model=model).exists():
            new.app_label = 'client_profile'
            new.save(update_fields=['app_label'])


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('client_profile', '0063_move_talent_out'),
        ('contenttypes', '0002_remove_content_type_name'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
            migrations.CreateModel(
                name='CalendarEvent',
                fields=[
                    ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                    ('title', models.CharField(max_length=255)),
                    ('description', models.TextField(blank=True)),
                    ('date', models.DateField(db_index=True)),
                    ('start_time', models.TimeField(blank=True, null=True)),
                    ('end_time', models.TimeField(blank=True, null=True)),
                    ('all_day', models.BooleanField(default=True)),
                    ('source', models.CharField(choices=[('manual', 'Manual'), ('birthday', 'Birthday'), ('shift', 'Shift'), ('org_event', 'Organization Event')], default='manual', max_length=20)),
                    ('recurrence', models.JSONField(blank=True, help_text="Recurrence rule: {'freq': 'DAILY|WEEKLY|MONTHLY', 'interval': int, 'until_date': 'YYYY-MM-DD', 'byweekday': [0-6]}", null=True)),
                    ('created_at', models.DateTimeField(auto_now_add=True)),
                    ('updated_at', models.DateTimeField(auto_now=True)),
                    ('created_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='created_calendar_events', to=settings.AUTH_USER_MODEL)),
                    ('source_membership', models.ForeignKey(blank=True, help_text='For birthday events: the membership whose DOB generated this event', null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='birthday_events', to='client_profile.membership')),
                    ('organization', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='calendar_events', to='client_profile.organization')),
                    ('pharmacy', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='calendar_events', to='client_profile.pharmacy')),
                ],
                options={
                    'indexes': [models.Index(fields=['pharmacy', 'date'], name='client_prof_pharmac_fdbdd1_idx'), models.Index(fields=['organization', 'date'], name='client_prof_organiz_9ff239_idx'), models.Index(fields=['source', 'date'], name='client_prof_source_c3c076_idx')],
                    'constraints': [models.UniqueConstraint(condition=models.Q(('source', 'birthday')), fields=('source_membership', 'date', 'source'), name='unique_birthday_event')],
                    'db_table': 'client_profile_calendarevent',
                },
            ),
            migrations.CreateModel(
                name='WorkNote',
                fields=[
                    ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                    ('date', models.DateField(db_index=True)),
                    ('title', models.CharField(max_length=255)),
                    ('body', models.TextField(blank=True)),
                    ('status', models.CharField(choices=[('open', 'Open'), ('in_progress', 'In Progress'), ('done', 'Done')], default='open', max_length=20)),
                    ('notify_on_shift_start', models.BooleanField(default=False, help_text="Send notification when assigned staff's shift starts")),
                    ('recurrence', models.JSONField(blank=True, help_text="Recurrence rule: {'freq': 'DAILY|WEEKLY|MONTHLY', 'interval': int, 'until_date': 'YYYY-MM-DD', 'byweekday': [0-6]}", null=True)),
                    ('is_general', models.BooleanField(default=False, help_text='If true, this note applies to all pharmacy staff')),
                    ('created_at', models.DateTimeField(auto_now_add=True)),
                    ('updated_at', models.DateTimeField(auto_now=True)),
                    ('created_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='created_work_notes', to=settings.AUTH_USER_MODEL)),
                    ('pharmacy', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='work_notes', to='client_profile.pharmacy')),
                ],
                options={
                    'ordering': ['-date', '-created_at'],
                    'indexes': [models.Index(fields=['pharmacy', 'date'], name='client_prof_pharmac_6dcb3d_idx'), models.Index(fields=['pharmacy', 'status'], name='client_prof_pharmac_0ae5e5_idx'), models.Index(fields=['date', 'notify_on_shift_start'], name='client_prof_date_13053a_idx')],
                    'constraints': [],
                    'db_table': 'client_profile_worknote',
                },
            ),
            migrations.CreateModel(
                name='WorkNoteAssignee',
                fields=[
                    ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                    ('notified_at', models.DateTimeField(blank=True, help_text='When shift-start notification was sent', null=True)),
                    ('created_at', models.DateTimeField(auto_now_add=True)),
                    ('membership', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='assigned_work_notes', to='client_profile.membership')),
                    ('work_note', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='assignees', to='team_calendar.worknote')),
                ],
                options={
                    'indexes': [models.Index(fields=['membership'], name='client_prof_members_1bb3a1_idx'), models.Index(fields=['work_note'], name='client_prof_work_no_eb54a2_idx')],
                    'constraints': [],
                    'unique_together': {('work_note', 'membership')},
                    'db_table': 'client_profile_worknoteassignee',
                },
            ),
            migrations.CreateModel(
                name='WorkNoteCompletion',
                fields=[
                    ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                    ('occurrence_date', models.DateField(db_index=True)),
                    ('completed_at', models.DateTimeField(auto_now_add=True)),
                    ('completed_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='completed_work_notes', to=settings.AUTH_USER_MODEL)),
                    ('membership', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='work_note_completions', to='client_profile.membership')),
                    ('work_note', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='completions', to='team_calendar.worknote')),
                ],
                options={
                    'indexes': [models.Index(fields=['work_note', 'occurrence_date'], name='client_prof_work_no_ebc9d8_idx'), models.Index(fields=['membership', 'occurrence_date'], name='client_prof_members_d368bd_idx')],
                    'constraints': [],
                    'unique_together': {('work_note', 'membership', 'occurrence_date')},
                    'db_table': 'client_profile_worknotecompletion',
                },
            ),
            ],
            database_operations=[],
        ),
        migrations.RunPython(move_content_types, restore_content_types),
    ]
