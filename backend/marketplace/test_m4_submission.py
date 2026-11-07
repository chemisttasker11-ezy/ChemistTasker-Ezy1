"""M4-04: real marketplace ownership, idempotency, version and image HTTP boundaries.

These controls already enforce the intended server authority on the integration
base. The failing regression anchor is the native account-switch await chain.
"""
from datetime import date
from uuid import uuid4
from django.test import TestCase, override_settings
from django.utils import timezone
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient

from users.models import User
from onboarding.models import (
    OwnerOnboarding, PharmacistOnboarding, OtherStaffOnboarding, ExplorerOnboarding,
)
from organizations.models import Pharmacy
from marketplace.models import (
    IdentityVerification, MarketplaceCategory, MarketplaceListing,
    MarketplaceRequestReceipt, MarketplaceTermsAcceptance, MarketplaceImage,
)

API = '/api/v1/marketplace/'


@override_settings(
    MARKETPLACE_NEW_LISTINGS_ENABLED=True, MARKETPLACE_ALL_WRITES_ENABLED=True,
)
class M4MarketplaceSubmissionContracts(TestCase):
    def verified(self, name, role, subtype=None):
        user = User.objects.create_user(
            email=f'm4-{name}@example.test', password='m4-test',
            role=role, is_active=True, is_otp_verified=True,
            is_mobile_verified=True, mobile_number='0400000000',
        )
        if role == 'OWNER':
            profile = OwnerOnboarding.objects.create(
                user=user, phone_number='0400000000', role='MANAGER', verified=True,
            )
        elif role == 'PHARMACIST':
            profile = PharmacistOnboarding.objects.create(
                user=user, verified=True, gov_id_verified=True,
                date_of_birth=date(1990, 4, 12),
            )
        elif role == 'OTHER_STAFF':
            profile = OtherStaffOnboarding.objects.create(
                user=user, verified=True, gov_id_verified=True, role_type=subtype,
                date_of_birth=date(1995, 8, 4),
            )
        else:
            profile = ExplorerOnboarding.objects.create(
                user=user, verified=True,
                date_of_birth=date(1995, 6, 5),
            )
        IdentityVerification.objects.create(
            user=user, status='VERIFIED', assurance_method='AGE_MANUAL',
            verified_at=timezone.now(),
        )
        MarketplaceTermsAcceptance.objects.create(user=user, version='2026-09')
        return user, profile

    def client(self, user=None):
        http = APIClient()
        if user is not None:
            http.force_authenticate(user=user)
        return http

    def setUp(self):
        self.tom, owner_profile = self.verified('tom', 'OWNER')
        self.nadia, other_profile = self.verified('nadia', 'OWNER')
        self.site_a = Pharmacy.objects.create(
            name='M4 Tom site A', owner=owner_profile, verified=True, state='QLD',
        )
        self.site_b = Pharmacy.objects.create(
            name='M4 Nadia B', owner=other_profile, verified=True, state='QLD',
        )
        self.omar, _ = self.verified('omar', 'PHARMACIST')
        self.ali, _ = self.verified('ali', 'OTHER_STAFF', subtype='TECHNICIAN')
        self.zoe, _ = self.verified('zoe', 'EXPLORER')
        self.personal = MarketplaceCategory.objects.create(
            slug='m4-books', name='M4 books', context='PERSONAL',
            permitted_modes=['SELL', 'FREE'], maximum_buyer_roles=['PHARMACIST', 'OWNER'],
            field_schema={'allowed_seller_roles': ['OWNER', 'PHARMACIST', 'TECHNICIAN', 'EXPLORER']},
        )
        self.fixtures = MarketplaceCategory.objects.create(
            slug='m4-fixtures', name='M4 fixtures', context='PHARMACY',
            permitted_modes=['SELL', 'FREE'], maximum_buyer_roles=['OWNER'],
            field_schema={'allowed_seller_roles': ['OWNER']},
        )

    def payload(self, user=None, key=None, **change):
        doc = {
            'client_request_id': str(key or uuid4()), 'seller_context': 'PHARMACY',
            'pharmacy': self.site_a.pk, 'category': self.fixtures.pk,
            'mode': 'FREE', 'title': 'M4 storage cabinet', 'description': 'Surplus cabinet',
            'condition': 'Used', 'quantity': 1, 'unit': 'item',
            'amount': '0', 'desired_swap': '', 'suburb': 'Brisbane',
            'state': 'QLD', 'postcode': '4000', 'private_pickup_details': 'Private',
            'allowed_buyer_roles': ['OWNER'], 'delivery': {'method': 'PICKUP'},
        }
        return {**doc, **change}

    def create_listing(self, user=None):
        response = self.client(user or self.tom).post(
            API + 'listings/', self.payload(), format='json',
        )
        self.assertEqual(response.status_code, 201, response.data)
        return response

    def test_owner_listing_create_is_idempotent_with_frozen_payload(self):
        value = self.payload()
        url = API + 'listings/'
        client = self.client(self.tom)
        first = client.post(url, value, format='json')
        self.assertEqual(first.status_code, 201, first.data)
        second = client.post(url, value, format='json')
        self.assertEqual(second.status_code, 200, second.data)
        self.assertEqual(first.data['id'], second.data['id'])
        self.assertEqual(MarketplaceListing.objects.filter(creator=self.tom).count(), 1)
        self.assertEqual(MarketplaceRequestReceipt.objects.filter(
            actor=self.tom, action='LISTING_CREATE',
            client_request_id=value['client_request_id'],
        ).count(), 1)
        changed = {**value, 'title': 'Altered cabinet'}
        conflicting = client.post(url, changed, format='json')
        self.assertEqual(conflicting.status_code, 400, conflicting.data)
        self.assertIn('REQUEST_ID_REUSED_WITH_DIFFERENT_PAYLOAD',
                      str(conflicting.data['client_request_id']))
        self.assertEqual(MarketplaceListing.objects.filter(creator=self.tom).count(), 1)

    def test_pharmacy_ownership_not_role_or_seller_context_controls_writes(self):
        value = self.payload()
        for user in (self.nadia, self.omar, self.ali, self.zoe):
            with self.subTest(role=user.role, actor=user.email):
                rejected = self.client(user).post(API + 'listings/', value, format='json')
                self.assertEqual(rejected.status_code, 403, rejected.data)
        self.assertFalse(MarketplaceListing.objects.exists())
        no_login = self.client().post(API + 'listings/', value, format='json')
        self.assertEqual(no_login.status_code, 401)

    def test_personal_category_options_are_role_scoped_and_read_does_not_grant_writes(self):
        for user in (self.tom, self.omar, self.ali, self.zoe):
            options = self.client(user).get(API + 'me/listing-options/')
            self.assertEqual(options.status_code, 200, options.data)
            self.assertIn(self.personal.pk, {
                row['id'] for row in options.data['personal_categories'],
            })
            if user != self.tom:
                self.assertEqual(options.data['pharmacy_categories'], [])
        anon = self.client()
        self.assertEqual(anon.get(API + 'me/listing-options/').status_code, 401)
        self.assertEqual(anon.get(API + 'listings/').status_code, 200)
        self.assertEqual(anon.get(API + 'categories/').status_code, 200)

    def test_version_and_publication_changes_come_only_from_the_creator(self):
        made = self.create_listing()
        listing_id = made.data['id']
        owner = self.client(self.tom)
        foreign = self.client(self.nadia)
        url = API + f'listings/{listing_id}/'
        self.assertEqual(foreign.patch(
            url, {'title': 'Foreign edit', 'expected_version': 1},
            format='json',
        ).status_code, 403)
        self.assertEqual(owner.patch(
            url, {'title': 'Stale edit', 'expected_version': 0},
            format='json',
        ).status_code, 409)
        updated = owner.patch(
            url, {'title': 'Permitted edit', 'expected_version': 1},
            format='json',
        )
        self.assertEqual(updated.status_code, 200, updated.data)
        listing = MarketplaceListing.objects.get(pk=listing_id)
        self.assertEqual(listing.title, 'Permitted edit')
        current_version = listing.version
        submit = owner.post(
            url + 'submit/', {'expected_version': current_version},
            format='json',
        )
        self.assertEqual(submit.status_code, 200, submit.data)
        self.assertEqual(submit.data['publication_status'], 'PENDING_REVIEW')
        self.assertEqual(foreign.post(
            url + 'submit/', {'expected_version': submit.data['version']},
            format='json',
        ).status_code, 403)
        self.assertEqual(owner.post(
            url + 'submit/', {'expected_version': current_version},
            format='json',
        ).status_code, 409)

    def test_upload_denials_and_payload_guard_do_not_add_files(self):
        made = self.create_listing()
        image_url = API + f'listings/{made.data["id"]}/images/'
        image = SimpleUploadedFile('photo.jpg', b'not an image', content_type='image/jpeg')
        self.assertEqual(self.client(self.nadia).post(
            image_url, {'image': image}, format='multipart',
        ).status_code, 403)
        image = SimpleUploadedFile('photo.jpg', b'not an image', content_type='image/jpeg')
        invalid = self.client(self.tom).post(
            image_url, {'image': image}, format='multipart',
        )
        self.assertEqual(invalid.status_code, 400, invalid.data)
        oversize = SimpleUploadedFile(
            'large.jpg', b'0' * (4 * 1024 * 1024 + 1), content_type='image/jpeg',
        )
        refused = self.client(self.tom).post(
            image_url, {'image': oversize}, format='multipart',
        )
        self.assertEqual(refused.status_code, 413, refused.data)
        self.assertEqual(MarketplaceImage.objects.count(), 0)
        self.assertEqual(self.client().post(image_url, {}, format='multipart').status_code, 401)
