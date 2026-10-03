"""Move the talent models out of client_profile: STATE ONLY.

No SQL is executed here. The tables already exist (created by the client_profile baseline migration) under their original
names; this migration only registers the models with the new app. 0002 then gives the tables clean names. The
ContentType rows are re-labelled in place so permissions, admin history and generic relations stay attached.
"""
from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


MODELS = ['explorerpost', 'explorerpostreaction', 'useravailability']


def move_content_types(apps, schema_editor):
    ContentType = apps.get_model('contenttypes', 'ContentType')
    for model in MODELS:
        old = ContentType.objects.filter(app_label='client_profile', model=model).first()
        if old is not None and not ContentType.objects.filter(app_label='talent', model=model).exists():
            old.app_label = 'talent'
            old.save(update_fields=['app_label'])


def restore_content_types(apps, schema_editor):
    ContentType = apps.get_model('contenttypes', 'ContentType')
    for model in MODELS:
        new = ContentType.objects.filter(app_label='talent', model=model).first()
        if new is not None and not ContentType.objects.filter(app_label='client_profile', model=model).exists():
            new.app_label = 'client_profile'
            new.save(update_fields=['app_label'])


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('client_profile', '0062_move_ratings_out'),
        ('contenttypes', '0002_remove_content_type_name'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
            migrations.CreateModel(
                name='ExplorerPost',
                fields=[
                    ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                    ('headline', models.CharField(max_length=255)),
                    ('body', models.TextField(blank=True)),
                    ('role_category', models.CharField(blank=True, choices=[('EXPLORER', 'Explorer'), ('PHARMACIST', 'Pharmacist'), ('OTHER_STAFF', 'Other Staff')], max_length=20, null=True)),
                    ('role_title', models.CharField(blank=True, max_length=120, null=True)),
                    ('work_types', models.JSONField(blank=True, default=list)),
                    ('post_kind', models.CharField(choices=[('FULL_TIME_APPLICATION', 'Full Time Application'), ('AVAILABILITY', 'Availability Post')], default='AVAILABILITY', max_length=30)),
                    ('coverage_radius_km', models.PositiveSmallIntegerField(blank=True, null=True)),
                    ('open_to_travel', models.BooleanField(default=False)),
                    ('availability_mode', models.CharField(blank=True, choices=[('FULL_TIME_NOTICE', 'Full Time Notice'), ('PART_TIME_DAYS', 'Part Time Days'), ('CASUAL_CALENDAR', 'Casual/Locum Calendar')], max_length=30, null=True)),
                    ('availability_summary', models.CharField(blank=True, max_length=255, null=True)),
                    ('availability_days', models.JSONField(blank=True, default=list)),
                    ('availability_notice', models.CharField(blank=True, max_length=50, null=True)),
                    ('location_suburb', models.CharField(blank=True, max_length=100, null=True)),
                    ('location_state', models.CharField(blank=True, max_length=50, null=True)),
                    ('location_postcode', models.CharField(blank=True, max_length=10, null=True)),
                    ('skills', models.JSONField(blank=True, default=list)),
                    ('software', models.JSONField(blank=True, default=list)),
                    ('reference_code', models.CharField(blank=True, max_length=20, null=True, unique=True)),
                    ('is_anonymous', models.BooleanField(default=True)),
                    ('view_count', models.PositiveIntegerField(default=0)),
                    ('like_count', models.PositiveIntegerField(default=0)),
                    ('reply_count', models.PositiveIntegerField(default=0)),
                    ('created_at', models.DateTimeField(auto_now_add=True)),
                    ('updated_at', models.DateTimeField(auto_now=True)),
                    ('author_user', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='talent_posts', to=settings.AUTH_USER_MODEL)),
                    ('explorer_profile', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='posts', to='client_profile.exploreronboarding')),
                ],
                options={
                    'indexes': [models.Index(fields=['-created_at'], name='client_prof_created_80bbb4_idx'), models.Index(fields=['explorer_profile', '-created_at'], name='client_prof_explore_cc31b1_idx')],
                    'constraints': [],
                    'db_table': 'client_profile_explorerpost',
                },
            ),
            migrations.CreateModel(
                name='ExplorerPostReaction',
                fields=[
                    ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                    ('created_at', models.DateTimeField(auto_now_add=True)),
                    ('post', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='reactions', to='talent.explorerpost')),
                    ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='explorer_post_reactions', to=settings.AUTH_USER_MODEL)),
                ],
                options={
                    'indexes': [models.Index(fields=['post'], name='client_prof_post_id_bd9cb2_idx'), models.Index(fields=['user'], name='client_prof_user_id_0b557f_idx')],
                    'constraints': [],
                    'unique_together': {('post', 'user')},
                    'db_table': 'client_profile_explorerpostreaction',
                },
            ),
            migrations.CreateModel(
                name='UserAvailability',
                fields=[
                    ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                    ('date', models.DateField()),
                    ('start_time', models.TimeField()),
                    ('end_time', models.TimeField()),
                    ('is_all_day', models.BooleanField(default=False)),
                    ('is_recurring', models.BooleanField(default=False)),
                    ('recurring_days', models.JSONField(blank=True, default=list)),
                    ('recurring_end_date', models.DateField(blank=True, null=True)),
                    ('notify_new_shifts', models.BooleanField(default=False, help_text='Notify this user when a public shift matches this availability.')),
                    ('notes', models.TextField(blank=True)),
                    ('created_at', models.DateTimeField(auto_now_add=True)),
                    ('updated_at', models.DateTimeField(auto_now=True)),
                    ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='user_availabilities', to=settings.AUTH_USER_MODEL)),
                ],
                options={
                    'indexes': [models.Index(fields=['user'], name='client_prof_user_id_e880ba_idx')],
                    'constraints': [],
                    'db_table': 'client_profile_useravailability',
                },
            ),
            ],
            database_operations=[],
        ),
        migrations.RunPython(move_content_types, restore_content_types),
    ]
