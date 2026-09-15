"""Run with --settings=public_hub.integration_settings (real platform user/models)."""
import hashlib
from datetime import timedelta
from unittest.mock import patch
from django.test import TestCase, override_settings
from django.utils import timezone
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken
from .models import ContentAdministrator, ContentAssignment, ContentInvitation, ContentRevision, Article
from .editorial import publish_due
from client_profile.models import PharmacyHubPost, PharmacyHubComment


def payload(title='A pharmacy perspective', slug='pharmacy-perspective'):
    return {'title': title, 'slug': slug, 'excerpt': 'A useful perspective.', 'body_document':
            {'type': 'doc', 'content': [{'type': 'paragraph', 'content': [{'type': 'text', 'text': title}]}]}}


class EditorialTests(TestCase):
    def setUp(self):
        from django.core.cache import cache
        cache.clear()
        User = get_user_model()
        self.writer = User.objects.create_user(email='writer@example.test', password='Test-password-33', role='EXPLORER', is_otp_verified=True)
        self.publisher = User.objects.create_user(email='publisher@example.test', role='EXPLORER', is_otp_verified=True)
        self.other = User.objects.create_user(email='other@example.test', role='PHARMACIST', is_otp_verified=True)
        self.admin = User.objects.create_user(email='admin@example.test', role='EXPLORER', is_otp_verified=True)
        ContentAdministrator.objects.create(user=self.admin)
        ContentAssignment.objects.create(user=self.writer, area='blog', role='writer')
        ContentAssignment.objects.create(user=self.publisher, area='blog', role='publisher')
        self.api = APIClient()
        self.api.force_authenticate(self.writer)

    def create(self, area='blog', data=None):
        return self.api.post('/api/content/documents/', {'area': area, 'payload': data or payload()}, format='json')

    def action(self, doc, action, **kwargs):
        return self.api.post(f"/api/content/documents/{doc['id']}/{action}/", {'version': doc['revision']['version'], **kwargs}, format='json')

    def test_scoped_writer_cannot_publish_or_change_area(self):
        doc = self.create().data
        self.assertEqual(self.create('news').status_code, 403)
        self.assertEqual(self.action(doc, 'publish').status_code, 403)
        self.assertEqual(self.api.patch(f"/api/content/documents/{doc['id']}/", {'area': 'news'}, format='json').status_code, 400)
        self.api.force_authenticate(self.other)
        self.assertEqual(self.api.get(f"/api/content/documents/{doc['id']}/").status_code, 403)

    def test_published_copy_survives_draft_and_review(self):
        doc = self.create().data
        self.assertEqual(self.api.get('/api/public-hub/articles/').data['count'], 0)
        doc = self.action(doc, 'submit').data
        self.api.force_authenticate(self.publisher)
        response = self.action(doc, 'publish')
        self.assertEqual(response.status_code, 200, response.data)
        doc = response.data
        self.api.force_authenticate(self.writer)
        edited = self.api.patch(f"/api/content/documents/{doc['id']}/", {'version': doc['revision']['version'], 'payload': payload('Edited working copy')}, format='json')
        self.assertEqual(edited.status_code, 200, edited.data)
        self.assertEqual(Article.objects.get().title, 'A pharmacy perspective')
        self.assertEqual(self.api.patch(f"/api/content/documents/{doc['id']}/", {'version': 999, 'payload': payload()}, format='json').status_code, 409)
        doc = self.action(edited.data, 'submit').data
        self.api.force_authenticate(self.publisher)
        self.assertEqual(self.action(doc, 'publish').status_code, 200)
        self.assertEqual(Article.objects.get().title, 'Edited working copy')

    def test_scheduled_publication_and_revoked_approver(self):
        doc = self.create().data
        self.api.force_authenticate(self.publisher)
        future = timezone.now() + timedelta(hours=1)
        response = self.action(doc, 'publish', publish_at=future.isoformat())
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(Article.objects.count(), 0)
        self.assertEqual(publish_due(), 0)
        ContentRevision.objects.update(publish_at=timezone.now() - timedelta(seconds=1))
        ContentAssignment.objects.filter(user=self.publisher).delete()
        self.assertEqual(publish_due(), 0)
        self.assertEqual(ContentRevision.objects.get().status, 'submitted')

    def test_archive_removes_article(self):
        doc = self.create().data
        self.api.force_authenticate(self.publisher)
        doc = self.action(doc, 'publish').data
        self.assertEqual(self.action(doc, 'archive').status_code, 200)
        self.api.force_authenticate(None)
        self.assertEqual(self.api.get('/api/public-hub/articles/pharmacy-perspective/').status_code, 404)

    def test_structured_content_rejects_scripts_and_bad_images(self):
        data = payload()
        data['body_document']['content'] = [{'type': 'script', 'text': 'alert(1)'}]
        self.assertEqual(self.create(data=data).status_code, 400)
        data['body_document']['content'] = [{'type': 'image', 'attrs': {'src': 'javascript:alert(1)', 'alt': 'Test'}}]
        self.assertEqual(self.create(data=data).status_code, 400)

    def test_permissions_revoke_immediately_without_logout(self):
        doc = self.create().data
        ContentAssignment.objects.filter(user=self.writer).delete()
        self.assertEqual(self.api.get(f"/api/content/documents/{doc['id']}/").status_code, 403)

    def test_invitation_bound_to_email_single_use_and_no_staff(self):
        token = 'test-only-token'
        invitation = ContentInvitation.objects.create(email=self.writer.email, token_hash=hashlib.sha256(token.encode()).hexdigest(), assignments={'news': 'writer'}, expires_at=timezone.now()+timedelta(days=7))
        self.api.force_authenticate(self.other)
        self.assertEqual(self.api.post('/api/content/invitations/accept/', {'token': token}).status_code, 403)
        self.api.force_authenticate(self.writer)
        self.assertEqual(self.api.post('/api/content/invitations/accept/', {'token': token}).status_code, 200)
        self.assertEqual(self.api.post('/api/content/invitations/accept/', {'token': token}).status_code, 404)
        self.writer.refresh_from_db()
        self.assertFalse(self.writer.is_staff)
        self.assertFalse(self.writer.is_superuser)

    def test_expired_and_revoked_invitations(self):
        for suffix, fields in [('expired', {'expires_at': timezone.now()-timedelta(seconds=1)}), ('revoked', {'expires_at': timezone.now()+timedelta(days=1), 'revoked_at': timezone.now()})]:
            ContentInvitation.objects.create(email=self.writer.email, token_hash=hashlib.sha256(suffix.encode()).hexdigest(), assignments={'news':'writer'}, **fields)
            self.assertEqual(self.api.post('/api/content/invitations/accept/', {'token': suffix}).status_code, 404)

    def test_only_admin_invites_and_updates_team(self):
        self.assertEqual(self.api.post('/api/content/invitations/', {'email':self.other.email,'assignments':{'news':'writer'}}, format='json').status_code, 403)
        self.api.force_authenticate(self.admin)
        self.assertEqual(self.api.put(f'/api/content/team/{self.writer.pk}/', {'assignments':{}}, format='json').status_code, 200)
        self.assertFalse(ContentAssignment.objects.filter(user=self.writer).exists())

    def test_public_hub_allowlist_and_old_history(self):
        for hub in ['public','pharmacist','intern','staff','explorer','owner']:
            post = PharmacyHubPost.objects.create(platform_hub=hub, author_user=self.writer, body='Existing history')
            self.api.force_authenticate(None)
            response = self.api.get(f'/api/public-hub/posts/{post.pk}/')
            self.assertEqual(response.status_code, 200, response.data)
            self.assertNotIn('email', str(response.data))
            self.assertNotIn('author_membership', response.data)
            self.assertFalse(response.data['can_interact'])
        self.assertEqual(self.api.get('/api/public-hub/community/owner/posts/').status_code, 200)
        self.assertEqual(len(self.api.get('/api/public-hub/community/').data), 6)

    @override_settings(PUBLIC_COMMUNITY_ENABLED=False)
    def test_public_rollout_switch(self):
        self.assertEqual(self.api.get('/api/public-hub/community/').status_code, 404)

    def test_owner_and_staff_public_reads_never_expose_private_scopes(self):
        from client_profile.models import Pharmacy, Organization, PharmacyCommunityGroup, PharmacyHubAttachment, PharmacyHubPoll
        pharmacy = Pharmacy.objects.create(name='Private pharmacy')
        organisation = Organization.objects.create(name='Private organisation')
        group = PharmacyCommunityGroup.objects.create(pharmacy=pharmacy, name='Internal staff', created_by=self.admin)
        self.api.force_authenticate(None)
        for hub in ['owner', 'staff']:
            for scope in [{'pharmacy': pharmacy}, {'organization': organisation}, {'community_group': group}]:
                post = PharmacyHubPost.objects.create(body='Private scope', author_user=self.admin, **scope)
                PharmacyHubComment.objects.create(post=post, body='Private reply', author_user=self.admin)
                attachment = PharmacyHubAttachment.objects.create(post=post, file='private.pdf', kind='FILE')
                PharmacyHubPoll.objects.create(question='Private poll', **scope)
                for path in [f'posts/{post.pk}/', f'posts/{post.pk}/comments/', f'attachments/{attachment.pk}/']:
                    self.assertEqual(self.api.get('/api/public-hub/'+path).status_code, 404)
            self.assertEqual(self.api.get(f'/api/public-hub/community/{hub}/posts/?q=Private').data['count'], 0)
            self.assertEqual(self.api.get(f'/api/public-hub/community/{hub}/polls/').data['count'], 0)

    def test_owner_and_other_staff_interaction_roles(self):
        from .permissions import member_hubs
        from client_profile.models import OtherStaffOnboarding
        owner = get_user_model().objects.create_user(email='owner@example.test', role='OWNER', is_otp_verified=True)
        self.assertEqual(member_hubs(owner), ['public', 'owner'])
        for index, role_type in enumerate(['ASSISTANT', 'TECHNICIAN', 'INTERN']):
            staff = get_user_model().objects.create_user(email=f'staff{index}@example.test', role='OTHER_STAFF', is_otp_verified=True)
            OtherStaffOnboarding.objects.create(user=staff, role_type=role_type)
            self.assertEqual(member_hubs(staff), ['public', 'intern' if role_type=='INTERN' else 'staff'])

    def test_hidden_parent_and_deleted_post_not_readable(self):
        post = PharmacyHubPost.objects.create(platform_hub='public', author_user=self.writer, body='Public')
        parent = PharmacyHubComment.objects.create(post=post, author_user=self.writer, body='Hidden', deleted_at=timezone.now())
        PharmacyHubComment.objects.create(post=post, author_user=self.other, body='Reply', parent_comment=parent)
        self.api.force_authenticate(None)
        self.assertEqual(self.api.get(f'/api/public-hub/posts/{post.pk}/comments/').data['count'], 0)
        post.soft_delete()
        self.assertEqual(self.api.get(f'/api/public-hub/posts/{post.pk}/').status_code, 404)

    def test_cookie_writes_require_csrf_bearer_remains_supported(self):
        client = APIClient(enforce_csrf_checks=True)
        token = str(RefreshToken.for_user(self.writer).access_token)
        client.cookies['ct_access'] = token
        self.assertEqual(client.post('/api/content/documents/', {'area':'blog','payload':payload()}, format='json').status_code, 403)
        response = client.get('/api/users/csrf/')
        csrf = response.json()['csrfToken']
        self.assertEqual(client.post('/api/content/documents/', {'area':'blog','payload':payload()}, format='json', HTTP_X_CSRFTOKEN=csrf).status_code, 201)
        client.cookies.clear()
        client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
        self.assertEqual(client.post('/api/content/documents/', {'area':'blog','payload':payload(slug='second')}, format='json').status_code, 201)

    def test_membership_free_comment_cannot_be_edited_by_another_member(self):
        from client_profile.hub.api import HubCommentViewSet
        from rest_framework.test import APIRequestFactory, force_authenticate
        post = PharmacyHubPost.objects.create(platform_hub='public', author_user=self.writer, body='Public')
        comment = PharmacyHubComment.objects.create(post=post, author_user=self.writer, body='My comment')
        for method, action in [('patch', 'partial_update'), ('delete', 'destroy')]:
            request = getattr(APIRequestFactory(), method)('/test/', {'body': 'Changed'}, format='json')
            force_authenticate(request, self.other)
            response = HubCommentViewSet.as_view({method: action})(request, post_pk=post.pk, pk=comment.pk)
            self.assertEqual(response.status_code, 403, response.data)
        comment.refresh_from_db()
        self.assertEqual(comment.body, 'My comment')
        self.assertIsNone(comment.deleted_at)

    def test_editorial_hub_post_cannot_bypass_review_through_member_api(self):
        from client_profile.hub.api import HubPostViewSet
        from rest_framework.test import APIRequestFactory, force_authenticate
        self.api.force_authenticate(self.admin)
        doc = self.create('hub:public').data
        doc = self.action(doc, 'publish').data
        request = APIRequestFactory().patch('/test/', {'body': 'Bypass'}, format='json')
        force_authenticate(request, self.admin)
        response = HubPostViewSet.as_view({'patch': 'partial_update'})(request, pk=doc['hub_post_id'])
        self.assertEqual(response.status_code, 403, response.data)

    def test_role_hub_write_access_and_explorer(self):
        from client_profile.hub.api import HubScopeResolver
        from rest_framework.exceptions import PermissionDenied
        self.assertEqual(HubScopeResolver(self.writer).platform_scope('explorer')['platform_hub'], 'explorer')
        with self.assertRaises(PermissionDenied):
            HubScopeResolver(self.writer).platform_scope('pharmacist')

    def test_scheduled_replacement_reaches_live_only_when_due(self):
        doc = self.create().data
        self.api.force_authenticate(self.publisher)
        doc = self.action(doc, 'publish', publish_at=(timezone.now()+timedelta(hours=1)).isoformat()).data
        self.assertEqual(publish_due(), 0)
        ContentRevision.objects.update(publish_at=timezone.now()-timedelta(seconds=1))
        self.assertEqual(publish_due(), 1)
        self.assertEqual(publish_due(), 0)
        self.assertEqual(Article.objects.published().count(), 1)

class MediaAccessTests(TestCase):
    setUp = EditorialTests.setUp
    create = EditorialTests.create
    action = EditorialTests.action

    def test_media_draft_publish_archive_and_actual_reference(self):
        import io
        from .models import ContentMedia
        asset = ContentMedia.objects.create(file='public_content/cover.jpg', uploaded_by=self.writer)
        data = payload()
        data.update(cover_url=f'https://example.test/api/hub/media/{asset.pk}/', cover_alt='Pharmacy shelves')
        doc = self.create(data=data).data
        reader = APIClient()
        path = f'/api/public-hub/media/{asset.pk}/'
        self.assertEqual(reader.get(path).status_code, 404)
        doc = self.action(doc, 'submit').data
        self.api.force_authenticate(self.publisher)
        doc = self.action(doc, 'publish').data
        with patch('django.db.models.fields.files.FieldFile.open', return_value=io.BytesIO(b'image')):
            self.assertEqual(reader.get(path).status_code, 200)
        self.assertEqual(self.action(doc, 'archive').status_code, 200)
        self.assertEqual(reader.get(path).status_code, 404)
