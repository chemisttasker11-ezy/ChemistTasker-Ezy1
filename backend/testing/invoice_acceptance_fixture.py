"""Real accepted work for disposable browser/native invoice acceptance only."""
import os
from datetime import time, timedelta
from decimal import Decimal
from django.conf import settings
from django.utils import timezone


def seed_invoice_work(worker, pharmacy):
    if (os.environ.get('APP_ENV') != 'test'
            or os.environ.get('DJANGO_SETTINGS_MODULE') not in {'core.e2e_acceptance_settings', 'core.native_smoke_settings'}
            or settings.EMAIL_BACKEND != 'django.core.mail.backends.locmem.EmailBackend'):
        raise RuntimeError('Invoice acceptance fixtures require isolated settings and captured email')
    from onboarding.models import PharmacistOnboarding, OwnerOnboarding
    from django.contrib.auth import get_user_model
    from shifts.models import Shift, ShiftSlot, ShiftSlotAssignment
    if pharmacy.owner_id is None:
        owner = get_user_model().objects.create_user(email='invoice-owner@acceptance.example.test', role='OWNER')
        pharmacy.owner = OwnerOnboarding.objects.create(user=owner)
        pharmacy.save(update_fields=['owner'])
    PharmacistOnboarding.objects.filter(user=worker).update(payment_preference='ABN', abn='51824753556',
                                                          abn_entity_confirmed=True, gst_registered=True)
    day = timezone.localdate() - timedelta(days=2)
    shift = Shift.objects.create(pharmacy=pharmacy, created_by=pharmacy.owner.user,
                                role_needed='PHARMACIST', employment_type='LOCUM', payment_status='PAID')
    slot = ShiftSlot.objects.create(shift=shift, date=day, start_time=time(9), end_time=time(17), rate=Decimal('70'))
    assignment = ShiftSlotAssignment.objects.create(shift=shift, slot=slot, slot_date=day, user=worker,
        unit_rate=Decimal('70'), settlement_channel='INVOICE', engagement_kind='INDEPENDENT_CONTRACTOR',
        payment_preference_snapshot='ABN', engagement_terms_accepted_at=timezone.now(),
        engagement_terms_snapshot={'gst_registered': True, 'super_payable_confirmed': False,
                                  'occurrences': [{'slot_id': slot.pk, 'date': str(day), 'agreed_rate': '70.00'}]})
    return shift, assignment


def verify_invoice_work(email='native-smoke@example.test'):
    """Read committed simulator results; prove the PDFs and original source still agree."""
    if (os.environ.get('APP_ENV') != 'test'
            or os.environ.get('DJANGO_SETTINGS_MODULE') != 'core.native_smoke_settings'
            or settings.EMAIL_BACKEND != 'django.core.mail.backends.locmem.EmailBackend'):
        raise RuntimeError('Native invoice verification requires isolated captured-email settings')
    import fitz
    from invoicing.models import Invoice
    from worker_finance.documents import render_document_pdf
    from worker_finance.services import serialize_revision
    record = Invoice.objects.get(user__email=email, request_key__isnull=False)
    assert record.version == 2
    assert record.revisions.count() == 2
    assert list(record.deliveries.values_list('version', 'status')) == [(2, 'sent')]
    assert record.source_snapshot['accepted_terms'][0]['original_hours'] == '8.00'
    assert record.source_snapshot['accepted_terms'][0]['original_rate'] == '70.00'
    for version, total in ((1, '577.50'), (2, '616.00')):
        revision = record.revisions.get(version=version)
        assert revision.calculation['payable'] == total
        payload = render_document_pdf(serialize_revision(record, revision))
        with fitz.open(stream=payload, filetype='pdf') as pdf:
            assert total in '\n'.join(page.get_text() for page in pdf)
    print('NATIVE_INVOICE_REVISIONS_PDF_CAPTURED_DELIVERY=PASS')
