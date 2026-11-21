"""M5-04 controls: real posting and template endpoints retain pharmacy scope."""
from client_profile.characterization_support import client_for, make_owner_with_pharmacy, make_user
from organizations.models import Organization, PharmacyAdmin
from shifts.test_shift_posting_contract import ShiftPostingFixture, queued_emails
from users.models import OrganizationMembership


class PostingScopeControls(ShiftPostingFixture):
    def setUp(self):
        super().setUp()
        self.nadia, self.foreign = make_owner_with_pharmacy('M5 foreign B')
        org = Organization.objects.create(name='M5 scope organization')
        self.pharmacy.organization = org
        self.pharmacy.save(update_fields=['organization'])
        self.lina = make_user('OWNER')
        OrganizationMembership.objects.create(user=self.lina, organization=org, role='ORG_ADMIN')
        self.dee = make_user('OWNER')
        PharmacyAdmin.objects.create(user=self.dee, pharmacy=self.pharmacy,
                                     admin_level=PharmacyAdmin.AdminLevel.ROSTER_MANAGER)
        self.sam = make_user('OWNER')
        PharmacyAdmin.objects.create(user=self.sam, pharmacy=self.pharmacy,
                                     admin_level=PharmacyAdmin.AdminLevel.COMMUNICATION_MANAGER)
        self.omar = make_user('PHARMACIST')
        self.ali = make_user('OTHER_STAFF')
        self.zoe = make_user('EXPLORER')

    def test_post_and_patch_permission_matrix(self):
        url = '/api/v1/shifts/'
        cases = [(self.owner, 201), (self.lina, 201), (self.dee, 201),
                 (self.sam, 403), (self.omar, 403), (self.ali, 403),
                 (self.zoe, 403), (self.nadia, 403), (None, 401)]
        shift_id = None
        for actor, status in cases:
            with self.subTest(actor=getattr(actor, 'email', 'anonymous'), operation='POST'):
                with queued_emails():
                    response = client_for(actor).post(url, self.payload(), format='json')
                self.assertEqual(response.status_code, status, getattr(response, 'data', None))
                if actor == self.owner and status == 201:
                    shift_id = response.data['id']
        self.assertIsNotNone(shift_id)
        for actor, post_status in cases:
            with self.subTest(actor=getattr(actor, 'email', 'anonymous'), operation='PATCH'):
                response = client_for(actor).patch(f'{url}{shift_id}/', {'description': 'Changed'}, format='json')
                expected = 200 if post_status == 201 else 401 if actor is None else 404
                self.assertEqual(response.status_code, expected,
                                 getattr(response, 'data', None))
        response = client_for(self.dee).post(url, self.payload(pharmacy=self.foreign.id), format='json')
        self.assertEqual(response.status_code, 403, response.data)

    def test_template_upsert_and_foreign_delete(self):
        url = '/api/v1/shift-description-templates/'
        owner = client_for(self.owner)
        payload = {'pharmacy': self.pharmacy.id, 'role_needed': 'PHARMACIST', 'description': 'First'}
        created = owner.post(url, payload, format='json')
        self.assertEqual(created.status_code, 201, created.data)
        updated = owner.post(url, {**payload, 'description': 'Second'}, format='json')
        self.assertEqual(updated.status_code, 200, updated.data)
        self.assertEqual(created.data['id'], updated.data['id'])
        foreign = client_for(self.nadia).post(url, {**payload, 'pharmacy': self.foreign.id}, format='json')
        self.assertEqual(foreign.status_code, 201, foreign.data)
        listing = owner.get(url)
        self.assertEqual(listing.status_code, 200, listing.data)
        rows = listing.data.get('results', []) if isinstance(listing.data, dict) else listing.data
        self.assertIn(created.data['id'], [row['id'] for row in rows])
        self.assertNotIn(foreign.data['id'], [row['id'] for row in rows])
        self.assertEqual(owner.delete(f'{url}{foreign.data["id"]}/').status_code, 404)
