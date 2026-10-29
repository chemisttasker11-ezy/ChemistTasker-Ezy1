"""Current-number AHPRA state shared by onboarding, access checks and employers."""
from datetime import date, timedelta
import logging

from django.conf import settings
from django.core.cache import caches
from django.db import transaction
from django.utils import timezone

from onboarding.models import AhpraCheck, OwnerOnboarding, PharmacistOnboarding
from onboarding.services.work_profile import current_worker_profile
from onboarding.verification.ahpra import ahpra_name_match, registration_type_note
from onboarding.verification.ahpra_numbers import full_registration_number

ADVERSE_STATUSES = {'suspended', 'cancelled', 'surrendered'}
# Lookups with no real register record: they never change anyone's AHPRA state.
VERIFIER_FAILURES = ('error', 'blocked')
REVIEW_NOTE = (
    'Your AHPRA registration needs a quick review by our team before you can apply for public '
    "shifts. We'll let you know when it's done. If something looks wrong, check your name and "
    'registration number, or contact us.'
)
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
    raw_type = data.get('registration_type')
    registration_type = raw_type.strip() if isinstance(raw_type, str) else ''
    pharmacist = isinstance(profile, PharmacistOnboarding) or (
        isinstance(profile, OwnerOnboarding) and (profile.role == 'PHARMACIST' or profile.ahpra_switched_to_manager)
    )
    state = 'pending'
    if check:
        # A different person's record cannot impose restrictions; an admin's review of the check settles it.
        mismatch = not check.reviewed_at and bool(data.get('name')) and not ahpra_name_match(
            data['name'], profile.user.first_name, profile.user.last_name)
        if mismatch:
            state = 'review'
        elif check.outcome == 'review' and normalized_status in ADVERSE_STATUSES | {'registered', 'not registered'}:
            state = 'review'
        elif check.outcome == 'not_found' or normalized_status == 'not registered':
            state = 'not_found'
        elif normalized_status in ADVERSE_STATUSES:
            state = 'suspended'
        elif check.outcome == 'rejected' and normalized_status in ('', 'registered'):
            # A rejection not explained by the status (wrong profession, admin) blocks public work;
            # an unreadable status stays unreadable.
            state = 'rejected'
        elif normalized_status == 'registered' and pharmacist and registration_type.lower() != 'general':
            state = 'type_not_accepted'
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
    elif state == 'review':
        note = REVIEW_NOTE
    elif state == 'suspended':
        note = (member_suspension_note(status) + ' Your owner profile is now a Pharmacy Manager.') if isinstance(profile, OwnerOnboarding) else (
            f'Your AHPRA registration shows as {status}. Your ChemistTasker account is paused until this changes. '
            'Please contact AHPRA. When your registration is restored, open your AHPRA step and press Re-check.'
        )
    elif state == 'type_not_accepted':
        note = registration_type_note(registration_type)
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
        'registration_type': registration_type or None,
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
    if not settings.AHPRA_ENFORCEMENT_ENABLED:
        return
    from shifts.access import ShiftActionRefused
    profile = ahpra_profile(user)
    state = ahpra_state(profile)
    if state['state'] == 'suspended' and not ahpra_frozen(user, state):
        state['note'] = member_suspension_note(state['registration_status'])
    if state['state'] in ('not_found', 'suspended', 'unreadable', 'rejected', 'type_not_accepted', 'review'):
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


def lock_public_ahpra(user, shift, *, manager=False):
    """Inside the booking transaction: lock the worker's AHPRA profile row (apply_state_transition holds the same
    lock) and re-check, so a booking cannot commit around a suspension that has not yet cancelled bookings."""
    from shifts.access import ShiftActionRefused
    profile = ahpra_profile(user)
    if profile is not None:
        type(profile).objects.select_for_update().filter(pk=profile.pk).first()
    try:
        require_public_ahpra(user, shift)
    except ShiftActionRefused:
        if not manager:
            raise
        raise ShiftActionRefused({'code': 'candidate_ahpra_ineligible',
                                  'detail': "This worker can't be booked for public shifts right now."}, 403)


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
    if not settings.AHPRA_ENFORCEMENT_ENABLED:
        return False
    from memberships.models import Membership
    from users.models import OrganizationMembership

    state = state or ahpra_state(ahpra_profile(user))
    return state['state'] == 'suspended' and str(user.role).upper() != 'OWNER' and (
        not Membership.objects.filter(
            user=user, pharmacy__isnull=False, is_active=True, status=Membership.Status.ACCEPTED).exists()
    ) and not OrganizationMembership.objects.filter(user=user).exists()


@transaction.atomic
def apply_state_transition(profile, previous):
    """Called under the profile/check locks, after saving the finished check."""
    from onboarding.verification.policy import refresh_verified, revoke_for_changed_evidence
    # The booking paths take this lock too (lock_public_ahpra); callers normally hold it already.
    type(profile).objects.select_for_update().filter(pk=profile.pk).first()
    profile.refresh_from_db()
    current = ahpra_state(profile)
    if current['state'] in ('suspended', 'not_found', 'unreadable', 'rejected', 'type_not_accepted', 'review'):
        revoked = revoke_for_changed_evidence(profile, 'ahpra')
        if current['state'] in ('suspended', 'unreadable', 'rejected', 'type_not_accepted', 'review'):
            profile.ahpra_verified = False
            profile.verified = False
            profile.save(update_fields=['ahpra_verified', 'verified'])
            if (settings.AHPRA_ENFORCEMENT_ENABLED and current['state'] in ('suspended', 'type_not_accepted')
                    and isinstance(profile, OwnerOnboarding) and profile.role != 'MANAGER'):
                profile.role, profile.ahpra_switched_to_manager = 'MANAGER', True
                profile.save(update_fields=['role', 'ahpra_switched_to_manager'])
        elif revoked:
            profile.save(update_fields=['verified'])
    elif current['state'] == 'ok':
        if settings.AHPRA_ENFORCEMENT_ENABLED and isinstance(profile, OwnerOnboarding) and profile.ahpra_switched_to_manager:
            profile.role, profile.ahpra_switched_to_manager = 'PHARMACIST', False
            profile.save(update_fields=['role', 'ahpra_switched_to_manager'])
        refresh_verified(profile)
    if not settings.AHPRA_ENFORCEMENT_ENABLED:
        return
    adverse_transition = current['state'] in ('suspended', 'type_not_accepted') and previous['state'] != current['state']
    if adverse_transition:
        from shifts.cancellation import cancel_upcoming_assignments
        reason = ('their AHPRA registration type is not accepted for pharmacist shifts'
                  if current['state'] == 'type_not_accepted' else 'their AHPRA registration is paused')
        bookings = cancel_upcoming_assignments(profile.user, reason=reason)
        transaction.on_commit(lambda: announce_suspension(profile, current, bookings), robust=True)
    if current['state'] == 'rejected' and previous['state'] != 'rejected':
        # A rejection keeps bookings: the pharmacy and our team resolve them by hand.
        from shifts.cancellation import cancel_upcoming_assignments
        bookings = cancel_upcoming_assignments(profile.user, cancel=False)['retained']
        if bookings:
            transaction.on_commit(lambda: announce_rejected_bookings(profile, bookings), robust=True)
    if current['state'] == 'suspended' and previous['state'] != 'suspended':
        if not profile.user.is_staff and ahpra_frozen(profile.user):
            transaction.on_commit(lambda: close_chat_sockets(profile.user_id), robust=True)
        transaction.on_commit(lambda: announce_member_suspension(profile.user, current['registration_status']), robust=True)


def close_chat_sockets(user_id):
    from asgiref.sync import async_to_sync
    from channels.layers import get_channel_layer
    from chat.realtime import USER_GROUP_FMT

    layer = get_channel_layer()
    if layer:
        async_to_sync(layer.group_send)(USER_GROUP_FMT.format(user_id=user_id), {'type': 'ahpra.suspended'})


def announce_suspension(profile, state, bookings):
    from django.conf import settings
    from django.core.mail import send_mail
    from users.task_dispatch import async_task
    from notifications.services import notify_users

    type_not_accepted = state['state'] == 'type_not_accepted'
    notify_users([profile.user_id], title='AHPRA registration type not accepted' if type_not_accepted else 'AHPRA registration paused',
                 body=state['note'], payload={'code': f"ahpra_{state['state']}"})
    async_task('users.tasks.send_async_email', subject='Your AHPRA registration',
               recipient_list=[profile.user.email], template_name='emails/ahpra_status.html',
               text_template='emails/ahpra_status.txt', context={'message': state['note']},
               suppress_auto_notification=True)
    recipients = getattr(settings, 'ADMIN_EMAILS', None) or [email for _, email in settings.ADMINS]
    if recipients:
        rows = '\n'.join(f"Shift {row['id']}: {row['date']} - {row['pharmacy']}" for row in bookings['cancelled'])
        retained = '\n'.join(f"Shift {row['id']}: {row['date']} - {row['pharmacy']} - kept, needs manual action"
                             for row in bookings['retained'])
        subject = ('AHPRA owner switched to Pharmacy Manager' if isinstance(profile, OwnerOnboarding) else
                   'AHPRA registration type not accepted' if type_not_accepted else 'AHPRA account paused')
        send_mail(subject,
                  f'User id: {profile.user_id}\nNumber: {full_registration_number(profile.ahpra_number)}\n'
                  f"Status: {state['registration_status']}\nType: {state['registration_type']}\nCancelled shifts:\n{rows or 'None'}\n"
                  f"Retained bookings:\n{retained or 'None'}",
                  settings.DEFAULT_FROM_EMAIL, recipients)


def announce_rejected_bookings(profile, bookings):
    from django.core.mail import send_mail
    from shifts.cancellation import announce_bookings

    name = profile.user.get_full_name() or profile.user.email
    announce_bookings(bookings, title='Booking needs immediate resolution',
                      message=lambda row: (f"{name}'s AHPRA check was rejected. Their booking for shift {row['id']} on "
                                           f"{row['date']} at {row['pharmacy']} needs immediate resolution."))
    recipients = getattr(settings, 'ADMIN_EMAILS', None) or [email for _, email in settings.ADMINS]
    if recipients:
        rows = '\n'.join(f"Shift {row['id']}: {row['date']} - {row['pharmacy']}" for row in bookings)
        send_mail('AHPRA rejected: bookings need immediate resolution',
                  f'User id: {profile.user_id}\nNumber: {full_registration_number(profile.ahpra_number)}\n'
                  f'Upcoming public bookings (not cancelled):\n{rows}',
                  settings.DEFAULT_FROM_EMAIL, recipients)


def announce_member_suspension(user, status):
    from users.task_dispatch import async_task
    from memberships.models import Membership
    from notifications.services import notify_users
    from organizations.models import PharmacyAdmin
    from users.models import OrganizationMembership, User

    pharmacies = Membership.objects.filter(
        user=user, pharmacy__isnull=False, is_active=True, status=Membership.Status.ACCEPTED,
    ).select_related('pharmacy__owner')
    pharmacy_ids = [membership.pharmacy_id for membership in pharmacies]
    recipient_ids = {membership.pharmacy.owner.user_id for membership in pharmacies if membership.pharmacy.owner_id}
    recipient_ids.update(PharmacyAdmin.objects.filter(
        pharmacy_id__in=pharmacy_ids, is_active=True).values_list('user_id', flat=True))
    organizations = OrganizationMembership.objects.filter(user=user).values_list('organization_id', flat=True)
    recipient_ids.update(OrganizationMembership.objects.filter(
        organization_id__in=organizations, role__in=['ORG_ADMIN', 'CHIEF_ADMIN', 'REGION_ADMIN'],
    ).values_list('user_id', flat=True))
    recipients = list(User.objects.filter(pk__in=recipient_ids, is_active=True).exclude(pk=user.pk))
    if not recipients:
        return
    message = f"Your team member {user.get_full_name() or user.email}'s AHPRA registration now shows as {status}"
    notify_users([recipient.pk for recipient in recipients], title='Team member AHPRA registration', body=message,
                 payload={'code': 'ahpra_member_suspended'})
    emails = sorted({recipient.email for recipient in recipients if recipient.email})
    if emails:
        async_task('users.tasks.send_async_email', subject='Team member AHPRA registration', recipient_list=emails,
                   template_name='emails/ahpra_status.html', text_template='emails/ahpra_status.txt',
                   context={'message': message}, suppress_auto_notification=True)
