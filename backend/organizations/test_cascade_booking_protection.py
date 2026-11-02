"""Deleting a store or organisation must respect its shifts' deletion rules."""
from datetime import time, timedelta
from decimal import Decimal
from unittest.mock import Mock

from django.db import transaction
from django.test import TestCase
from django.utils import timezone

from billing.models import ShiftPayment
from client_profile.characterization_support import client_for, make_owner_with_pharmacy, make_user
from organizations.models import Organization, Pharmacy
from shifts.models import Shift, ShiftOffer, ShiftSlot, ShiftSlotAssignment
from users.models import OrganizationMembership


class ParentDeletionBookingProtectionTests(TestCase):
    def scenario(self, parent, **shift_fields):
        owner, pharmacy = make_owner_with_pharmacy('Deletion protection')
        organization = Organization.objects.create(name=f'Deletion {pharmacy.pk}')
        pharmacy.organization = organization
        pharmacy.save(update_fields=['organization'])
        admin = make_user('ORG_STAFF')
        OrganizationMembership.objects.create(user=admin, organization=organization, role='ORG_ADMIN')
        shift = Shift.objects.create(
            pharmacy=pharmacy, created_by=owner, role_needed='PHARMACIST',
            employment_type='LOCUM', **shift_fields,
        )
        slot = ShiftSlot.objects.create(
            shift=shift, date=timezone.localdate() + timedelta(days=7),
            start_time=time(9), end_time=time(17), rate=Decimal('70.00'),
        )
        actor, path = ((owner, f'/api/v1/pharmacies/{pharmacy.pk}/') if parent == 'pharmacy'
                       else (admin, f'/api/v1/organizations/{organization.pk}/'))
        return owner, organization, pharmacy, shift, slot, actor, path

    def assert_preserved(self, organization, pharmacy, shift, slot):
        self.assertTrue(Organization.objects.filter(pk=organization.pk).exists())
        self.assertTrue(Pharmacy.objects.filter(pk=pharmacy.pk).exists())
        self.assertTrue(Shift.objects.filter(pk=shift.pk).exists())
        self.assertTrue(ShiftSlot.objects.filter(pk=slot.pk).exists())

    def test_parent_delete_refuses_pending_shift_status(self):
        for parent in ('pharmacy', 'organization'):
            with self.subTest(parent=parent):
                _, org, pharmacy, shift, slot, actor, path = self.scenario(parent, payment_status='PENDING')
                response = client_for(actor).delete(path)
                self.assertEqual(response.status_code, 409, response.content)
                self.assert_preserved(org, pharmacy, shift, slot)

    def test_parent_delete_refuses_accepted_offer_awaiting_payment(self):
        for parent in ('pharmacy', 'organization'):
            with self.subTest(parent=parent):
                _, org, pharmacy, shift, slot, actor, path = self.scenario(parent)
                offer = ShiftOffer.objects.create(
                    shift=shift, slot=slot, user=make_user('PHARMACIST'),
                    offered_slot_date=slot.date, status=ShiftOffer.Status.ACCEPTED_AWAITING_PAYMENT,
                )
                response = client_for(actor).delete(path)
                self.assertEqual(response.status_code, 409, response.content)
                self.assert_preserved(org, pharmacy, shift, slot)
                self.assertTrue(ShiftOffer.objects.filter(pk=offer.pk).exists())

    def test_parent_delete_refuses_pending_payment_record(self):
        for parent in ('pharmacy', 'organization'):
            with self.subTest(parent=parent):
                owner, org, pharmacy, shift, slot, actor, path = self.scenario(parent)
                payment = ShiftPayment.objects.create(
                    owner=owner, shift=shift, payment_type='fulfillment', payment_method='card',
                    status='pending', amount_aud=Decimal('20.00'),
                )
                response = client_for(actor).delete(path)
                self.assertEqual(response.status_code, 409, response.content)
                self.assert_preserved(org, pharmacy, shift, slot)
                payment.refresh_from_db()
                self.assertEqual(payment.shift_id, shift.pk)

    def test_parent_delete_refuses_plain_assignment_without_offer(self):
        for parent in ('pharmacy', 'organization'):
            with self.subTest(parent=parent):
                _, org, pharmacy, shift, slot, actor, path = self.scenario(parent)
                assignment = ShiftSlotAssignment.objects.create(
                    shift=shift, slot=slot, slot_date=slot.date, user=make_user('PHARMACIST'),
                )
                response = client_for(actor).delete(path)
                self.assertEqual(response.status_code, 409, response.content)
                self.assert_preserved(org, pharmacy, shift, slot)
                self.assertTrue(ShiftSlotAssignment.objects.filter(pk=assignment.pk).exists())

    def test_parent_delete_with_unassigned_shift_remains_allowed(self):
        for parent in ('pharmacy', 'organization'):
            with self.subTest(parent=parent):
                _, org, pharmacy, shift, slot, actor, path = self.scenario(parent)
                response = client_for(actor).delete(path)
                self.assertEqual(response.status_code, 204, response.content)
                self.assertFalse(Pharmacy.objects.filter(pk=pharmacy.pk).exists())
                self.assertFalse(Shift.objects.filter(pk=shift.pk).exists())
                self.assertFalse(ShiftSlot.objects.filter(pk=slot.pk).exists())
                self.assertEqual(Organization.objects.filter(pk=org.pk).exists(), parent == 'pharmacy')

    def test_unrelated_actor_cannot_delete_empty_parent(self):
        for parent in ('pharmacy', 'organization'):
            with self.subTest(parent=parent):
                _, org, pharmacy, shift, slot, _, path = self.scenario(parent)
                stranger, _ = make_owner_with_pharmacy('Unrelated deletion')
                response = client_for(stranger).delete(path)
                self.assertEqual(response.status_code, 404 if parent == 'pharmacy' else 403, response.content)
                self.assert_preserved(org, pharmacy, shift, slot)

    def test_direct_shift_refusal_preserves_lookup_transaction_side_effects(self):
        from shifts.base import BaseShiftViewSet

        _, _, _, shift, _, _, _ = self.scenario('pharmacy', payment_status='PENDING')
        published = Mock()

        def lookup():
            # get_queryset may auto-escalate a due shift while resolving the object.
            Shift.objects.filter(pk=shift.pk).update(visibility='PLATFORM')
            transaction.on_commit(published)
            return shift

        view = BaseShiftViewSet()
        view.get_object = lookup
        with self.captureOnCommitCallbacks(execute=True):
            response = view.destroy(None)
        self.assertEqual(response.status_code, 409)
        self.assertEqual(str(response.data['detail']),
                         'This shift has a pending payment. Complete payment before deleting it.')
        shift.refresh_from_db()
        self.assertEqual(shift.visibility, 'PLATFORM')
        published.assert_called_once_with()

