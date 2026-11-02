"""Synthetic PostgreSQL backup evidence; never operate against application databases."""
import hashlib
import json
import os
from pathlib import Path
from django.conf import settings
from django.db import connection

SYNTHETIC_EMAIL = 'recovery-fixture@release.example.test'


def guard():
    db = connection.settings_dict
    if (os.environ.get('APP_ENV') != 'test' or connection.vendor != 'postgresql'
            or not db['NAME'].startswith('ct_release_') or db['HOST'] not in {'127.0.0.1', 'localhost'}):
        raise RuntimeError('Recovery evidence requires the isolated ct_release_ PostgreSQL database')


def seed_baseline():
    guard()
    from django.contrib.auth import get_user_model
    from onboarding.models import PharmacistOnboarding
    user = get_user_model().objects.create_user(email=SYNTHETIC_EMAIL, role='PHARMACIST', password='disposable-rehearsal')
    PharmacistOnboarding.objects.create(user=user, tfn_number='123456782')
    verify_identity()


def verify_identity():
    guard()
    from onboarding.models import PharmacistOnboarding
    from client_profile.fields import EncryptedTextField
    row = PharmacistOnboarding.objects.get(user__email=SYNTHETIC_EMAIL)
    field = row._meta.get_field('tfn_number')
    assert row.tfn_number == '123456782'
    assert isinstance(field, EncryptedTextField)
    assert field.deconstruct()[1] == 'client_profile.fields.EncryptedTextField'
    with connection.cursor() as cursor:
        cursor.execute(f'SELECT tfn_number FROM {connection.ops.quote_name(row._meta.db_table)} WHERE id = %s', [row.pk])
        raw = cursor.fetchone()[0]
    assert raw.startswith('enc1$') and '123456782' not in raw
    return hashlib.sha256(raw.encode()).hexdigest()


def seed_candidate():
    guard()
    from django.contrib.auth import get_user_model
    from billing.models import FulfillmentCheckout, FulfillmentReservation, ShiftPayment
    from client_profile.characterization_support import make_owner_with_pharmacy, make_assignment
    from django.utils import timezone
    from onboarding.models import PharmacistOnboarding
    from worker_finance.services import internal_invoice_prefill, save_draft
    owner, pharmacy = make_owner_with_pharmacy('Synthetic recovery only')
    user = get_user_model().objects.get(email=SYNTHETIC_EMAIL)
    shift, slot, assignment = make_assignment(pharmacy, owner, user)
    payment = ShiftPayment.objects.create(owner=owner, shift=shift, stripe_payment_intent_id='pi_synthetic_restore',
        amount_aud='30.00', payment_type='fulfillment', payment_method='card', status='paid', paid_at=timezone.now(),
        reconciliation_required=True, reconciliation_reason='locked_payroll_period')
    attempt = FulfillmentCheckout.objects.create(shift=shift, original_shift_id=shift.pk, actor=owner, offer_ids=[],
        parameters={'metadata': {'synthetic_recovery': True}}, parameter_hash='synthetic', expected_amount_cents=3000,
        state=FulfillmentCheckout.State.COMPLETE, stripe_session_id='cs_synthetic_restore', payment=payment)
    FulfillmentReservation.objects.create(checkout=attempt, occurrence_key=f'{shift.pk}:{slot.pk}:{slot.date}')
    PharmacistOnboarding.objects.filter(user=user).update(payment_preference='ABN', abn='51824753556',
        abn_entity_confirmed=True, gst_registered=True)
    assignment.unit_rate = '70.00'
    assignment.payment_preference_snapshot = 'ABN'
    assignment.settlement_channel = 'INVOICE'
    assignment.engagement_kind = 'INDEPENDENT_CONTRACTOR'
    assignment.engagement_terms_accepted_at = timezone.now()
    assignment.engagement_terms_snapshot = {'gst_registered': True, 'super_payable_confirmed': False,
        'occurrences': [{'slot_id': slot.pk, 'date': str(slot.date), 'agreed_rate': '70.00'}]}
    assignment.save()
    record = save_draft(user, internal_invoice_prefill(user, [assignment.pk]))
    payload = dict(record.payload, version=record.version)
    payload['lines'][0]['quantity'] = '7.50'
    save_draft(user, payload, record.pk)
    verify_candidate()


def verify_candidate():
    guard()
    from billing.models import FulfillmentCheckout, ShiftPayment
    from invoicing.models import Invoice
    from worker_finance.documents import render_document_pdf
    from worker_finance.services import serialize_revision
    payment = ShiftPayment.objects.get(stripe_payment_intent_id='pi_synthetic_restore')
    assert payment.reconciliation_required and payment.amount_aud == 30
    attempt = FulfillmentCheckout.objects.get(payment=payment)
    assert attempt.reservations.filter(active=True).count() == 1
    record = Invoice.objects.get(user__email=SYNTHETIC_EMAIL, request_key__isnull=False)
    assert record.version == 2 and record.revisions.count() == 2
    for revision in record.revisions.all():
        assert render_document_pdf(serialize_revision(record, revision)).startswith(b'%PDF-')


def inventory(destination):
    guard()
    result = {'encrypted_identity': verify_identity(), 'tables': {}, 'columns': [], 'constraints': [], 'sequences': []}
    with connection.cursor() as cursor:
        for table in sorted(connection.introspection.table_names()):
            quoted = connection.ops.quote_name(table)
            cursor.execute(f"SELECT count(*), md5(coalesce(string_agg(row_to_json(t)::text, E'\\n' ORDER BY row_to_json(t)::text), '')) FROM {quoted} t")
            result['tables'][table] = cursor.fetchone()
        cursor.execute("SELECT table_name,column_name,data_type,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position")
        result['columns'] = cursor.fetchall()
        cursor.execute("SELECT conrelid::regclass::text,conname,pg_get_constraintdef(oid) FROM pg_constraint WHERE connamespace='public'::regnamespace ORDER BY 1,2")
        result['constraints'] = cursor.fetchall()
        cursor.execute("SELECT sequencename,start_value,increment_by,last_value FROM pg_sequences WHERE schemaname='public' ORDER BY sequencename")
        result['sequences'] = cursor.fetchall()
    Path(destination).write_text(json.dumps(result, sort_keys=True, indent=2, default=str) + '\n')
    print(f'RECOVERY_INVENTORY={len(result["tables"])} tables')
