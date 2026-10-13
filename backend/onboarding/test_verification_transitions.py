"""Verification transitions from the senior review of 2026-10-13, with the owner's decisions of the same day:
AHPRA numbers are for life and unique, an upgraded newcomer's post comes off the board, leaving Overseas cancels the
mobile skip, and one verification decision serves the screens and the background evaluation."""
from datetime import date
from io import StringIO
from unittest import mock

from django.core.management import call_command
from django.test import TestCase, override_settings
from django.utils import timezone

from client_profile.characterization_support import BASE, client_for, make_user
from onboarding.models import ExplorerOnboarding, OtherStaffOnboarding, PharmacistOnboarding
from onboarding.services.regulatory import apply_regulatory_tab
from onboarding.services.upgrade import upgrade_newcomer
from onboarding.verification.policy import verification_summary
from onboarding.verification.schema import VerificationSummarySerializer
from talent.models import ExplorerPost

STAFF_URL = BASE + 'otherstaff/onboarding/me/'
NEWCOMER_URL = BASE + 'explorer/onboarding/me/'


def worker(**fields):
    user = make_user('OTHER_STAFF', is_otp_verified=True, is_mobile_verified=True)
    return OtherStaffOnboarding.objects.create(user=user, **fields)


def newcomer(age=16, **fields):
    user = make_user('EXPLORER', first_name='Sam', last_name='Lee', is_otp_verified=True, is_mobile_verified=True)
    born = timezone.localdate().replace(year=timezone.localdate().year - age)
    profile = ExplorerOnboarding.objects.create(user=user, date_of_birth=born, role_type='JUNIOR', verified=True, **fields)
    post = ExplorerPost.objects.create(author_user=user, explorer_profile=profile, headline='Available',
                                       role_category='EXPLORER', is_anonymous=False)
    return user, profile, post


class AhpraNumberTests(TestCase):
    def test_a_checked_number_cannot_be_changed(self):
        profile = worker(role_type='INTERN', ahpra_number='PHA0000000001', ahpra_verified=True, verified=True)
        for submit in (False, True):
            response = client_for(profile.user).patch(STAFF_URL, {'tab': 'regulatory', 'ahpra_number': 'PHA0000000002',
                                                                  'submitted_for_verification': submit}, format='json')
            self.assertEqual(response.status_code, 400, response.data)
            self.assertIn('ahpra_number', response.data)
        profile.refresh_from_db()
        self.assertEqual((profile.ahpra_number, profile.ahpra_verified, profile.verified), ('PHA0000000001', True, True))

    def test_saving_the_same_checked_number_keeps_verified(self):
        profile = worker(role_type='INTERN', ahpra_number='PHA0000000001', ahpra_verified=True, verified=True)
        response = client_for(profile.user).patch(STAFF_URL, {'tab': 'regulatory', 'ahpra_number': ' PHA0000000001 '}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        profile.refresh_from_db()
        self.assertTrue(profile.ahpra_verified and profile.verified)

    def test_changing_an_unchecked_number_removes_verified_until_checked(self):
        # e.g. verified by admin before the AHPRA check existed
        profile = worker(role_type='INTERN', ahpra_number='PHA0000000001', verified=True)
        response = client_for(profile.user).patch(STAFF_URL, {'tab': 'regulatory', 'ahpra_number': 'PHA0000000003'}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        profile.refresh_from_db()
        self.assertFalse(profile.verified)
        self.assertFalse(response.data['verified'])

    def test_a_number_cannot_be_used_by_two_accounts(self):
        PharmacistOnboarding.objects.create(user=make_user('PHARMACIST'), ahpra_number='PHA0000000009')
        profile = worker(role_type='INTERN')
        response = client_for(profile.user).patch(STAFF_URL, {'tab': 'regulatory', 'ahpra_number': 'pha0000000009'}, format='json')
        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn('another account', str(response.data['ahpra_number']))

    def test_the_check_stays_with_the_number_across_role_changes(self):
        profile = worker(role_type='INTERN', ahpra_number='PHA0000000001', ahpra_verified=True, verified=True)
        apply_regulatory_tab(profile, {'role_type': 'ASSISTANT', 'classification_level': 'LEVEL_1'}, False)
        apply_regulatory_tab(profile, {'role_type': 'INTERN'}, False)
        profile.refresh_from_db()
        self.assertTrue(profile.ahpra_verified)  # the same lifelong number, already checked

    def test_an_intern_submitting_an_unchecked_number_notifies_the_admin_team(self):
        profile = worker(role_type='INTERN', ahpra_number='PHA0000000001')
        with mock.patch('onboarding.emails.notify_superuser_on_onboarding') as notify:
            apply_regulatory_tab(profile, {}, True)
            notify.assert_called_once_with(profile)
            profile.ahpra_verified = True
            apply_regulatory_tab(profile, {}, True)
            notify.assert_called_once()


class VerificationStateTests(TestCase):
    def test_one_response_reports_one_state(self):
        promoted = worker(role_type='ASSISTANT', verified=False)
        demoted = worker(role_type='ASSISTANT', verified=True)
        with override_settings(VERIFICATION_EXTRA_REQUIREMENTS=['referees'], VERIFICATION_GRACE_UNTIL=date(2000, 1, 1)):
            for profile, expected in ((promoted, False), (demoted, False)):
                data = client_for(profile.user).get(STAFF_URL).data
                self.assertEqual((data['verified'], data['verification']['verified']), (expected, expected))
                profile.refresh_from_db()
                self.assertEqual(profile.verified, expected)
        data = client_for(promoted.user).get(STAFF_URL).data
        self.assertEqual((data['verified'], data['verification']['verified']), (True, True))

    @override_settings(VERIFICATION_EXTRA_REQUIREMENTS=['referees'], VERIFICATION_GRACE_UNTIL=date(2099, 1, 1))
    def test_during_grace_the_worker_sees_what_is_due_and_the_background_check_agrees(self):
        from onboarding.tasks import final_evaluation
        profile = worker(role_type='ASSISTANT', verified=True)
        verification = client_for(profile.user).get(STAFF_URL).data['verification']
        self.assertEqual((verification['verified'], verification['outstanding'], verification['grace_until']),
                         (True, ['referees'], '2099-01-01'))
        with mock.patch('onboarding.tasks.final_evaluation.apply_async'), mock.patch('core.task_queue.async_task'), \
             mock.patch('onboarding.tasks._marker_get', return_value=False), mock.patch('onboarding.tasks._marker_set', return_value=True):
            final_evaluation.run('otherstaffonboarding', profile.pk)
        profile.refresh_from_db()
        self.assertTrue(profile.verified)
        # A new profile is not covered by the grace period.
        self.assertFalse(client_for(worker(role_type='ASSISTANT').user).get(STAFF_URL).data['verified'])

    def test_the_schema_describes_the_real_payload(self):
        user, profile, post = newcomer()
        for summary in (verification_summary(profile), client_for(user).get(NEWCOMER_URL).data['verification'],
                        verification_summary(worker(role_type='INTERN', ahpra_number='PHA1'))):
            serializer = VerificationSummarySerializer(data=summary)
            self.assertTrue(serializer.is_valid(), serializer.errors)
            self.assertEqual(set(summary), set(VerificationSummarySerializer().fields))

    def test_reevaluate_command_ships_and_applies_the_policy(self):
        profile = worker(role_type='ASSISTANT', verified=True)
        out = StringIO()
        with override_settings(VERIFICATION_EXTRA_REQUIREMENTS=['referees'], VERIFICATION_GRACE_UNTIL=date(2000, 1, 1)):
            call_command('reevaluate_verification', stdout=out)
        profile.refresh_from_db()
        self.assertFalse(profile.verified)
        self.assertIn('1 profile(s) changed', out.getvalue())


class NewcomerTransitionTests(TestCase):
    def test_under_18_name_does_not_depend_on_the_post_link(self):
        user, profile, post = newcomer()
        response = client_for(user).patch(BASE + f'explorer-posts/{post.pk}/', {'explorer_profile': None}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        post.refresh_from_db()
        self.assertEqual(post.explorer_profile_id, profile.pk)  # server-owned link
        post.explorer_profile = None
        post.save(update_fields=['explorer_profile'])
        data = client_for(make_user('OWNER')).get(BASE + f'explorer-posts/{post.pk}/').data
        self.assertEqual((data['explorer_name'], data['verification']['under_18']), ('Sam', True))

    def test_upgrade_takes_the_newcomer_post_off_the_board_and_keeps_the_age_label(self):
        user, profile, post = newcomer()
        upgrade_newcomer(user.pk, 'OTHER_STAFF', 'ASSISTANT')
        self.assertFalse(ExplorerPost.objects.filter(pk=post.pk).exists())
        self.assertTrue(verification_summary(OtherStaffOnboarding.objects.get(user=user))['under_18'])

    def test_upgrade_carries_the_whole_identity_bundle(self):
        for kind in ('VISA', 'OTHER_PASSPORT'):
            user, profile, post = newcomer(age=30)
            ExplorerOnboarding.objects.filter(pk=profile.pk).update(
                government_id_type=kind, government_id=f'id/{kind}.pdf', identity_secondary_file=f'id/{kind}-visa.pdf',
                identity_meta={'visa_type_number': '482'}, gov_id_verified=True)
            upgrade_newcomer(user.pk, 'PHARMACIST')
            target = PharmacistOnboarding.objects.get(user=user)
            self.assertEqual((target.government_id_type, target.government_id.name, target.identity_secondary_file.name,
                              target.identity_meta, target.gov_id_verified),
                             (kind, f'id/{kind}.pdf', f'id/{kind}-visa.pdf', {'visa_type_number': '482'}, True))

    def test_leaving_overseas_cancels_the_mobile_skip(self):
        user, profile, post = newcomer(age=30)
        ExplorerOnboarding.objects.filter(pk=profile.pk).update(role_type='OVERSEAS')
        type(user).objects.filter(pk=user.pk).update(is_mobile_verified=False, mobile_check_skipped=True)
        response = client_for(user).patch(NEWCOMER_URL, {'tab': 'basic', 'role_type': 'CAREER_SWITCHER'}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        user.refresh_from_db()
        profile.refresh_from_db()
        self.assertEqual((user.mobile_check_skipped, profile.verified), (False, False))

    def test_a_post_from_before_the_repost_timestamp_can_be_reposted(self):
        user, profile, post = newcomer(age=30)
        self.assertIsNone(profile.last_talent_post_at)
        client = client_for(user)
        self.assertEqual(client.delete(BASE + f'explorer-posts/{post.pk}/').status_code, 204)
        response = client.post(BASE + 'explorer-posts/', {'headline': 'Again', 'role_category': 'EXPLORER'}, format='json')
        self.assertEqual(response.status_code, 201, response.data)
