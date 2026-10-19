"""Synchronous desktop-verifier persistence; no applicant identity leaves the server."""
from datetime import date, timedelta

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.apps import apps
from django.conf import settings
from django.core.cache import caches
from django.core.mail import mail_admins
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from django.urls import reverse
from rest_framework import serializers

from onboarding.models import AhpraCheck
from onboarding.verification.ahpra import _update_ahpra_fields, evaluate_ahpra_record
from onboarding.verification.ahpra_numbers import full_registration_number

PROFILE_MODELS = ('PharmacistOnboarding', 'OwnerOnboarding', 'OtherStaffOnboarding')


def verifier_seen(kind):
    caches['ahpra'].set(f'ahpra_verifier_presence_{kind}', True, timeout=120)


class RegisterSerializer(serializers.Serializer):
    name = serializers.CharField(allow_blank=True, max_length=500)
    profession = serializers.CharField(allow_blank=True, max_length=500)
    registration_status = serializers.CharField(allow_blank=True, max_length=100)
    registration_type = serializers.CharField(allow_blank=True, max_length=100)
    expiry_date = serializers.RegexField(r'^\d{4}-\d{2}-\d{2}$', allow_null=True)
    conditions = serializers.BooleanField()
    undertakings = serializers.BooleanField()
    reprimands = serializers.BooleanField()
    registration_requirements = serializers.CharField(allow_blank=True, required=False, default='')
    supervised_practice = serializers.BooleanField(required=False, default=False)


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
    fields = RegisterSerializer().fields
    if (not isinstance(record, dict) or not set(record) <= set(fields)
            or not {key for key, field in fields.items() if field.required} <= set(record)):
        return False
    if any(type(record.get(k, False)) is not bool for k in ('conditions', 'undertakings', 'reprimands', 'supervised_practice')):
        return False
    if any(not isinstance(record.get(k, ''), str) for k in ('name', 'profession', 'registration_status', 'registration_type', 'registration_requirements')):
        return False
    if not RegisterSerializer(data=record).is_valid():
        return False
    try:
        if record['expiry_date'] is not None:
            date.fromisoformat(record['expiry_date'])
    except (TypeError, ValueError):
        return False
    return True


def enqueue_check(profile, number, reason, *, register_data=None):
    check, created = AhpraCheck.objects.get_or_create(
        model_name=profile._meta.object_name, object_pk=profile.pk, registration_number=number,
        status__in=['pending', 'sent'], defaults={
            'reason': reason, 'status': 'pending',
            'register_data': register_data or {},
            'stage': 'extension' if caches['ahpra'].get('ahpra_verifier_presence_extension') else 'bridge',
        },
    )
    if created:
        transaction.on_commit(lambda: async_to_sync(get_channel_layer().group_send)(
            f'ahpra_verifiers_{check.stage}', {'type': 'ahpra.check', 'check_id': check.pk},
        ))
    return check


def claim_checks(check_id=None, stage='extension'):
    now = timezone.now()
    stale = Q(status='sent', sent_at__lt=now - timedelta(minutes=5))
    eligible = Q(status='pending') | stale
    if stage == 'bridge':
        fallback = stale if caches['ahpra'].get('ahpra_verifier_presence_extension') else Q(status__in=['pending', 'sent'])
        abandoned = AhpraCheck.objects.filter(fallback, stage='extension')
        if check_id is not None:
            abandoned = abandoned.filter(pk=check_id)
        abandoned.update(stage='bridge', status='pending', sent_at=None)
    checks = AhpraCheck.objects.filter(eligible, stage=stage).order_by('created_at')
    if check_id is not None:
        checks = checks.filter(pk=check_id)
    messages = []
    for check in checks:
        if AhpraCheck.objects.filter(eligible, pk=check.pk, stage=stage).update(status='sent', sent_at=now):
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
    # Non-profile checks are diagnostic only, including after the lookup page is removed.
    if check.model_name not in PROFILE_MODELS:
        inputs = check.register_data.get('_test_input', {})
        record = payload['register'] or {}
        outcome, note = payload['outcome'], payload['error']
        # Same pre-checks as the profile path below, so the would-be decision matches.
        if outcome == 'found' and not record['name'].strip():
            outcome, note = 'error', 'AHPRA practitioner record incomplete. Please try again later.'
        elif outcome == 'found' and not record['registration_status'].strip():
            outcome, note = 'review', 'Needs review: AHPRA registration status is unreadable.'
        elif outcome == 'found':
            outcome, note = evaluate_ahpra_record(
                {**record, 'practitioner_name': record['name'],
                 'expiry_date': date.fromisoformat(record['expiry_date']) if record['expiry_date'] else None},
                first_name=inputs.get('first_name', ''), last_name=inputs.get('last_name', ''), role=inputs.get('role', ''),
            )
        check.register_data = {**record, '_test_input': inputs, '_test_outcome': payload['outcome']}
        check.status, check.outcome, check.note = 'done', outcome, note
        check.completed_at = timezone.now()
        check.save(update_fields=['register_data', 'status', 'outcome', 'note', 'completed_at'])
        return True
    profile = check_profile(check)
    from onboarding.verification.state import ahpra_state, apply_state_transition
    previous = ahpra_state(profile)
    outcome = payload['outcome']
    record = payload['register']
    note = payload['error']
    if profile is None or full_registration_number(profile.ahpra_number) != check.registration_number:
        outcome, note = 'error', 'Profile missing or registration number changed; manual review required.'
    elif outcome == 'found' and not record['name'].strip():
        outcome, note = 'error', 'AHPRA practitioner record incomplete. Please try again later.'
    elif outcome == 'found' and not record['registration_status'].strip():
        # A found record with no status is "unreadable" (state.py), not a verifier error.
        outcome, note = 'review', 'Needs review: AHPRA registration status is unreadable.'
    elif outcome == 'found':
        from onboarding.tasks import _resolve_ahpra_role
        outcome, note = evaluate_ahpra_record(
            {**record, 'practitioner_name': record['name'],
             'expiry_date': date.fromisoformat(record['expiry_date']) if record['expiry_date'] else None},
            first_name=profile.user.first_name, last_name=profile.user.last_name,
            # An owner AHPRA switched to MANAGER is still checked as the pharmacist they were.
            role=_resolve_ahpra_role(profile, model_name=check.model_name,
                                     role_override='pharmacist' if getattr(profile, 'ahpra_switched_to_manager', False) else None),
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
    if (outcome not in ('error', 'blocked') and profile is not None
            and full_registration_number(profile.ahpra_number) == check.registration_number):
        apply_state_transition(profile, previous)
    return True


def admin_review_url(check):
    return settings.BACKEND_BASE_URL.rstrip('/') + reverse('admin:client_profile_ahpracheck_change', args=[check.pk])


@transaction.atomic
def handle_verifier_result(payload, kind):
    if not valid_result(payload):
        return False
    check = AhpraCheck.objects.select_for_update().filter(pk=payload['check_id']).first()
    if check is None:
        return False
    # ACK a lost terminal ACK or extension hand-off ACK without applying it again.
    if check.status == 'done' or (kind == 'extension' and check.stage == 'bridge'):
        return True
    if check.stage != kind:
        return False
    if payload['outcome'] == 'error' and kind == 'extension':
        check.stage, check.status = 'bridge', 'pending'
        check.extension_error = payload['error']
        check.sent_at = None
        check.save(update_fields=['stage', 'status', 'extension_error', 'sent_at'])
        transaction.on_commit(lambda: async_to_sync(get_channel_layer().group_send)(
            'ahpra_verifiers_bridge', {'type': 'ahpra.check', 'check_id': check.pk},
        ))
        return True
    if not apply_ahpra_result(check, payload):
        return False
    if payload['outcome'] == 'error' and check.model_name in PROFILE_MODELS:
        check.refresh_from_db()
        check.needs_attention, check.alerted_at = True, None
        check.save(update_fields=['needs_attention', 'alerted_at'])
        message = {
            'type': 'repair', 'check_id': check.pk, 'registration_number': check.registration_number,
            'errors': [check.extension_error, payload['error']],
        }
        transaction.on_commit(lambda: async_to_sync(get_channel_layer().group_send)(
            'ahpra_verifiers_bridge', {'type': 'ahpra.repair', 'message': message},
        ))
        transaction.on_commit(lambda: mail_admins('AHPRA check needs your input',
                    f'Check {check.pk} ({check.registration_number})\n'
                    f'Extension error: {check.extension_error}\nBridge error: {payload["error"]}\n'
                    f'Claude repair has started\nAdmin review: {admin_review_url(check)}', fail_silently=True))
    return True


@transaction.atomic
def store_repair_report(payload):
    if (type(payload.get('check_id')) is not int or payload['check_id'] <= 0
            or not isinstance(payload.get('summary'), str) or not payload['summary'].strip()
            or not isinstance(payload.get('branch'), str)):
        return False
    check = AhpraCheck.objects.select_for_update().filter(
        pk=payload['check_id'], model_name__in=PROFILE_MODELS, needs_attention=True, reviewed_at__isnull=True,
    ).first()
    if check is None:
        return False
    if check.repair_reported_at is not None:
        return True
    check.repair_summary = payload['summary'][:4000]
    check.repair_branch = payload['branch'][:255]
    check.repair_reported_at = timezone.now()
    check.save(update_fields=['repair_summary', 'repair_branch', 'repair_reported_at'])
    transaction.on_commit(lambda: mail_admins('AHPRA repair report: your decision needed',
                f'Check {check.pk} ({check.registration_number})\n{check.repair_summary}\n'
                f'Branch: {check.repair_branch}\nPlease decide whether to approve or reject this check.\n'
                f'Admin review: {admin_review_url(check)}', fail_silently=True))
    return True
