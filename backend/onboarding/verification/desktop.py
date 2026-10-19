"""Synchronous desktop-verifier persistence; no applicant identity leaves the server."""
from datetime import date, timedelta

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.apps import apps
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework import serializers

from onboarding.models import AhpraCheck
from onboarding.verification.ahpra import _update_ahpra_fields, evaluate_ahpra_record
from onboarding.verification.ahpra_numbers import full_registration_number

PROFILE_MODELS = ('PharmacistOnboarding', 'OwnerOnboarding', 'OtherStaffOnboarding')


class RegisterSerializer(serializers.Serializer):
    name = serializers.CharField(allow_blank=True, max_length=500)
    profession = serializers.CharField(allow_blank=True, max_length=500)
    registration_status = serializers.CharField(allow_blank=True, max_length=100)
    registration_type = serializers.CharField(allow_blank=True, max_length=100)
    expiry_date = serializers.RegexField(r'^\d{4}-\d{2}-\d{2}$', allow_null=True)
    conditions = serializers.BooleanField()
    undertakings = serializers.BooleanField()
    reprimands = serializers.BooleanField()


def valid_result(payload):
    if not isinstance(payload, dict) or set(payload) != {'type', 'check_id', 'outcome', 'checked_at', 'register', 'error'}:
        return False
    if payload['type'] != 'result' or type(payload['check_id']) is not int or payload['check_id'] <= 0:
        return False
    if payload['outcome'] not in ('found', 'not_found', 'blocked', 'error') or not isinstance(payload['error'], str):
        return False
    try:
        serializers.DateTimeField().run_validation(payload['checked_at'])
    except serializers.ValidationError:
        return False
    record = payload['register']
    if record is None:
        return payload['outcome'] != 'found'
    if not isinstance(record, dict) or set(record) != set(RegisterSerializer().fields):
        return False
    if any(type(record[k]) is not bool for k in ('conditions', 'undertakings', 'reprimands')):
        return False
    if any(not isinstance(record[k], str) for k in ('name', 'profession', 'registration_status', 'registration_type')):
        return False
    if not RegisterSerializer(data=record).is_valid():
        return False
    try:
        if record['expiry_date'] is not None:
            date.fromisoformat(record['expiry_date'])
    except (TypeError, ValueError):
        return False
    return True


def enqueue_check(profile, number, reason):
    check, created = AhpraCheck.objects.get_or_create(
        model_name=profile._meta.object_name, object_pk=profile.pk, registration_number=number,
        status__in=['pending', 'sent'], defaults={'reason': reason, 'status': 'pending'},
    )
    if created:
        transaction.on_commit(lambda: async_to_sync(get_channel_layer().group_send)(
            'ahpra_verifiers', {'type': 'ahpra.check', 'check_id': check.pk},
        ))
    return check


def claim_checks(check_id=None):
    now = timezone.now()
    eligible = Q(status='pending') | Q(status='sent', sent_at__lt=now - timedelta(minutes=5))
    checks = AhpraCheck.objects.filter(eligible).order_by('created_at')
    if check_id is not None:
        checks = checks.filter(pk=check_id)
    messages = []
    for check in checks:
        if AhpraCheck.objects.filter(eligible, pk=check.pk).update(status='sent', sent_at=now):
            messages.append({'type': 'check', 'check_id': check.pk, 'registration_number': check.registration_number})
    return messages


def check_profile(check):
    if check.model_name not in PROFILE_MODELS:
        return None
    return apps.get_model('client_profile', check.model_name).objects.select_for_update().select_related('user').filter(pk=check.object_pk).first()


@transaction.atomic
def apply_ahpra_result(check, payload):
    if not valid_result(payload):
        return False
    check = AhpraCheck.objects.select_for_update().filter(pk=check.pk).exclude(status='done').first()
    if check is None:
        return False
    profile = check_profile(check)
    outcome = payload['outcome']
    record = payload['register']
    note = payload['error']
    if profile is None or full_registration_number(profile.ahpra_number) != check.registration_number:
        outcome, note = 'error', 'Profile missing or registration number changed; manual review required.'
    elif outcome == 'found' and not all(record[field].strip() for field in ('name', 'registration_status')):
        outcome, note = 'error', 'AHPRA practitioner record incomplete. Please try again later.'
    elif outcome == 'found':
        from onboarding.tasks import _resolve_ahpra_role
        outcome, note = evaluate_ahpra_record(
            {**record, 'practitioner_name': record['name'],
             'expiry_date': date.fromisoformat(record['expiry_date']) if record['expiry_date'] else None},
            first_name=profile.user.first_name, last_name=profile.user.last_name,
            role=_resolve_ahpra_role(profile, model_name=check.model_name),
        )
        if outcome != 'verified':
            note = ('Rejected: ' if outcome == 'rejected' else 'Needs review: ') + note
        _update_ahpra_fields(check.model_name, check.object_pk, outcome == 'verified', note,
                             reg_type=record['registration_type'], reg_status=record['registration_status'],
                             expiry_date=date.fromisoformat(record['expiry_date']) if record['expiry_date'] else None)
    elif outcome == 'not_found':
        note = 'Registration number not found on the AHPRA register'
        _update_ahpra_fields(check.model_name, check.object_pk, False, note)
    check.status, check.outcome, check.note = 'done', outcome, note
    check.register_data = record or {}
    check.completed_at = timezone.now()
    check.save()
    return True
