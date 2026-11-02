from unittest.mock import patch
from django.test import TestCase, override_settings
from client_profile.characterization_support import make_owner_with_pharmacy, make_user
from onboarding.models import PharmacistOnboarding
from testing.invoice_acceptance_fixture import seed_invoice_work
from worker_finance.services import internal_invoice_prefill, internal_invoice_sources


@override_settings(EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend')
class InvoiceAcceptanceFixtureTests(TestCase):
    def test_seed_creates_real_eligible_accepted_work_and_preserves_source_snapshot(self):
        owner, pharmacy = make_owner_with_pharmacy()
        worker = make_user('PHARMACIST')
        PharmacistOnboarding.objects.create(user=worker)
        with patch.dict('os.environ', APP_ENV='test', DJANGO_SETTINGS_MODULE='core.e2e_acceptance_settings'):
            shift, assignment = seed_invoice_work(worker, pharmacy)
        [source] = internal_invoice_sources(worker)
        self.assertEqual(source['shift_id'], shift.pk)
        draft = internal_invoice_prefill(worker, [assignment.pk])
        self.assertEqual(draft['lines'][0]['quantity'], '8.00')
        self.assertEqual(draft['lines'][0]['unit_price'], '70.00')
        self.assertTrue(draft['gst_registered'])
        self.assertEqual(draft['customer']['email'], owner.email)

    def test_seed_refuses_normal_application_settings(self):
        with self.assertRaises(RuntimeError):
            seed_invoice_work(None, None)
