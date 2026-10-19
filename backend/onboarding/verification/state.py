"""Current-number AHPRA state shared by onboarding, access checks and employers."""
from datetime import timedelta

from django.core.cache import caches
from django.db import transaction

from onboarding.models import AhpraCheck, OwnerOnboarding
from onboarding.services.work_profile import current_worker_profile
from onboarding.verification.ahpra_numbers import full_registration_number

ADVERSE_STATUSES = {'suspended', 'cancelled', 'surrendered'}


def ahpra_profile(user):
    if str(user.role).upper() == 'OWNER':
        return OwnerOnboarding.objects.filter(user=user).first()
    return current_worker_profile(user)


def recheck_key(user_id):
    return f'ahpra_recheck_requested_{user_id}'


def ahpra_state(profile):
    number = full_registration_number(getattr(profile, 'ahpra_number', None))
    check = None
    if profile is not None and number and hasattr(profile, '_meta'):
        check = AhpraCheck.objects.filter(
            model_name=profile._meta.object_name, object_pk=profile.pk,
            registration_number=number, status='done',
        ).order_by('-completed_at', '-pk').first()
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
        elif normalized_status == 'registered' and check.outcome == 'verified':
            state = 'ok'
    user_id = getattr(profile, 'user_id', None)
    requested = caches['ahpra'].get(recheck_key(user_id)) if user_id and number else None
    available = requested + timedelta(hours=1) if requested else None
    note = check.note if check else ''
    if state == 'suspended':
        note = (
            f'Your AHPRA registration shows as {status}. Your ChemistTasker account is paused until this changes. '
            'Please contact AHPRA. When your registration is restored, open your AHPRA step and press Re-check.'
        )
    elif state == 'not_found':
        note = (
            f"We couldn't find registration number {number} on the AHPRA public register. "
            'Check the number (fix it if it was a typo) or contact AHPRA, then press Re-check.'
        )
    elif check and state == 'pending' and normalized_status != 'registered':
        note = f'Needs review by an admin: AHPRA registration status is {status or "unreadable"}.'
    return {
        'state': state, 'registration_status': status,
        'registration_type': data.get('registration_type') or None,
        'expiry_date': data.get('expiry_date') or None, 'note': note,
        'checked_at': check.completed_at.isoformat() if check and check.completed_at else None,
        'recheck_available_at': available.isoformat() if available else None,
    }


def require_ahpra_application(user):
    from shifts.access import ShiftActionRefused
    state = ahpra_state(ahpra_profile(user))
    if state['state'] in ('not_found', 'suspended'):
        raise ShiftActionRefused({'code': f"ahpra_{state['state']}", 'detail': state['note']}, 403)


def apply_state_transition(profile, previous):
    """Called under the profile/check locks, after saving the finished check."""
    from onboarding.verification.policy import refresh_verified, revoke_for_changed_evidence
    profile.refresh_from_db()
    current = ahpra_state(profile)
    # Pending/needs-review never revokes Verified (owner decision 2026-10-14).
    if current['state'] in ('suspended', 'not_found'):
        revoked = revoke_for_changed_evidence(profile, 'ahpra')
        if current['state'] == 'suspended':
            profile.ahpra_verified = False
            profile.verified = False
            profile.save(update_fields=['ahpra_verified', 'verified'])
        elif revoked:
            profile.save(update_fields=['verified'])
    elif current['state'] == 'ok':
        refresh_verified(profile)
    if current['state'] == 'suspended' and previous['state'] != 'suspended':
        if not profile.user.is_staff:
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
        send_mail('AHPRA account paused',
                  f'User id: {profile.user_id}\nNumber: {full_registration_number(profile.ahpra_number)}\n'
                  f"Status: {state['registration_status']}\nCancelled shifts:\n{rows or 'None'}\n"
                  f"Retained bookings:\n{retained or 'None'}",
                  settings.DEFAULT_FROM_EMAIL, recipients)
