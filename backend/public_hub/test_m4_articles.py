"""M4-06 C controls: real AllowAny article topic/kind/q pagination and visibility."""
from datetime import timedelta

from django.test import TestCase
from django.utils import timezone

from client_profile.characterization_support import client_for, make_user
from public_hub.models import Article

URL = '/api/v1/public-hub/articles/'


class PublicArticleDiscoveryContracts(TestCase):
    def setUp(self):
        self.now = timezone.now()
        for number in range(14):
            self.article(number, kind='blog', topic='career',
                         title=f'Career bulletin {number:02d}',
                         body=f'Practical career SEARCHTOKEN {number}')
        self.article(40, kind='news', topic='tga', title='TGA regulation NEWSMARK')
        self.article(41, kind='blog', topic='practice', title='Practice note')
        self.article(42, kind='blog', topic='career', title='Unpublished secret',
                     status='draft', published_at=None)
        self.article(43, kind='news', topic='industry', title='Future secret',
                     published_at=self.now + timedelta(days=2))
        self.article(44, kind='news', topic='community', title='Archived secret',
                     status='archived')

    def article(self, number, *, kind, topic, title, body='Real public content',
                status='published', published_at=None):
        return Article.objects.create(
            title=title, slug=f'm406-{number}', kind=kind, topic=topic,
            excerpt='Public discoverable excerpt', body=body,
            status=status,
            published_at=published_at if published_at is not None
                else (None if status == 'draft' else self.now),
        )

    def test_C_anonymous_and_cast_read_same_published_topic_collection(self):
        for account in (None, make_user('PHARMACIST'), make_user('OTHER_STAFF'),
                        make_user('EXPLORER'), make_user('OWNER')):
            with self.subTest(role=getattr(account, 'role', 'anonymous')):
                response = client_for(account).get(
                    URL, {'kind': 'blog', 'topic': 'career'})
                self.assertEqual(response.status_code, 200, response.data)
                self.assertEqual(response.data['count'], 14)
                self.assertEqual(len(response.data['results']), 12)
                self.assertTrue(response.data['next'])
                next_page = client_for(account).get(
                    URL, {'kind': 'blog', 'topic': 'career', 'page': 2})
                self.assertEqual(next_page.status_code, 200, next_page.data)
                self.assertEqual(len(next_page.data['results']), 2)
                self.assertEqual(
                    len({row['id'] for row in response.data['results'] +
                         next_page.data['results']}), 14)

    def test_C_kind_topic_q_trim_and_200_character_limit(self):
        http = client_for()
        selected = http.get(URL, {'kind': 'news', 'topic': 'tga', 'q': '  NEWSMARK  '})
        self.assertEqual(selected.status_code, 200)
        self.assertEqual(selected.data['count'], 1)
        self.assertEqual(selected.data['results'][0]['title'], 'TGA regulation NEWSMARK')
        self.assertEqual(http.get(URL, {'kind': 'blog', 'topic': 'tga'}).data['count'], 0)
        self.assertEqual(http.get(URL, {'kind': 'news', 'topic': 'career'}).data['count'], 0)
        self.assertEqual(http.get(URL, {'kind': 'blog', 'topic': 'career', 'q': 'SEARCHTOKEN'}).data['count'], 14)
        self.assertEqual(http.get(URL, {'kind': 'news', 'topic': 'tga',
                                        'q': 'NEWSMARK' + 'x' * 250}).data['count'], 1)

    def test_C_unpublished_scheduled_archived_invisible_and_details_private(self):
        http = client_for()
        visible = http.get(URL)
        self.assertEqual(visible.status_code, 200)
        titles = {row['title'] for row in visible.data['results']}
        self.assertNotIn('Unpublished secret', titles)
        self.assertNotIn('Future secret', titles)
        self.assertNotIn('Archived secret', titles)
        for number in (42, 43, 44):
            self.assertEqual(http.get(URL + f'm406-{number}/').status_code, 404)
        detail = http.get(URL + 'm406-40/')
        self.assertEqual(detail.status_code, 200)
        self.assertIn('body', detail.data)
        self.assertEqual(detail.data['kind'], 'news')
        for key in ('email', 'bank_details', 'phone_number'):
            self.assertNotIn(key, detail.data)

    def test_C_article_listing_is_read_only_for_anonymous_browsers(self):
        http = client_for()
        self.assertEqual(http.get(URL).status_code, 200)
        self.assertEqual(http.post(URL, {'title': 'not allowed'}).status_code, 405)
        self.assertEqual(http.patch(URL + 'm406-40/', {'title': 'stolen'}).status_code, 405)
