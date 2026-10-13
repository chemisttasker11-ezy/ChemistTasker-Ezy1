"""A manager looking at the workers of a shift: revealing a candidate's profile (audited), opening an assigned
worker's profile (audited) and the member status list of a member-visibility shift.

Refusals raise `ShiftActionRefused`, whose response body and status are those the views used to build by hand.
"""
from onboarding.services.skill_identity import normalize_skills
from onboarding.services.work_profile import current_worker_profile
from onboarding.qualifications import has_verified_dispensing_qualification
from onboarding.verification.policy import VERIFIED, verification_summary
from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework import status

from core.task_queue import async_task
from memberships.models import Membership
from onboarding.models import OtherStaffOnboarding, PharmacistOnboarding
from organizations.models import Chain
from shifts.access import ShiftActionRefused, _get_request_ip
from shifts.emails import build_offer_shift_details, build_shift_email_context
from shifts.escalation import PUBLIC_LEVEL
from shifts.models import (
    ShiftCounterOffer,
    ShiftInterest,
    ShiftOffer,
    ShiftProfileAccessAudit,
    ShiftRejection,
    ShiftSlot,
    ShiftSlotAssignment,
)
from shifts.notifications import notify_shift_users
from shifts.serializers import ShiftCounterOfferSerializer, ShiftSlotSerializer
from users.serializers import UserProfileSerializer


def _log_shift_profile_access(*, request, shift, candidate, action, slot=None):
    ShiftProfileAccessAudit.objects.create(
        shift=shift,
        slot=slot,
        target_user=candidate,
        actor=request.user if getattr(request.user, "is_authenticated", False) else None,
        action=action,
        request_ip=_get_request_ip(request),
        user_agent=(request.META.get("HTTP_USER_AGENT", "") or "")[:1000],
    )


def _candidate_interest(*, shift, candidate, slot_id):
    # Handle single user shifts
    if shift.single_user_only:
        # For single user shifts, try slot-specific first (recurring slots share one user), then fallback to slot=None
        if slot_id is not None:
            interest = ShiftInterest.objects.filter(
                shift=shift, slot_id=slot_id, user=candidate
            ).first()
            if not interest:
                interest = ShiftInterest.objects.filter(
                    shift=shift, slot__isnull=True, user=candidate
                ).first()
        else:
            interest = ShiftInterest.objects.filter(
                shift=shift, slot__isnull=True, user=candidate
            ).first()

        if not interest:
            raise ShiftActionRefused('No ShiftInterest matches the given query.', status.HTTP_404_NOT_FOUND)
        return interest

    # Existing multi-slot logic
    if slot_id is not None:
        try:
            return ShiftInterest.objects.get(
                shift=shift, slot_id=slot_id, user=candidate
            )
        except ShiftInterest.DoesNotExist:
            return get_object_or_404(
                ShiftInterest, shift=shift, slot__isnull=True, user=candidate
            )
    return get_object_or_404(
        ShiftInterest, shift=shift, slot__isnull=True, user=candidate
    )


def reveal_candidate(*, request, shift, candidate, slot_id, slot):
    """Reveal an interested candidate to the shift's managers: count it against the reveal quota, audit the access
    and tell the candidate the first time. Returns the candidate's profile as the endpoint renders it."""
    interest = _candidate_interest(shift=shift, candidate=candidate, slot_id=slot_id)

    already_revealed_user = shift.revealed_users.filter(pk=candidate.pk).exists()
    already_revealed_interest = bool(interest.revealed)

    if (shift.reveal_quota is not None
        and shift.reveal_count >= shift.reveal_quota
        and not already_revealed_user):
        raise ShiftActionRefused('Reveal quota exceeded.', status.HTTP_403_FORBIDDEN)

    if not already_revealed_user:
        shift.revealed_users.add(candidate)
        shift.reveal_count += 1
        shift.save()

    if not already_revealed_interest:
        interest.revealed = True
        interest.save()

    _log_shift_profile_access(
        request=request,
        shift=shift,
        candidate=candidate,
        action=ShiftProfileAccessAudit.Action.REVEAL_PROFILE,
        slot=slot,
    )

    # Notify only the first time this interest/profile is revealed.
    if not already_revealed_interest:
        ctx = build_shift_email_context(shift, user=candidate, role=candidate.role.lower())
        reveal_details = build_offer_shift_details(shift, interest)
        notify_shift_users(
            [candidate],
            shift=shift,
            title=f"Profile revealed: {shift.pharmacy.name}",
            body=f"Your profile was shared with {shift.pharmacy.name} for an upcoming shift. {reveal_details['shift_summary']}",
            kind="shift_profile_revealed",
            payload={
                "slot_id": slot_id,
                **reveal_details,
            },
        )

        if candidate.email:
            async_task(
                'users.tasks.send_async_email',
                subject=f"Your profile was revealed for a shift at {shift.pharmacy.name}",
                recipient_list=[candidate.email],
                template_name="emails/shift_reveal.html",
                context=ctx,
                text_template="emails/shift_reveal.txt",
                suppress_auto_notification=True,
            )

    return revealed_profile(candidate, build_absolute_uri=request.build_absolute_uri)


def work_profile(candidate, *, build_absolute_uri):
    """What a manager sees of a candidate's work profile: photo, bio, skills (catalogue codes), role, experience,
    location and verification. Never contact details or the CV; those are only for booked workers."""
    profile = current_worker_profile(candidate)
    po = profile if str(getattr(candidate, 'role', '')).upper() == 'PHARMACIST' else None
    os = profile if str(getattr(candidate, 'role', '')).upper() == 'OTHER_STAFF' else None
    if not profile:
        return {'profile_photo': None, 'short_bio': None, 'skills': [], 'role_label': None, 'verified': False}
    summary = verification_summary(profile)
    data = {
        'profile_photo': build_absolute_uri(profile.profile_photo.url) if profile.profile_photo else None,
        'short_bio': profile.short_bio,
        'skill_role': 'PHARMACIST' if po else str(os.role_type or 'UNKNOWN').upper(),
        # Canonical registry IDs the candidate's current role may claim (same rule as the Talent board).
        'skills': normalize_skills(list(profile.skills or []), allowed_role='PHARMACIST' if po else str(os.role_type or 'UNKNOWN').upper(), matchable_only=True),
        # verified_skills stays for app builds released before the badge summary.
        'verified_skills': [code for code, state in summary['skill_evidence'].items() if state == VERIFIED],
        'verification': summary,
        'suburb': profile.suburb or None,
        'state': profile.state or None,
        'open_to_travel': bool(profile.open_to_travel),
        'travel_states': list(profile.travel_states or []),
        'coverage_radius_km': profile.coverage_radius_km,
        'verified': bool(profile.verified),
        'gov_id_verified': bool(profile.gov_id_verified),
        'abn_verified': bool(profile.abn_verified),
    }
    if po:
        first = po.ahpra_first_registration_date
        data.update({
            'role_label': 'Pharmacist',
            'classification': None,
            'ahpra_verified': bool(po.ahpra_verified),
            'registered_since': first.isoformat() if first else None,
            'years_experience': None,
            'rate_preference': po.rate_preference or None,
        })
    else:
        classification = (os.get_classification_level_display() if os.classification_level
                          else os.get_student_year_display() if os.student_year
                          else os.get_intern_half_display() if os.intern_half else None)
        data.update({
            'role_label': os.get_role_type_display() if os.role_type else None,
            'dispensary_qualification': os.dispensary_qualification or None,
            'dispensary_qualification_verified': has_verified_dispensing_qualification(os),
            'classification': classification,
            'ahpra_verified': bool(os.ahpra_proof_verified),
            'registered_since': None,
            'years_experience': os.years_experience or None,
            'rate_preference': None,
        })
    return data


def revealed_profile(candidate, *, build_absolute_uri):
    """A revealed (not yet booked) candidate: name and work profile, no contact details or CV (owner decision)."""
    return {
        'id': candidate.id,
        'first_name': candidate.first_name,
        'last_name': candidate.last_name,
        **work_profile(candidate, build_absolute_uri=build_absolute_uri),
    }


def member_status(*, shift, requested_visibility, slot_id, slot_date, request):
    """The members a member-visibility shift was offered to and how each responded (interested, rejected,
    accepted, pending confirmation, awaiting payment). `request` is the serializer context of the nested rows."""
    if not requested_visibility:
        requested_visibility = shift.visibility

    # Public/Chemisttasker is handled by shift interests. Historical member tiers
    # must remain viewable after a shift is escalated to public.
    if requested_visibility == PUBLIC_LEVEL:
        raise ShiftActionRefused(
            'Member status is not applicable for Public shifts via this endpoint. '
            'Please query /shift-interests directly for public interests.'
        )

    slot_obj = None
    if slot_id:
        slot_obj = get_object_or_404(ShiftSlot, pk=slot_id, shift=shift)
    elif not shift.single_user_only:
        # For multi-slot shifts that are not single-user-only, a slot_id is required for specific status.
        raise ShiftActionRefused('slot_id is required for multi-slot shifts via this endpoint.')

    interests_query = ShiftInterest.objects.filter(shift=shift)
    rejections_query = ShiftRejection.objects.filter(shift=shift)

    if shift.single_user_only:
        interests_query = interests_query.filter(slot__isnull=True)
        rejections_query = rejections_query.filter(slot__isnull=True)
    else:  # Multi-slot (non-single_user_only)
        interests_query = interests_query.filter(slot=slot_obj)
        rejections_query = rejections_query.filter(slot=slot_obj)
        if slot_obj and slot_obj.is_recurring and slot_date:
            rejections_query = rejections_query.filter(slot_date=slot_date)

    interested_user_ids = {i.user_id for i in interests_query}
    rejected_user_ids = {r.user_id for r in rejections_query}

    memberships_qs = Membership.objects.filter(
        is_active=True,
        role=shift.role_needed
    ).select_related('user', 'pharmacy', 'pharmacy__organization')

    # Apply filtering based on the requested_visibility from the query parameter
    if requested_visibility == 'FULL_PART_TIME':
        memberships_qs = memberships_qs.filter(
            pharmacy=shift.pharmacy,
            employment_type__in=['FULL_TIME', 'PART_TIME', 'CASUAL'],
        )
    elif requested_visibility == 'LOCUM_CASUAL':
        memberships_qs = memberships_qs.filter(
            pharmacy=shift.pharmacy,
            employment_type__in=['LOCUM', 'SHIFT_HERO'],
        )
    elif requested_visibility == 'OWNER_CHAIN':
        owner = getattr(shift.pharmacy, 'owner', None)
        chain_ids = Chain.objects.filter(
            owner=owner,
            pharmacies=shift.pharmacy,
        ).values_list('id', flat=True) if owner else []
        if chain_ids:
            memberships_qs = memberships_qs.filter(
                pharmacy__chains__id__in=chain_ids
            )
        else:
            memberships_qs = Membership.objects.none()
    elif requested_visibility == 'ORG_CHAIN':
        if shift.pharmacy.organization_id:
            memberships_qs = memberships_qs.filter(
                pharmacy__organization_id=shift.pharmacy.organization_id
            )
        else:
            memberships_qs = Membership.objects.none()
    else:
        memberships_qs = Membership.objects.none()

    data = []
    for membership in memberships_qs.distinct():
        user = membership.user
        member_interaction_status = 'no_response'

        display_name = membership.invited_name if membership.invited_name else user.get_full_name()

        is_assigned = False
        if shift.single_user_only:
            is_assigned = ShiftSlotAssignment.objects.filter(
                user=user,
                shift=shift
            ).exists()
        else:
            is_assigned = ShiftSlotAssignment.objects.filter(
                user=user,
                slot=slot_obj,
                **({'slot_date': slot_date} if slot_obj and slot_obj.is_recurring and slot_date else {})
            ).exists()

        pending_offer_qs = ShiftOffer.objects.filter(
            shift=shift,
            user=user,
            status=ShiftOffer.Status.PENDING,
        )
        if shift.single_user_only:
            pending_offer_qs = pending_offer_qs.filter(slot__isnull=True)
        else:
            pending_offer_qs = pending_offer_qs.filter(slot=slot_obj)
            if slot_obj and slot_obj.is_recurring and slot_date:
                pending_offer_qs = pending_offer_qs.filter(
                    Q(offered_slot_date=slot_date) | Q(offered_slot_date__isnull=True)
                )
        pending_offer = pending_offer_qs.order_by('-created_at').first()
        pending_confirmation = pending_offer is not None
        pending_confirmation_counter_offer_data = None
        if pending_offer and pending_offer.counter_offer_id:
            pending_confirmation_counter_offer_data = ShiftCounterOfferSerializer(
                pending_offer.counter_offer,
                context={
                    'request': request,
                    'shift': shift,
                    'include_user_detail': True,
                },
            ).data
        if pending_offer and pending_confirmation_counter_offer_data is None:
            accepted_counter_offer_qs = ShiftCounterOffer.objects.filter(
                shift=shift,
                user=user,
                status=ShiftCounterOffer.Status.ACCEPTED,
                slots__isnull=False,
            )
            if not shift.single_user_only and slot_obj:
                accepted_counter_offer_qs = accepted_counter_offer_qs.filter(slots__slot=slot_obj)
                if slot_obj.is_recurring and slot_date:
                    accepted_counter_offer_qs = accepted_counter_offer_qs.filter(
                        Q(slots__slot_date=slot_date) | Q(slots__slot_date__isnull=True)
                    )
            accepted_counter_offer = accepted_counter_offer_qs.order_by('-updated_at').first()
            if accepted_counter_offer:
                pending_confirmation_counter_offer_data = ShiftCounterOfferSerializer(
                    accepted_counter_offer,
                    context={
                        'request': request,
                        'shift': shift,
                        'include_user_detail': True,
                    },
                ).data
        if pending_offer and pending_confirmation_counter_offer_data is None:
            pending_confirmation_counter_offer_data = {
                'id': None,
                'shift': shift.id,
                'user': user.id,
                'user_detail': UserProfileSerializer(user, context={'request': request}).data,
                'travel_origin': None,
                'request_travel': False,
                'status': 'ACCEPTED',
                'slots': [{
                    'id': None,
                    'slot_id': pending_offer.slot_id,
                    'slot_date': pending_offer.offered_slot_date,
                    'slot': ShiftSlotSerializer(pending_offer.slot, context={'request': request}).data if pending_offer.slot_id else None,
                    'proposed_start_time': pending_offer.offered_start_time,
                    'proposed_end_time': pending_offer.offered_end_time,
                    'proposed_rate': pending_offer.offered_rate,
                }],
                'created_at': pending_offer.created_at,
                'updated_at': pending_offer.updated_at,
            }

        active_counter_offer_qs = ShiftCounterOffer.objects.filter(
            shift=shift,
            user=user,
            status=ShiftCounterOffer.Status.PENDING,
            slots__isnull=False,
        )
        if not shift.single_user_only and slot_obj:
            active_counter_offer_qs = active_counter_offer_qs.filter(slots__slot=slot_obj)
            if slot_obj.is_recurring and slot_date:
                active_counter_offer_qs = active_counter_offer_qs.filter(
                    Q(slots__slot_date=slot_date) | Q(slots__slot_date__isnull=True)
                )
        active_counter_offer_exists = active_counter_offer_qs.exists()

        awaiting_payment_qs = ShiftOffer.objects.filter(
            shift=shift,
            user=user,
            status=ShiftOffer.Status.ACCEPTED_AWAITING_PAYMENT,
        )
        if shift.single_user_only:
            awaiting_payment_qs = awaiting_payment_qs.filter(slot__isnull=True)
        else:
            awaiting_payment_qs = awaiting_payment_qs.filter(slot=slot_obj)
            if slot_obj and slot_obj.is_recurring and slot_date:
                awaiting_payment_qs = awaiting_payment_qs.filter(
                    Q(offered_slot_date=slot_date) | Q(offered_slot_date__isnull=True)
                )
        awaiting_payment_offer = awaiting_payment_qs.order_by('-updated_at').first()
        awaiting_payment = awaiting_payment_offer is not None
        awaiting_payment_counter_offer_data = None
        if awaiting_payment_offer and awaiting_payment_offer.counter_offer_id:
            awaiting_payment_counter_offer_data = ShiftCounterOfferSerializer(
                awaiting_payment_offer.counter_offer,
                context={
                    'request': request,
                    'shift': shift,
                    'include_user_detail': True,
                },
            ).data
        if awaiting_payment_offer and awaiting_payment_counter_offer_data is None:
            awaiting_payment_counter_offer_data = {
                'id': None,
                'shift': shift.id,
                'user': user.id,
                'user_detail': UserProfileSerializer(user, context={'request': request}).data,
                'travel_origin': None,
                'request_travel': False,
                'status': 'ACCEPTED',
                'slots': [{
                    'id': None,
                    'slot_id': awaiting_payment_offer.slot_id,
                    'slot_date': awaiting_payment_offer.offered_slot_date,
                    'slot': ShiftSlotSerializer(awaiting_payment_offer.slot, context={'request': request}).data if awaiting_payment_offer.slot_id else None,
                    'proposed_start_time': awaiting_payment_offer.offered_start_time,
                    'proposed_end_time': awaiting_payment_offer.offered_end_time,
                    'proposed_rate': awaiting_payment_offer.offered_rate,
                }],
                'created_at': awaiting_payment_offer.created_at,
                'updated_at': awaiting_payment_offer.updated_at,
            }
        if active_counter_offer_exists:
            pending_confirmation = False
            pending_offer = None
            pending_confirmation_counter_offer_data = None
            awaiting_payment = False
            awaiting_payment_offer = None
            awaiting_payment_counter_offer_data = None

        if is_assigned:
            member_interaction_status = 'accepted'
        elif user.id in interested_user_ids:
            member_interaction_status = 'interested'
        elif user.id in rejected_user_ids:
            member_interaction_status = 'rejected'

        data.append({
            'user_id': user.id,
            'name': display_name,
            'employment_type': membership.employment_type,
            'role': membership.role,
            'status': member_interaction_status,
            'is_member': True,
            'membership_id': membership.id,
            'pharmacy_id': membership.pharmacy_id,
            'pharmacy_name': membership.pharmacy.name if membership.pharmacy else None,
            'organization_id': membership.pharmacy.organization_id if membership.pharmacy else None,
            'organization_name': (
                membership.pharmacy.organization.name
                if membership.pharmacy and membership.pharmacy.organization
                else None
            ),
            'visibility_level': requested_visibility,
            'pending_confirmation': pending_confirmation,
            'pending_offer_id': pending_offer.id if pending_offer else None,
            'pending_confirmation_counter_offer': pending_confirmation_counter_offer_data,
            'awaiting_payment': awaiting_payment,
            'awaiting_payment_offer_id': awaiting_payment_offer.id if awaiting_payment_offer else None,
            'awaiting_payment_counter_offer': awaiting_payment_counter_offer_data,
            # Pharmacy members and favourites already work with the pharmacy: show their work profile (skills,
            # software, role, experience) in the review without a reveal.
            'user_detail': revealed_profile(user, build_absolute_uri=request.build_absolute_uri if request else (lambda url: url)),
        })

    return data


def assigned_profile(*, request, shift, candidate, slot_id, slot):
    """A manager opening the profile of a worker assigned to the shift (or to the given slot). Audited; unlike a
    reveal it uses no quota and sends no e-mail. Returns the profile as the endpoint renders it."""
    # Verify the user is actually assigned to this shift/slot
    if shift.single_user_only:
        if not ShiftSlotAssignment.objects.filter(shift=shift, user=candidate).exists():
            raise ShiftActionRefused('User is not assigned to this shift.', status.HTTP_404_NOT_FOUND)
    else:
        if slot_id is None:
            # If slot_id is not provided for a multi-slot shift, check if assigned to any slot of this shift
            if not ShiftSlotAssignment.objects.filter(shift=shift, user=candidate).exists():
                raise ShiftActionRefused('User is not assigned to any slot in this shift.', status.HTTP_404_NOT_FOUND)
        else:
            if not ShiftSlotAssignment.objects.filter(shift=shift, slot_id=slot_id, user=candidate).exists():
                raise ShiftActionRefused('User is not assigned to this specific slot.', status.HTTP_404_NOT_FOUND)

    _log_shift_profile_access(
        request=request,
        shift=shift,
        candidate=candidate,
        action=ShiftProfileAccessAudit.Action.VIEW_ASSIGNED_PROFILE,
        slot=slot,
    )

    # Contact access is unchanged; bio/CV must come from the current worker role,
    # just like the public work-profile projection. Historical rows remain stored.
    profile = current_worker_profile(candidate)
    resume = getattr(profile, 'resume', None)
    profile_data = {
        'phone_number': candidate.mobile_number if profile else None,
        'short_bio': getattr(profile, 'short_bio', None),
        'resume': request.build_absolute_uri(resume.url) if resume else None,
    }
    if profile is None or hasattr(profile, 'rate_preference'):
        profile_data['rate_preference'] = getattr(profile, 'rate_preference', None) or None

    return {
        'id': candidate.id,
        'first_name': candidate.first_name,
        'last_name': candidate.last_name,
        **work_profile(candidate, build_absolute_uri=request.build_absolute_uri),
        # Booked workers: contact details and CV as before.
        'email': candidate.email,
        **profile_data
    }
