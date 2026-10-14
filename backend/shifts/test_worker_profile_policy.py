from types import SimpleNamespace
from unittest.mock import patch
from django.test import SimpleTestCase
from shifts.access import _shift_roles_visible_to_user
from onboarding.services.work_profile import current_worker_profile
from onboarding.services.regulatory import apply_regulatory_tab
from onboarding.serializers import OtherStaffOnboardingV2Serializer
from unittest.mock import Mock


class WorkerProfilePolicyTests(SimpleTestCase):
    def test_user_cannot_mark_their_own_dispensing_qualification_verified(self):
        serializer = OtherStaffOnboardingV2Serializer()
        values = serializer.to_internal_value({'dispensary_qualification': 'LEVEL_3', 'dispensary_qualification_verified': True})
        self.assertEqual(values, {'dispensary_qualification': 'LEVEL_3'})

    def test_changing_claim_resets_its_evidence_badge_without_blocking_general_profile(self):
        profile = SimpleNamespace(role_type='ASSISTANT',classification_level='LEVEL_3',student_year=None,intern_half=None,
            dispensary_qualification='LEVEL_3',dispensary_qualification_verified=True,dispensary_qualification_verification_note='Checked',
            verified=True,save=Mock(),ahpra_number=None,ahpra_proof=None,hours_proof=None,certificate=None,university_id=None,cpr_certificate=None,s8_certificate=None)
        apply_regulatory_tab(profile, {'dispensary_qualification':'LEVEL_4'}, False)
        self.assertFalse(profile.dispensary_qualification_verified)
        self.assertEqual(profile.dispensary_qualification_verification_note, '')
        self.assertTrue(profile.verified)

    def test_historical_pharmacist_profile_is_not_queried_for_other_staff(self):
        user = SimpleNamespace(role='OTHER_STAFF')
        profile = SimpleNamespace(role_type='TECHNICIAN')
        with patch('onboarding.services.work_profile.OtherStaffOnboarding.objects.filter') as other, patch('onboarding.services.work_profile.PharmacistOnboarding.objects.filter') as pharmacist:
            other.return_value.first.return_value = profile
            self.assertIs(current_worker_profile(user), profile)
            pharmacist.assert_not_called()

    def test_missing_current_role_profile_does_not_fall_back_to_an_old_profession(self):
        with patch('onboarding.services.work_profile.OtherStaffOnboarding.objects.filter') as other, patch('onboarding.services.work_profile.PharmacistOnboarding.objects.filter') as pharmacist:
            other.return_value.first.return_value = None
            self.assertIsNone(current_worker_profile(SimpleNamespace(role='OTHER_STAFF')))
            pharmacist.assert_not_called()

    def test_other_staff_matrix_uses_claims_not_evidence_verification(self):
        cases = [
            ('INTERN', '', [], ['ASSISTANT', 'INTERN', 'TECHNICIAN']),
            ('STUDENT', '', [], ['ASSISTANT', 'STUDENT', 'TECHNICIAN']),
            ('TECHNICIAN', '', [], ['ASSISTANT', 'TECHNICIAN']),
            ('ASSISTANT', '', [], ['ASSISTANT']),
            ('ASSISTANT', 'LEVEL_3', [], ['ASSISTANT', 'TECHNICIAN']),
            ('ASSISTANT', '', ['PRESCRIPTION_DISPENSING'], ['ASSISTANT', 'TECHNICIAN']),
        ]
        for role, qualification, skills, expected in cases:
            with self.subTest(role=role, qualification=qualification, skills=skills), patch('shifts.access.OtherStaffOnboarding.objects.filter') as query:
                query.return_value.first.return_value = SimpleNamespace(role_type=role, dispensary_qualification=qualification, skills=skills, dispensary_qualification_verified=False, certificate=None)
                self.assertEqual(_shift_roles_visible_to_user(SimpleNamespace(role='OTHER_STAFF')), expected)
