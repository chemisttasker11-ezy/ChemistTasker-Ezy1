from datetime import timedelta

from django.utils import timezone

from onboarding.models import OtherStaffOnboarding, PharmacistOnboarding
from onboarding.services.indemnity import indemnity_status
from onboarding.test_role_tabs_contract import RoleTabFixture, pdf


class IndemnityTests(RoleTabFixture):
    def test_status(self):
        today = timezone.localdate()
        obj = PharmacistOnboarding(indemnity_certificate='cover.pdf', indemnity_expiry=today)
        self.assertEqual(indemnity_status(obj, today), 'shown')
        obj.indemnity_expiry = today + timedelta(days=1)
        self.assertEqual(indemnity_status(obj, today), 'shown')
        obj.indemnity_expiry = today - timedelta(days=1)
        self.assertEqual(indemnity_status(obj, today), 'expired')
        obj.indemnity_certificate = None
        self.assertEqual(indemnity_status(obj, today), 'missing')
        obj = OtherStaffOnboarding(role_type='ASSISTANT', indemnity_certificate='cover.pdf', indemnity_expiry=today)
        self.assertIsNone(indemnity_status(obj, today))

    def test_worker_profile_upload_and_read(self):
        for label, tab, fields in [('pharmacist', 'profile', {}), ('otherstaff', 'regulatory', {'role_type': 'INTERN'})]:
            with self.subTest(label=label):
                user, obj, url = self.onboarding(label, **fields)
                response, _ = self.patch(user, url, {'tab': tab, 'indemnity_insurer': 'Example insurer',
                    'indemnity_expiry': timezone.localdate().isoformat(), 'indemnity_certificate': pdf()}, multipart=True)
                self.assertEqual(response.status_code, 200, response.data)
                obj.refresh_from_db()
                self.assertEqual(obj.indemnity_insurer, 'Example insurer')
                self.assertTrue(obj.indemnity_certificate.storage.exists(obj.indemnity_certificate.name))
                self.assertEqual(response.data['indemnity_status'], 'shown')
                response = self.get(user, url)
                self.assertEqual(response.data['indemnity_status'], 'shown')
                self.assertEqual(response.data['indemnity_insurer'], 'Example insurer')
                self.assertTrue(response.data['indemnity_certificate'])

    def test_non_intern_does_not_offer_cover(self):
        user, obj, url = self.onboarding('otherstaff')
        response = self.get(user, url)
        self.assertIsNone(response.data['indemnity_status'])
        self.assertNotIn('indemnity_certificate', response.data)
        response, _ = self.patch(user, url, {'tab': 'regulatory', 'indemnity_insurer': 'Ignored'})
        self.assertEqual(response.status_code, 200, response.data)
        obj.refresh_from_db()
        self.assertEqual(obj.indemnity_insurer, '')
