"""Moved verbatim from client_profile/views.py (Stage 2 domain split). Behaviour is unchanged; client_profile/views.py re-exports these names."""
from rest_framework import permissions, status, viewsets
from client_profile.models import (
    Shift,
    ShiftInterest,
    ShiftOffer,
    ShiftRejection,
    ShiftSaved,
    ShiftSlotAssignment,
)
from rest_framework.response import Response
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework.decorators import action
from django.shortcuts import get_object_or_404
from django.db.models import Avg
from django.utils import timezone
from client_profile.domains.shifts.pricing import expand_shift_slots
from client_profile.utils import (
    active_shift_url_for_user,
    build_offer_shift_details,
    build_roster_email_link,
    build_shift_email_context,
    finalize_shift_offer,
    send_shift_payment_finalized_notifications,
    user_work_role_label,
    worker_offer_url,
)
from client_profile.domains.shifts.notifications import notify_shift_users
from core.task_queue import async_task
from client_profile.domains.common.access import Http400
from django.db import transaction
from decimal import Decimal
from client_profile.domains.shifts.base import BaseShiftViewSet, SHIFT_OFFER_BUZZ_COOLDOWN
from client_profile.domains.shifts.serializers import (
    ShiftInterestSerializer,
    ShiftOfferSerializer,
    ShiftRejectionSerializer,
    ShiftSavedSerializer,
)


class ShiftInterestViewSet(viewsets.ModelViewSet):
    """
    Only return interests for the given `?shift=` (and optional `?slot=`),
    so that each shift’s page only shows its own interests.
    """
    serializer_class = ShiftInterestSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        qs = ShiftInterest.objects.select_related('shift', 'slot', 'user').annotate(
            average_rating=Avg('user__ratings_received_as_worker__stars')
        )

        shift_id = self.request.query_params.get('shift')
        if shift_id is not None:
            shift = get_object_or_404(Shift, pk=shift_id)
            if BaseShiftViewSet._user_can_manage_pharmacy(self.request.user, shift.pharmacy):
                qs = qs.filter(shift_id=shift_id)
            else:
                qs = qs.filter(shift_id=shift_id, user=self.request.user)
        else:
            qs = qs.filter(user=self.request.user)

        slot_param = self.request.query_params.get('slot')
        if slot_param == 'null':
            qs = qs.filter(slot__isnull=True)
        elif slot_param is not None:
            try:
                slot_id_int = int(slot_param)
                qs = qs.filter(slot_id=slot_id_int)
            except ValueError:
                raise Http400('Invalid slot ID provided. Must be an integer or "null".')

        user_id = self.request.query_params.get('user')
        if user_id is not None:
            if str(user_id) == str(self.request.user.id):
                qs = qs.filter(user_id=user_id)
            else:
                qs = qs.filter(user=self.request.user)

        return qs

    # Add a custom list method to ensure a 200 OK with content
    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())

        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK) # Ensure 200 OK


class ShiftRejectionViewSet(viewsets.ModelViewSet):
    queryset = ShiftRejection.objects.all()
    serializer_class = ShiftRejectionSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        qs = ShiftRejection.objects.select_related('shift', 'slot', 'user')

        shift_id = self.request.query_params.get('shift')
        if shift_id is not None:
            shift = get_object_or_404(Shift, pk=shift_id)
            if BaseShiftViewSet._user_can_manage_pharmacy(self.request.user, shift.pharmacy):
                qs = qs.filter(shift_id=shift_id)
            else:
                qs = qs.filter(shift_id=shift_id, user=self.request.user)
        else:
            qs = qs.filter(user=self.request.user)

        slot_param = self.request.query_params.get('slot')
        if slot_param == 'null':
            qs = qs.filter(slot__isnull=True)
        elif slot_param is not None:
            try:
                slot_id_int = int(slot_param)
                qs = qs.filter(slot_id=slot_id_int)
            except ValueError:
                raise Http400('Invalid slot ID provided. Must be an integer or "null".')

        user_id = self.request.query_params.get('user')
        if user_id is not None:
            if str(user_id) == str(self.request.user.id):
                qs = qs.filter(user_id=user_id)
            else:
                qs = qs.filter(user=self.request.user)

        return qs


class ShiftSavedViewSet(viewsets.ModelViewSet):
    serializer_class = ShiftSavedSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        qs = ShiftSaved.objects.filter(user=self.request.user).select_related('shift')
        shift_id = self.request.query_params.get('shift')
        if shift_id is not None:
            qs = qs.filter(shift_id=shift_id)
        return qs

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        self.perform_destroy(instance)
        return Response(status=status.HTTP_204_NO_CONTENT)


class ShiftOfferViewSet(viewsets.ModelViewSet):
    serializer_class = ShiftOfferSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        qs = ShiftOffer.objects.select_related('shift', 'slot', 'user', 'shift__pharmacy')
        user = self.request.user
        status_param = self.request.query_params.get('status')
        if status_param:
            qs = qs.filter(status=status_param)

        if getattr(user, "role", None) in ["PHARMACIST", "OTHER_STAFF", "EXPLORER"]:
            return qs.filter(user=user)

        managed = BaseShiftViewSet._managed_pharmacies(user)
        return qs.filter(shift__pharmacy__in=managed)

    def list(self, request, *args, **kwargs):
        now = timezone.now()
        ShiftOffer.objects.filter(status=ShiftOffer.Status.PENDING, expires_at__lt=now).update(
            status=ShiftOffer.Status.EXPIRED,
            updated_at=now,
        )
        return super().list(request, *args, **kwargs)

    def _resolve_owner_recipient(self, shift):
        pharmacy_owner = getattr(getattr(shift, "pharmacy", None), "owner", None)
        owner_user = getattr(pharmacy_owner, "user", None) if pharmacy_owner else None
        if owner_user and getattr(owner_user, "email", None):
            return owner_user
        creator = getattr(shift, "created_by", None)
        if creator and getattr(creator, "email", None):
            return creator
        return None

    def _first_offer_date(self, shift, offer):
        offered_date = getattr(offer, "offered_slot_date", None)
        if offered_date:
            return offered_date
        try:
            entries = expand_shift_slots(shift)
        except Exception:
            entries = []
        if getattr(offer, "slot_id", None):
            entries = [e for e in entries if e.get("slot") and e["slot"].id == offer.slot_id]
        if entries:
            return entries[0].get("date")
        if offer.slot and getattr(offer.slot, "date", None):
            return offer.slot.date
        return None

    def _format_rate_label(self, shift, *, assignment_rates=None, offer=None):
        assignment_rates = [Decimal(str(r)) for r in (assignment_rates or []) if r is not None]
        if assignment_rates:
            minimum = min(assignment_rates)
            maximum = max(assignment_rates)
            if minimum == maximum:
                return f"${minimum:.2f}/hr"
            return f"${minimum:.2f}–${maximum:.2f}/hr"

        if offer and getattr(offer, "offered_rate", None) is not None:
            return f"${Decimal(str(offer.offered_rate)):.2f}/hr"

        if offer and getattr(offer, "slot", None) and getattr(offer.slot, "rate", None) is not None:
            return f"${Decimal(str(offer.slot.rate)):.2f}/hr"

        fixed_rate = getattr(shift, "fixed_rate", None)
        if fixed_rate is not None:
            return f"${Decimal(str(fixed_rate)):.2f}/hr"

        min_hourly = getattr(shift, "min_hourly_rate", None)
        max_hourly = getattr(shift, "max_hourly_rate", None)
        if min_hourly is not None or max_hourly is not None:
            if min_hourly is not None and max_hourly is not None:
                return f"${Decimal(str(min_hourly)):.2f}–${Decimal(str(max_hourly)):.2f}/hr"
            only = min_hourly if min_hourly is not None else max_hourly
            return f"${Decimal(str(only)):.2f}/hr"

        min_annual = getattr(shift, "min_annual_salary", None)
        max_annual = getattr(shift, "max_annual_salary", None)
        if min_annual is not None or max_annual is not None:
            if min_annual is not None and max_annual is not None:
                return f"${Decimal(str(min_annual)):.0f}–${Decimal(str(max_annual)):.0f} package"
            only = min_annual if min_annual is not None else max_annual
            return f"${Decimal(str(only)):.0f} package"

        return "N/A"

    @action(detail=True, methods=['post'])
    def buzz(self, request, pk=None):
        with transaction.atomic():
            offer = (
                ShiftOffer.objects
                .select_for_update(of=("self",))
                .select_related("shift__pharmacy", "user")
                .get(pk=pk)
            )
            shift = offer.shift
            if not BaseShiftViewSet._user_can_manage_pharmacy(request.user, shift.pharmacy):
                return Response({'detail': 'Permission denied.'}, status=status.HTTP_403_FORBIDDEN)
            if offer.status != ShiftOffer.Status.PENDING:
                return Response({
                    'detail': 'This offer no longer needs a reminder.',
                    'offer_id': offer.id,
                    'status': offer.status,
                }, status=status.HTTP_400_BAD_REQUEST)

            now = timezone.now()
            if offer.last_buzzed_at:
                next_buzz_at = offer.last_buzzed_at + SHIFT_OFFER_BUZZ_COOLDOWN
                if next_buzz_at > now:
                    seconds_remaining = int((next_buzz_at - now).total_seconds())
                    minutes_remaining = max(1, (seconds_remaining + 59) // 60)
                    wait_label = (
                        "about 1 hour"
                        if minutes_remaining >= 60
                        else f"about {minutes_remaining} minute{'s' if minutes_remaining != 1 else ''}"
                    )
                    return Response({
                        'detail': f'A reminder was already sent recently. You can send another confirmation reminder in {wait_label}.',
                        'offer_id': offer.id,
                        'next_buzz_at': next_buzz_at.isoformat(),
                        'seconds_remaining': seconds_remaining,
                    }, status=status.HTTP_429_TOO_MANY_REQUESTS)

            offer.last_buzzed_at = now
            offer.save(update_fields=['last_buzzed_at', 'updated_at'])

        pharmacy_display = shift.pharmacy.name
        if getattr(shift, "post_anonymously", False):
            suburb = getattr(shift.pharmacy, "suburb", None)
            pharmacy_display = f"Shift in {suburb}" if suburb else "Anonymous Pharmacy"

        worker_name = offer.user.get_full_name() or offer.user.email
        ctx = build_shift_email_context(shift, user=offer.user, role=offer.user.role.lower())
        ctx["pharmacy_name"] = pharmacy_display
        ctx["offered_rate"] = offer.offered_rate
        ctx["expires_at"] = offer.expires_at
        offer_details = build_offer_shift_details(shift, offer)
        ctx.update(offer_details)
        ctx["shift_link"] = worker_offer_url(offer.user, shift, offer)

        notify_shift_users(
            [offer.user],
            shift=shift,
            title="Reminder: confirm your shift offer",
            body=f"{pharmacy_display} is waiting for you to confirm this shift offer. {offer_details['shift_summary']}",
            kind="shift_offer_buzz",
            payload={
                "offer_id": offer.id,
                "status": offer.status,
                "worker_confirmation_required": True,
                **offer_details,
            },
        )
        if offer.user and offer.user.email:
            async_task(
                'users.tasks.send_async_email',
                subject=f"Reminder: confirm your shift offer at {pharmacy_display}",
                recipient_list=[offer.user.email],
                template_name="emails/shift_offer_buzz.html",
                context=ctx,
                text_template="emails/shift_offer_buzz.txt",
                suppress_auto_notification=True,
            )

        return Response({
            'detail': f'Reminder sent to {worker_name}.',
            'offer_id': offer.id,
        }, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'])
    def accept(self, request, pk=None):
        from billing.utils import (
            BILLING_STATE_PAYMENT_REQUIRED,
            get_billing_state_for_pharmacy,
        )

        offer = self.get_object()
        if offer.user_id != request.user.id:
            return Response({'detail': 'Permission denied.'}, status=status.HTTP_403_FORBIDDEN)
        if offer.status != ShiftOffer.Status.PENDING:
            return Response({'detail': 'Offer is not pending.'}, status=status.HTTP_400_BAD_REQUEST)
        now = timezone.now()
        if offer.expires_at and offer.expires_at <= now:
            offer.status = ShiftOffer.Status.EXPIRED
            offer.save(update_fields=['status', 'updated_at'])
            return Response({'detail': 'Offer has expired.'}, status=status.HTTP_400_BAD_REQUEST)

        shift = offer.shift
        slot_obj = offer.slot
        if not shift.single_user_only and slot_obj is None:
            return Response({'detail': 'Offer is missing slot selection.'}, status=status.HTTP_400_BAD_REQUEST)

        from client_profile.domains.shifts.engagement import (
            build_shift_engagement_terms,
            freeze_accepted_terms,
            require_acceptance_payload,
        )
        try:
            engagement_terms = build_shift_engagement_terms(shift=shift, user=offer.user, offer=offer)
            require_acceptance_payload(terms=engagement_terms, data=request.data)
        except DjangoValidationError as exc:
            return Response(getattr(exc, 'message_dict', {'detail': exc.messages}), status=status.HTTP_400_BAD_REQUEST)

        if engagement_terms.get("acceptance_required"):
            accepted_terms, terms_accepted_at = freeze_accepted_terms(
                terms=engagement_terms,
                user=request.user,
            )
        else:
            accepted_terms, terms_accepted_at = engagement_terms, None

        assignment_ids = []
        assignment_rates = []
        billing_state = get_billing_state_for_pharmacy(shift.pharmacy, acting_user=request.user)
        requires_payment = billing_state == BILLING_STATE_PAYMENT_REQUIRED

        with transaction.atomic():
            offer.payment_preference_snapshot = accepted_terms.get("payment_preference", "")
            offer.settlement_channel = accepted_terms.get("settlement_channel", "")
            offer.engagement_kind = accepted_terms.get("engagement_kind", "")
            offer.engagement_terms_snapshot = accepted_terms
            offer.engagement_terms_accepted_at = terms_accepted_at
            offer.save(update_fields=[
                "payment_preference_snapshot",
                "settlement_channel",
                "engagement_kind",
                "engagement_terms_snapshot",
                "engagement_terms_accepted_at",
                "updated_at",
            ])

            if requires_payment:
                offer.status = ShiftOffer.Status.ACCEPTED_AWAITING_PAYMENT
                offer.save(update_fields=['status', 'updated_at'])
                if shift.payment_status != 'PENDING':
                    shift.payment_status = 'PENDING'
                    shift.save(update_fields=['payment_status'])
            else:
                if shift.payment_status != 'PAID':
                    shift.payment_status = 'PAID'
                    shift.save(update_fields=['payment_status'])
                assignment_ids, assignment_rates = finalize_shift_offer(offer)
                if slot_obj:
                    ShiftOffer.objects.filter(
                        shift=shift,
                        slot=slot_obj,
                        status__in=[ShiftOffer.Status.PENDING, ShiftOffer.Status.ACCEPTED_AWAITING_PAYMENT],
                    ).exclude(id=offer.id).update(status=ShiftOffer.Status.EXPIRED, updated_at=timezone.now())
                elif shift.single_user_only:
                    ShiftOffer.objects.filter(
                        shift=shift,
                        slot__isnull=True,
                        status__in=[ShiftOffer.Status.PENDING, ShiftOffer.Status.ACCEPTED_AWAITING_PAYMENT],
                    ).exclude(id=offer.id).update(status=ShiftOffer.Status.EXPIRED, updated_at=timezone.now())

        if not requires_payment:
            transaction.on_commit(lambda: send_shift_payment_finalized_notifications(
                shift=shift,
                offers=[offer],
                paid_by=self._resolve_owner_recipient(shift),
                payment_method="free",
            ))

        pharmacy_display = shift.pharmacy.name
        if getattr(shift, "post_anonymously", False):
            suburb = getattr(shift.pharmacy, "suburb", None)
            pharmacy_display = f"Shift in {suburb}" if suburb else "Anonymous Pharmacy"

        if offer.user and offer.user.email:
            ctx = build_shift_email_context(shift, user=offer.user, role=offer.user.role.lower())
            ctx["pharmacy_name"] = pharmacy_display
            offer_details = build_offer_shift_details(shift, offer)
            ctx.update(offer_details)
            ctx["shift_link"] = worker_offer_url(offer.user, shift, offer) if requires_payment else active_shift_url_for_user(offer.user, shift)
            ctx["payment_required"] = requires_payment
            ctx["rate"] = offer_details["slot_details"][0].get("rate") if offer_details["slot_details"] else ""
            worker_title = "Offer accepted - owner payment pending" if requires_payment else "Shift confirmed"
            worker_body = (
                f"Thanks for confirming. The owner must complete payment before you are locked in. {offer_details['shift_summary']}"
                if requires_payment
                else f"You are confirmed for a shift at {pharmacy_display}. {offer_details['shift_summary']}"
            )
            notify_shift_users(
                [offer.user],
                shift=shift,
                title=worker_title,
                body=worker_body,
                kind="shift_confirmed",
                payload={
                    "offer_id": offer.id,
                    "assignment_ids": assignment_ids,
                    "status": offer.status,
                    "payment_required": requires_payment,
                    **offer_details,
                },
            )
            async_task(
                'users.tasks.send_async_email',
                subject=(
                    f"Thanks for confirming your shift at {pharmacy_display} - owner payment pending"
                    if requires_payment
                    else f"You've been accepted for a shift at {pharmacy_display}"
                ),
                recipient_list=[offer.user.email],
                template_name="emails/shift_accept.html",
                context=ctx,
                text_template="emails/shift_accept.txt",
                suppress_auto_notification=True,
            )

        owner_user = self._resolve_owner_recipient(shift)
        if owner_user and owner_user.email:
            worker_name = offer.user.get_full_name() or offer.user.email
            worker_role_label = user_work_role_label(offer.user, "candidate")
            shift_date = self._first_offer_date(shift, offer)
            shift_link = active_shift_url_for_user(owner_user, shift)
            rate_label = self._format_rate_label(shift, assignment_rates=assignment_rates, offer=offer)
            offer_details = build_offer_shift_details(shift, offer)
            owner_ctx = {
                "owner_name": owner_user.get_full_name() or owner_user.email,
                "worker_name": worker_name,
                "worker_role_label": worker_role_label,
                "pharmacy_name": pharmacy_display,
                "role_needed": shift.role_needed,
                "shift_date": shift_date,
                "shift_link": shift_link,
                "rate": rate_label,
                "billing_state": billing_state,
                "payment_required": requires_payment,
                **offer_details,
            }
            notify_shift_users(
                [owner_user],
                shift=shift,
                title=f"{worker_role_label} confirmed: {pharmacy_display}",
                body=f"{worker_name} confirmed your shift offer." + (" Payment is required to finalize." if requires_payment else ""),
                kind="shift_worker_confirmed",
                payload={
                    "offer_id": offer.id,
                    "status": offer.status,
                    "payment_required": requires_payment,
                    "billing_state": billing_state,
                    **offer_details,
                },
            )
            async_task(
                'users.tasks.send_async_email',
                subject=f"{worker_role_label} confirmed shift offer at {pharmacy_display}" + (" - Action Required" if requires_payment else ""),
                recipient_list=[owner_user.email],
                template_name="emails/owner_worker_confirmed.html",
                context=owner_ctx,
                text_template="emails/owner_worker_confirmed.txt",
                suppress_auto_notification=True,
            )

        return Response({
            'detail': 'Offer accepted.',
            'assignment_ids': assignment_ids,
            'status': offer.status,
            'payment_status': shift.payment_status,
            'requires_payment': requires_payment,
            'billing_state': billing_state,
        }, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'], url_path='activate-payroll')
    def activate_payroll(self, request, pk=None):
        from client_profile.domains.shifts.engagement import (
            KIND_SHIFT_EMPLOYMENT,
            PAYMENT_TFN,
            SETTLEMENT_PAYROLL,
            validate_tfn_payroll_profile,
        )

        with transaction.atomic():
            offer = (
                ShiftOffer.objects
                .select_for_update()
                .select_related("shift__pharmacy", "user")
                .get(pk=pk)
            )
            shift = offer.shift
            if not BaseShiftViewSet._user_can_manage_pharmacy(request.user, shift.pharmacy):
                return Response({'detail': 'Permission denied.'}, status=status.HTTP_403_FORBIDDEN)
            if not getattr(shift.pharmacy, "use_chemisttasker_payroll", False):
                return Response(
                    {'detail': 'ChemistTasker Payroll is not enabled for this pharmacy.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if (
                offer.payment_preference_snapshot != PAYMENT_TFN
                or offer.engagement_kind != KIND_SHIFT_EMPLOYMENT
            ):
                return Response(
                    {'detail': 'Only accepted external TFN employee shifts can be activated for payroll.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if offer.status not in {
                ShiftOffer.Status.ACCEPTED,
                ShiftOffer.Status.ACCEPTED_AWAITING_PAYMENT,
            }:
                return Response(
                    {'detail': 'Accept the shift offer before activating payroll.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            snapshot = offer.engagement_terms_snapshot or {}
            if snapshot.get("award_payroll_review_required"):
                return Response(
                    {
                        'detail': 'This shift needs Award/overtime review before ChemistTasker Payroll can process it.',
                        'reasons': snapshot.get("award_payroll_review_reasons") or [],
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            try:
                validate_tfn_payroll_profile(offer.user)
            except DjangoValidationError as exc:
                return Response(
                    getattr(exc, 'message_dict', {'detail': exc.messages}),
                    status=status.HTTP_400_BAD_REQUEST,
                )

            activated_at = timezone.now()
            offer.settlement_channel = SETTLEMENT_PAYROLL
            offer.payroll_activated_at = activated_at
            offer.save(update_fields=[
                "settlement_channel",
                "payroll_activated_at",
                "updated_at",
            ])
            assignment_count = ShiftSlotAssignment.objects.filter(
                source_offer=offer,
                payment_preference_snapshot=PAYMENT_TFN,
                engagement_kind=KIND_SHIFT_EMPLOYMENT,
            ).update(
                settlement_channel=SETTLEMENT_PAYROLL,
                payroll_activated_at=activated_at,
            )

        return Response({
            'status': 'payroll_activated',
            'offer_id': offer.id,
            'assignment_count': assignment_count,
            'payroll_activated_at': activated_at.isoformat(),
        })

    @action(detail=True, methods=['post'])
    def decline(self, request, pk=None):
        offer = self.get_object()
        if offer.user_id != request.user.id:
            return Response({'detail': 'Permission denied.'}, status=status.HTTP_403_FORBIDDEN)
        if offer.status != ShiftOffer.Status.PENDING:
            return Response({'detail': 'Offer is not pending.'}, status=status.HTTP_400_BAD_REQUEST)
        offer.status = ShiftOffer.Status.DECLINED
        offer.save(update_fields=['status', 'updated_at'])

        shift = offer.shift
        pharmacy_display = shift.pharmacy.name
        if getattr(shift, "post_anonymously", False):
            suburb = getattr(shift.pharmacy, "suburb", None)
            pharmacy_display = f"Shift in {suburb}" if suburb else "Anonymous Pharmacy"

        owner_user = self._resolve_owner_recipient(shift)
        if owner_user and owner_user.email:
            worker_name = offer.user.get_full_name() or offer.user.email
            worker_role_label = user_work_role_label(offer.user, "candidate")
            shift_date = self._first_offer_date(shift, offer)
            shift_link = build_roster_email_link(owner_user, shift.pharmacy)
            rate_label = self._format_rate_label(shift, offer=offer)
            owner_ctx = {
                "owner_name": owner_user.get_full_name() or owner_user.email,
                "worker_name": worker_name,
                "worker_role_label": worker_role_label,
                "pharmacy_name": pharmacy_display,
                "role_needed": shift.role_needed,
                "shift_date": shift_date,
                "shift_link": shift_link,
                "rate": rate_label,
            }
            notify_shift_users(
                [owner_user],
                shift=shift,
                title=f"{worker_role_label} rejected: {pharmacy_display}",
                body=f"{worker_name} rejected your shift offer.",
                kind="shift_worker_rejected",
                payload={"offer_id": offer.id, "status": "DECLINED"},
            )
            async_task(
                'users.tasks.send_async_email',
                subject=f"{worker_role_label} rejected shift offer at {pharmacy_display}",
                recipient_list=[owner_user.email],
                template_name="emails/owner_worker_rejected.html",
                context=owner_ctx,
                text_template="emails/owner_worker_rejected.txt",
                suppress_auto_notification=True,
            )
        return Response({'detail': 'Offer declined.'}, status=status.HTTP_200_OK)
