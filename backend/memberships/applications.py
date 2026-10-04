"""Deciding membership applications (the magic-link intake): approval creates or activates the worker's membership,
rejection closes the application; the applicant is e-mailed after commit."""
from datetime import date

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.utils import timezone

from core.task_queue import async_task
from memberships.access import user_can_decide_applications
from memberships.invites import create_membership_invite
from memberships.models import MembershipApplication
from onboarding.models import OtherStaffOnboarding, PharmacistOnboarding
from users.models import User
from users.normalization import sanitize_email_text as clean_email


class ApplicationRefused(Exception):
    """A refused decision: `body` and `status` are the endpoint's response, exactly as the view used to build it."""

    def __init__(self, body, status):
        super().__init__(body)
        self.body = body
        self.status = status


def approve_application(app, *, decided_by, data):
    """Approve a pending application: create (or activate) the worker's membership, fill a new account from the
    application, record employment terms when ChemistTasker payroll is on, and e-mail the applicant after commit.
    Returns the response body; refusals raise ApplicationRefused with the body and status the endpoint returns."""
    if not user_can_decide_applications(decided_by, app.pharmacy):
        raise ApplicationRefused({'detail': 'Not allowed to approve for this pharmacy.'}, 403)

    allowed_ftpt = {'FULL_TIME', 'PART_TIME', 'CASUAL'}
    allowed_fav = {'LOCUM', 'SHIFT_HERO'}
    raw_employment_type = data.get('employment_type')
    req_emp = str(raw_employment_type or '').strip().upper()
    if app.category == 'FULL_PART_TIME':
        if raw_employment_type not in (None, '') and req_emp not in allowed_ftpt:
            raise ApplicationRefused({'employment_type': ['Choose FULL_TIME, PART_TIME or CASUAL.']}, 400)
        employment_type = req_emp or 'CASUAL'
    else:
        if raw_employment_type not in (None, '') and req_emp not in allowed_fav:
            raise ApplicationRefused({'employment_type': ['Choose LOCUM or SHIFT_HERO.']}, 400)
        employment_type = req_emp or (
            'LOCUM' if app.role == 'PHARMACIST' else 'SHIFT_HERO'
        )

    payroll_terms = data.get('employment_engagement')
    payroll_required = bool(
        app.category == 'FULL_PART_TIME'
        and app.pharmacy.use_chemisttasker_payroll
    )

    if app.category == 'FULL_PART_TIME':
        from memberships.serializers import _application_payment_profile_status
        payment_profile = _application_payment_profile_status(app)
        if payment_profile.get('payment_preference') != 'TFN':
            raise ApplicationRefused({
                    'payment_profile': [
                        'Pharmacy staff are employees and must use the TFN pathway in their private ChemistTasker worker profile before approval.'
                    ],
                    'payment_profile_status': payment_profile,
                }, 400)
        if payroll_required and not payment_profile.get('payroll_ready'):
            raise ApplicationRefused({
                    'payment_profile': [
                        'ChemistTasker Payroll is enabled. The worker must complete TFN and super setup in their private profile before final approval.'
                    ],
                    'payment_profile_status': payment_profile,
                }, 400)

    if payroll_required and not isinstance(payroll_terms, dict):
        raise ApplicationRefused({
                'employment_engagement': [
                    'ChemistTasker Payroll is enabled. Add the initial employment terms before approving this staff application.'
                ]
            }, 400)

    email = clean_email((app.email or '').strip().lower())
    if not email:
        raise ApplicationRefused({'email': ['Application email is required.']}, 400)

    employment_engagement_public_id = None
    try:
        with transaction.atomic():
            app = (
                MembershipApplication.objects
                .select_for_update()
                .select_related('pharmacy')
                .get(pk=app.pk)
            )
            if app.status != 'PENDING':
                raise ApplicationRefused({'detail': f'Already {app.status.lower()}.'}, 400)

            existing_worker = User.objects.filter(email__iexact=email).first()
            user_existed_before_approval = existing_worker is not None
            if existing_worker:
                onboarding = (
                    PharmacistOnboarding.objects.filter(user=existing_worker).first()
                    if app.role == 'PHARMACIST'
                    else OtherStaffOnboarding.objects.filter(user=existing_worker).first()
                )
                existing_dob = getattr(onboarding, 'date_of_birth', None) if onboarding else None
                if existing_dob and existing_dob != app.date_of_birth:
                    raise DjangoValidationError({
                        'date_of_birth': ['Application date of birth does not match the worker onboarding profile.']
                    })

            invite_data = {
                'email': email,
                'pharmacy': app.pharmacy_id,
                'role': app.role,
                'employment_type': employment_type,
                'invited_name': f'{app.first_name} {app.last_name}'.strip(),
                'job_title': app.job_title if app.job_title else '',
                'pharmacist_award_level': app.pharmacist_award_level,
                'otherstaff_classification_level': app.otherstaff_classification_level,
                'intern_half': app.intern_half,
                'student_year': app.student_year,
                'activate_immediately': True,
                'source_application_id': app.id,
            }

            membership, error = create_membership_invite(
                invite_data,
                inviter=decided_by,
            )
            if error:
                raise DjangoValidationError({'detail': [error]})

            worker_user = membership.user
            if not user_existed_before_approval:
                worker_user.first_name = app.first_name.strip()
                worker_user.last_name = app.last_name.strip()
                worker_user.username = (app.username or '').strip()
                worker_user.mobile_number = (app.mobile_number or '').strip()
                worker_user.save(
                    update_fields=['first_name', 'last_name', 'username', 'mobile_number']
                )

            onboarding = (
                PharmacistOnboarding.objects.filter(user=worker_user).first()
                if app.role == 'PHARMACIST'
                else OtherStaffOnboarding.objects.filter(user=worker_user).first()
            )
            if onboarding and not onboarding.date_of_birth:
                onboarding.date_of_birth = app.date_of_birth
                onboarding.save(update_fields=['date_of_birth'])

            if payroll_required:
                from workforce.employment_engagement_service import build_employment_engagement_payload
                from workforce.models import EmploymentEngagement

                engagement_data = dict(payroll_terms)
                engagement_data.setdefault('employment_type', employment_type)
                engagement_data.setdefault('job_title', app.job_title or '')
                engagement_data.setdefault(
                    'award_classification',
                    app.pharmacist_award_level
                    or app.otherstaff_classification_level
                    or app.intern_half
                    or app.student_year
                    or '',
                )
                engagement_data.setdefault('pay_basis', 'AWARD')

                effective_from_raw = engagement_data.get('effective_from') or str(timezone.localdate())
                try:
                    effective_from = date.fromisoformat(str(effective_from_raw))
                except (TypeError, ValueError) as exc:
                    raise DjangoValidationError({
                        'effective_from': ['Use YYYY-MM-DD for the employment terms effective date.']
                    }) from exc

                effective_to_raw = engagement_data.get('effective_to')
                effective_to = None
                if effective_to_raw:
                    try:
                        effective_to = date.fromisoformat(str(effective_to_raw))
                    except (TypeError, ValueError) as exc:
                        raise DjangoValidationError({
                            'effective_to': ['Use YYYY-MM-DD for the employment terms end date.']
                        }) from exc

                engagement_payload = build_employment_engagement_payload(
                    engagement_data,
                    membership,
                    effective_from=effective_from,
                    effective_to=effective_to,
                )
                engagement = EmploymentEngagement(
                    membership=membership,
                    effective_from=effective_from,
                    effective_to=effective_to,
                    created_by=decided_by,
                    updated_by=decided_by,
                    **engagement_payload,
                )
                engagement.full_clean()
                engagement.save()
                employment_engagement_public_id = str(engagement.public_id)

            app.status = 'APPROVED'
            app.decided_at = timezone.now()
            app.decided_by = decided_by
            app.approved_membership = membership
            app.pending_identity_key = None
            app.save(update_fields=[
                'status',
                'decided_at',
                'decided_by',
                'approved_membership',
                'pending_identity_key',
            ])
            transaction.on_commit(
                lambda app_id=app.id: async_task(
                    'client_profile.tasks.email_membership_application_approved',
                    app_id,
                )
            )
    except DjangoValidationError as exc:
        raise ApplicationRefused(getattr(exc, 'message_dict', {'detail': exc.messages}), 400)

    return {
        'status': 'approved',
        'membership_id': membership.id,
        'employment_engagement_public_id': employment_engagement_public_id,
        'payroll_enabled': bool(app.pharmacy.use_chemisttasker_payroll),
    }


def reject_application(visible_app, *, decided_by):
    """Reject a pending application and e-mail the applicant after commit."""
    if not user_can_decide_applications(decided_by, visible_app.pharmacy):
        raise ApplicationRefused({'detail': 'Not allowed to reject for this pharmacy.'}, 403)

    with transaction.atomic():
        app = MembershipApplication.objects.select_for_update().get(pk=visible_app.pk)
        if app.status != 'PENDING':
            raise ApplicationRefused({'detail': f'Already {app.status.lower()}.'}, 400)
        app.status = 'REJECTED'
        app.decided_at = timezone.now()
        app.decided_by = decided_by
        app.pending_identity_key = None
        app.save(update_fields=['status', 'decided_at', 'decided_by', 'pending_identity_key'])
        transaction.on_commit(
            lambda app_id=app.id: async_task(
                'client_profile.tasks.email_membership_application_rejected',
                app_id,
            )
        )
    return {'status': 'rejected'}
