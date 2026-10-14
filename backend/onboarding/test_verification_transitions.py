"""Verification transitions from the senior review of 2026-10-13, with the owner's decisions of the same day:
AHPRA numbers are for life and unique, an upgraded newcomer's post comes off the board, leaving Overseas cancels the
mobile skip, and one verification decision serves the screens and the background evaluation."""
from datetime import date
from io import StringIO
from unittest import mock, skipUnless

from django.core.management import call_command

from django.db import connection
from django.test import TestCase, TransactionTestCase, override_settings
from django.utils import timezone

from client_profile.characterization_support import BASE, client_for, make_user
from onboarding.models import AhpraRegistration, ExplorerOnboarding, OtherStaffOnboarding, OwnerOnboarding, PharmacistOnboarding
from onboarding.services.regulatory import apply_regulatory_tab
from onboarding.services.upgrade import upgrade_newcomer
from onboarding.verification.ahpra_numbers import guard_ahpra_number
from onboarding.verification.policy import verification_summary
from onboarding.verification.schema import VerificationSummarySerializer
from talent.models import ExplorerPost

STAFF_URL = BASE + 'otherstaff/onboarding/me/'
NEWCOMER_URL = BASE + 'explorer/onboarding/me/'
PHARMACIST_URL = BASE + 'pharmacist/onboarding/me/'


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
        pharmacist = make_user('PHARMACIST', is_otp_verified=True)
        PharmacistOnboarding.objects.create(user=pharmacist)
        response = client_for(pharmacist).patch(PHARMACIST_URL, {'tab': 'basic', 'ahpra_number': 'PHA 0000000009'}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(AhpraRegistration.objects.get(number='PHA0000000009').user_id, pharmacist.pk)
        profile = worker(role_type='INTERN')
        response = client_for(profile.user).patch(STAFF_URL, {'tab': 'regulatory', 'ahpra_number': 'pha0000000009'}, format='json')
        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn('another account', str(response.data['ahpra_number']))
        profile.refresh_from_db()
        self.assertFalse(profile.ahpra_number)

    def test_the_registry_row_decides_ownership(self):
        # A concurrent claim that committed first owns the number: the unique row decides, not a scan of profiles.
        AhpraRegistration.objects.create(number='PHA0000000010', user=make_user('PHARMACIST'))
        profile = worker(role_type='INTERN')
        response = client_for(profile.user).patch(STAFF_URL, {'tab': 'regulatory', 'ahpra_number': 'PHA0000000010'}, format='json')
        self.assertEqual(response.status_code, 400, response.data)

    def test_one_person_keeps_their_number_across_their_profiles_and_frees_an_old_one(self):
        profile = worker(role_type='INTERN')
        client = client_for(profile.user)
        for number in ('PHA0000000011', 'PHA0000000012'):
            self.assertEqual(client.patch(STAFF_URL, {'tab': 'regulatory', 'ahpra_number': number}, format='json').status_code, 200)
        self.assertEqual(set(AhpraRegistration.objects.filter(user=profile.user).values_list('number', flat=True)), {'PHA0000000012'})
        owner_profile = OwnerOnboarding.objects.create(user=profile.user)
        self.assertTrue(guard_ahpra_number(owner_profile, 'PHA0000000012'))  # same person: allowed

    def test_unknown_tabs_are_refused_and_cannot_change_a_checked_number(self):
        intern = worker(role_type='INTERN', ahpra_number='PHA0000000001', ahpra_verified=True, verified=True)
        pharmacist_user = make_user('PHARMACIST', is_otp_verified=True, is_mobile_verified=True)
        pharmacist = PharmacistOnboarding.objects.create(user=pharmacist_user, ahpra_number='PHA0000000002', ahpra_verified=True, verified=True)
        for user, url, row, number in ((intern.user, STAFF_URL, intern, 'PHA0000000001'), (pharmacist_user, PHARMACIST_URL, pharmacist, 'PHA0000000002')):
            response = client_for(user).patch(url, {'tab': 'unrecognised', 'ahpra_number': 'PHA0000000099'}, format='json')
            self.assertEqual(response.status_code, 400, response.data)
            self.assertIn('tab', response.data)
            row.refresh_from_db()
            self.assertEqual((row.ahpra_number, row.ahpra_verified, row.verified), (number, True, True))
        response = client_for(pharmacist_user).patch(PHARMACIST_URL, {'tab': 'basic', 'ahpra_number': 'PHA0000000099'}, format='json')
        self.assertEqual(response.status_code, 400, response.data)

    def test_a_pharmacy_team_role_is_fixed_once_chosen(self):
        profile = worker(role_type='ASSISTANT', verified=True)
        client = client_for(profile.user)
        # Basic no longer takes role fields; the Role step refuses a change.
        self.assertEqual(client.patch(STAFF_URL, {'tab': 'basic', 'role_type': 'INTERN', 'suburb': 'Town'}, format='json').status_code, 200)
        response = client.patch(STAFF_URL, {'tab': 'regulatory', 'role_type': 'INTERN'}, format='json')
        self.assertEqual(response.status_code, 400, response.data)
        profile.refresh_from_db()
        self.assertEqual((profile.role_type, profile.suburb, profile.verified), ('ASSISTANT', 'Town', True))
        new = worker()  # choosing a role the first time is still allowed
        self.assertEqual(client_for(new.user).patch(STAFF_URL, {'tab': 'regulatory', 'role_type': 'STUDENT'}, format='json').status_code, 200)

    def test_existing_duplicates_are_kept_and_one_owner_registered(self):
        from importlib import import_module
        from django.apps import apps
        claim = import_module('client_profile.migrations.0080_ahpra_registration').claim_existing_numbers
        checked = PharmacistOnboarding.objects.create(user=make_user('PHARMACIST'), ahpra_number='pha 77', ahpra_verified=True)
        other = worker(role_type='INTERN', ahpra_number='PHA77', verified=True)
        with mock.patch('builtins.print'):
            claim(apps, None)
        other.refresh_from_db()
        self.assertEqual(AhpraRegistration.objects.get(number='PHA77').user_id, checked.user_id)
        # Owner decision 2026-10-14: legacy duplicates stay as they are (tightened again at launch).
        self.assertEqual((other.ahpra_number, other.verified), ('PHA77', True))
        # ...and can still be saved, while a new account cannot claim the number.
        self.assertEqual(client_for(other.user).patch(STAFF_URL, {'tab': 'regulatory', 'ahpra_number': 'PHA77'}, format='json').status_code, 200)
        newcomer_account = worker(role_type='INTERN')
        self.assertEqual(client_for(newcomer_account.user).patch(STAFF_URL, {'tab': 'regulatory', 'ahpra_number': 'PHA77'}, format='json').status_code, 400)
        self.assertIsNone(AhpraSupportCorrectionTests.correct(self, other, 'PHA77'))  # support can still edit the legacy holder

    def test_an_intern_submitting_an_unchecked_number_notifies_the_admin_team(self):
        profile = worker(role_type='INTERN', ahpra_number='PHA0000000001')
        with mock.patch('onboarding.emails.notify_superuser_on_onboarding') as notify:
            apply_regulatory_tab(profile, {}, True)
            notify.assert_called_once_with(profile)
            profile.ahpra_verified = True
            apply_regulatory_tab(profile, {}, True)
            notify.assert_called_once()


class VerificationStateTests(TestCase):
    @override_settings(VERIFICATION_EXTRA_REQUIREMENTS=['referees'], VERIFICATION_GRACE_UNTIL=date(2099, 1, 1))
    def test_submitting_ordinary_details_never_removes_verified(self):
        profile = worker(role_type='ASSISTANT', verified=True)
        client = client_for(profile.user)
        for payload in ({'tab': 'basic', 'suburb': 'Town'}, {'tab': 'profile', 'short_bio': 'Hello'}, {'tab': 'skills', 'skills': []}):
            client.patch(STAFF_URL, {**payload, 'submitted_for_verification': True}, format='json')
            data = client.get(STAFF_URL).data
            self.assertEqual((data['verified'], data['verification']['outstanding']), (True, ['referees']), payload)

    def test_a_changed_photo_id_removes_verified_only_when_verified_relies_on_it(self):
        from onboarding.services.identity import apply_identity_tab
        user, overseas, post = newcomer(age=30)
        type(user).objects.filter(pk=user.pk).update(is_mobile_verified=False, mobile_check_skipped=True)
        ExplorerOnboarding.objects.filter(pk=overseas.pk).update(role_type='OVERSEAS', government_id='id/a.pdf', gov_id_verified=True)
        overseas = ExplorerOnboarding.objects.select_related('user').get(pk=overseas.pk)
        apply_identity_tab(overseas, {'government_id_type': 'OTHER_PASSPORT'}, False)
        overseas.refresh_from_db()
        self.assertFalse(overseas.verified)  # the overseas route relies on the photo ID
        assistant = worker(role_type='ASSISTANT', verified=True, government_id='id/b.pdf', gov_id_verified=True)
        apply_identity_tab(assistant, {'government_id_type': 'OTHER_PASSPORT'}, False)
        assistant.refresh_from_db()
        self.assertTrue(assistant.verified)  # here the photo ID is only a badge

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

    def test_upgrade_carries_the_work_rights_answer(self):
        for answer in ('CITIZEN_OR_RESIDENT', 'VISA', 'NONE'):
            for role, staff_role, model in (('PHARMACIST', None, PharmacistOnboarding), ('OTHER_STAFF', 'ASSISTANT', OtherStaffOnboarding)):
                user, profile, post = newcomer(age=30, work_rights=answer)
                upgrade_newcomer(user.pk, role, staff_role)
                self.assertEqual(model.objects.get(user=user).work_rights, answer)

    def test_upgrade_removes_legacy_newcomer_posts_without_a_role_category(self):
        user, profile, post = newcomer(age=30)
        ExplorerPost.objects.filter(pk=post.pk).update(role_category=None)
        authored = ExplorerPost.objects.create(author_user=user, headline='Old', role_category='')
        upgrade_newcomer(user.pk, 'PHARMACIST')
        self.assertFalse(ExplorerPost.objects.filter(pk__in=[post.pk, authored.pk]).exists())

    def test_referee_links_sent_before_upgrade_follow_the_person(self):
        from django.core.signing import TimestampSigner
        user, profile, post = newcomer(age=30, referee1_name='Dr Lee', referee1_email='lee@example.test',
                                       referee1_relation='manager', referee1_workplace='Clinic')
        token = TimestampSigner().sign(f'exploreronboarding:{profile.pk}:1')
        upgrade_newcomer(user.pk, 'OTHER_STAFF', 'ASSISTANT')
        with mock.patch('onboarding.views.async_task', create=True), mock.patch('core.task_queue.async_task'):
            response = client_for(None).post(BASE + f'onboarding/referee-reject/{token}/', {}, format='json')
        self.assertEqual(response.status_code, 200, getattr(response, 'data', None))
        self.assertTrue(OtherStaffOnboarding.objects.get(user=user).referee1_rejected)
        profile.refresh_from_db()
        self.assertFalse(profile.referee1_rejected)

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


@skipUnless(connection.vendor == 'postgresql', 'needs real concurrent writes: runs in the PostgreSQL job (SQLite locks the table)')
class AhpraConcurrentClaimTests(TransactionTestCase):
    """The reviewer's race (2026-10-14): two accounts claim one number at the same moment; exactly one may hold it."""

    def test_concurrent_claims_leave_one_owner(self):
        from queue import Queue
        from threading import Barrier, Thread
        from django.db import close_old_connections
        profiles = [PharmacistOnboarding.objects.create(user=make_user('PHARMACIST', is_otp_verified=True, is_mobile_verified=True)) for _ in range(2)]
        barrier, results = Barrier(2), Queue()
        original = AhpraRegistration.objects.get_or_create

        def together(*args, **kwargs):
            barrier.wait(timeout=15)  # both requests reach the insert before either commits
            return original(*args, **kwargs)

        def claim(user):
            close_old_connections()
            try:
                results.put(client_for(user).patch(PHARMACIST_URL, {'tab': 'basic', 'ahpra_number': 'PHA0000000099'}, format='json').status_code)
            except Exception as error:  # report the worker's real failure instead of an empty queue
                results.put(repr(error))
            finally:
                close_old_connections()

        with mock.patch.object(AhpraRegistration.objects, 'get_or_create', side_effect=together):
            threads = [Thread(target=claim, args=(profile.user,)) for profile in profiles]
            for thread in threads:
                thread.start()
            for thread in threads:
                thread.join(timeout=25)
        self.assertFalse([thread for thread in threads if thread.is_alive()], 'a claim did not finish')
        statuses = sorted((results.get_nowait() for _ in threads), key=str)
        self.assertEqual(statuses, [200, 400])
        self.assertEqual(PharmacistOnboarding.objects.filter(ahpra_number='PHA0000000099').count(), 1)
        self.assertEqual(AhpraRegistration.objects.filter(number='PHA0000000099').count(), 1)


class AhpraSupportCorrectionTests(TestCase):
    """Third review (2026-10-14): Django admin corrections keep the owner registry in step, with the support override."""

    def correct(self, profile, number):
        from django.contrib import admin
        from django.test import RequestFactory
        model_admin = admin.site._registry[type(profile)]
        request = RequestFactory().post('/admin/')
        request.user = make_user('OWNER', is_superuser=True, is_staff=True)
        form = model_admin.get_form(request, profile)(instance=profile)
        form.cleaned_data = {'user': profile.user, 'ahpra_number': number, 'phone_number': getattr(profile, 'phone_number', None),
                             'role': getattr(profile, 'role', None)}
        form._errors = {}
        form.clean()
        if form.errors:
            return form.errors
        profile.ahpra_number = number
        model_admin.save_model(request, profile, form, True)
        return None

    def test_admin_corrections_move_ownership_for_each_profile_type(self):
        for profile in (PharmacistOnboarding.objects.create(user=make_user('PHARMACIST'), ahpra_number='PHAA1', ahpra_verified=True),
                        worker(role_type='INTERN', ahpra_number='PHAA2', ahpra_verified=True),
                        OwnerOnboarding.objects.create(user=make_user('OWNER', mobile_number='0400000003'), role='PHARMACIST', ahpra_number='PHAA3', ahpra_verified=True, phone_number='0400000003')):
            old = profile.ahpra_number
            AhpraRegistration.objects.create(number=old, user=profile.user)
            self.assertIsNone(self.correct(profile, old + 'B'))  # support may change a checked number
            self.assertEqual(list(AhpraRegistration.objects.filter(user=profile.user).values_list('number', flat=True)), [old + 'B'])
            other = worker(role_type='INTERN')
            response = client_for(other.user).patch(STAFF_URL, {'tab': 'regulatory', 'ahpra_number': old + 'B'}, format='json')
            self.assertEqual(response.status_code, 400, response.data)

    def test_admin_cannot_give_a_number_another_account_holds(self):
        AhpraRegistration.objects.create(number='PHAA9', user=make_user('PHARMACIST'))
        profile = PharmacistOnboarding.objects.create(user=make_user('PHARMACIST'))
        self.assertIn('ahpra_number', self.correct(profile, 'PHAA9'))


class ConsumedRefereeLinkTests(TestCase):
    def test_a_link_answered_before_upgrade_cannot_be_used_again(self):
        from django.core.signing import TimestampSigner
        user, profile, post = newcomer(age=30, referee1_name='Dr Lee', referee1_email='lee@example.test',
                                       referee1_relation='manager', referee1_workplace='Clinic')
        ExplorerOnboarding.objects.filter(pk=profile.pk).update(referee1_confirmed=True)  # answered Yes before upgrade
        token = TimestampSigner().sign(f'exploreronboarding:{profile.pk}:1')
        upgrade_newcomer(user.pk, 'OTHER_STAFF', 'ASSISTANT')
        with mock.patch('core.task_queue.async_task'):
            rejected = client_for(None).post(BASE + f'onboarding/referee-reject/{token}/', {}, format='json')
            answered = client_for(None).post(BASE + f'onboarding/submit-reference/{token}/', {'would_rehire': 'NO'}, format='json')
        self.assertEqual(rejected.status_code, 200)
        self.assertEqual(answered.status_code, 400)
        target = OtherStaffOnboarding.objects.get(user=user)
        self.assertEqual((target.referee1_confirmed, target.referee1_rejected), (True, False))


class AhpraOwnershipDriftTests(TestCase):
    """Third review (2026-10-14): the registry never releases a number the saved profile still holds."""

    def test_a_tab_that_ignores_the_number_does_not_touch_ownership(self):
        user = make_user('PHARMACIST', is_otp_verified=True)
        PharmacistOnboarding.objects.create(user=user)
        client = client_for(user)
        self.assertEqual(client.patch(PHARMACIST_URL, {'tab': 'basic', 'ahpra_number': 'PHAD1'}, format='json').status_code, 200)
        self.assertEqual(client.patch(PHARMACIST_URL, {'tab': 'profile', 'short_bio': 'Hi', 'ahpra_number': 'PHAD2'}, format='json').status_code, 200)
        self.assertEqual(PharmacistOnboarding.objects.get(user=user).ahpra_number, 'PHAD1')
        self.assertEqual(AhpraRegistration.objects.get(number='PHAD1').user_id, user.pk)
        self.assertFalse(AhpraRegistration.objects.filter(number='PHAD2').exists())
        other = worker(role_type='INTERN')
        self.assertEqual(client_for(other.user).patch(STAFF_URL, {'tab': 'regulatory', 'ahpra_number': 'PHAD1'}, format='json').status_code, 400)

    def test_a_refused_role_change_does_not_move_the_number(self):
        intern = worker(role_type='INTERN')
        client = client_for(intern.user)
        self.assertEqual(client.patch(STAFF_URL, {'tab': 'regulatory', 'ahpra_number': 'PHAD3'}, format='json').status_code, 200)
        response = client.patch(STAFF_URL, {'tab': 'regulatory', 'role_type': 'ASSISTANT', 'ahpra_number': 'PHAD4'}, format='json')
        self.assertEqual(response.status_code, 400)
        intern.refresh_from_db()
        self.assertEqual(intern.ahpra_number, 'PHAD3')
        self.assertEqual(list(AhpraRegistration.objects.filter(user=intern.user).values_list('number', flat=True)), ['PHAD3'])
