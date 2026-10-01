"""Move the notifications models out of client_profile: STATE ONLY.

No SQL is executed here. The tables already exist (created by the client_profile baseline migration) under their original
names; this migration only registers the models with the new app. 0002 then gives the tables clean names. The
ContentType rows are re-labelled in place so permissions, admin history and generic relations stay attached.
"""
from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


MODELS = ['notification']


def move_content_types(apps, schema_editor):
    ContentType = apps.get_model('contenttypes', 'ContentType')
    for model in MODELS:
        old = ContentType.objects.filter(app_label='client_profile', model=model).first()
        if old is not None and not ContentType.objects.filter(app_label='notifications', model=model).exists():
            old.app_label = 'notifications'
            old.save(update_fields=['app_label'])


def restore_content_types(apps, schema_editor):
    ContentType = apps.get_model('contenttypes', 'ContentType')
    for model in MODELS:
        new = ContentType.objects.filter(app_label='notifications', model=model).first()
        if new is not None and not ContentType.objects.filter(app_label='client_profile', model=model).exists():
            new.app_label = 'client_profile'
            new.save(update_fields=['app_label'])


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('client_profile', '0064_move_team_calendar_out'),
        ('contenttypes', '0002_remove_content_type_name'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
            migrations.CreateModel(
                name='Notification',
                fields=[
                    ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                    ('type', models.CharField(choices=[('task', 'Task'), ('message', 'Message'), ('alert', 'Alert'), ('work_note', 'Work Note')], default='task', max_length=32)),
                    ('title', models.CharField(max_length=255)),
                    ('body', models.TextField(blank=True)),
                    ('action_url', models.CharField(blank=True, max_length=512)),
                    ('payload', models.JSONField(blank=True, default=dict)),
                    ('read_at', models.DateTimeField(blank=True, null=True)),
                    ('created_at', models.DateTimeField(auto_now_add=True)),
                    ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='notifications', to=settings.AUTH_USER_MODEL)),
                ],
                options={
                    'ordering': ['-created_at'],
                    'indexes': [models.Index(fields=['user', 'read_at'], name='client_prof_user_id_2537cd_idx'), models.Index(fields=['user', 'created_at'], name='client_prof_user_id_ab57c4_idx')],
                    'constraints': [],
                    'db_table': 'client_profile_notification',
                },
            ),
            ],
            database_operations=[],
        ),
        migrations.RunPython(move_content_types, restore_content_types),
    ]
