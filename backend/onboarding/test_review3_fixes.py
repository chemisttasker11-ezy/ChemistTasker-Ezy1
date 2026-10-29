"""Owner's review-state, atomic enforcement and member-notice contract."""
from datetime import timedelta
from types import SimpleNamespace
from unittest.mock import patch

from django.core.cache import caches
from django.db import transaction
from django.test import TestCase, override_settings
from django.utils import timezone

from client_profile.characterization_support import client_for, make_assignment, make_owner_with_pharmacy, make_user
from memberships.models import Membership
from onboarding.middleware import AhpraFreezeMiddleware
from onboarding.models import AhpraCheck, OwnerOnboarding
from onboarding.test_ahpra_desktop import NUMBER, TEST_CACHES, check_fixture, profile_fixture, result
from onboarding.verification.ahpra_numbers import guard_ahpra_number
from onboarding.verification.desktop import apply_ahpra_result
from onboarding.verification.schema import AhpraStateSerializer
from onboarding.verification.state import (
    REVIEW_NOTE, ahpra_frozen, ahpra_state, require_ahpra_application, require_public_ahpra,
)
from organizations.models import Organization, PharmacyAdmin
from shifts.cancellation import cancel_upcoming_assignments
from shifts.access import ShiftActionRefused, _user_can_perform_shift_role
from shifts.interest import _require_public_shift_onboarding
from shifts.models import ShiftOffer, ShiftSlotAssignment
from users.models import OrganizationMembership


@override_settings(AHPRA_SOURCE='desktop', AHPRA_ENFORCEMENT_ENABLED=True, CACHES=TEST_CACHES,
                   CHANNEL_LAYERS={'default': {'BACKEND': 'channels.layers.InMemoryChannelLayer'}},
                   EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend', ADMINS=[])
class Review3FixTests(TestCase):
    def setUp(self):
        caches['ahpra'].clear()
        self.profile = profile_fixture()
        self.user = self.profile.user
        self.user.is_otp_verified = self.user.is_mobile_verified = True
        self.user.save(update_fields=['is_otp_verified', 'is_mobile_verified'])
        self.owner, self.pharmacy = make_owner_with_pharmacy()
        self.shift, self.slot, self.booking = make_assignment(
            self.pharmacy, self.owner, self.user, timezone.localdate() + timedelta(days=2))
        self.shift.role_needed = 'PHARMACIST'
        self.shift.post_anonymously = True
        self.shift.save(update_fields=['role_needed', 'post_anonymously'])

    def mark_verified(self):
        self.profile.verified = self.profile.ahpra_verified = True
        self.profile.save(update_fields=['verified', 'ahpra_verified'])

    def apply(self, **record):
        check = check_fixture(self.profile)
        self.assertTrue(apply_ahpra_result(check, result(check.pk, **record)))
        self.profile.refresh_from_db()
        check.refresh_from_db()
        return check

    def test_name_mismatch_never_freezes_cancels_or_locks_number(self):
        records = [{'registration_status': status} for status in ('Suspended', 'Cancelled', 'Surrendered')]
        records += [{'registration_type': kind} for kind in ('Non Practising', 'Provisional')]
        for record in records:
            with self.subTest(record=record), patch('shifts.cancellation.cancel_upcoming_assignments') as cancel:
                self.mark_verified()
                check = self.apply(name='Someone Else', **record)
                self.assertEqual((check.outcome, ahpra_state(self.profile)['state']), ('review', 'review'))
                self.assertFalse(ahpra_frozen(self.user))
                self.assertFalse(self.profile.ahpra_verified or self.profile.verified)
                self.assertTrue(ShiftSlotAssignment.objects.filter(pk=self.booking.pk).exists())
                cancel.assert_not_called()
                with transaction.atomic():
                    self.assertTrue(guard_ahpra_number(self.profile, 'PHA0007654321'))
                    transaction.set_rollback(True)
                self.profile.refresh_from_db()

        owner_profile = OwnerOnboarding.objects.get(user=self.owner)
        owner_profile.role, owner_profile.ahpra_number = 'PHARMACIST', NUMBER
        owner_profile.save()
        check = AhpraCheck.objects.create(model_name='OwnerOnboarding', object_pk=owner_profile.pk,
                                         registration_number=NUMBER, reason='recheck')
        apply_ahpra_result(check, result(check.pk, name='Someone Else', registration_status='Suspended'))
        owner_profile.refresh_from_db()
        self.assertEqual((ahpra_state(owner_profile)['state'], owner_profile.role), ('review', 'PHARMACIST'))
        self.assertFalse(owner_profile.ahpra_switched_to_manager)

    def test_review_removes_public_access_keeps_member_work_and_hourly_recheck(self):
        client = client_for(self.user)
        offer = ShiftOffer.objects.create(shift=self.shift, slot=self.slot, user=self.user)
        Membership.objects.create(user=self.user, pharmacy=self.pharmacy, role='PHARMACIST', employment_type='FULL_TIME')
        internal, _, _ = make_assignment(self.pharmacy, self.owner, self.user, timezone.localdate() + timedelta(days=3))
        internal.role_needed = 'PHARMACIST'
        internal.save(update_fields=['role_needed'])
        records = [{'name': 'Someone Else'}, {'conditions': True}, {'undertakings': True},
                   {'reprimands': True}, {'expiry_date': '2000-01-01'}, {'expiry_date': None}]
        for record in records:
            with self.subTest(record=record), patch('shifts.cancellation.cancel_upcoming_assignments') as cancel:
                self.mark_verified()
                self.apply(**record)
                state = ahpra_state(self.profile)
                self.assertEqual((state['state'], state['note']), ('review', REVIEW_NOTE))
                schema = AhpraStateSerializer(data={**state, 'frozen': False})
                self.assertTrue(schema.is_valid(), schema.errors)
                self.assertFalse(self.profile.verified or self.profile.ahpra_verified or ahpra_frozen(self.user))
                for path in (f'shifts/{self.shift.pk}/express_interest/',
                             f'shifts/{self.shift.pk}/counter-offers/', f'shift-offers/{offer.pk}/accept/'):
                    response = client.post(f'/api/v1/{path}', {}, format='json')
                    self.assertEqual((response.status_code, response.json()),
                                     (403, {'code': 'ahpra_review', 'detail': REVIEW_NOTE}))
                require_public_ahpra(self.user, internal)
                self.assertEqual(client.get('/api/v1/shift-saved/').status_code, 200)
                self.assertTrue(ShiftSlotAssignment.objects.filter(pk=self.booking.pk).exists())
                cancel.assert_not_called()
        self.assertEqual(client.post('/api/v1/onboarding/ahpra/recheck/').status_code, 202)
        self.assertEqual(client.post('/api/v1/onboarding/ahpra/recheck/').status_code, 429)

    def test_cancellation_failure_rolls_back_result_flags_owner_switch_and_bookings(self):
        owner_profile = OwnerOnboarding.objects.get(user=self.owner)
        owner_profile.role, owner_profile.ahpra_number = 'PHARMACIST', NUMBER
        owner_profile.verified = owner_profile.ahpra_verified = True
        owner_profile.save()
        _, _, owner_booking = make_assignment(self.pharmacy, self.owner, self.owner, timezone.localdate() + timedelta(days=4))

        def fail_after_writes(user, **kwargs):
            cancel_upcoming_assignments(user, **kwargs)
            raise RuntimeError('cancellation database failure')

        # The rollback leaves this check pending, so both records reuse it.
        check = AhpraCheck.objects.create(model_name='OwnerOnboarding', object_pk=owner_profile.pk,
                                         registration_number=NUMBER, reason='recheck')
        for record in ({'registration_status': 'Suspended'}, {'registration_type': 'Non Practising'}):
            with self.subTest(record=record):
                with patch('shifts.cancellation.cancel_upcoming_assignments', side_effect=fail_after_writes), \
                        patch('onboarding.verification.state.announce_suspension') as announce:
                    with self.captureOnCommitCallbacks(execute=True):
                        with self.assertRaisesRegex(RuntimeError, 'cancellation database failure'):
                            apply_ahpra_result(check, result(check.pk, name=self.owner.get_full_name(), **record))
                    announce.assert_not_called()
                check.refresh_from_db()
                owner_profile.refresh_from_db()
                self.assertEqual((check.status, check.outcome, check.register_data), ('pending', '', {}))
                self.assertEqual(owner_profile.role, 'PHARMACIST')
                self.assertFalse(owner_profile.ahpra_switched_to_manager)
                self.assertTrue(owner_profile.verified and owner_profile.ahpra_verified)
                self.assertTrue(ShiftSlotAssignment.objects.filter(pk=owner_booking.pk).exists())

    @override_settings(AHPRA_ENFORCEMENT_ENABLED=False)
    def test_kill_switch_records_results_without_enforcement(self):
        owner_profile = OwnerOnboarding.objects.get(user=self.owner)
        owner_profile.role, owner_profile.ahpra_number = 'PHARMACIST', NUMBER
        owner_profile.save()
        with patch('shifts.cancellation.cancel_upcoming_assignments') as cancel, \
                patch('onboarding.verification.state.announce_suspension') as announce, \
                patch('onboarding.verification.state.announce_member_suspension') as member_notice, \
                patch('onboarding.verification.state.close_chat_sockets') as close:
            for record in ({'registration_status': 'Suspended'}, {'registration_type': 'Non Practising'}, {'conditions': True}):
                with self.subTest(record=record), self.captureOnCommitCallbacks(execute=True):
                    self.apply(**record)
                    require_ahpra_application(self.user)
                    require_public_ahpra(self.user, self.shift)
                    _require_public_shift_onboarding(self.user)
                    self.assertFalse(ahpra_frozen(self.user))
                    self.assertIsNone(AhpraFreezeMiddleware(lambda request: None).process_view(
                        SimpleNamespace(path='/api/v1/shift-saved/'), lambda request: None, (), {}))
            check = AhpraCheck.objects.create(model_name='OwnerOnboarding', object_pk=owner_profile.pk,
                                             registration_number=NUMBER, reason='recheck')
            with self.captureOnCommitCallbacks(execute=True):
                apply_ahpra_result(check, result(check.pk, name=self.owner.get_full_name(), registration_status='Suspended'))
            owner_profile.refresh_from_db()
            self.assertEqual(owner_profile.role, 'PHARMACIST')
            cancel.assert_not_called()
            announce.assert_not_called()
            member_notice.assert_not_called()
            close.assert_not_called()
        self.assertEqual(cancel_upcoming_assignments(self.user), {'cancelled': [], 'retained': []})
        self.assertTrue(ShiftSlotAssignment.objects.filter(pk=self.booking.pk).exists())
        # Previously automatic AHPRA switches are bypassed; a chosen manager stays a manager.
        owner_profile.role, owner_profile.ahpra_switched_to_manager = 'MANAGER', True
        owner_profile.save(update_fields=['role', 'ahpra_switched_to_manager'])
        self.assertTrue(_user_can_perform_shift_role(self.owner, 'PHARMACIST'))
        owner_profile.ahpra_switched_to_manager = False
        owner_profile.save(update_fields=['ahpra_switched_to_manager'])
        self.assertFalse(_user_can_perform_shift_role(self.owner, 'PHARMACIST'))
        # Other verification requirements still apply while AHPRA enforcement is off.
        self.user.is_mobile_verified = False
        self.user.save(update_fields=['is_mobile_verified'])
        with self.assertRaises(ShiftActionRefused):
            _require_public_shift_onboarding(self.user)

    def test_member_suspension_notifies_owner_and_admins_once_after_commit(self):
        organization = Organization.objects.create(name='Member notice organisation')
        admin, outsider = make_user('ORG_STAFF'), make_user('ORG_STAFF')
        PharmacyAdmin.objects.create(user=admin, pharmacy=self.pharmacy, is_active=True)
        OrganizationMembership.objects.create(user=self.user, organization=organization, role='REGION_ADMIN')
        OrganizationMembership.objects.create(user=admin, organization=organization, role='ORG_ADMIN')
        OrganizationMembership.objects.create(user=outsider, organization=Organization.objects.create(name='Unrelated'), role='ORG_ADMIN')
        membership = Membership.objects.create(user=self.user, pharmacy=self.pharmacy, role='PHARMACIST', employment_type='FULL_TIME')
        for status in ('Suspended', 'Cancelled', 'Surrendered'):
            with self.subTest(status=status):
                self.apply()  # A recovery permits a new suspension transition.
                with patch('notifications.services.notify_users') as notify, patch('users.task_dispatch.async_task') as email, \
                        patch('shifts.cancellation.notify_shift_managers', return_value=[]):
                    with self.captureOnCommitCallbacks(execute=True):
                        self.apply(registration_status=status)
                        notify.assert_not_called()
                        email.assert_not_called()
                    with self.captureOnCommitCallbacks(execute=True):
                        self.apply(registration_status=status)
                    notices = [call for call in notify.call_args_list if call.kwargs['payload']['code'] == 'ahpra_member_suspended']
                    self.assertEqual(len(notices), 1)
                    self.assertEqual(set(notices[0].args[0]), {self.owner.pk, admin.pk})
                    expected = f"Your team member Jane Doe's AHPRA registration now shows as {status}"
                    self.assertEqual(notices[0].kwargs['body'], expected)
                    emails = [call for call in email.call_args_list if call.kwargs.get('context', {}).get('message') == expected]
                    self.assertEqual(len(emails), 1)
                    self.assertEqual(set(emails[0].kwargs['recipient_list']), {self.owner.email, admin.email})
                membership.refresh_from_db()
                self.assertTrue(membership.is_active)
                self.assertEqual(membership.status, Membership.Status.ACCEPTED)
                self.assertFalse(ahpra_frozen(self.user))
