"""Move the ratings models out of client_profile: STATE ONLY.

No SQL is executed here. The tables already exist (created by the client_profile baseline migration) under their original
names; this migration only registers the models with the new app. 0002 then gives the tables clean names. The
ContentType rows are re-labelled in place so permissions, admin history and generic relations stay attached.
"""
from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


MODELS = ['rating', 'ratingreport']


def move_content_types(apps, schema_editor):
    ContentType = apps.get_model('contenttypes', 'ContentType')
    for model in MODELS:
        old = ContentType.objects.filter(app_label='client_profile', model=model).first()
        if old is not None and not ContentType.objects.filter(app_label='ratings', model=model).exists():
            old.app_label = 'ratings'
            old.save(update_fields=['app_label'])


def restore_content_types(apps, schema_editor):
    ContentType = apps.get_model('contenttypes', 'ContentType')
    for model in MODELS:
        new = ContentType.objects.filter(app_label='ratings', model=model).first()
        if new is not None and not ContentType.objects.filter(app_label='client_profile', model=model).exists():
            new.app_label = 'client_profile'
            new.save(update_fields=['app_label'])


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('client_profile', '0061_move_rewards_out'),
        ('contenttypes', '0002_remove_content_type_name'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
            migrations.CreateModel(
                name='Rating',
                fields=[
                    ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                    ('direction', models.CharField(choices=[('OWNER_TO_WORKER', 'Owner/Org/PharmacyAdmin → Worker'), ('WORKER_TO_PHARMACY', 'Worker → Pharmacy')], db_index=True, max_length=32)),
                    ('stars', models.PositiveSmallIntegerField()),
                    ('comment', models.TextField(blank=True, max_length=1000, null=True)),
                    ('created_at', models.DateTimeField(auto_now_add=True)),
                    ('updated_at', models.DateTimeField(auto_now=True)),
                    ('ratee_pharmacy', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='ratings_received', to='client_profile.pharmacy')),
                    ('ratee_user', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='ratings_received_as_worker', to=settings.AUTH_USER_MODEL)),
                    ('rater_user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='ratings_given', to=settings.AUTH_USER_MODEL)),
                ],
                options={
                    'indexes': [models.Index(fields=['direction', 'rater_user'], name='client_prof_directi_97a2f4_idx'), models.Index(fields=['direction', 'ratee_user'], name='client_prof_directi_c6efd6_idx'), models.Index(fields=['direction', 'ratee_pharmacy'], name='client_prof_directi_de7840_idx')],
                    'constraints': [models.UniqueConstraint(condition=models.Q(('direction', 'OWNER_TO_WORKER')), fields=('rater_user', 'ratee_user', 'direction'), name='uniq_owner_to_worker_per_pair'), models.UniqueConstraint(condition=models.Q(('direction', 'WORKER_TO_PHARMACY')), fields=('rater_user', 'ratee_pharmacy', 'direction'), name='uniq_worker_to_pharmacy_per_pair')],
                    'db_table': 'client_profile_rating',
                },
            ),
            migrations.CreateModel(
                name='RatingReport',
                fields=[
                    ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                    ('reason', models.TextField(max_length=2000)),
                    ('status', models.CharField(choices=[('OPEN', 'Open'), ('REVIEWED', 'Reviewed'), ('CLOSED', 'Closed')], db_index=True, default='OPEN', max_length=16)),
                    ('created_at', models.DateTimeField(auto_now_add=True)),
                    ('updated_at', models.DateTimeField(auto_now=True)),
                    ('rating', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='reports', to='ratings.rating')),
                    ('reporter', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='rating_reports_submitted', to=settings.AUTH_USER_MODEL)),
                ],
                options={
                    'ordering': ['-created_at'],
                    'indexes': [],
                    'constraints': [models.UniqueConstraint(condition=models.Q(('status', 'OPEN')), fields=('rating', 'reporter'), name='uniq_open_rating_report_per_reporter')],
                    'db_table': 'client_profile_ratingreport',
                },
            ),
            ],
            database_operations=[],
        ),
        migrations.RunPython(move_content_types, restore_content_types),
    ]
