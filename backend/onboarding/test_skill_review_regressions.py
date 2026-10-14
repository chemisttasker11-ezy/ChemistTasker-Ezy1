"""Recruitment taxonomy review: retained evidence and fail-closed requirements."""
from types import SimpleNamespace
from unittest.mock import Mock, patch

from django.test import SimpleTestCase
from rest_framework.exceptions import ValidationError

from onboarding.services.skill_identity import evaluate_match, normalize_skills, registry
from onboarding.services.skills import apply_skills_tab, _canonical_skills, _required_cert_skill_codes
from shifts.serialization.shifts import ShiftSerializer
from talent.serializers.explorer import ExplorerPostReadSerializer, ExplorerPostWriteSerializer


class SkillReviewRegressions(SimpleTestCase):
    def test_credentialed_skill_claim_can_be_saved_without_evidence(self):
        profile = SimpleNamespace(user_id=1, skills=[], skill_certificates={}, save=Mock())
        apply_skills_tab(profile, {}, initial_data={'skills': ['VACCINATION']}, uploads={},
                         role_key='pharmacist')
        self.assertEqual(profile.skills, ['VACCINATION'])
        self.assertEqual(profile.skill_certificates, {})
        profile.save.assert_called_once()

    def test_removed_choices_never_match(self):
        self.assertEqual(len(registry()['skills']), 67)
        for code in ('CASH_HANDLING', 'PHONE_ENQUIRIES', 'WORD', 'OTHER'):
            self.assertFalse(evaluate_match([code], [], [code])['matches_required'])
            with self.assertRaises(ValidationError):
                normalize_skills([code], strict=True, matchable_only=True)

    def test_narrow_claims_cannot_satisfy_broader_requirements(self):
        for old, broader in (('S8_RECORDS', 'S8_PROCEDURES'), ('BLOOD_PRESSURE_CHECK', 'HEALTH_CHECKS'),
                             ('ANAPHYLAXIS_MANAGEMENT', 'FIRST_AID'), ('CUSTOMER_SERVICE', 'POS_CUSTOMER')):
            self.assertFalse(evaluate_match([broader], [], [old])['matches_required'])
            with self.assertRaises(ValidationError):
                normalize_skills([old], strict=True)
        self.assertEqual(normalize_skills(['methadone', 'WinIFRED']), ['PHARMACOTHERAPY_METHADONE_SUBOXONE', 'FRED'])

    def test_anaphylaxis_document_does_not_become_first_aid_proof(self):
        profile = SimpleNamespace(user_id=1, skills=['ANAPHYLAXIS_MANAGEMENT'],
                                  skill_certificates={'ANAPHYLAXIS_MANAGEMENT': {'path': 'anaphylaxis.pdf'}}, save=Mock())
        with patch('onboarding.services.skills.default_storage.delete') as delete:
            apply_skills_tab(profile, {}, initial_data={'skills': ['FIRST_AID']}, uploads={},
                             role_key='pharmacist', keep_history=True)
        profile.save.assert_called_once()
        self.assertEqual(profile.skills, ['FIRST_AID'])  # Explicit claim is allowed, but old proof is not broadened.
        delete.assert_not_called()
        self.assertNotIn('FIRST_AID', profile.skill_certificates)

    def test_certificates_only_for_credentialed_services(self):
        required = _required_cert_skill_codes('pharmacist')
        self.assertIn('VACCINATION', required)
        self.assertIn('ADVANCED_COMPOUNDING', required)
        self.assertNotIn('COMPOUNDING', required)
        self.assertFalse({s['code'] for s in registry()['skills'] if s['group'] == 'Software & Digital'} & required)

    def test_partial_edit_does_not_drop_unknown_required_codes(self):
        shift = SimpleNamespace(role_needed='PHARMACIST', must_have=['UNKNOWN_REQUIRED'], nice_to_have=[])
        for attrs in ({'nice_to_have': ['FRED']}, {'role_needed': 'TECHNICIAN'}):
            with self.assertRaises(ValidationError):
                ShiftSerializer(instance=shift).validate(attrs)
        self.assertEqual(shift.must_have, ['UNKNOWN_REQUIRED'])
        self.assertFalse(evaluate_match(shift.must_have, [], [])['matches_required'])

    def test_removed_claim_is_rejected(self):
        profile = SimpleNamespace(skills=['OTHER'])
        with self.assertRaises(ValidationError):
            _canonical_skills(profile, ['OTHER'], 'pharmacist')
        with self.assertRaises(ValidationError):
            _canonical_skills(SimpleNamespace(skills=[]), ['OTHER'], 'pharmacist')

    def test_legacy_certificate_is_rekeyed_without_deleting_proof(self):
        profile = SimpleNamespace(user_id=1, skills=['VACCINATOR'],
                                  skill_certificates={'VACCINATOR': {'path': 'historic.pdf'}}, save=Mock())
        with patch('onboarding.services.skills.default_storage.delete') as delete:
            apply_skills_tab(profile, {}, initial_data={'skills': ['Vaccination']}, uploads={},
                             role_key='pharmacist')
        self.assertEqual(profile.skills, ['VACCINATION'])
        self.assertEqual(profile.skill_certificates['VACCINATION']['path'], 'historic.pdf')
        delete.assert_not_called()

    def test_canonical_certificate_wins_when_alias_and_code_both_exist(self):
        profile = SimpleNamespace(user_id=1, skills=['VACCINATION'], skill_certificates={
            'VACCINATOR': {'path': 'old.pdf'}, 'VACCINATION': {'path': 'current.pdf'}}, save=Mock())
        with patch('onboarding.services.skills.default_storage.delete') as delete:
            apply_skills_tab(profile, {}, initial_data={'skills': ['VACCINATION']}, uploads={},
                             role_key='pharmacist')
        self.assertEqual(profile.skill_certificates['VACCINATION']['path'], 'current.pdf')
        delete.assert_not_called()

    def test_malformed_onboarding_list_returns_validation_error(self):
        profile = SimpleNamespace(skills=[])
        for payload in ({'FRED': True}, 3, ['FRED', None]):
            with self.assertRaises(ValidationError):
                apply_skills_tab(profile, {}, initial_data={'skills': payload}, uploads={},
                                 role_key='pharmacist')

    def test_role_patch_revalidates_persisted_requirements(self):
        shift = SimpleNamespace(role_needed='PHARMACIST', must_have=['DAA_FINAL_CHECK'], nice_to_have=[])
        with self.assertRaises(ValidationError):
            ShiftSerializer(instance=shift).validate({'role_needed': 'TECHNICIAN'})
        with self.assertRaises(ValidationError):
            ShiftSerializer(instance=shift).validate({'role_needed': 'EXPLORER'})

    def test_overlap_is_caught_even_when_untouched_requirement_uses_alias(self):
        shift = SimpleNamespace(role_needed='PHARMACIST', must_have=['DAA'], nice_to_have=[])
        with self.assertRaises(ValidationError):
            ShiftSerializer(instance=shift).validate({'nice_to_have': ['WEBSTER_PACKING_DAA']})

    def test_software_field_rejects_a_clinical_skill(self):
        user = SimpleNamespace(role='PHARMACIST', is_authenticated=True)
        serializer = ExplorerPostWriteSerializer(context={'request': SimpleNamespace(user=user)})
        with self.assertRaises(ValidationError):
            serializer.validate({'role_category': 'PHARMACIST', 'software': ['VACCINATION']})

    def test_explorer_cannot_publish_as_a_pharmacist(self):
        user = SimpleNamespace(role='EXPLORER', is_authenticated=True)
        serializer = ExplorerPostWriteSerializer(context={'request': SimpleNamespace(user=user)})
        with self.assertRaises(ValidationError):
            serializer.validate({'role_category': 'PHARMACIST', 'skills': ['VACCINATION']})

    def test_staff_subtype_limits_talent_skills(self):
        user = SimpleNamespace(role='OTHER_STAFF', is_authenticated=True)
        serializer = ExplorerPostWriteSerializer(context={'request': SimpleNamespace(user=user)})
        with patch('talent.serializers.explorer.OtherStaffOnboarding.objects') as profiles:
            profiles.filter.return_value.first.return_value = SimpleNamespace(role_type='TECHNICIAN')
            with self.assertRaises(ValidationError):
                serializer.validate({'role_category': 'OTHER_STAFF', 'skills': ['DAA_FINAL_CHECK']})

    def test_talent_software_comes_from_current_claims(self):
        post = SimpleNamespace(role_category='PHARMACIST', software=['OTHER', 'VACCINATION'])
        serializer = ExplorerPostReadSerializer()
        with patch.object(serializer, 'get_skills', return_value=['FRED', 'VACCINATION']):
            self.assertEqual(serializer.get_software(post), ['FRED'])
