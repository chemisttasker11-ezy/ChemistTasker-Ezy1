"""The same representative kiosk authority cases run in TypeScript and Django."""
import json
from pathlib import Path
from django.test import TestCase
from attendance.credentials import is_authorized_kiosk_manager
from client_profile.characterization_support import make_user
from organizations.models import Pharmacy, PharmacyAdmin

class CrossClientKioskAuthorityTests(TestCase):
    def test_shared_contract_against_actual_database_authority(self):
        cases = json.loads((Path(__file__).resolve().parents[1] / 'testing/contracts/kiosk_authority.json').read_text())
        pharmacies = {pk: Pharmacy.objects.create(pk=pk, name=f'Contract {pk}') for pk in (7, 8)}
        for row in cases:
            with self.subTest(case=row['name']):
                user = make_user('PHARMACIST')
                for assignment in row['user']['admin_assignments']:
                    PharmacyAdmin.objects.create(user=user, pharmacy=pharmacies[assignment['pharmacy_id']], admin_level=assignment['admin_level'], is_active=True)
                self.assertEqual(is_authorized_kiosk_manager(user, pharmacies[row['target_id']]), row['expected'])
