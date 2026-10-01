"""Move the chat models out of client_profile: STATE ONLY.

No SQL is executed here. The tables already exist (created by the client_profile baseline migration) under their original
names; this migration only registers the models with the new app. 0002 then gives the tables clean names. The
ContentType rows are re-labelled in place so permissions, admin history and generic relations stay attached.
"""
from django.conf import settings
from django.db import migrations, models
import client_profile.models.common
import django.db.models.deletion


MODELS = ['message', 'conversation', 'participant', 'messagereaction']


def move_content_types(apps, schema_editor):
    ContentType = apps.get_model('contenttypes', 'ContentType')
    for model in MODELS:
        old = ContentType.objects.filter(app_label='client_profile', model=model).first()
        if old is not None and not ContentType.objects.filter(app_label='chat', model=model).exists():
            old.app_label = 'chat'
            old.save(update_fields=['app_label'])


def restore_content_types(apps, schema_editor):
    ContentType = apps.get_model('contenttypes', 'ContentType')
    for model in MODELS:
        new = ContentType.objects.filter(app_label='chat', model=model).first()
        if new is not None and not ContentType.objects.filter(app_label='client_profile', model=model).exists():
            new.app_label = 'client_profile'
            new.save(update_fields=['app_label'])


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('client_profile', '0065_move_notifications_out'),
        ('contenttypes', '0002_remove_content_type_name'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
            migrations.CreateModel(
                name='Message',
                fields=[
                    ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                    ('body', models.TextField(blank=True)),
                    ('attachment', models.FileField(blank=True, null=True, upload_to=client_profile.models.common.chat_upload_path)),
                    ('attachment_filename', models.CharField(blank=True, max_length=255, null=True)),
                    ('created_at', models.DateTimeField(auto_now_add=True)),
                    ('is_deleted', models.BooleanField(default=False)),
                    ('is_edited', models.BooleanField(default=False)),
                    ('original_body', models.TextField(blank=True, help_text='Stores the original message body before an edit.', null=True)),
                    ('conversation', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='messages', to='chat.conversation')),
                    ('sender', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='sent_messages', to='client_profile.membership')),
                ],
                options={
                    'ordering': ['created_at'],
                    'indexes': [models.Index(fields=['conversation', 'created_at'], name='client_prof_convers_3300e2_idx'), models.Index(fields=['sender'], name='client_prof_sender__c0e43d_idx'), models.Index(fields=['conversation', 'id'], name='client_prof_convers_57cca8_idx')],
                    'constraints': [],
                    'db_table': 'client_profile_message',
                },
            ),
            migrations.CreateModel(
                name='Conversation',
                fields=[
                    ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                    ('type', models.CharField(choices=[('GROUP', 'Group'), ('DM', 'Direct')], default='GROUP', max_length=8)),
                    ('title', models.CharField(blank=True, max_length=255)),
                    ('dm_key', models.CharField(blank=True, db_index=True, max_length=63)),
                    ('created_at', models.DateTimeField(auto_now_add=True)),
                    ('updated_at', models.DateTimeField(auto_now=True)),
                    ('created_by', models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='created_conversations', to=settings.AUTH_USER_MODEL)),
                    ('pinned_message', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='+', to='chat.message')),
                    ('pharmacy', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='group_conversations', to='client_profile.pharmacy')),
                ],
                options={
                    'indexes': [models.Index(fields=['created_by', 'updated_at'], name='client_prof_created_886564_idx'), models.Index(fields=['updated_at'], name='client_prof_updated_6ccea6_idx'), models.Index(fields=['pharmacy'], name='client_prof_pharmac_16fdb4_idx'), models.Index(fields=['dm_key'], name='client_prof_dm_key_26c86a_idx')],
                    'constraints': [models.UniqueConstraint(condition=models.Q(('pharmacy__isnull', False)), fields=('pharmacy',), name='uniq_community_chat_per_pharmacy'), models.UniqueConstraint(condition=models.Q(('dm_key', ''), _negated=True), fields=('dm_key',), name='uniq_dm_per_user_pair')],
                    'db_table': 'client_profile_conversation',
                },
            ),
            migrations.CreateModel(
                name='Participant',
                fields=[
                    ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                    ('is_admin', models.BooleanField(default=False)),
                    ('joined_at', models.DateTimeField(auto_now_add=True)),
                    ('last_read_at', models.DateTimeField(blank=True, null=True)),
                    ('is_pinned', models.BooleanField(default=False)),
                    ('conversation', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='participants', to='chat.conversation')),
                    ('membership', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='chat_participations', to='client_profile.membership')),
                    ('pinned_message', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='pinned_by_participants', to='chat.message')),
                ],
                options={
                    'indexes': [models.Index(fields=['conversation'], name='client_prof_convers_e7c34a_idx'), models.Index(fields=['membership'], name='client_prof_members_7e6b9f_idx')],
                    'constraints': [],
                    'unique_together': {('conversation', 'membership')},
                    'db_table': 'client_profile_participant',
                },
            ),
            migrations.CreateModel(
                name='MessageReaction',
                fields=[
                    ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                    ('reaction', models.CharField(choices=[('👍', 'Thumbs Up'), ('❤️', 'Heart'), ('🔥', 'Fire'), ('💩', 'Poop')], max_length=4)),
                    ('created_at', models.DateTimeField(auto_now_add=True)),
                    ('message', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='reactions', to='chat.message')),
                    ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='message_reactions', to=settings.AUTH_USER_MODEL)),
                ],
                options={
                    'ordering': ['created_at'],
                    'indexes': [],
                    'constraints': [],
                    'unique_together': {('message', 'user', 'reaction')},
                    'db_table': 'client_profile_messagereaction',
                },
            ),
            ],
            database_operations=[],
        ),
        migrations.RunPython(move_content_types, restore_content_types),
    ]
