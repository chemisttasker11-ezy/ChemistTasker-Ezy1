"""Inviting people to a pharmacy: one invitation (new account or existing worker, pending or immediately active) and
bulk invitations reported row by row.

Each invitation runs in its own atomic block; a failure after a write (for example a new user account) rolls that
invitation back so nothing of it is committed (PR #110). Failures are logged to the "memberships.views" channel that
operators and the public error-surface tests read.
"""
import logging

from django.contrib.auth.tokens import default_token_generator
from django.core import signing
from django.db import transaction
from django.utils import timezone
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode
from rest_framework import serializers

from users.task_dispatch import async_task
from memberships.access import user_can_invite_members_to_pharmacy
from memberships.labels import membership_role_label
from memberships.models import DIRECT_INVITE_DURATION, Membership, MembershipApplication
from memberships.role_resolution import membership_role_refusal
from memberships.notifications import _frontend_base_url_for_notifications
from memberships.serializers import (
    _count_active_memberships,
    MAX_ACTIVE_PHARMACY_MEMBERSHIPS,
    MembershipSerializer,
    required_user_role_for_membership,
)
from notifications.models import Notification
from organizations.models import Pharmacy
from users.models import User
from users.normalization import sanitize_email_text as clean_email

logger = logging.getLogger("memberships.views")


DIRECT_APPLICATION_PREFIX = "direct-"
DIRECT_APPLICATION_SALT = "memberships.expired-direct-invite"


def direct_invite_expiry(membership):
    if membership.status != Membership.Status.PENDING or membership.invited_by_id is None:
        return None
    sent = membership.direct_invited_at
    if sent is None:
        if hasattr(membership, "admin_assignment"):
            return None
        sent = membership.created_at
    return sent + DIRECT_INVITE_DURATION


def direct_invite_expired(membership, now):
    expires_at = direct_invite_expiry(membership)
    return expires_at is not None and expires_at <= now


def direct_application_token(membership):
    sent = membership.direct_invited_at or membership.created_at
    return DIRECT_APPLICATION_PREFIX + signing.dumps(
        [membership.pk, sent.isoformat()], salt=DIRECT_APPLICATION_SALT,
    )


def expired_invite_from_token(token, *, for_update=False):
    try:
        pk, sent = signing.loads(token.removeprefix(DIRECT_APPLICATION_PREFIX), salt=DIRECT_APPLICATION_SALT)
    except (signing.BadSignature, ValueError, TypeError):
        return None
    rows = Membership.objects.select_related("pharmacy", "invited_by")
    if for_update:
        rows = rows.select_for_update(of=("self",))
    membership = rows.filter(pk=pk, pharmacy__isnull=False).first()
    if not membership or not direct_invite_expired(membership, timezone.now()):
        return None
    if (membership.direct_invited_at or membership.created_at).isoformat() != sent:
        return None
    if not user_can_invite_members_to_pharmacy(membership.invited_by, membership.pharmacy):
        return None
    return membership


def direct_application_category(membership):
    return "FULL_PART_TIME" if membership.is_pharmacy_staff_member else "LOCUM_CASUAL"


def activate_first_password_invites(user):
    """Join current direct invites when the invitee sets their first password."""
    now = timezone.now()
    remaining = MAX_ACTIVE_PHARMACY_MEMBERSHIPS - _count_active_memberships(user)
    if remaining <= 0:
        return
    ids = list(Membership.objects.filter(
        user=user, status=Membership.Status.PENDING, is_active=False, invited_by__isnull=False,
        direct_invited_at__gt=now - DIRECT_INVITE_DURATION,
    ).exclude(pharmacy__isnull=True).order_by("direct_invited_at", "pk").values_list("pk", flat=True)[:remaining])
    Membership.objects.filter(pk__in=ids, status=Membership.Status.PENDING).update(
        status=Membership.Status.ACCEPTED, is_active=True, responded_at=now, updated_at=now,
    )


@transaction.atomic
def create_membership_invite(data, inviter, *, request=None, source_application_id=None):
    """
    Helper to create or invite a user as a membership and send emails.
    Returns: (membership_instance, None) if successful, (None, error_message) if not.
    A failure after a write (e.g. a new user account) rolls this invite's atomic block back, so nothing of a
    failed invite is committed; unexpected errors are logged and reported with a stable message.
    """
    try:
        email_raw = (data.get('email') or data.get('user_email') or '').strip().lower()
        email = clean_email(email_raw)
        pharmacy_id = data.get('pharmacy')
        role = data.get('role')
        employment_type = data.get('employment_type', '')

        if not email or not pharmacy_id or not role:
            return None, 'email, pharmacy, and role are required.'

        if role == "PHARMACY_ADMIN":
            return None, 'Use the pharmacy admin management endpoint to invite admins.'

        try:
            pharmacy = (
                Pharmacy.objects
                .select_for_update(of=("self",))
                .select_related("owner__user")
                .get(id=pharmacy_id)
            )
        except Pharmacy.DoesNotExist:
            return None, 'Pharmacy not found.'

        pending_application_qs = MembershipApplication.objects.filter(
            pharmacy=pharmacy,
            email__iexact=email,
            status="PENDING",
        )
        if source_application_id:
            pending_application_qs = pending_application_qs.exclude(pk=source_application_id)
        if pending_application_qs.exists():
            return None, (
                "This person already has a pending membership application for this pharmacy. "
                "Review that application instead of creating a duplicate invitation."
            )

        # Find or create user
        # Serialize the cross-pharmacy active-membership cap on the worker row.
        # Pharmacy locks alone do not coordinate two simultaneous invites to
        # different pharmacies for the same existing user.
        user = User.objects.select_for_update().filter(email__iexact=email).first()
        if not user:
            try:
                if role == "PHARMACIST":
                    user_role = "PHARMACIST"
                elif role in ["INTERN", "STUDENT", "ASSISTANT", "TECHNICIAN"]:
                    user_role = "OTHER_STAFF"
                else:
                    user_role = "EXPLORER"

                user = User.objects.create_user(
                    email=email,
                    password=None,
                    role=user_role,
                    is_otp_verified=False,
                )
            except Exception:
                logger.exception(
                    "Membership invite: user creation failed (inviter_id=%s pharmacy_id=%s)",
                    getattr(inviter, "id", None), pharmacy_id,
                )
                transaction.set_rollback(True)
                return None, 'Failed to create the user account for this invitation.'
        else:
            refusal = membership_role_refusal(user, role)
            if refusal:
                return None, f"{user.email}: {refusal}"

        # Enforce maximum active pharmacy memberships per user
        active_memberships = _count_active_memberships(user)
        if active_memberships >= MAX_ACTIVE_PHARMACY_MEMBERSHIPS:
            return None, f'This user already a member in {MAX_ACTIVE_PHARMACY_MEMBERSHIPS} pharmacies.'

        # Membership exists?
        existing_membership = Membership.objects.filter(user=user, pharmacy_id=pharmacy_id).first()
        now = timezone.now()
        if existing_membership:
            if existing_membership.status == Membership.Status.PENDING and not direct_invite_expired(existing_membership, now):
                return None, 'This user already has a pending invitation for this pharmacy.'
            if existing_membership.status == Membership.Status.ACCEPTED and existing_membership.is_active:
                return None, 'User is already a member of this pharmacy.'

        # --- START OF THE FIX ---
        # Prepare data for Membership creation, including new classification fields
        job_title_value = (data.get('job_title') or '').strip()
        if employment_type not in {'FULL_TIME', 'PART_TIME'}:
            job_title_value = ''

        membership_data = {
            'user': user.pk,
            'pharmacy': pharmacy.pk,
            'invited_name': data.get('invited_name', ''),
            'role': role,
            'employment_type': employment_type,
            'job_title': job_title_value,
            # Add classification fields from the request data
            'pharmacist_award_level': data.get('pharmacist_award_level', None),
            'otherstaff_classification_level': data.get('otherstaff_classification_level', None),
            'intern_half': data.get('intern_half', None),
            'student_year': data.get('student_year', None),
        }
        needs_first_password = not user.has_usable_password() and not user.is_otp_verified
        activate_immediately = bool(data.get('activate_immediately')) and (
            not needs_first_password or source_application_id is not None
        )
        if activate_immediately:
            membership_data['is_active'] = True
            membership_data['status'] = Membership.Status.ACCEPTED
        else:
            membership_data['is_active'] = False
            membership_data['status'] = Membership.Status.PENDING

        # Create membership through the serializer so role/classification rules
        # stay identical across manual invites and magic-link approvals.
        serializer_kwargs = {
            'data': membership_data,
            'context': {'request': request},
        }
        if existing_membership:
            serializer_kwargs['instance'] = existing_membership
            serializer_kwargs['partial'] = True
        membership_serializer = MembershipSerializer(**serializer_kwargs)
        try:
            membership_serializer.is_valid(raise_exception=True)
            membership = membership_serializer.save(
                invited_by=inviter, direct_invited_at=None if activate_immediately else now, responded_at=None,
            )
            if existing_membership:
                membership.revoke_admin_access()
            desired_status = membership_data.get('status', Membership.Status.ACCEPTED)
            desired_active = bool(membership_data.get('is_active', True))
            force_update_fields = []
            if membership.status != desired_status:
                membership.status = desired_status
                force_update_fields.append('status')
            if membership.is_active != desired_active:
                membership.is_active = desired_active
                force_update_fields.append('is_active')
            if force_update_fields:
                force_update_fields.append('updated_at')
                membership.save(update_fields=force_update_fields)
        except serializers.ValidationError as e:
            transaction.set_rollback(True)
            detail = e.detail
            if isinstance(detail, dict):
                for messages in detail.values():
                    if isinstance(messages, list) and messages:
                        return None, str(messages[0])
                    if isinstance(messages, str):
                        return None, messages
            return None, str(detail)
        except Exception:
            logger.exception(
                "Membership invite: membership creation failed (inviter_id=%s pharmacy_id=%s)",
                getattr(inviter, "id", None), pharmacy_id,
            )
            transaction.set_rollback(True)
            return None, 'Failed to create the membership.'
        # --- END OF THE FIX ---

        # Prepare and send email
        try:
            base = _frontend_base_url_for_notifications()
            admin_landing_url = f"{base}/dashboard/owner/manage-pharmacies/my-pharmacies"
            login_url = f"{base}/login"

            is_admin_role = False

            context = {
                "pharmacy_name": pharmacy.name,
                "inviter": inviter.get_full_name() or inviter.email or "A pharmacy admin",
                "role": membership_role_label(role),
                "is_admin": is_admin_role,                    # <-- NEW
                "admin_landing_url": admin_landing_url,       # <-- NEW
            }
            if not activate_immediately:
                context["expired_application_url"] = f"{base}/membership/apply/{direct_application_token(membership)}"

            recipient_list = [user.email]


            if needs_first_password:
                uid = urlsafe_base64_encode(force_bytes(user.pk))
                token = default_token_generator.make_token(user)
                context["magic_link"] = f"{base}/reset-password/{uid}/{token}/"

                subject = (
                    f"You’ve been invited as Pharmacy Admin at {pharmacy.name}"
                    if is_admin_role
                    else "You’re invited to join a pharmacy on ChemistTasker"
                )

                transaction.on_commit(lambda: async_task(
                    'users.tasks.send_async_email',
                    subject=subject,
                    recipient_list=recipient_list,
                    template_name="emails/pharmacy_invite_new_user.html",
                    context=context,
                    text_template="emails/pharmacy_invite_new_user.txt",
                ))

            elif activate_immediately:
                pass
            else:
                worker_role = "pharmacist" if getattr(user, "role", "") == "PHARMACIST" else "otherstaff"
                membership_url = f"{base}/dashboard/{worker_role}/memberships"
                context["frontend_dashboard_link"] = admin_landing_url if is_admin_role else membership_url
                context["membership_url"] = membership_url

                subject = (
                    f"You’ve been added as Pharmacy Admin at {pharmacy.name}"
                    if is_admin_role
                    else f"Review your invitation to join {pharmacy.name}"
                )

                transaction.on_commit(lambda: async_task(
                    'users.tasks.send_async_email',
                    subject=subject,
                    recipient_list=recipient_list,
                    template_name="emails/pharmacy_invite_existing_user.html",
                    context=context,
                    text_template="emails/pharmacy_invite_existing_user.txt",
                    notification={
                        "user_ids": [user.id],
                        "title": f"Invitation to join {pharmacy.name}",
                        "body": f"You have been invited as {membership_role_label(role)}. Accept or reject the invitation from Manage Memberships.",
                        "type": Notification.Type.ALERT,
                        "action_url": membership_url,
                        "payload": {
                            "membership_id": membership.id,
                            "pharmacy_id": pharmacy.id,
                            "status": membership.status,
                        },
                    },
                ))


        except Exception:
            # Don't return error here - membership was created successfully
            # Just log the email error but continue
            logger.exception(
                "Membership invite: invitation email could not be queued (membership_id=%s)", membership.id
            )

        return membership, None
        
    except Exception:
        logger.exception(
            "Membership invite failed unexpectedly (inviter_id=%s)", getattr(inviter, "id", None)
        )
        transaction.set_rollback(True)
        return None, 'Unable to process this invitation.'


def bulk_invite(invitations, inviter, *, request=None):
    """Invite each row; returns (results, errors) with 1-based line numbers for the rows that failed."""
    results, errors = [], []

    for idx, invite in enumerate(invitations):
        # Validate target pharmacy per row
        pid = invite.get('pharmacy')
        if not pid:
            errors.append({'line': idx + 1, 'email': invite.get('email'), 'error': 'Field "pharmacy" is required.'})
            continue

        try:
            target_pharmacy = Pharmacy.objects.select_related("owner__user").get(id=pid)
        except Pharmacy.DoesNotExist:
            errors.append({
                'line': idx + 1,
                'email': invite.get('email'),
                'error': 'Pharmacy not found.'
            })
            continue

        if not user_can_invite_members_to_pharmacy(inviter, target_pharmacy):
            errors.append({
                'line': idx + 1,
                'email': invite.get('email'),
                'error': 'Not permitted to invite into this pharmacy.'
            })
            continue

        # Default employment type for Pharmacy Admin if omitted
        if invite.get('role') == 'PHARMACY_ADMIN':
            errors.append({
                'line': idx + 1,
                'email': invite.get('email'),
                'error': 'Pharmacy admin invitations must use the admin management endpoint.'
            })
            continue

        membership, error = create_membership_invite(invite, inviter, request=request)
        if error:
            errors.append({'line': idx + 1, 'email': invite.get('email'), 'error': error})
        else:
            results.append({
                'email': invite.get('email'),
                'role': invite.get('role'),
                'employment_type': invite.get('employment_type'),
                'status': 'invited',
                'membership_id': membership.id,
                'membership_status': membership.status,
                'membership_is_active': membership.is_active,
            })

    return results, errors
