from uuid import uuid4
from tempfile import TemporaryDirectory

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import SimpleTestCase, TestCase, override_settings

from client_profile.characterization_support import client_for, make_owner_with_pharmacy, make_user
from memberships.models import Membership
from organizations.models import Organization, Pharmacy, PharmacyAdmin
from users.models import OrganizationMembership


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
        self.assertNotIn('idempotency_fingerprint', first.data)
        self.assertEqual(len(pharmacy.idempotency_fingerprint), 64)

    def assert_revoked_replay(self, pharmacy_id):
        before = Pharmacy.objects.count()
        self.assertEqual(self.client.get(f'{self.url}{pharmacy_id}/').status_code, 404)
        for payload in (self.payload, {'name': 'Changed details'}):
            response = self.client.post(self.url, payload, format='json', HTTP_IDEMPOTENCY_KEY=self.key)
            self.assertEqual(response.status_code, 404, response.content)
            self.assertNotIn('pharmacy_id', response.data)
            self.assertNotIn('id', response.data)
        self.assertEqual(Pharmacy.objects.count(), before)

    def test_transferred_owner_cannot_replay_after_access_is_removed(self):
        first = self.client.post(self.url, self.payload, format='json', HTTP_IDEMPOTENCY_KEY=self.key)
        self.assertEqual(first.status_code, 201, first.content)
        _, other_pharmacy = make_owner_with_pharmacy('New owner')
        pharmacy_id = first.data['id']
        Pharmacy.objects.filter(pk=pharmacy_id).update(owner=other_pharmacy.owner)
        PharmacyAdmin.objects.filter(user=self.owner, pharmacy_id=pharmacy_id).delete()
        Membership.objects.filter(user=self.owner, pharmacy_id=pharmacy_id).delete()
        self.assert_revoked_replay(pharmacy_id)

    def test_org_admin_cannot_replay_after_scope_is_revoked(self):
        admin = make_user('ORG_STAFF')
        org = Organization.objects.create(name='Retry Org', slug='retry-org')
        org_membership = OrganizationMembership.objects.create(user=admin, organization=org, role='ORG_ADMIN')
        self.client = client_for(admin)
        first = self.client.post(self.url, self.payload, format='json', HTTP_IDEMPOTENCY_KEY=self.key)
        self.assertEqual(first.status_code, 201, first.content)
        pharmacy_id = first.data['id']
        org_membership.role = 'REGION_ADMIN'
        org_membership.save(update_fields=['role'])
        org_membership.pharmacies.clear()
        PharmacyAdmin.objects.filter(user=admin, pharmacy_id=pharmacy_id).delete()
        Membership.objects.filter(user=admin, pharmacy_id=pharmacy_id).delete()
        self.assert_revoked_replay(pharmacy_id)

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
        for payload in ({}, ['invalid']):
            invalid = self.client.post(self.url, payload, format='json', HTTP_IDEMPOTENCY_KEY=self.key)
            self.assertEqual(invalid.status_code, 400, invalid.content)
        valid = self.client.post(self.url, self.payload, format='json', HTTP_IDEMPOTENCY_KEY=self.key)
        self.assertEqual(valid.status_code, 201, valid.content)
        self.assertEqual(Pharmacy.objects.filter(idempotency_key=self.key).count(), 1)

    def test_multipart_retry_rejects_changed_body_without_creating_another(self):
        first = self.client.post(self.url, self.payload, format='multipart', HTTP_IDEMPOTENCY_KEY=self.key)
        second = self.client.post(self.url, {}, format='multipart', HTTP_IDEMPOTENCY_KEY=self.key)
        self.assertEqual(first.status_code, 201, first.content)
        self.assertEqual(second.status_code, 409, second.content)
        self.assertEqual(second.data['pharmacy_id'], first.data['id'])
        self.assertIn('different details', second.data['detail'])
        self.assertEqual(Pharmacy.objects.filter(idempotency_key=self.key).count(), 1)

    def test_changed_name_or_abn_conflicts_but_reordered_fields_replay(self):
        first = self.client.post(self.url, self.payload, format='json', HTTP_IDEMPOTENCY_KEY=self.key)
        self.assertEqual(first.status_code, 201, first.content)
        reordered = dict(reversed(list(self.payload.items())))
        self.assertEqual(self.client.post(self.url, reordered, format='json', HTTP_IDEMPOTENCY_KEY=self.key).status_code, 200)
        for changes in ({'name': 'Changed'}, {'abn': '53004085616'}):
            response = self.client.post(self.url, {**self.payload, **changes}, format='json', HTTP_IDEMPOTENCY_KEY=self.key)
            self.assertEqual(response.status_code, 409, response.content)
            self.assertEqual(response.data['pharmacy_id'], first.data['id'])
        pharmacy = Pharmacy.objects.get(pk=first.data['id'])
        self.assertEqual(pharmacy.name, self.payload['name'])
        self.assertEqual(pharmacy.abn, self.payload['abn'])
        self.assertEqual(Pharmacy.objects.filter(idempotency_key=self.key).count(), 1)

    def test_multipart_fingerprint_includes_file_name_size_and_content(self):
        original = b'%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF\n'

        def submit(files=(('sops', 'sops.pdf', original),)):
            documents = {field: SimpleUploadedFile(name, content, content_type='application/pdf')
                         for field, name, content in files}
            return self.client.post(self.url, {**self.payload, **documents},
                                    format='multipart', HTTP_IDEMPOTENCY_KEY=self.key)

        with TemporaryDirectory() as media, override_settings(
            MEDIA_ROOT=media,
            STORAGES={'default': {'BACKEND': 'django.core.files.storage.FileSystemStorage'}},
        ):
            first = submit()
            self.assertEqual(first.status_code, 201, first.content)
            self.assertEqual(submit().status_code, 200)
            self.assertEqual(submit().status_code, 200)
            for files in ((('sops', 'renamed.pdf', original),),
                          (('sops', 'sops.pdf', original + b'\n'),),
                          (('sops', 'sops.pdf', original.replace(b'1 0 obj', b'2 0 obj')),),
                          (('induction_guides', 'sops.pdf', original),),
                          (('sops', 'sops.pdf', original), ('induction_guides', 'guide.pdf', original)),
                          ()):
                response = submit(files)
                self.assertEqual(response.status_code, 409, response.content)
                self.assertEqual(response.data['pharmacy_id'], first.data['id'])
            pharmacy = Pharmacy.objects.get(pk=first.data['id'])
            with pharmacy.sops.open('rb') as stored:
                self.assertEqual(stored.read(), original)
            self.assertEqual(Pharmacy.objects.filter(idempotency_key=self.key).count(), 1)

    def test_legacy_key_without_fingerprint_requires_edit_instead_of_claiming_success(self):
        first = self.client.post(self.url, self.payload, format='json', HTTP_IDEMPOTENCY_KEY=self.key)
        self.assertEqual(first.status_code, 201, first.content)
        Pharmacy.objects.filter(pk=first.data['id']).update(idempotency_fingerprint=None)
        response = self.client.post(self.url, self.payload, format='json', HTTP_IDEMPOTENCY_KEY=self.key)
        self.assertEqual(response.status_code, 409, response.content)
        self.assertEqual(response.data['pharmacy_id'], first.data['id'])
        self.assertEqual(Pharmacy.objects.filter(idempotency_key=self.key).count(), 1)
