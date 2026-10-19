"""Current-number AHPRA state shared by onboarding, access checks and employers."""
from datetime import date, timedelta
import logging

from django.core.cache import caches
from django.db import transaction
from django.utils import timezone

from onboarding.models import AhpraCheck, OwnerOnboarding
from onboarding.services.work_profile import current_worker_profile
from onboarding.verification.ahpra_numbers import full_registration_number

ADVERSE_STATUSES = {'suspended', 'cancelled', 'surrendered'}
# Lookups with no real register record: they never change anyone's AHPRA state.
VERIFIER_FAILURES = ('error', 'blocked')
logger = logging.getLogger(__name__)
_cooldown_cache_failed = False


def ahpra_profile(user):
    if str(user.role).upper() == 'OWNER':
        return OwnerOnboarding.objects.filter(user=user).first()
    return current_worker_profile(user)


def recheck_key(user_id):
    return f'ahpra_recheck_requested_{user_id}'


def recent_rechecks(profile):
    return AhpraCheck.objects.filter(
        model_name=profile._meta.object_name, object_pk=profile.pk, reason='recheck',
        registration_number=full_registration_number(profile.ahpra_number), created_at__gt=timezone.now() - timedelta(hours=24),
    ).order_by('created_at', 'pk')


def ahpra_state(profile):
    number = full_registration_number(getattr(profile, 'ahpra_number', None))
    check = None
    if profile is not None and number and hasattr(profile, '_meta'):
        check = AhpraCheck.objects.filter(
            model_name=profile._meta.object_name, object_pk=profile.pk,
            registration_number=number, status='done',
        ).exclude(outcome__in=VERIFIER_FAILURES).order_by('-completed_at', '-pk').first()
    data = check.register_data if check and isinstance(check.register_data, dict) else {}
    raw_status = data.get('registration_status')
    status = (raw_status.strip() or None) if isinstance(raw_status, str) else None
    normalized_status = (status or '').lower()
    state = 'pending'
    if check:
        if check.outcome == 'not_found' or normalized_status == 'not registered':
            state = 'not_found'
        elif normalized_status in ADVERSE_STATUSES:
            state = 'suspended'
        elif AhpraCheck.objects.filter(
            model_name=profile._meta.object_name, object_pk=profile.pk, registration_number=number,
            status='done', reviewed_at__isnull=False,
        ).order_by('-reviewed_at', '-pk').values_list('outcome', flat=True).first() == 'rejected':
            # An admin rejection outlasts later automatic and user re-checks until an admin verifies.
            state = 'rejected'
        elif normalized_status == 'registered' and check.outcome == 'verified':
            state = 'ok'
        elif normalized_status != 'registered' and not (check.outcome == 'verified' and check.reviewed_at):
            # An admin's manual verify carries no readable register status.
            state = 'unreadable'
    user_id = getattr(profile, 'user_id', None)
    requested = None
    if user_id and number:
        global _cooldown_cache_failed
        try:
            requested = caches['ahpra'].get(recheck_key(user_id))
        except Exception:
            if not _cooldown_cache_failed:
                logger.warning('AHPRA cooldown cache unavailable; omitting cooldown information', exc_info=True)
                _cooldown_cache_failed = True
    available = requested + timedelta(hours=1) if requested else None
    attempts, contact_support = 0, False
    if state == 'unreadable':
        retries = list(recent_rechecks(profile))
        attempts = len(retries)
        available = retries[0].created_at + timedelta(hours=24) if attempts >= 3 else None
        last_two = list(AhpraCheck.objects.filter(
            model_name=profile._meta.object_name, object_pk=profile.pk,
            registration_number=number, status='done',
        ).exclude(outcome__in=VERIFIER_FAILURES).order_by('-completed_at', '-pk')[:2])
        contact_support = len(last_two) == 2 and all(
            row.outcome != 'not_found' and str((row.register_data or {}).get('registration_status') or '').strip().lower()
            not in ADVERSE_STATUSES | {'registered', 'not registered'} for row in last_two
        )
    note = check.note if check else ''
    if state == 'rejected':
        note = 'Your AHPRA check was rejected. Contact support before applying for public shifts.'
    elif state == 'suspended':
        note = (member_suspension_note(status) + ' Your owner profile is now a Pharmacy Manager.') if isinstance(profile, OwnerOnboarding) else (
            f'Your AHPRA registration shows as {status}. Your ChemistTasker account is paused until this changes. '
            'Please contact AHPRA. When your registration is restored, open your AHPRA step and press Re-check.'
        )
    elif state == 'not_found':
        note = (
            f"We couldn't find registration number {number} on the AHPRA public register. "
            'Check the number (fix it if it was a typo) or contact AHPRA, then press Re-check.'
        )
    elif state == 'unreadable':
        note = "We couldn't read your AHPRA registration. Please check your number is correct and press Re-check."
        if contact_support:
            note += ' Still not working? Contact us now.'
    return {
        'state': state, 'registration_status': status,
        'registration_type': data.get('registration_type') or None,
        'expiry_date': data.get('expiry_date') or None, 'note': note,
        'checked_at': check.completed_at.isoformat() if check and check.completed_at else None,
        'recheck_available_at': available.isoformat() if available else None,
        'attempts': attempts, 'contact_support': contact_support,
    }


def member_suspension_note(status):
    return (
        f"Your AHPRA registration shows as {status}, so you can't apply for public shifts. "
        "Your work with your own pharmacy or organisation isn't affected. Please contact AHPRA."
    )


def require_ahpra_application(user):
    from shifts.access import ShiftActionRefused
    profile = ahpra_profile(user)
    state = ahpra_state(profile)
    if state['state'] == 'suspended' and not ahpra_frozen(user, state):
        state['note'] = member_suspension_note(state['registration_status'])
    if state['state'] in ('not_found', 'suspended', 'unreadable', 'rejected'):
        raise ShiftActionRefused({'code': f"ahpra_{state['state']}", 'detail': state['note']}, 403)
    if isinstance(profile, OwnerOnboarding) and profile.role != 'PHARMACIST':
        raise ShiftActionRefused({'code': 'pharmacist_required', 'detail': 'Pharmacy managers cannot apply as pharmacists.'}, 403)
    # Workers are held to verified onboarding by _require_public_shift_onboarding; owners have no such gate.
    if isinstance(profile, OwnerOnboarding) and not profile.ahpra_verified:
        raise ShiftActionRefused({'code': 'ahpra_pending', 'detail': 'Verify your AHPRA registration before applying for public shifts.'}, 403)


def require_public_ahpra(user, shift):
    from shifts.escalation import PUBLIC_LEVEL
    from shifts.interest import is_public_shift_member_access

    if shift.visibility == PUBLIC_LEVEL and not is_public_shift_member_access(user, shift):
        require_ahpra_application(user)
        from shifts.interest import _require_public_shift_onboarding
        _require_public_shift_onboarding(user)
        transaction.on_commit(lambda: queue_public_recheck(user), robust=True)


def queue_public_recheck(user):
    from django.conf import settings
    from onboarding.verification.desktop import enqueue_check

    profile = ahpra_profile(user)
    number = full_registration_number(getattr(profile, 'ahpra_number', None))
    if settings.AHPRA_SOURCE != 'desktop' or not number:
        return
    today = timezone.localdate()
    last = AhpraCheck.objects.filter(
        model_name=profile._meta.object_name, object_pk=profile.pk, registration_number=number, status='done',
    ).exclude(outcome__in=VERIFIER_FAILURES).order_by('-completed_at', '-pk').first()
    checked = timezone.localtime(last.completed_at).date() if last and last.completed_at else None
    data = last.register_data if last and isinstance(last.register_data, dict) else {}
    # Other-staff (intern) profiles have no expiry column; the finished check stores it.
    expiry = getattr(profile, 'ahpra_expiry_date', None) or (
        date.fromisoformat(data['expiry_date']) if data.get('expiry_date') else None)
    if expiry:
        due = expiry < today and (checked is None or checked <= expiry)
    else:
        due = checked is None or checked < date(today.year if today.month == 12 else today.year - 1, 12, 1)
    if due:
        enqueue_check(profile, number, 'public_recheck')


def ahpra_frozen(user, state=None):
    from memberships.models import Membership
    from users.models import OrganizationMembership

    state = state or ahpra_state(ahpra_profile(user))
    return state['state'] == 'suspended' and str(user.role).upper() != 'OWNER' and (
        not Membership.objects.filter(
            user=user, pharmacy__isnull=False, is_active=True, status=Membership.Status.ACCEPTED).exists()
    ) and not OrganizationMembership.objects.filter(user=user).exists()


def apply_state_transition(profile, previous):
    """Called under the profile/check locks, after saving the finished check."""
    from onboarding.verification.policy import refresh_verified, revoke_for_changed_evidence
    profile.refresh_from_db()
    current = ahpra_state(profile)
    if current['state'] in ('suspended', 'not_found', 'unreadable', 'rejected'):
        revoked = revoke_for_changed_evidence(profile, 'ahpra')
        if current['state'] in ('suspended', 'unreadable', 'rejected'):
            profile.ahpra_verified = False
            profile.verified = False
            profile.save(update_fields=['ahpra_verified', 'verified'])
            if current['state'] == 'suspended' and isinstance(profile, OwnerOnboarding) and profile.role != 'MANAGER':
                profile.role, profile.ahpra_switched_to_manager = 'MANAGER', True
                profile.save(update_fields=['role', 'ahpra_switched_to_manager'])
        elif revoked:
            profile.save(update_fields=['verified'])
    elif current['state'] == 'ok':
        if isinstance(profile, OwnerOnboarding) and profile.ahpra_switched_to_manager:
            profile.role, profile.ahpra_switched_to_manager = 'PHARMACIST', False
            profile.save(update_fields=['role', 'ahpra_switched_to_manager'])
        refresh_verified(profile)
    if current['state'] == 'suspended' and previous['state'] != 'suspended':
        if not profile.user.is_staff and ahpra_frozen(profile.user):
            transaction.on_commit(lambda: close_chat_sockets(profile.user_id), robust=True)
        transaction.on_commit(lambda: announce_suspension(profile, current), robust=True)


def close_chat_sockets(user_id):
    from asgiref.sync import async_to_sync
    from channels.layers import get_channel_layer
    from chat.realtime import USER_GROUP_FMT

    layer = get_channel_layer()
    if layer:
        async_to_sync(layer.group_send)(USER_GROUP_FMT.format(user_id=user_id), {'type': 'ahpra.suspended'})


def announce_suspension(profile, state):
    from django.conf import settings
    from django.core.mail import send_mail
    from core.task_queue import async_task
    from notifications.services import notify_users
    from shifts.cancellation import cancel_upcoming_assignments

    bookings = cancel_upcoming_assignments(profile.user)
    notify_users([profile.user_id], title='AHPRA registration paused', body=state['note'],
                 payload={'code': 'ahpra_suspended'})
    async_task('users.tasks.send_async_email', subject='Your AHPRA registration',
               recipient_list=[profile.user.email], template_name='emails/ahpra_status.html',
               text_template='emails/ahpra_status.txt', context={'message': state['note']},
               suppress_auto_notification=True)
    recipients = getattr(settings, 'ADMIN_EMAILS', None) or [email for _, email in settings.ADMINS]
    if recipients:
        rows = '\n'.join(f"Shift {row['id']}: {row['date']} - {row['pharmacy']}" for row in bookings['cancelled'])
        retained = '\n'.join(f"Shift {row['id']}: {row['date']} - {row['pharmacy']} - kept, needs manual action"
                             for row in bookings['retained'])
        send_mail('AHPRA owner switched to Pharmacy Manager' if isinstance(profile, OwnerOnboarding) else 'AHPRA account paused',
                  f'User id: {profile.user_id}\nNumber: {full_registration_number(profile.ahpra_number)}\n'
                  f"Status: {state['registration_status']}\nCancelled shifts:\n{rows or 'None'}\n"
                  f"Retained bookings:\n{retained or 'None'}",
                  settings.DEFAULT_FROM_EMAIL, recipients)
