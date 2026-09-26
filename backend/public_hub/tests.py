from datetime import timedelta
from importlib import import_module
from django.contrib import admin
from django.apps import apps
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.core.cache import cache
from django.db import IntegrityError, transaction
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken
from .admin import ArticleAdmin
from .models import Article, Comment, ContentDocument, ContentRevision, Reaction, Report


class HubTests(TestCase):
    def setUp(self):
        cache.clear()
        users = get_user_model()
        self.user = users.objects.create_user(username='member', email='member@example.test', password='local-test-pass', first_name='Alex')
        self.other = users.objects.create_user(username='other', email='other@example.test', password='local-test-pass')
        if hasattr(self.user, 'is_otp_verified'):
            for member in [self.user, self.other]:
                member.role = 'EXPLORER'
                member.is_otp_verified = True
                member.save()
        self.api = APIClient()
        self.article = Article.objects.create(title='A thoughtful handover', slug='thoughtful-handover', kind='blog', topic='practice',
            excerpt='Practical perspectives.', body='## A shared plan\n\nMake time for a conversation.', status='published', published_at=timezone.now())
        self.url = f'/api/public-hub/articles/{self.article.slug}/'

    def login(self, user=None):
        token = RefreshToken.for_user(user or self.user)
        self.api.credentials(HTTP_AUTHORIZATION=f'Bearer {token.access_token}')

    def test_article_admin_cannot_bypass_editorial_workflow(self):
        article_admin = ArticleAdmin(Article, admin.site)
        self.assertFalse(article_admin.has_add_permission(None))
        self.assertFalse(article_admin.has_change_permission(None, self.article))
        self.assertFalse(article_admin.has_delete_permission(None, self.article))

    def test_legacy_article_backfill_preserves_heading_and_paragraphs(self):
        migration = import_module('public_hub.migrations.0004_backfill_editorial_documents')
        document = migration._body_document(self.article)

        self.assertEqual([block['type'] for block in document['content']], ['heading', 'paragraph'])
        self.assertEqual(document['content'][0]['content'][0]['text'], 'A shared plan')
        self.assertEqual(document['content'][1]['content'][0]['text'], 'Make time for a conversation.')

    def test_editorial_backfill_governs_each_publication_state_once(self):
        future = timezone.now() + timedelta(days=1)
        for slug, status, published_at in (
            ('draft-guide', 'draft', None),
            ('scheduled-guide', 'published', future),
            ('archived-guide', 'archived', timezone.now()),
        ):
            Article.objects.create(
                title=slug, slug=slug, kind='blog', topic='practice',
                excerpt='Test editorial state.', body='Test editorial state.',
                status=status, published_at=published_at,
            )
        backfill = import_module('public_hub.migrations.0004_backfill_editorial_documents').backfill_editorial_documents
        backfill(apps, None)
        backfill(apps, None)
        self.assertEqual(ContentRevision.objects.count(), 4)
        self.assertEqual(
            ContentRevision.objects.get(document__article__slug='draft-guide').status, 'draft'
        )
        self.assertEqual(
            ContentRevision.objects.get(document__article__slug='scheduled-guide').status, 'scheduled'
        )
        archived = ContentDocument.objects.get(article__slug='archived-guide')
        self.assertTrue(archived.archived)
        self.assertEqual(archived.revisions.get().status, 'superseded')

    def test_drafts_scheduled_and_archived_are_not_public(self):
        for status, date in [('draft', None), ('published', timezone.now() + timedelta(days=1)), ('archived', timezone.now())]:
            self.article.status, self.article.published_at = status, date
            self.article.save()
            self.assertEqual(self.api.get(self.url).status_code, 404)
            self.assertEqual(self.api.get('/api/public-hub/articles/').data['count'], 0)
            self.login()
            self.assertEqual(self.api.post(self.url + 'comments/', {'body': 'test'}).status_code, 404)
            self.assertEqual(self.api.put(self.url + 'reaction/', {'kind': 'like'}).status_code, 404)

    def test_filter_and_search(self):
        self.assertEqual(self.api.get('/api/public-hub/articles/?kind=blog&topic=practice&q=handover').data['count'], 1)
        self.assertEqual(self.api.get('/api/public-hub/articles/?kind=news').data['count'], 0)

    def test_anonymous_reads_but_cannot_write_or_publish(self):
        self.assertEqual(self.api.get(self.url).status_code, 200)
        self.assertEqual(self.api.post(self.url + 'comments/', {'body': 'Hello'}).status_code, 401)
        self.assertEqual(self.api.put(self.url + 'reaction/', {'kind': 'like'}).status_code, 401)
        self.login()
        self.assertEqual(self.api.post('/api/public-hub/articles/', {'title': 'Unauthorised'}).status_code, 405)
        self.assertEqual(self.api.patch(self.url, {'status': 'published'}).status_code, 405)

    def test_comments_and_replies_validate_and_do_not_leak_identity(self):
        self.login()
        response = self.api.post(self.url + 'comments/', {'body': 'Thoughtful question'})
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['author_name'], 'Alex')
        self.assertNotIn('email', response.data)
        root = response.data['id']
        response = self.api.post(self.url + 'comments/', {'body': 'A reply', 'parent': root})
        self.assertEqual(response.status_code, 201)
        self.assertEqual(self.api.get(self.url + f'comments/?parent={root}').data['count'], 1)
        self.assertEqual(self.api.get(self.url + 'comments/').data['count'], 1)
        self.assertEqual(self.api.post(self.url + 'comments/', {'body': 'Too deep', 'parent': response.data['id']}).status_code, 404)
        self.assertEqual(self.api.post(self.url + 'comments/', {'body': '   '}).status_code, 400)
        self.assertEqual(self.api.post(self.url + 'comments/', {'body': 'x' * 3001}).status_code, 400)
        self.assertEqual(self.api.get(self.url + 'comments/?parent=bad').status_code, 400)

    def test_parent_must_be_in_same_article(self):
        root = Comment.objects.create(article=self.article, author=self.user, body='Root')
        self.article.pk = None
        self.article.slug = 'another'
        self.article.save()
        self.login()
        self.assertEqual(self.api.post('/api/public-hub/articles/another/comments/', {'body': 'Wrong article', 'parent': root.id}).status_code, 404)

    def test_author_delete_tombstones_without_destroying_replies(self):
        root = Comment.objects.create(article=self.article, author=self.user, body='Root')
        Comment.objects.create(article=self.article, author=self.other, parent=root, body='Reply')
        self.login(self.other)
        self.assertEqual(self.api.delete(f'/api/public-hub/comments/{root.pk}/').status_code, 403)
        self.login()
        self.assertEqual(self.api.delete(f'/api/public-hub/comments/{root.pk}/').status_code, 204)
        root.refresh_from_db()
        self.assertEqual(root.body, '')
        self.assertEqual(root.replies.count(), 1)
        self.assertEqual(self.api.get(self.url + 'comments/').data['results'][0]['body'], '')
        self.assertEqual(self.api.get(self.url).data['comment_count'], 1)

    def test_hidden_threads_are_not_exposed_or_reactable(self):
        root = Comment.objects.create(article=self.article, author=self.user, body='Hidden', hidden=True)
        reply = Comment.objects.create(article=self.article, author=self.other, parent=root, body='Reply')
        self.assertEqual(self.api.get(self.url + 'comments/').data['count'], 0)
        self.assertEqual(self.api.get(self.url + f'comments/?parent={root.pk}').status_code, 404)
        self.assertEqual(self.api.get(self.url).data['comment_count'], 0)
        self.login()
        self.assertEqual(self.api.put(f'/api/public-hub/comments/{reply.pk}/reaction/', {'kind': 'support'}).status_code, 403)

    def test_reactions_are_idempotent_changeable_and_removable(self):
        self.login()
        path = self.url + 'reaction/'
        self.assertEqual(self.api.put(path, {'kind': 'like'}).status_code, 200)
        self.api.put(path, {'kind': 'like'})
        self.assertEqual(Reaction.objects.count(), 1)
        response = self.api.put(path, {'kind': 'insightful'})
        self.assertEqual(response.data['counts'], {'like': 0, 'insightful': 1, 'support': 0})
        self.assertEqual(response.data['mine'], 'insightful')
        self.assertEqual(self.api.put(path, {'kind': 'invalid'}).status_code, 400)
        self.assertEqual(self.api.delete(path).status_code, 200)
        self.assertEqual(Reaction.objects.count(), 0)

    def test_comments_closed_still_allow_reading_and_reacting(self):
        self.article.comments_open = False
        self.article.save()
        self.login()
        self.assertEqual(self.api.post(self.url + 'comments/', {'body': 'Not allowed'}).status_code, 403)
        self.assertEqual(self.api.get(self.url + 'comments/').status_code, 200)
        self.assertEqual(self.api.put(self.url + 'reaction/', {'kind': 'support'}).status_code, 200)

    def test_reports_are_private_and_deduplicated(self):
        comment = Comment.objects.create(article=self.article, author=self.other, body='Review this')
        self.login()
        path = f'/api/public-hub/comments/{comment.pk}/report/'
        self.assertEqual(self.api.post(path, {'reason': 'Personal information'}).status_code, 201)
        self.assertEqual(self.api.post(path, {'reason': 'Duplicate report'}).status_code, 200)
        self.assertEqual(Report.objects.count(), 1)
        self.assertEqual(self.api.get(path).status_code, 405)
        self.assertNotIn('reports', self.api.get(self.url + 'comments/').data['results'][0])

    def test_publication_and_urls_validated(self):
        self.article.published_at = None
        with self.assertRaises(ValidationError): self.article.full_clean()
        self.article.published_at = timezone.now()
        self.article.cover_url = 'javascript:alert(1)'
        with self.assertRaises(ValidationError): self.article.full_clean()
        self.article.cover_url = ''
        self.article.slug = 'changed-link'
        with self.assertRaises(ValidationError): self.article.full_clean()

    def test_database_prevents_invalid_reaction_target(self):
        with self.assertRaises(IntegrityError), transaction.atomic():
            Reaction.objects.create(user=self.user, kind='like')

    def test_pagination_and_invalid_page(self):
        for i in range(14): Comment.objects.create(article=self.article, author=self.user, body=f'Comment {i}')
        response = self.api.get(self.url + 'comments/')
        self.assertEqual(len(response.data['results']), 12)
        self.assertTrue(response.data['next'])
        self.assertEqual(len(self.api.get(self.url + 'comments/?page=2').data['results']), 2)
        self.assertEqual(self.api.get(self.url + 'comments/?page=99').status_code, 404)

    def test_write_throttle(self):
        self.login()
        for i in range(30): self.assertEqual(self.api.put(self.url + 'reaction/', {'kind': 'like'}).status_code, 200)
        self.assertEqual(self.api.put(self.url + 'reaction/', {'kind': 'like'}).status_code, 429)
