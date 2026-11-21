"""M4-06 C controls: real public-feed authorization, pagination and learning role context."""
from datetime import timedelta

from django.test import TestCase
from django.utils import timezone

from client_profile.characterization_support import client_for, make_user
from client_profile.models import OtherStaffOnboarding
from talent.models import ExplorerPost

PUBLIC = '/api/v1/explorer-posts/public-feed/'
OPTIONS = '/api/v1/marketplace/me/listing-options/'


class PublicTalentDiscoveryContracts(TestCase):
    def setUp(self):
        self.author = make_user('EXPLORER')
        today = timezone.localdate()
        self.visible = ExplorerPost.objects.create(
            author_user=self.author, headline='Ben available',
            reference_code='M406VISIBLE', role_category='OTHER_STAFF',
            role_title='Technician', location_state='QLD',
            skills=['WEBSTER_PACKING_DAA'], software=['FRED'],
            work_types=['CASUAL'], availability_days=[
                {'date': str(today + timedelta(days=4))}],
            is_anonymous=True,
        )
        self.expired = ExplorerPost.objects.create(
            author_user=self.author, headline='Expired private availability',
            reference_code='M406EXPIRED',
            availability_days=[str(today - timedelta(days=3))],
        )
        self.hidden = ExplorerPost.objects.create(
            author_user=self.author, headline='Hidden post',
            reference_code='M406HIDDEN', hidden_at=timezone.now(),
        )

    def test_C_public_feed_visible_to_anonymous_and_all_personas_with_redaction(self):
        actors = [None, self.author] + [
            make_user(role) for role in ('OWNER', 'PHARMACIST', 'OTHER_STAFF', 'EXPLORER',
                                        'ORGANIZATION', 'REGION_ADMIN')]
        for actor in actors:
            with self.subTest(role=getattr(actor, 'role', 'anonymous')):
                response = client_for(actor).get(PUBLIC, {'reference_code': 'M406VISIBLE'})
                self.assertEqual(response.status_code, 200, response.data)
                self.assertEqual(response.data['count'], 1)
                row = response.data['results'][0]
                self.assertEqual(row['id'], self.visible.pk)
                self.assertEqual(row['reference_code'], 'M406VISIBLE')
                for private in ('email', 'contact_email', 'date_of_birth',
                                'bank_details', 'phone_number', 'profile_email'):
                    self.assertNotIn(private, row)
                self.assertIsNone(row['author_user_id'])
                self.assertIsNone(row['explorer_user_id'])
                self.assertEqual(row['explorer_name'], 'Anonymous candidate')

    def test_C_reference_visibility_and_invalid_reference(self):
        for code in ('M406EXPIRED', 'M406HIDDEN', 'UNKNOWN'):
            with self.subTest(code=code):
                response = client_for().get(PUBLIC, {'reference_code': code})
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.data['count'], 0)
                self.assertEqual(response.data['results'], [])
        for invalid in ('', 'x' * 101):
            response = client_for().get(PUBLIC, {'reference_code': invalid})
            self.assertEqual(response.status_code, 400)
        self.assertEqual(client_for().get(PUBLIC, {'reference_code': 'M406VISIBLE'}).data['count'], 1)

    def test_C_page_size_and_complete_public_collection_without_server_role_filters(self):
        for index in range(4):
            ExplorerPost.objects.create(
                author_user=self.author, headline=f'Extra visible {index}',
                role_title='Pharmacist' if index % 2 else 'Technician')
        http = client_for()
        first = http.get(PUBLIC, {'page': 1, 'page_size': 2})
        second = http.get(PUBLIC, {'page': 2, 'page_size': 2})
        self.assertEqual(first.status_code, 200, first.data)
        self.assertEqual(second.status_code, 200, second.data)
        self.assertEqual(first.data['count'], 5)
        self.assertEqual(second.data['count'], 5)
        self.assertEqual(len(first.data['results']), 2)
        self.assertEqual(len(second.data['results']), 2)
        self.assertTrue(first.data['next'])
        ids = {item['id'] for item in first.data['results'] + second.data['results']}
        self.assertEqual(len(ids), 4)
        # This route has no server-side skill/role query filter.
        self.assertEqual(http.get(PUBLIC, {'role': 'IMPOSSIBLE'}).data['count'], 5)

    def test_C_listing_options_reveals_real_subtypes_without_granting_trading(self):
        for subtype in ('TECHNICIAN', 'ASSISTANT', 'INTERN', 'STUDENT'):
            with self.subTest(subtype=subtype):
                account = make_user('OTHER_STAFF')
                OtherStaffOnboarding.objects.create(user=account, role_type=subtype)
                result = client_for(account).get(OPTIONS)
                self.assertEqual(result.status_code, 200, result.data)
                self.assertEqual(result.data['role_code'], subtype)
                self.assertFalse(result.data['can_trade_personally'])
                self.assertTrue(result.data['blockers'])
        self.assertEqual(client_for().get(OPTIONS).status_code, 401)

    def test_C_public_browse_never_requires_private_contact_authority(self):
        guest = client_for()
        self.assertEqual(guest.get(PUBLIC).status_code, 200)
        forbidden = guest.post(f'/api/v1/explorer-posts/{self.visible.pk}/like/')
        self.assertEqual(forbidden.status_code, 401)
        forbidden = guest.post(f'/api/v1/explorer-posts/{self.visible.pk}/view/')
        self.assertEqual(forbidden.status_code, 401)
        viewer = make_user('PHARMACIST')
        liked = client_for(viewer).post(
            f'/api/v1/explorer-posts/{self.visible.pk}/like/')
        self.assertEqual(liked.status_code, 200, liked.data)
