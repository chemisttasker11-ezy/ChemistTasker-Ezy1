from uuid import uuid4

from django.test import SimpleTestCase, TestCase, override_settings

from client_profile.characterization_support import client_for, make_owner_with_pharmacy
from organizations.models import Pharmacy


class PharmacyCreateCorsTests(SimpleTestCase):
    @override_settings(CORS_ALLOWED_ORIGINS=['https://pharmacy.example'], SECURE_SSL_REDIRECT=False)
    def test_browser_preflight_allows_idempotency_header(self):
        response = self.client.options(
            '/api/v1/pharmacies/',
            HTTP_ORIGIN='https://pharmacy.example',
            HTTP_ACCESS_CONTROL_REQUEST_METHOD='POST',
            HTTP_ACCESS_CONTROL_REQUEST_HEADERS='content-type,idempotency-key',
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response['Access-Control-Allow-Origin'], 'https://pharmacy.example')
        self.assertIn('idempotency-key', response['Access-Control-Allow-Headers'])


class PharmacyCreateIdempotencyTests(TestCase):
    url = '/api/v1/pharmacies/'
    payload = {'name': 'Retry Pharmacy', 'abn': '51824753556'}

    def setUp(self):
        self.owner, _ = make_owner_with_pharmacy()
        self.client = client_for(self.owner)
        self.key = str(uuid4())

    def test_retry_returns_original_pharmacy_without_creating_another(self):
        before = Pharmacy.objects.count()
        first = self.client.post(self.url, self.payload, format='json', HTTP_IDEMPOTENCY_KEY=self.key)
        second = self.client.post(self.url, self.payload, format='json', HTTP_IDEMPOTENCY_KEY=self.key)
        self.assertEqual(first.status_code, 201, first.content)
        self.assertEqual(second.status_code, 200, second.content)
        self.assertEqual(second.data, first.data)
        self.assertEqual(Pharmacy.objects.count(), before + 1)
        pharmacy = Pharmacy.objects.get(pk=first.data['id'])
        self.assertEqual(str(pharmacy.idempotency_key), self.key)
        self.assertEqual(pharmacy.idempotency_user_id, self.owner.pk)
        self.assertNotIn('idempotency_key', first.data)
        self.assertNotIn('idempotency_user', first.data)

    def test_other_user_cannot_replay_key_even_with_access_to_pharmacy(self):
        first = self.client.post(self.url, self.payload, format='json', HTTP_IDEMPOTENCY_KEY=self.key)
        self.assertEqual(first.status_code, 201, first.content)
        other, other_pharmacy = make_owner_with_pharmacy('Other owner')
        # Ownership can change; the key must remain bound to the original submitter.
        Pharmacy.objects.filter(pk=first.data['id']).update(owner=other_pharmacy.owner)
        before = Pharmacy.objects.count()
        response = client_for(other).post(self.url, self.payload, format='json', HTTP_IDEMPOTENCY_KEY=self.key)
        self.assertEqual(response.status_code, 400, response.content)
        self.assertNotIn('id', response.data)
        self.assertEqual(Pharmacy.objects.count(), before)

    def test_without_key_each_request_still_creates_a_pharmacy(self):
        before = Pharmacy.objects.count()
        first = self.client.post(self.url, self.payload, format='json')
        second = self.client.post(self.url, self.payload, format='json')
        self.assertEqual(first.status_code, 201, first.content)
        self.assertEqual(second.status_code, 201, second.content)
        self.assertNotEqual(second.data['id'], first.data['id'])
        self.assertEqual(Pharmacy.objects.count(), before + 2)
        self.assertFalse(Pharmacy.objects.filter(id__in=[first.data['id'], second.data['id']])
                         .exclude(idempotency_key=None, idempotency_user=None).exists())

    def test_invalid_uuid_is_rejected_without_creating_a_pharmacy(self):
        before = Pharmacy.objects.count()
        for key in ('not-a-uuid', ''):
            response = self.client.post(self.url, self.payload, format='json', HTTP_IDEMPOTENCY_KEY=key)
            self.assertEqual(response.status_code, 400, response.content)
        self.assertEqual(Pharmacy.objects.count(), before)

    def test_validation_failure_does_not_consume_key(self):
        invalid = self.client.post(self.url, {}, format='json', HTTP_IDEMPOTENCY_KEY=self.key)
        self.assertEqual(invalid.status_code, 400, invalid.content)
        valid = self.client.post(self.url, self.payload, format='json', HTTP_IDEMPOTENCY_KEY=self.key)
        self.assertEqual(valid.status_code, 201, valid.content)
        self.assertEqual(Pharmacy.objects.filter(idempotency_key=self.key).count(), 1)

    def test_multipart_retry_returns_original_before_validating_changed_body(self):
        first = self.client.post(self.url, self.payload, format='multipart', HTTP_IDEMPOTENCY_KEY=self.key)
        second = self.client.post(self.url, {}, format='multipart', HTTP_IDEMPOTENCY_KEY=self.key)
        self.assertEqual(first.status_code, 201, first.content)
        self.assertEqual(second.status_code, 200, second.content)
        self.assertEqual(second.data['id'], first.data['id'])
        self.assertEqual(Pharmacy.objects.filter(idempotency_key=self.key).count(), 1)
