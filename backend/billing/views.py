"""Billing HTTP adapters: authentication, parsing and account authority before owned workflows."""
from django.shortcuts import get_object_or_404
from django.views.decorators.csrf import csrf_exempt
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle

from . import shift_payments, subscription_operations, webhooks
from .checkout_context import _shift_checkout_return_urls, _shift_dashboard_context
from .checkout_urls import (
    extra_seat_return_urls as _extra_seat_return_urls,
    frontend_base_url as _frontend_base_url,
    mobile_bridge_url as _mobile_bridge_url,
    subscription_return_urls as _subscription_return_urls,
)
from .fulfillment import _finalize_pending_offers_for_shift, _normalize_offer_ids, _normalize_slot_ids
from .stripe_support import (
    BASE_SUB_PRICE,
    EXTRA_SEAT_PRICE,
    _build_extra_seat_metadata,
    _build_subscription_metadata,
    _get_subscription_from_customer,
    _get_subscription_from_metadata,
    _stripe_object_value,
    stripe,
)
from .subscriptions import (
    get_or_create_subscription_for_account as _get_or_create_subscription_for_account,
    get_subscription_for_account as _get_subscription_for_account,
    serialize_subscription as _serialize_subscription,
    subscription_lookup_from_account as _subscription_lookup_from_account,
)
from .utils import (
    get_billing_state_for_account,
    resolve_billing_account,
    user_can_manage_billing_for_pharmacy,
    user_can_pay_shift_charge_for_pharmacy,
)
from .webhooks import _process_stripe_event


def _current_account_for_user(user, pharmacy_id=None):
    pharmacy = None
    if pharmacy_id:
        from organizations.models import Pharmacy
        pharmacy = get_object_or_404(Pharmacy, pk=pharmacy_id)
        if not user_can_manage_billing_for_pharmacy(user, pharmacy):
            return None, None, Response({'error': 'Not authorized to manage billing for this pharmacy.'}, status=status.HTTP_403_FORBIDDEN)
        account = resolve_billing_account(pharmacy, acting_user=user)
        return account, pharmacy, None

    if hasattr(user, 'owneronboarding'):
        account = {
            'scope': 'owner',
            'organization': None,
            'owner_user': user,
            'billing_contact': user,
        }
        return account, pharmacy, None

    return None, None, Response(
        {'error': 'A pharmacy is required when managing billing on behalf of an organization or managed pharmacy.'},
        status=status.HTTP_400_BAD_REQUEST,
    )


@api_view(['POST'])
@permission_classes([IsAuthenticated])
@throttle_classes([ScopedRateThrottle])
def create_subscription_checkout(request):
    """
    Creates a Stripe Subscription directly (if Invoice) or a Checkout Session (if Card).
    Payload:
      - staff_count (int, default=5)
      - payment_method: 'card' | 'invoice'
    """
    user = request.user
    staff_count = 5
    payment_method_input = request.data.get('payment_method', 'card')
    pharmacy_id = request.data.get('pharmacy_id')
    platform = request.data.get('platform', 'web')

    account, pharmacy, error_response = _current_account_for_user(user, pharmacy_id=pharmacy_id)
    if error_response is not None:
        return error_response

    return subscription_operations.create_subscription_checkout(
        user=user,
        account=account,
        pharmacy=pharmacy,
        staff_count=staff_count,
        payment_method_input=payment_method_input,
        platform=platform,
    )


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def current_subscription(request):
    account, _pharmacy, error_response = _current_account_for_user(
        request.user,
        pharmacy_id=request.query_params.get('pharmacy_id'),
    )
    if error_response is not None:
        return error_response
    return subscription_operations.current_subscription(account=account)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def update_subscription_seats(request):
    try:
        desired_staff_count = int(request.data.get('staff_count', 5))
    except (TypeError, ValueError):
        return Response({'error': 'staff_count must be a valid integer.'}, status=400)
    if desired_staff_count < 5:
        return Response({'error': 'Base subscription includes five seats.'}, status=400)
    platform = request.data.get('platform', 'web')
    account, _pharmacy, error = _current_account_for_user(
        request.user, pharmacy_id=request.data.get('pharmacy_id'),
    )
    if error is not None:
        return error
    return subscription_operations.update_subscription_seats(
        user=request.user,
        account=account,
        desired_staff_count=desired_staff_count,
        platform=platform,
    )


@api_view(['POST'])
@permission_classes([IsAuthenticated])
@throttle_classes([ScopedRateThrottle])
def charge_shift_fulfillment(request, shift_id):
    """
    Called when a shift is FILLED (worker assigned and approves).
    Generates a checkout session for the fulfillment fee.
    """
    user = request.user
    from shifts.models import Shift

    shift = get_object_or_404(Shift, id=shift_id)

    # 0. Authorization check
    if not user_can_pay_shift_charge_for_pharmacy(user, shift.pharmacy):
        return Response({'error': 'Not authorized to pay charges for this shift.'}, status=status.HTTP_403_FORBIDDEN)

    account = resolve_billing_account(shift.pharmacy, acting_user=user)
    billing_state = get_billing_state_for_account(account)
    return shift_payments.charge_shift_fulfillment(
        user=user,
        shift=shift,
        shift_id=shift_id,
        account=account,
        billing_state=billing_state,
        data=request.data,
    )


@api_view(['POST'])
@permission_classes([IsAuthenticated])
@throttle_classes([ScopedRateThrottle])
def charge_penalty(request, shift_id):
    """
    Called when an owner cancels a filled shift.
    Penalty is dynamic based on hours until shift and worker's expected wage.
    Because the amount is dynamic, we use price_data.
    """
    user = request.user
    from shifts.models import Shift, ShiftSlotAssignment

    shift = get_object_or_404(Shift, id=shift_id)

    # 0. Authorization check
    if not user_can_pay_shift_charge_for_pharmacy(user, shift.pharmacy):
        return Response({'error': 'Not authorized to pay charges for this shift.'}, status=status.HTTP_403_FORBIDDEN)

    account = resolve_billing_account(shift.pharmacy, acting_user=user)
    sub = _get_subscription_for_account(account)
    return shift_payments.charge_penalty(
        user=user,
        shift=shift,
        shift_id=shift_id,
        account=account,
        sub=sub,
        data=request.data,
    )


@csrf_exempt
@api_view(['POST'])
@permission_classes([AllowAny])
def stripe_webhook(request):
    """Verify, deduplicate, and process one Stripe webhook delivery."""
    payload = request.body
    sig_header = request.META.get('HTTP_STRIPE_SIGNATURE')
    return webhooks.receive_stripe_webhook(payload, sig_header)
