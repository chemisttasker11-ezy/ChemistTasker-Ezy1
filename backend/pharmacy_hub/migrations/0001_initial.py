"""Move the pharmacy_hub models out of client_profile: STATE ONLY.

No SQL is executed here. The tables already exist (created by the client_profile baseline migration) under their original
names; this migration only registers the models with the new app. 0002 then gives the tables clean names. The
ContentType rows are re-labelled in place so permissions, admin history and generic relations stay attached.
"""
from django.conf import settings
from django.db import migrations, models
import client_profile.models.common
import django.db.models.deletion


MODELS = ['pharmacycommunitygroup', 'pharmacycommunitygroupmembership', 'pharmacyhubpost', 'pharmacyhubpostmention', 'pharmacyhubcomment', 'pharmacyhubcommentreaction', 'pharmacyhubreaction', 'pharmacyhubattachment', 'pharmacyhubpoll', 'pharmacyhubpolloption', 'pharmacyhubpollvote', 'pharmacyhubpollcomment', 'pharmacyhubpollreaction']


def move_content_types(apps, schema_editor):
    ContentType = apps.get_model('contenttypes', 'ContentType')
    for model in MODELS:
        old = ContentType.objects.filter(app_label='client_profile', model=model).first()
        if old is not None and not ContentType.objects.filter(app_label='pharmacy_hub', model=model).exists():
            old.app_label = 'pharmacy_hub'
            old.save(update_fields=['app_label'])


def restore_content_types(apps, schema_editor):
    ContentType = apps.get_model('contenttypes', 'ContentType')
    for model in MODELS:
        new = ContentType.objects.filter(app_label='pharmacy_hub', model=model).first()
        if new is not None and not ContentType.objects.filter(app_label='client_profile', model=model).exists():
            new.app_label = 'client_profile'
            new.save(update_fields=['app_label'])


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('client_profile', '0066_move_chat_out'),
        ('contenttypes', '0002_remove_content_type_name'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
            migrations.CreateModel(
                name='PharmacyCommunityGroup',
                fields=[
                    ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                    ('name', models.CharField(max_length=255)),
                    ('description', models.TextField(blank=True)),
                    ('created_at', models.DateTimeField(auto_now_add=True)),
                    ('updated_at', models.DateTimeField(auto_now=True)),
                    ('created_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='created_community_groups', to=settings.AUTH_USER_MODEL)),
                    ('pharmacy', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='community_groups', to='client_profile.pharmacy')),
                ],
                options={
                    'ordering': ['name'],
                    'indexes': [models.Index(fields=['pharmacy', 'name'], name='client_prof_pharmac_cf3cf1_idx'), models.Index(fields=['pharmacy', 'created_at'], name='client_prof_pharmac_05129b_idx')],
                    'constraints': [models.UniqueConstraint(fields=('pharmacy', 'name'), name='uniq_group_name_per_pharmacy')],
                    'db_table': 'client_profile_pharmacycommunitygroup',
                },
            ),
            migrations.CreateModel(
                name='PharmacyCommunityGroupMembership',
                fields=[
                    ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                    ('is_admin', models.BooleanField(default=False)),
                    ('joined_at', models.DateTimeField(auto_now_add=True)),
                    ('group', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='memberships', to='pharmacy_hub.pharmacycommunitygroup')),
                    ('membership', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='community_group_memberships', to='client_profile.membership')),
                ],
                options={
                    'indexes': [models.Index(fields=['group'], name='client_prof_group_i_2edaf5_idx'), models.Index(fields=['membership'], name='client_prof_members_4c6c93_idx')],
                    'constraints': [],
                    'unique_together': {('group', 'membership')},
                    'db_table': 'client_profile_pharmacycommunitygroupmembership',
                },
            ),
            migrations.CreateModel(
                name='PharmacyHubPost',
                fields=[
                    ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                    ('body', models.TextField()),
                    ('visibility', models.CharField(choices=[('NORMAL', 'Normal'), ('ANNOUNCEMENT', 'Announcement')], default='NORMAL', max_length=16)),
                    ('allow_comments', models.BooleanField(default=True)),
                    ('created_at', models.DateTimeField(auto_now_add=True)),
                    ('updated_at', models.DateTimeField(auto_now=True)),
                    ('deleted_at', models.DateTimeField(blank=True, null=True)),
                    ('platform_hub', models.CharField(blank=True, choices=[('public', 'Public Hub'), ('owner', 'Owner Hub'), ('pharmacist', 'Pharmacists Hub'), ('intern', 'Interns Hub'), ('staff', 'Staff Hub'), ('explorer', 'Explorer Hub')], db_index=True, max_length=32, null=True)),
                    ('is_pinned', models.BooleanField(default=False)),
                    ('pinned_at', models.DateTimeField(blank=True, null=True)),
                    ('comment_count', models.PositiveIntegerField(default=0)),
                    ('reaction_summary', models.JSONField(blank=True, default=dict)),
                    ('original_body', models.TextField(blank=True, default='')),
                    ('is_edited', models.BooleanField(default=False)),
                    ('last_edited_at', models.DateTimeField(blank=True, null=True)),
                    ('author_membership', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, to='client_profile.membership')),
                    ('author_user', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='pharmacy_hub_posts', to=settings.AUTH_USER_MODEL)),
                    ('community_group', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='hub_posts', to='pharmacy_hub.pharmacycommunitygroup')),
                    ('last_edited_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='edited_pharmacy_hub_posts', to=settings.AUTH_USER_MODEL)),
                    ('organization', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='hub_posts', to='client_profile.organization')),
                    ('pharmacy', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='hub_posts', to='client_profile.pharmacy')),
                    ('pinned_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='pinned_pharmacy_hub_posts', to=settings.AUTH_USER_MODEL)),
                    ('tagged_members', models.ManyToManyField(blank=True, related_name='tagged_pharmacy_hub_posts', through='pharmacy_hub.PharmacyHubPostMention', to='client_profile.membership')),
                ],
                options={
                    'db_table': 'client_profile_pharmacyhubpost',
                    'ordering': ['-is_pinned', '-pinned_at', '-created_at'],
                    'indexes': [models.Index(fields=['pharmacy', 'created_at'], name='client_prof_pharmac_340346_idx'), models.Index(fields=['author_membership'], name='client_prof_author__672887_idx'), models.Index(fields=['author_user'], name='client_prof_author__65b010_idx'), models.Index(fields=['is_pinned', 'pinned_at'], name='client_prof_is_pinn_5b7054_idx'), models.Index(fields=['organization', 'created_at'], name='client_prof_organiz_46a670_idx'), models.Index(fields=['community_group', 'created_at'], name='client_prof_communi_ebfaa9_idx'), models.Index(fields=['platform_hub', 'created_at'], name='client_prof_platfor_0a35e1_idx')],
                    'constraints': [models.CheckConstraint(condition=models.Q(models.Q(('community_group__isnull', True), ('organization__isnull', True), ('pharmacy__isnull', True), ('platform_hub__isnull', False)), models.Q(('community_group__isnull', False), ('organization__isnull', True), ('pharmacy__isnull', False), ('platform_hub__isnull', True)), models.Q(('community_group__isnull', True), ('organization__isnull', True), ('pharmacy__isnull', False), ('platform_hub__isnull', True)), models.Q(('community_group__isnull', True), ('organization__isnull', False), ('pharmacy__isnull', True), ('platform_hub__isnull', True)), _connector='OR'), name='pharmacy_hub_post_scope_check')],
                },
            ),
            migrations.CreateModel(
                name='PharmacyHubPostMention',
                fields=[
                    ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                    ('created_at', models.DateTimeField(auto_now_add=True)),
                    ('membership', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='hub_post_mentions', to='client_profile.membership')),
                    ('post', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='mentions', to='pharmacy_hub.pharmacyhubpost')),
                ],
                options={
                    'db_table': 'client_profile_pharmacyhubpostmention',
                    'indexes': [],
                    'constraints': [],
                    'unique_together': {('post', 'membership')},
                },
            ),
            migrations.CreateModel(
                name='PharmacyHubComment',
                fields=[
                    ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                    ('body', models.TextField()),
                    ('reaction_summary', models.JSONField(blank=True, default=dict)),
                    ('created_at', models.DateTimeField(auto_now_add=True)),
                    ('updated_at', models.DateTimeField(auto_now=True)),
                    ('deleted_at', models.DateTimeField(blank=True, null=True)),
                    ('original_body', models.TextField(blank=True, default='')),
                    ('is_edited', models.BooleanField(default=False)),
                    ('last_edited_at', models.DateTimeField(blank=True, null=True)),
                    ('author_membership', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, to='client_profile.membership')),
                    ('author_user', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='hub_comments', to=settings.AUTH_USER_MODEL)),
                    ('last_edited_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='edited_pharmacy_hub_comments', to=settings.AUTH_USER_MODEL)),
                    ('parent_comment', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='replies', to='pharmacy_hub.pharmacyhubcomment')),
                    ('post', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='comments', to='pharmacy_hub.pharmacyhubpost')),
                ],
                options={
                    'ordering': ['created_at'],
                    'indexes': [models.Index(fields=['post', 'created_at'], name='client_prof_post_id_0f34d2_idx'), models.Index(fields=['author_membership'], name='client_prof_author__3092e0_idx'), models.Index(fields=['author_user'], name='client_prof_author__e72fe1_idx')],
                    'constraints': [models.CheckConstraint(condition=models.Q(('author_membership__isnull', False), ('author_user__isnull', False), _connector='OR'), name='hub_comment_has_author_membership_or_user')],
                    'db_table': 'client_profile_pharmacyhubcomment',
                },
            ),
            migrations.CreateModel(
                name='PharmacyHubCommentReaction',
                fields=[
                    ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                    ('reaction_type', models.CharField(choices=[('LIKE', 'Like'), ('CELEBRATE', 'Celebrate'), ('SUPPORT', 'Support'), ('INSIGHTFUL', 'Insightful'), ('LOVE', 'Love')], default='LIKE', max_length=16)),
                    ('created_at', models.DateTimeField(auto_now_add=True)),
                    ('updated_at', models.DateTimeField(auto_now=True)),
                    ('comment', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='reactions', to='pharmacy_hub.pharmacyhubcomment')),
                    ('member', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='hub_comment_reactions', to='client_profile.membership')),
                    ('user', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='hub_comment_reactions', to=settings.AUTH_USER_MODEL)),
                ],
                options={
                    'indexes': [models.Index(fields=['comment'], name='client_prof_comment_fb9876_idx'), models.Index(fields=['member'], name='client_prof_member__e862a5_idx'), models.Index(fields=['user'], name='client_prof_user_id_07f548_idx')],
                    'constraints': [models.UniqueConstraint(condition=models.Q(('member__isnull', False)), fields=('comment', 'member'), name='unique_hub_comment_reaction_member'), models.UniqueConstraint(condition=models.Q(('user__isnull', False)), fields=('comment', 'user'), name='unique_hub_comment_reaction_user'), models.CheckConstraint(condition=models.Q(models.Q(('member__isnull', False), ('user__isnull', True)), models.Q(('member__isnull', True), ('user__isnull', False)), _connector='OR'), name='hub_comment_reaction_member_xor_user')],
                    'db_table': 'client_profile_pharmacyhubcommentreaction',
                },
            ),
            migrations.CreateModel(
                name='PharmacyHubReaction',
                fields=[
                    ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                    ('reaction_type', models.CharField(choices=[('LIKE', 'Like'), ('CELEBRATE', 'Celebrate'), ('SUPPORT', 'Support'), ('INSIGHTFUL', 'Insightful'), ('LOVE', 'Love')], default='LIKE', max_length=16)),
                    ('created_at', models.DateTimeField(auto_now_add=True)),
                    ('updated_at', models.DateTimeField(auto_now=True)),
                    ('member', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='hub_reactions', to='client_profile.membership')),
                    ('post', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='reactions', to='pharmacy_hub.pharmacyhubpost')),
                    ('user', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='hub_reactions', to=settings.AUTH_USER_MODEL)),
                ],
                options={
                    'indexes': [models.Index(fields=['post'], name='client_prof_post_id_282d78_idx'), models.Index(fields=['member'], name='client_prof_member__e0f1e3_idx'), models.Index(fields=['user'], name='client_prof_user_id_ea00ba_idx')],
                    'constraints': [models.UniqueConstraint(condition=models.Q(('member__isnull', False)), fields=('post', 'member'), name='unique_hub_post_reaction_member'), models.UniqueConstraint(condition=models.Q(('user__isnull', False)), fields=('post', 'user'), name='unique_hub_post_reaction_user'), models.CheckConstraint(condition=models.Q(models.Q(('member__isnull', False), ('user__isnull', True)), models.Q(('member__isnull', True), ('user__isnull', False)), _connector='OR'), name='hub_post_reaction_member_xor_user')],
                    'db_table': 'client_profile_pharmacyhubreaction',
                },
            ),
            migrations.CreateModel(
                name='PharmacyHubAttachment',
                fields=[
                    ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                    ('file', models.FileField(upload_to=client_profile.models.common.hub_attachment_upload_path)),
                    ('kind', models.CharField(choices=[('IMAGE', 'Image'), ('GIF', 'GIF'), ('FILE', 'File')], default='FILE', max_length=10)),
                    ('uploaded_at', models.DateTimeField(auto_now_add=True)),
                    ('post', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='attachments', to='pharmacy_hub.pharmacyhubpost')),
                ],
                options={
                    'indexes': [models.Index(fields=['post'], name='client_prof_post_id_c122a1_idx'), models.Index(fields=['kind'], name='client_prof_kind_62891d_idx')],
                    'constraints': [],
                    'db_table': 'client_profile_pharmacyhubattachment',
                },
            ),
            migrations.CreateModel(
                name='PharmacyHubPoll',
                fields=[
                    ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                    ('platform_hub', models.CharField(blank=True, choices=[('public', 'Public Hub'), ('owner', 'Owner Hub'), ('pharmacist', 'Pharmacists Hub'), ('intern', 'Interns Hub'), ('staff', 'Staff Hub'), ('explorer', 'Explorer Hub')], db_index=True, max_length=32, null=True)),
                    ('question', models.CharField(max_length=500)),
                    ('created_at', models.DateTimeField(auto_now_add=True)),
                    ('updated_at', models.DateTimeField(auto_now=True)),
                    ('closes_at', models.DateTimeField(blank=True, null=True)),
                    ('is_closed', models.BooleanField(default=False)),
                    ('comment_count', models.PositiveIntegerField(default=0)),
                    ('reaction_summary', models.JSONField(blank=True, default=dict)),
                    ('community_group', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='hub_polls', to='pharmacy_hub.pharmacycommunitygroup')),
                    ('created_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='created_hub_polls', to=settings.AUTH_USER_MODEL)),
                    ('created_by_membership', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='created_hub_polls', to='client_profile.membership')),
                    ('organization', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='hub_polls', to='client_profile.organization')),
                    ('pharmacy', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='hub_polls', to='client_profile.pharmacy')),
                ],
                options={
                    'ordering': ['-created_at'],
                    'indexes': [models.Index(fields=['pharmacy', 'created_at'], name='client_prof_pharmac_44d263_idx'), models.Index(fields=['organization', 'created_at'], name='client_prof_organiz_b406b8_idx'), models.Index(fields=['community_group', 'created_at'], name='client_prof_communi_63c2d0_idx'), models.Index(fields=['platform_hub', 'created_at'], name='client_prof_platfor_f17bc7_idx'), models.Index(fields=['is_closed', 'closes_at'], name='client_prof_is_clos_d7deb0_idx'), models.Index(fields=['created_by'], name='client_prof_created_fb5af6_idx'), models.Index(fields=['created_by_membership'], name='client_prof_created_601c8b_idx')],
                    'constraints': [models.CheckConstraint(condition=models.Q(models.Q(('community_group__isnull', True), ('organization__isnull', True), ('pharmacy__isnull', True), ('platform_hub__isnull', False)), models.Q(('community_group__isnull', False), ('organization__isnull', True), ('pharmacy__isnull', False), ('platform_hub__isnull', True)), models.Q(('community_group__isnull', True), ('organization__isnull', True), ('pharmacy__isnull', False), ('platform_hub__isnull', True)), models.Q(('community_group__isnull', True), ('organization__isnull', False), ('pharmacy__isnull', True), ('platform_hub__isnull', True)), _connector='OR'), name='pharmacy_hub_poll_scope_check')],
                    'db_table': 'client_profile_pharmacyhubpoll',
                },
            ),
            migrations.CreateModel(
                name='PharmacyHubPollOption',
                fields=[
                    ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                    ('label', models.CharField(max_length=255)),
                    ('vote_count', models.PositiveIntegerField(default=0)),
                    ('position', models.PositiveIntegerField(default=0)),
                    ('poll', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='options', to='pharmacy_hub.pharmacyhubpoll')),
                ],
                options={
                    'ordering': ['position', 'id'],
                    'indexes': [models.Index(fields=['poll', 'position'], name='client_prof_poll_id_087e39_idx')],
                    'constraints': [],
                    'db_table': 'client_profile_pharmacyhubpolloption',
                },
            ),
            migrations.CreateModel(
                name='PharmacyHubPollVote',
                fields=[
                    ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                    ('created_at', models.DateTimeField(auto_now_add=True)),
                    ('membership', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='hub_poll_votes', to='client_profile.membership')),
                    ('option', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='votes', to='pharmacy_hub.pharmacyhubpolloption')),
                    ('poll', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='votes', to='pharmacy_hub.pharmacyhubpoll')),
                    ('user', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='hub_poll_votes', to=settings.AUTH_USER_MODEL)),
                ],
                options={
                    'indexes': [models.Index(fields=['poll'], name='client_prof_poll_id_f9ec1f_idx'), models.Index(fields=['option'], name='client_prof_option__6df74a_idx'), models.Index(fields=['membership'], name='client_prof_members_cb25ad_idx'), models.Index(fields=['user'], name='client_prof_user_id_6b7c92_idx')],
                    'constraints': [models.UniqueConstraint(condition=models.Q(('membership__isnull', False)), fields=('poll', 'membership'), name='unique_hub_poll_vote_membership'), models.UniqueConstraint(condition=models.Q(('user__isnull', False)), fields=('poll', 'user'), name='unique_hub_poll_vote_user'), models.CheckConstraint(condition=models.Q(models.Q(('membership__isnull', False), ('user__isnull', True)), models.Q(('membership__isnull', True), ('user__isnull', False)), _connector='OR'), name='hub_poll_vote_membership_xor_user')],
                    'db_table': 'client_profile_pharmacyhubpollvote',
                },
            ),
            migrations.CreateModel(
                name='PharmacyHubPollComment',
                fields=[
                    ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                    ('body', models.TextField()),
                    ('created_at', models.DateTimeField(auto_now_add=True)),
                    ('updated_at', models.DateTimeField(auto_now=True)),
                    ('deleted_at', models.DateTimeField(blank=True, null=True)),
                    ('original_body', models.TextField(blank=True, default='')),
                    ('is_edited', models.BooleanField(default=False)),
                    ('last_edited_at', models.DateTimeField(blank=True, null=True)),
                    ('author_membership', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='hub_poll_comments', to='client_profile.membership')),
                    ('author_user', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='hub_poll_comments', to=settings.AUTH_USER_MODEL)),
                    ('last_edited_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='edited_pharmacy_hub_poll_comments', to=settings.AUTH_USER_MODEL)),
                    ('poll', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='comments', to='pharmacy_hub.pharmacyhubpoll')),
                ],
                options={
                    'ordering': ['created_at'],
                    'indexes': [models.Index(fields=['poll', 'created_at'], name='client_prof_poll_id_ea187b_idx'), models.Index(fields=['author_membership'], name='client_prof_author__fa902b_idx'), models.Index(fields=['author_user'], name='client_prof_author__2fbaf4_idx')],
                    'constraints': [],
                    'db_table': 'client_profile_pharmacyhubpollcomment',
                },
            ),
            migrations.CreateModel(
                name='PharmacyHubPollReaction',
                fields=[
                    ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                    ('reaction_type', models.CharField(choices=[('LIKE', 'Like'), ('CELEBRATE', 'Celebrate'), ('SUPPORT', 'Support'), ('INSIGHTFUL', 'Insightful'), ('LOVE', 'Love')], default='LIKE', max_length=16)),
                    ('created_at', models.DateTimeField(auto_now_add=True)),
                    ('updated_at', models.DateTimeField(auto_now=True)),
                    ('poll', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='reactions', to='pharmacy_hub.pharmacyhubpoll')),
                    ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='hub_poll_reactions', to=settings.AUTH_USER_MODEL)),
                ],
                options={
                    'indexes': [models.Index(fields=['poll'], name='client_prof_poll_id_e6dc43_idx'), models.Index(fields=['user'], name='client_prof_user_id_75d67a_idx')],
                    'constraints': [],
                    'unique_together': {('poll', 'user')},
                    'db_table': 'client_profile_pharmacyhubpollreaction',
                },
            ),
            ],
            database_operations=[],
        ),
        migrations.RunPython(move_content_types, restore_content_types),
    ]
