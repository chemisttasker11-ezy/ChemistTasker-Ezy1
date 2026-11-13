"""REPLAY-t1 (F2/F3): marketplace draft and photo saves have at most one committed effect.

Request contract under test:
- Listing create keeps its body key `client_request_id` (receipt action LISTING_CREATE; reuse with a
  changed payload stays 400 as today; a replay returns 200 with the original body).
- PATCH listings/<id>/, POST listings/<id>/audience/, POST listings/<id>/submit/ and POST
  listings/<id>/images/ accept an `Idempotency-Key` header (UUID). Receipt actions LISTING_UPDATE,
  LISTING_AUDIENCE, LISTING_SUBMIT and IMAGE_UPLOAD in MarketplaceRequestReceipt (no model change).
  A replay re-checks CURRENT authorization, then returns the original status and body; the same key
  with a different payload or different photo bytes is 409; a deleted listing or image is 410.
- Requests without the header behave exactly as before.
"Lost response": the first request commits, the test discards its response, then retries.
"""
import io
import os
import tempfile
import threading
from datetime import date, timedelta
from queue import Queue
from threading import Barrier, BrokenBarrierError, Thread
from unittest import skipUnless
from unittest.mock import patch
from uuid import uuid4

from django.core.files.storage import FileSystemStorage
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import close_old_connections, connection
from django.test import TestCase, TransactionTestCase, override_settings
from django.utils import timezone
from PIL import Image
from rest_framework.test import APIClient

from marketplace import services, views
from marketplace.models import (
    IdentityVerification, ListingEscalationStep, MarketplaceAuditEvent, MarketplaceCategory,
    MarketplaceImage, MarketplaceListing, MarketplaceRequestReceipt, MarketplaceTermsAcceptance,
)
from onboarding.models import OwnerOnboarding
from organizations.models import Pharmacy
from users.models import User

API = '/api/v1/marketplace/'


def jpeg(color='red'):
    buffer = io.BytesIO()
    Image.new('RGB', (2, 2), color).save(buffer, format='JPEG')
    return buffer.getvalue()


def media_files(root):
    return sorted(os.path.join(path, name) for path, _, names in os.walk(root) for name in names)


class ReplayFixture:
    """Shared setup for the TestCase and the PostgreSQL TransactionTestCase classes."""

    def verified_owner(self, name):
        user = User.objects.create_user(
            email=f'replay-{name}@example.test', password='replay-test', role='OWNER', is_active=True,
            is_otp_verified=True, is_mobile_verified=True, mobile_number='0400000000',
        )
        profile = OwnerOnboarding.objects.create(user=user, phone_number='0400000000', role='MANAGER', verified=True)
        IdentityVerification.objects.create(user=user, status='VERIFIED', assurance_method='AGE_MANUAL', verified_at=timezone.now())
        MarketplaceTermsAcceptance.objects.create(user=user, version='2026-09')
        pharmacy = Pharmacy.objects.create(name=f'Replay {name}', owner=profile, verified=True, state='QLD')
        return user, profile, pharmacy

    def setUp(self):
        super().setUp()
        self.tom, self.tom_profile, self.tom_site = self.verified_owner('tom')
        self.nadia, self.nadia_profile, self.nadia_site = self.verified_owner('nadia')
        self.category = MarketplaceCategory.objects.create(
            slug='replay-fixtures', name='Replay fixtures', context='PHARMACY',
            permitted_modes=['SELL', 'FREE'], maximum_buyer_roles=['OWNER'],
            field_schema={'allowed_seller_roles': ['OWNER']},
        )
        media = tempfile.TemporaryDirectory()
        self.addCleanup(media.cleanup)
        self.media = media.name
        media_settings = override_settings(MEDIA_ROOT=self.media)
        media_settings.enable()
        self.addCleanup(media_settings.disable)

    def client_for(self, user):
        http = APIClient()
        http.force_authenticate(user=user)
        http.raise_request_exception = False
        return http

    def create_payload(self, user=None, **change):
        site = self.nadia_site if user == self.nadia else self.tom_site
        return {
            'client_request_id': str(uuid4()), 'seller_context': 'PHARMACY', 'pharmacy': site.pk,
            'category': self.category.pk, 'mode': 'FREE', 'title': 'Replay cabinet', 'description': 'Surplus cabinet',
            'condition': 'Used', 'quantity': 1, 'unit': 'item', 'amount': '0', 'desired_swap': '',
            'suburb': 'Brisbane', 'state': 'QLD', 'postcode': '4000', 'private_pickup_details': 'Private',
            'allowed_buyer_roles': ['OWNER'], 'delivery': {'method': 'PICKUP'}, **change,
        }

    def listing_for(self, user=None):
        user = user or self.tom
        response = self.client_for(user).post(API + 'listings/', self.create_payload(user), format='json')
        self.assertEqual(response.status_code, 201, response.content)
        return response.json()['id']

    def keyed(self, user, method, url, data, key, multipart=False):
        headers = {'HTTP_IDEMPOTENCY_KEY': str(key)} if key else {}
        http = self.client_for(user)
        if multipart:
            return http.post(url, data, format='multipart', **headers)
        return getattr(http, method)(url, data, format='json', **headers)

    def patch_listing(self, listing_id, key, user=None, **body):
        return self.keyed(user or self.tom, 'patch', API + f'listings/{listing_id}/', {'title': 'Keyed edit', 'expected_version': 1, **body}, key)

    def audience(self, listing_id, key, user=None, **body):
        # a client retry resends the frozen payload, so the schedule time is fixed once per test
        if not hasattr(self, '_due_at'):
            self._due_at = (timezone.now() + timedelta(days=2)).isoformat()
        data = {'expected_version': 1, 'current_circle': 'OWNED_CHAIN', 'maximum_circle': 'PLATFORM',
                'schedule': [{'target_circle': 'ORGANISATION', 'due_at': self._due_at}], **body}
        return self.keyed(user or self.tom, 'post', API + f'listings/{listing_id}/audience/', data, key)

    def submit(self, listing_id, key, user=None, version=1):
        return self.keyed(user or self.tom, 'post', API + f'listings/{listing_id}/submit/', {'expected_version': version}, key)

    def upload(self, listing_id, key, user=None, color='red', name='photo.jpg'):
        image = SimpleUploadedFile(name, jpeg(color), content_type='image/jpeg')
        return self.keyed(user or self.tom, 'post', API + f'listings/{listing_id}/images/', {'image': image}, key, multipart=True)

    def receipts(self, action):
        return MarketplaceRequestReceipt.objects.filter(action=action).count()


@override_settings(MARKETPLACE_NEW_LISTINGS_ENABLED=True, MARKETPLACE_ALL_WRITES_ENABLED=True)
class MarketplaceReplayContracts(ReplayFixture, TestCase):
    # 1. commit + lost response + retry -> one effect, same outcome
    def test_create_lost_response_replays_original_body_without_duplicate(self):
        payload = self.create_payload()
        first = self.client_for(self.tom).post(API + 'listings/', payload, format='json')
        self.assertEqual(first.status_code, 201, first.content)
        retry = self.client_for(self.tom).post(API + 'listings/', payload, format='json')
        self.assertEqual(retry.status_code, 200, retry.content)
        self.assertEqual(retry.json(), first.json())
        self.assertEqual(MarketplaceListing.objects.filter(creator=self.tom).count(), 1)
        self.assertEqual(self.receipts('LISTING_CREATE'), 1)

    def test_patch_lost_response_replays_original_outcome(self):
        listing_id, key = self.listing_for(), uuid4()
        first = self.patch_listing(listing_id, key)
        self.assertEqual(first.status_code, 200, first.content)
        retry = self.patch_listing(listing_id, key)
        self.assertEqual(retry.status_code, 200, retry.content)
        self.assertEqual(retry.json(), first.json())
        self.assertEqual(MarketplaceListing.objects.get(pk=listing_id).version, 2)
        self.assertEqual(self.receipts('LISTING_UPDATE'), 1)

    def test_audience_lost_response_replays_original_outcome(self):
        listing_id, key = self.listing_for(), uuid4()
        first = self.audience(listing_id, key)
        self.assertEqual(first.status_code, 200, first.content)
        retry = self.audience(listing_id, key)
        self.assertEqual(retry.status_code, 200, retry.content)
        self.assertEqual(retry.json(), first.json())
        self.assertEqual(MarketplaceListing.objects.get(pk=listing_id).version, 2)
        self.assertEqual(ListingEscalationStep.objects.filter(listing_id=listing_id).count(), 1)
        self.assertEqual(self.receipts('LISTING_AUDIENCE'), 1)

    def test_submit_lost_response_replays_original_outcome(self):
        listing_id, key = self.listing_for(), uuid4()
        first = self.submit(listing_id, key)
        self.assertEqual(first.status_code, 200, first.content)
        retry = self.submit(listing_id, key)
        self.assertEqual(retry.status_code, 200, retry.content)
        self.assertEqual(retry.json(), first.json())
        self.assertEqual(MarketplaceAuditEvent.objects.filter(action='LISTING_SUBMIT', target_id=listing_id).count(), 1)
        self.assertEqual(MarketplaceListing.objects.get(pk=listing_id).version, 2)
        self.assertEqual(self.receipts('LISTING_SUBMIT'), 1)

    def test_upload_lost_response_replays_original_outcome_with_one_photo(self):
        listing_id, key = self.listing_for(), uuid4()
        first = self.upload(listing_id, key)
        self.assertEqual(first.status_code, 201, first.content)
        retry = self.upload(listing_id, key)
        self.assertEqual(retry.status_code, 201, retry.content)
        self.assertEqual(retry.json(), first.json())
        self.assertEqual(MarketplaceImage.objects.filter(listing_id=listing_id).count(), 1)
        self.assertEqual(len(media_files(self.media)), 2, 'one original and one derivative')
        self.assertEqual(self.receipts('IMAGE_UPLOAD'), 1)

    # 2. same key, different payload or bytes -> 409, nothing written
    def test_same_key_with_different_payload_or_bytes_is_refused(self):
        listing_id = self.listing_for()
        key = uuid4()
        self.assertEqual(self.patch_listing(listing_id, key, title='First').status_code, 200)
        changed = self.patch_listing(listing_id, key, title='Second')
        self.assertEqual(changed.status_code, 409, changed.content)
        listing = MarketplaceListing.objects.get(pk=listing_id)
        self.assertEqual((listing.title, listing.version), ('First', 2))

        key = uuid4()
        self.assertEqual(self.audience(listing_id, key, expected_version=2).status_code, 200)
        changed = self.audience(listing_id, key, expected_version=2, current_circle='ORGANISATION')
        self.assertEqual(changed.status_code, 409, changed.content)
        listing.refresh_from_db()
        self.assertEqual((listing.audience.current_circle, listing.version), ('OWNED_CHAIN', 3))

        key = uuid4()
        self.assertEqual(self.upload(listing_id, key, color='red').status_code, 201)
        changed = self.upload(listing_id, key, color='blue')
        self.assertEqual(changed.status_code, 409, changed.content)
        self.assertEqual(MarketplaceImage.objects.filter(listing_id=listing_id).count(), 1)
        self.assertEqual(len(media_files(self.media)), 2)
        self.assertEqual(self.receipts('IMAGE_UPLOAD'), 1)

    # 3. two users, same key; revoked access before the retry
    def test_two_users_with_the_same_key_are_independent(self):
        key = uuid4()
        tom_listing, nadia_listing = self.listing_for(self.tom), self.listing_for(self.nadia)
        tom_first = self.patch_listing(tom_listing, key, title='Tom edit')
        nadia_first = self.patch_listing(nadia_listing, key, user=self.nadia, title='Nadia edit')
        self.assertEqual((tom_first.status_code, nadia_first.status_code), (200, 200))
        self.assertEqual(MarketplaceListing.objects.get(pk=nadia_listing).title, 'Nadia edit')
        tom_retry = self.patch_listing(tom_listing, key, title='Tom edit')
        self.assertEqual(tom_retry.status_code, 200, tom_retry.content)
        self.assertEqual(tom_retry.json(), tom_first.json())
        tom_upload, nadia_upload = self.upload(tom_listing, key), self.upload(nadia_listing, key, user=self.nadia)
        self.assertEqual((tom_upload.status_code, nadia_upload.status_code), (201, 201))
        self.assertNotEqual(tom_upload.json()['id'], nadia_upload.json()['id'])
        self.assertEqual(self.receipts('LISTING_UPDATE'), 2)
        self.assertEqual(self.receipts('IMAGE_UPLOAD'), 2)

    def test_revoked_manager_access_refuses_the_retry_without_leaking_the_outcome(self):
        listing_id = self.listing_for()
        keys = {name: uuid4() for name in ('patch', 'audience', 'submit', 'upload')}
        self.assertEqual(self.patch_listing(listing_id, keys['patch']).status_code, 200)
        self.assertEqual(self.audience(listing_id, keys['audience'], expected_version=2).status_code, 200)
        self.assertEqual(self.upload(listing_id, keys['upload']).status_code, 201)
        self.assertEqual(self.submit(listing_id, keys['submit'], version=3).status_code, 200)
        self.tom_site.owner = self.nadia_profile  # ownership moved: Tom no longer manages this pharmacy
        self.tom_site.save(update_fields=['owner'])
        for name, retry in (
            ('patch', lambda: self.patch_listing(listing_id, keys['patch'])),
            ('audience', lambda: self.audience(listing_id, keys['audience'], expected_version=2)),
            ('upload', lambda: self.upload(listing_id, keys['upload'])),
            ('submit', lambda: self.submit(listing_id, keys['submit'], version=3)),
        ):
            with self.subTest(action=name):
                response = retry()
                self.assertEqual(response.status_code, 403, response.content)
                body = response.json()
                for leaked in ('version', 'id', 'title', 'publication_status', 'current_circle', 'moderation_status'):
                    self.assertNotIn(leaked, body)
        self.assertEqual(MarketplaceImage.objects.filter(listing_id=listing_id).count(), 1)

    # 4. deleted listing or image -> 410, never recreated
    def test_deleted_listing_before_retry_is_gone(self):
        payload = self.create_payload()
        created = self.client_for(self.tom).post(API + 'listings/', payload, format='json')
        self.assertEqual(created.status_code, 201, created.content)
        MarketplaceListing.objects.filter(pk=created.json()['id']).delete()
        retry = self.client_for(self.tom).post(API + 'listings/', payload, format='json')
        self.assertEqual(retry.status_code, 410, retry.content)
        self.assertFalse(MarketplaceListing.objects.exists())

        for name in ('patch', 'audience', 'submit', 'upload'):
            with self.subTest(action=name):
                listing_id, key = self.listing_for(), uuid4()
                send = {'patch': self.patch_listing, 'audience': self.audience, 'submit': self.submit, 'upload': self.upload}[name]
                self.assertIn(send(listing_id, key).status_code, (200, 201))
                MarketplaceListing.objects.filter(pk=listing_id).delete()
                retry = send(listing_id, key)
                self.assertEqual(retry.status_code, 410, retry.content)
                self.assertFalse(MarketplaceListing.objects.filter(pk=listing_id).exists())
        self.assertFalse(MarketplaceImage.objects.exists())

    def test_deleted_image_before_retry_is_gone_not_recreated(self):
        listing_id, key = self.listing_for(), uuid4()
        first = self.upload(listing_id, key)
        self.assertEqual(first.status_code, 201, first.content)
        removed = self.client_for(self.tom).delete(API + f"images/{first.json()['id']}/")
        self.assertEqual(removed.status_code, 204)
        retry = self.upload(listing_id, key)
        self.assertEqual(retry.status_code, 410, retry.content)
        self.assertFalse(MarketplaceImage.objects.filter(listing_id=listing_id).exists())

    # 5. unkeyed legacy requests (positive control) and a new key making a new effect
    def test_unkeyed_requests_behave_as_before(self):
        listing_id = self.listing_for()
        self.assertEqual(self.patch_listing(listing_id, None).status_code, 200)
        stale = self.patch_listing(listing_id, None)
        self.assertEqual((stale.status_code, stale.json()), (409, {'code': 'STALE_VERSION'}))
        self.assertEqual(self.audience(listing_id, None, expected_version=2).status_code, 200)
        self.assertEqual(self.upload(listing_id, None).status_code, 201)
        self.assertEqual(self.upload(listing_id, None).status_code, 201)
        submitted = self.submit(listing_id, None, version=3)
        self.assertEqual(submitted.status_code, 200, submitted.content)
        self.assertEqual(submitted.json()['publication_status'], 'PENDING_REVIEW')
        self.assertEqual(MarketplaceImage.objects.filter(listing_id=listing_id).count(), 2)
        self.assertFalse(MarketplaceRequestReceipt.objects.exclude(action='LISTING_CREATE').exists())

    def test_new_key_with_the_same_payload_makes_a_new_effect(self):
        listing_id = self.listing_for()
        first, second = self.upload(listing_id, uuid4()), self.upload(listing_id, uuid4())
        self.assertEqual((first.status_code, second.status_code), (201, 201))
        self.assertNotEqual(first.json()['id'], second.json()['id'])
        self.assertEqual(MarketplaceImage.objects.filter(listing_id=listing_id).count(), 2)
        payload = self.create_payload()
        again = {**payload, 'client_request_id': str(uuid4())}
        self.assertEqual(self.client_for(self.tom).post(API + 'listings/', payload, format='json').status_code, 201)
        self.assertEqual(self.client_for(self.tom).post(API + 'listings/', again, format='json').status_code, 201)
        self.assertEqual(MarketplaceListing.objects.filter(creator=self.tom).count(), 3)

    # 6. file write failure mid-upload
    def test_file_write_failure_rolls_back_rows_files_and_receipt(self):
        listing_id, key = self.listing_for(), uuid4()
        real_save, writes = FileSystemStorage._save, []

        def fail_on_derivative(storage, name, content):
            writes.append(name)
            if 'derivatives' in name:
                raise OSError('disk full while writing the derivative')
            return real_save(storage, name, content)

        with patch.object(FileSystemStorage, '_save', fail_on_derivative):
            failed = self.upload(listing_id, key)
        self.assertTrue(any('originals' in name for name in writes), 'the original was written before the failure')
        self.assertNotEqual(failed.status_code, 201)
        self.assertFalse(MarketplaceImage.objects.filter(listing_id=listing_id).exists())
        self.assertEqual(media_files(self.media), [], 'no orphan file left by the failed attempt')
        self.assertEqual(self.receipts('IMAGE_UPLOAD'), 0)
        retry = self.upload(listing_id, key)
        self.assertEqual(retry.status_code, 201, retry.content)
        self.assertEqual(MarketplaceImage.objects.filter(listing_id=listing_id).count(), 1)
        self.assertEqual(len(media_files(self.media)), 2)


def run_parallel(test, jobs, timeout=20):
    """Run each job in its own thread and DB connection; return [(status, body)] in job order."""
    start, results = Barrier(len(jobs)), Queue()

    def worker(index, job):
        close_old_connections()
        try:
            start.wait(timeout=10)
            response = job()
            results.put((index, response.status_code, response.json() if response.content else None))
        except Exception as exc:  # surfaced through the assertion below
            results.put((index, 500, repr(exc)))
        finally:
            close_old_connections()

    threads = [Thread(target=worker, args=(i, job)) for i, job in enumerate(jobs)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=timeout)
    test.assertFalse(any(thread.is_alive() for thread in threads), 'race timed out')
    rows = sorted(results.get(timeout=5) for _ in threads)
    return [(status, body) for _, status, body in rows]


def both_checked_before_writing(parties=2):
    """Hold each request after its (unlocked) manager check until the other has read the listing too."""
    meeting, local, original = Barrier(parties), threading.local(), services.assert_listing_manager

    def checked(user, listing):
        original(user, listing)
        if not getattr(local, 'met', False):
            local.met = True
            try:
                meeting.wait(timeout=2)
            except BrokenBarrierError:
                pass
    return patch.multiple(views, assert_listing_manager=checked), patch.multiple(services, assert_listing_manager=checked)


@skipUnless(connection.vendor == 'postgresql', 'PostgreSQL row locks required.')
@override_settings(MARKETPLACE_NEW_LISTINGS_ENABLED=True, MARKETPLACE_ALL_WRITES_ENABLED=True)
class MarketplaceReplayConcurrency(ReplayFixture, TransactionTestCase):
    def race(self, *jobs):
        view_patch, service_patch = both_checked_before_writing(len(jobs))
        with view_patch, service_patch:
            return run_parallel(self, list(jobs))

    def test_same_key_submit_retries_in_parallel_commit_once(self):
        listing_id, key = self.listing_for(), uuid4()
        results = self.race(lambda: self.submit(listing_id, key), lambda: self.submit(listing_id, key))
        self.assertEqual([status for status, _ in results], [200, 200], results)
        self.assertEqual(results[0][1], results[1][1])
        self.assertEqual(MarketplaceAuditEvent.objects.filter(action='LISTING_SUBMIT', target_id=listing_id).count(), 1)
        self.assertEqual(MarketplaceListing.objects.get(pk=listing_id).version, 2)

    def test_same_key_upload_retries_in_parallel_store_one_photo(self):
        listing_id, key = self.listing_for(), uuid4()
        results = self.race(lambda: self.upload(listing_id, key), lambda: self.upload(listing_id, key))
        self.assertEqual([status for status, _ in results], [201, 201], results)
        self.assertEqual(results[0][1], results[1][1])
        self.assertEqual(MarketplaceImage.objects.filter(listing_id=listing_id).count(), 1)
        self.assertEqual(len(media_files(self.media)), 2, 'no orphan file from the replayed attempt')

    def test_same_key_patch_retries_in_parallel_commit_once(self):
        listing_id, key = self.listing_for(), uuid4()
        results = self.race(lambda: self.patch_listing(listing_id, key), lambda: self.patch_listing(listing_id, key))
        self.assertEqual([status for status, _ in results], [200, 200], results)
        self.assertEqual(results[0][1], results[1][1])
        self.assertEqual(MarketplaceRequestReceipt.objects.filter(action='LISTING_UPDATE').count(), 1)

    def assert_one_winner(self, results, listing_id):
        statuses = sorted(status for status, _ in results)
        self.assertEqual(statuses, [200, 409], results)  # no lost update, no deadlock (500)
        self.assertEqual(MarketplaceListing.objects.get(pk=listing_id).version, 2)

    def test_audience_versus_patch_has_no_lost_update(self):
        listing_id = self.listing_for()
        results = self.race(lambda: self.audience(listing_id, uuid4(), current_circle='ORGANISATION'),
                            lambda: self.patch_listing(listing_id, uuid4(), title='Racing edit'))
        self.assert_one_winner(results, listing_id)
        listing = MarketplaceListing.objects.select_related('audience').get(pk=listing_id)
        audience_won = results[0][0] == 200
        self.assertEqual(listing.audience.current_circle == 'ORGANISATION', audience_won)
        self.assertEqual(listing.title == 'Racing edit', not audience_won)

    def test_audience_versus_submit_has_no_lost_update(self):
        listing_id = self.listing_for()
        results = self.race(lambda: self.audience(listing_id, uuid4(), current_circle='ORGANISATION'),
                            lambda: self.submit(listing_id, uuid4()))
        self.assert_one_winner(results, listing_id)
        listing = MarketplaceListing.objects.select_related('audience').get(pk=listing_id)
        audience_won = results[0][0] == 200
        self.assertEqual(listing.audience.current_circle == 'ORGANISATION', audience_won)
        self.assertEqual(listing.publication_status == 'PENDING_REVIEW', not audience_won)

    def test_simultaneous_uploads_at_five_photos_never_exceed_six(self):
        listing_id = self.listing_for()
        listing = MarketplaceListing.objects.get(pk=listing_id)
        for position in range(5):
            MarketplaceImage.objects.create(listing=listing, uploader=self.tom, position=position,
                                            original=f'marketplace/originals/seed-{position}.jpg')
        results = self.race(lambda: self.upload(listing_id, uuid4(), color='red'),
                            lambda: self.upload(listing_id, uuid4(), color='blue'))
        self.assertEqual(sorted(status for status, _ in results), [201, 400], results)
        self.assertEqual(MarketplaceImage.objects.filter(listing_id=listing_id).count(), 6)
        self.assertEqual(len(media_files(self.media)), 2, 'the refused upload leaves no file')
        self.assertEqual(MarketplaceRequestReceipt.objects.filter(action='IMAGE_UPLOAD').count(), 1)
