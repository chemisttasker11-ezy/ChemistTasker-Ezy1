"""Published external pay must not leak to internal staff, or reprice staff claims."""
from datetime import date, time, timedelta
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import patch

from django.test import TestCase, SimpleTestCase
from rest_framework.test import APIRequestFactory

from client_profile.characterization_support import client_for, make_owner_with_pharmacy, make_user
from memberships.models import Membership
from onboarding.models import PharmacistOnboarding
from organizations.models import Chain, PharmacyAdmin
from shifts.announcements import _build_shift_email_slot_meta
from shifts.models import Shift, ShiftSlot, ShiftSlotAssignment
from shifts.rate_visibility import published_rates_visible
from shifts.serializers import ShiftSerializer, MyShiftSerializer, OpenShiftSerializer
from shifts.pricing import get_locked_rate_for_slot
from workforce.models import EmploymentEngagement


class PublishedRateVisibilityTests(TestCase):
    def setUp(self):
        self.owner, self.pharmacy = make_owner_with_pharmacy()
        self.pharmacy.state = 'QLD'
        self.pharmacy.rate_weekday = Decimal('65')
        self.pharmacy.default_fixed_rate = Decimal('65')
        self.pharmacy.save()
        self.shift = Shift.objects.create(
            pharmacy=self.pharmacy, created_by=self.owner, role_needed='PHARMACIST',
            employment_type='LOCUM', visibility='PLATFORM', rate_type='FLEXIBLE',
            fixed_rate=Decimal('77.50'), payment_preference='ABN', owner_adjusted_rate=Decimal('5'),
            min_hourly_rate=Decimal('70'), max_hourly_rate=Decimal('80'), super_percent=Decimal('12'),
        )
        self.slot = ShiftSlot.objects.create(shift=self.shift, date=date.today()+timedelta(days=7),
            start_time=time(9), end_time=time(17), rate=Decimal('77.50'))

    def member(self, kind='FULL_TIME', pharmacy=None):
        user = make_user('PHARMACIST')
        membership = Membership.objects.create(user=user, pharmacy=pharmacy or self.pharmacy,
            role='PHARMACIST', employment_type=kind, is_active=True, status=Membership.Status.ACCEPTED)
        return user, membership

    def data(self, user, serializer=ShiftSerializer):
        request = APIRequestFactory().get('/api/v1/community-shifts/')
        request.user = user
        return serializer(self.shift, context={'request': request}).data

    def assert_hidden(self, data):
        self.assertFalse(data['published_rates_visible'])
        for field in ('fixed_rate','rate_type','owner_adjusted_rate','min_hourly_rate','super_percent','payment_preference'):
            self.assertNotIn(field, data)
        for slot in data['slots']:
            self.assertNotIn('rate', slot)
        self.assertNotIn('rate_weekday', data.get('pharmacy_detail', {}))
        self.assertNotIn('default_fixed_rate', data.get('pharmacy_detail', {}))

    def test_staff_hidden_at_every_escalation_level_and_in_details(self):
        for kind in ('FULL_TIME','PART_TIME','CASUAL'):
            user, _ = self.member(kind)
            for visibility in ('FULL_PART_TIME','LOCUM_CASUAL','OWNER_CHAIN','ORG_CHAIN','PLATFORM'):
                self.shift.visibility = visibility
                self.assert_hidden(self.data(user))
            self.assert_hidden(self.data(user, OpenShiftSerializer))
            with patch('invoicing.services.generate_preview_invoice_lines', return_value=[{'rate': '43.00'}]):
                data = self.data(user, MyShiftSerializer)
            self.assert_hidden(data)
            self.assertEqual(data['line_items'], [{'rate': '43.00'}])

    def test_owner_chain_staff_hidden_but_favourites_and_external_visible(self):
        _, sibling = make_owner_with_pharmacy('Sibling')
        sibling.owner = self.pharmacy.owner
        sibling.save()
        chain = Chain.objects.create(owner=self.pharmacy.owner, name='Owner chain')
        chain.pharmacies.add(self.pharmacy, sibling)
        worker, _ = self.member(pharmacy=sibling)
        self.assert_hidden(self.data(worker))
        for kind in ('LOCUM','SHIFT_HERO'):
            favourite, _ = self.member(kind)
            data = self.data(favourite)
            self.assertTrue(data['published_rates_visible'])
            self.assertEqual(data['slots'][0]['rate'], '77.50')
        self.assertTrue(published_rates_visible(make_user('PHARMACIST'), self.pharmacy))
        chain.is_active = False
        chain.save()
        self.assertTrue(published_rates_visible(worker, self.pharmacy))

    def test_managers_keep_rates_even_when_also_staff(self):
        worker, _ = self.member()
        PharmacyAdmin.objects.create(user=worker, pharmacy=self.pharmacy, is_active=True,
            admin_level=PharmacyAdmin.AdminLevel.OWNER)
        self.assertTrue(self.data(worker)['published_rates_visible'])
        self.assertTrue(self.data(self.owner)['published_rates_visible'])

    def test_feed_reuses_pay_visibility_per_pharmacy_and_never_across_requests(self):
        worker, _ = self.member()
        request = APIRequestFactory().get('/api/v1/community-shifts/')
        request.user = worker
        context = {'request': request}
        serializers = [cls(context=context) for cls in (ShiftSerializer, MyShiftSerializer, OpenShiftSerializer)]
        self.assertFalse(serializers[0].get_published_rates_visible(self.shift))
        with self.assertNumQueries(0):
            for index in range(50):
                self.assertFalse(serializers[index % 3].get_published_rates_visible(self.shift))
        # The same user gains manager scope on a subsequent request. A previous
        # feed's cached decision must not override the new permission lookup.
        PharmacyAdmin.objects.create(user=worker, pharmacy=self.pharmacy,
            is_active=True, admin_level=PharmacyAdmin.AdminLevel.OWNER)
        next_request = APIRequestFactory().get('/api/v1/community-shifts/')
        next_request.user = worker
        context['request'] = next_request
        self.assertTrue(serializers[0].get_published_rates_visible(self.shift))

    def test_real_community_response_and_emails_hide_staff_rates(self):
        worker, _ = self.member()
        response = client_for(worker).get(f'/api/v1/community-shifts/{self.shift.id}/')
        self.assertEqual(response.status_code, 200, response.data)
        self.assert_hidden(response.data)
        entries = [{'date':self.slot.date,'start_time':time(9),'end_time':time(17),'rate':'77.50'}]
        hidden = _build_shift_email_slot_meta(self.shift, entries, user=worker)
        self.assertIsNone(hidden['rate_summary'])
        self.assertIsNone(hidden['slots_display_details'][0]['rate'])
        favourite, _ = self.member('LOCUM')
        self.assertEqual('$77.5/hr', _build_shift_email_slot_meta(self.shift, entries, user=favourite)['rate_summary'])

    def claim(self, worker):
        with patch('shifts.browse.async_task'):
            return client_for(worker).post(f'/api/v1/community-shifts/{self.shift.id}/claim-shift/', {}, format='json')

    def test_staff_claim_without_app_payroll_never_locks_the_external_posted_rate(self):
        worker, _ = self.member()
        response = self.claim(worker)
        self.assertEqual(response.status_code, 201, response.data)
        assignment = ShiftSlotAssignment.objects.get(shift=self.shift, user=worker)
        self.assertEqual(assignment.unit_rate, Decimal('0'))
        self.assertEqual(assignment.settlement_channel, 'TIMESHEET_ONLY')
        self.assertEqual(assignment.payment_preference_snapshot, 'TFN')
        self.assertEqual(assignment.rate_reason['source'], 'StaffEmployment')

    def test_payroll_claim_uses_dated_employment_agreement(self):
        worker, membership = self.member()
        self.pharmacy.use_chemisttasker_payroll = True
        self.pharmacy.save()
        PharmacistOnboarding.objects.create(user=worker, payment_preference='TFN', tfn_number='123456789',
            super_fund_name='Test super', super_usi='TEST0001', super_member_number='MEMBER1')
        EmploymentEngagement.objects.create(membership=membership, effective_from=self.slot.date,
            role='PHARMACIST', employment_type='FULL_TIME', pay_basis='ABOVE_AWARD',
            rate_weekday='43', rate_saturday='50', rate_sunday='60', rate_public_holiday='80',
            created_by=self.owner, updated_by=self.owner)
        response = self.claim(worker)
        self.assertEqual(response.status_code, 201, response.data)
        assignment = ShiftSlotAssignment.objects.get(shift=self.shift, user=worker)
        # Fixture date may be any weekday: compare to the snapshot's actual day rate.
        from shifts.pricing import get_day_type
        day = get_day_type(self.slot.date, self.pharmacy.state)
        self.assertEqual(assignment.unit_rate, Decimal(assignment.engagement_terms_snapshot['rates'][day]))
        self.assertEqual(assignment.settlement_channel, 'PAYROLL')
        self.assertNotEqual(assignment.unit_rate, self.slot.rate)

    def test_missing_staff_payroll_terms_refuses_atomically_instead_of_using_external_pay(self):
        worker, _ = self.member()
        self.pharmacy.use_chemisttasker_payroll = True
        self.pharmacy.save()
        response = self.claim(worker)
        self.assertEqual(response.status_code, 400, response.data)
        self.assertFalse(ShiftSlotAssignment.objects.filter(shift=self.shift).exists())


class StaffAgreementPricingTests(SimpleTestCase):
    def test_overnight_staff_rate_uses_existing_segmentation_without_posted_bonus(self):
        slot = SimpleNamespace(date=date(2026,1,30),start_time=time(22),end_time=time(6),rate=Decimal('99'))
        shift = SimpleNamespace(role_needed='PHARMACIST',pharmacy=SimpleNamespace(state='QLD'),rate_type='FIXED')
        terms = {'rates':{'weekday':'40','saturday':'50','sunday':'60','public_holiday':'80'},'settlement_channel':'PAYROLL'}
        rate, reason = get_locked_rate_for_slot(slot,shift,None,staff_terms=terms)
        self.assertEqual(rate, Decimal('47.50'))
        self.assertEqual(reason['source'], 'StaffEmployment')
