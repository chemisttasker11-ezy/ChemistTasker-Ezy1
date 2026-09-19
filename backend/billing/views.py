import logging
from datetime import datetime, timezone as dt_timezone
from urllib.parse import urlencode
import stripe
from django.conf import settings
from django.shortcuts import get_object_or_404
from django.db import transaction
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from django.utils import timezone
from .models import OwnerSubscription, ShiftPayment, StripeWebhookEvent
from .utils import (
    BILLING_STATE_FREE_TRIAL,
    BILLING_STATE_PRE_LIVE,
    billing_account_display_name,
    get_billing_state_for_account,
    resolve_billing_account,
    user_can_manage_billing_for_pharmacy,
)

# NOTE: Will be importing shared-core pricing methods shortly
# from billing.pricing import calculateFulfillmentFee ...

stripe.api_key = settings.STRIPE_SECRET_KEY

logger = logging.getLogger(__name__)


# Product & Price IDs (from MCP)
BASE_SUB_PRICE = 'price_1T52ikBQXaySV5ukpVrv7EcZ' # $30 AUD
EXTRA_SEAT_PRICE = 'price_1T52ilBQXaySV5uk2fmUWXlw' # $5 AUD


def _frontend_base_url():
    return getattr(settings, 'FRONTEND_BASE_URL', 'http://localhost:5173').rstrip('/')


def _mobile_base_url():
    scheme = getattr(settings, 'MOBILE_APP_SCHEME', 'frontendmobile')
    return f'{scheme}://'


def _mobile_bridge_url(path, **params):
    base = _frontend_base_url()
    query = urlencode({
        'path': path,
        **{key: value for key, value in params.items() if value is not None},
    })
    return f"{base}/mobile-checkout-return?{query}"


def _subscription_return_urls(account, platform='web'):
    if platform == 'mobile':
        if account['scope'] == 'organization':
            return _mobile_bridge_url('organization/profile', checkout='success', billing='1'), _mobile_bridge_url('organization/profile', checkout='cancel', billing='1')
        return _mobile_bridge_url('owner/subscription-seats', checkout='success'), _mobile_bridge_url('owner/subscription-seats', checkout='cancel')
    base = _frontend_base_url()
    if account['scope'] == 'organization':
        success = f"{base}/dashboard/organization/overview?checkout=success&billing=1"
        cancel = f"{base}/dashboard/organization/overview?checkout=cancel&billing=1"
    else:
        success = f"{base}/dashboard/owner/overview?view=billing&checkout=success"
        cancel = f"{base}/dashboard/owner/overview?view=billing&checkout=cancel"
    return success, cancel


def _extra_seat_return_urls(account, platform='web'):
    if platform == 'mobile':
        if account['scope'] == 'organization':
            return _mobile_bridge_url('organization/profile', checkout='seat_success', billing='1'), _mobile_bridge_url('organization/profile', checkout='seat_cancel', billing='1')
        return _mobile_bridge_url('owner/subscription-seats', checkout='seat_success'), _mobile_bridge_url('owner/subscription-seats', checkout='seat_cancel')
    base = _frontend_base_url()
    if account['scope'] == 'organization':
        success = f"{base}/dashboard/organization/overview?checkout=seat_success&billing=1"
        cancel = f"{base}/dashboard/organization/overview?checkout=seat_cancel&billing=1"
    else:
        success = f"{base}/dashboard/owner/overview?view=billing&checkout=seat_success&mode=seats"
        cancel = f"{base}/dashboard/owner/overview?view=billing&checkout=seat_cancel&mode=seats"
    return success, cancel


def _shift_dashboard_context(user, pharmacy):
    from client_profile.models import PharmacyAdmin
    from users.models import OrganizationMembership

    organization_id = getattr(pharmacy, 'organization_id', None)
    if organization_id and OrganizationMembership.objects.filter(
        user=user,
        organization_id=organization_id,
        role__in=['ORG_ADMIN', 'CHIEF_ADMIN', 'REGION_ADMIN'],
    ).exists():
        return {'scope': 'organization'}

    admin_assignment = PharmacyAdmin.objects.filter(
        user=user,
        pharmacy=pharmacy,
        is_active=True,
    ).first()
    if admin_assignment and admin_assignment.admin_level != PharmacyAdmin.AdminLevel.OWNER:
        return {'scope': 'admin', 'pharmacy_id': pharmacy.id}

    return {'scope': 'owner'}


def _shift_checkout_return_urls(shift, *, acting_user, platform='web', query_key='payment'):
    context = _shift_dashboard_context(acting_user, shift.pharmacy)
    success_value = 'success'
    cancel_value = 'cancel'

    if platform == 'mobile':
        if context['scope'] == 'organization':
            path = f"organization/shifts/{shift.id}"
        elif context['scope'] == 'admin':
            path = "admin/shifts"
        else:
            path = f"owner/shifts/{shift.id}"
        return (
            _mobile_bridge_url(path, **{query_key: success_value}),
            _mobile_bridge_url(path, **{query_key: cancel_value}),
        )

    base = _frontend_base_url()
    if context['scope'] == 'organization':
        route = f"{base}/dashboard/organization/shifts/{shift.id}"
    elif context['scope'] == 'admin':
        route = f"{base}/dashboard/admin/{context['pharmacy_id']}/shifts/{shift.id}"
    else:
        route = f"{base}/dashboard/owner/shifts/{shift.id}"
    return (
        f"{route}?{query_key}={success_value}",
        f"{route}?{query_key}={cancel_value}",
    )


def _subscription_lookup_from_account(account):
    if account['scope'] == 'organization' and account.get('organization') is not None:
        return {'organization': account['organization']}
    owner_user = account.get('owner_user')
    if owner_user is None:
        raise ValueError('No billing owner found for this pharmacy.')
    return {'owner': owner_user}


def _get_subscription_for_account(account):
    lookup = _subscription_lookup_from_account(account)
    primary = OwnerSubscription.objects.filter(**lookup).first()
    if account['scope'] != 'organization':
        return primary

    if primary and primary.status == 'active':
        return primary

    owner_user = account.get('owner_user')
    if owner_user is not None:
        owner_subscription = OwnerSubscription.objects.filter(owner=owner_user).first()
        if owner_subscription and owner_subscription.status == 'active':
            return owner_subscription

    return primary


def _get_or_create_subscription_for_account(account):
    lookup = _subscription_lookup_from_account(account)
    defaults = {
        'billing_contact': account.get('billing_contact') or account.get('owner_user'),
    }
    subscription, _created = OwnerSubscription.objects.get_or_create(
        defaults=defaults,
        **lookup,
    )
    updated_fields = []
    if account.get('billing_contact') and subscription.billing_contact_id != account['billing_contact'].id:
        subscription.billing_contact = account['billing_contact']
        updated_fields.append('billing_contact')
    if updated_fields:
        subscription.save(update_fields=updated_fields)
    return subscription


def _build_subscription_metadata(account, *, actor_user, staff_count=None, pharmacy=None):
    metadata = {
        'billing_scope': account['scope'],
        'actor_user_id': actor_user.id,
    }
    if staff_count is not None:
        metadata['staff_count'] = staff_count
    if pharmacy is not None:
        metadata['pharmacy_id'] = pharmacy.id
    if account.get('owner_user') is not None:
        metadata['owner_user_id'] = account['owner_user'].id
    if account.get('organization') is not None:
        metadata['organization_id'] = account['organization'].id
    if account.get('billing_contact') is not None:
        metadata['billing_contact_user_id'] = account['billing_contact'].id
    return metadata


def _build_extra_seat_metadata(account, *, actor_user, extra_seat_count, pharmacy=None):
    metadata = _build_subscription_metadata(
        account,
        actor_user=actor_user,
        staff_count=5 + max(extra_seat_count, 0),
        pharmacy=pharmacy,
    )
    metadata['subscription_kind'] = 'extra_seats'
    metadata['extra_seat_count'] = max(extra_seat_count, 0)
    return metadata


def _get_subscription_from_metadata(metadata):
    organization_id = metadata.get('organization_id')
    owner_user_id = metadata.get('owner_user_id')
    if organization_id:
        return OwnerSubscription.objects.filter(organization_id=organization_id).first()
    if owner_user_id:
        return OwnerSubscription.objects.filter(owner_id=owner_user_id).first()
    actor_user_id = metadata.get('actor_user_id')
    if actor_user_id:
        return OwnerSubscription.objects.filter(owner_id=actor_user_id).first()
    return None


def _get_subscription_from_customer(customer_id):
    if not customer_id:
        return None
    return OwnerSubscription.objects.filter(stripe_customer_id=customer_id).first()


def _serialize_subscription(subscription):
    if not subscription:
        return {
            'exists': False,
            'active': False,
            'status': 'inactive',
            'staffCount': 5,
            'extraSeatCount': 0,
            'stripeCustomerId': None,
            'stripeSubscriptionId': None,
            'currentPeriodEnd': None,
        }

    staff_count = max(subscription.staff_count or 5, 5)
    return {
        'exists': True,
        'active': subscription.status == 'active',
        'status': subscription.status,
        'staffCount': staff_count,
        'extraSeatCount': max(0, staff_count - 5),
        'stripeCustomerId': subscription.stripe_customer_id,
        'stripeSubscriptionId': subscription.stripe_subscription_id,
        'stripeExtraSeatSubscriptionId': subscription.stripe_extra_seat_subscription_id,
        'currentPeriodEnd': subscription.current_period_end.isoformat() if subscription.current_period_end else None,
    }


def _current_account_for_user(user, pharmacy_id=None):
    pharmacy = None
    if pharmacy_id:
        from client_profile.models import Pharmacy
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


def _normalize_slot_ids(raw_slot_ids=None, raw_slot_id=None):
    values = raw_slot_ids if raw_slot_ids is not None else raw_slot_id
    if values in (None, '', []):
        return []
    if isinstance(values, str):
        values = [part.strip() for part in values.split(',') if part.strip()]
    elif not isinstance(values, (list, tuple, set)):
        values = [values]

    slot_ids = []
    for value in values:
        try:
            slot_ids.append(int(value))
        except (TypeError, ValueError):
            continue
    return sorted(set(slot_ids))


def _normalize_offer_ids(raw_offer_ids=None, raw_offer_id=None):
    values = raw_offer_ids if raw_offer_ids is not None else raw_offer_id
    if values in (None, '', []):
        return []
    if isinstance(values, str):
        values = [part.strip() for part in values.split(',') if part.strip()]
    elif not isinstance(values, (list, tuple, set)):
        values = [values]

    offer_ids = []
    for value in values:
        try:
            offer_ids.append(int(value))
        except (TypeError, ValueError):
            continue
    return sorted(set(offer_ids))


def _finalize_pending_offers_for_shift(shift, *, candidate_id=None, slot_id=None, slot_ids=None, offer_ids=None, return_offers=False):
    """
    Finalize shift offers waiting on payment.
    If candidate_id/slot_id are provided, narrow the target set.
    """
    from client_profile.models import ShiftOffer
    from client_profile.utils import finalize_shift_offer

    offers = ShiftOffer.objects.filter(
        shift=shift,
        status=ShiftOffer.Status.ACCEPTED_AWAITING_PAYMENT,
    ).order_by("created_at")

    if candidate_id:
        offers = offers.filter(user_id=candidate_id)
    target_offer_ids = _normalize_offer_ids(offer_ids)
    if target_offer_ids:
        offers = offers.filter(id__in=target_offer_ids)
    target_slot_ids = _normalize_slot_ids(slot_ids, slot_id)
    if target_slot_ids:
        offers = offers.filter(slot_id__in=target_slot_ids)

    finalized = 0
    finalized_offers = []
    selected_slot_ids = set()
    for offer in offers:
        finalize_shift_offer(offer)
        finalized_offers.append(offer)
        if offer.slot_id:
            selected_slot_ids.add(offer.slot_id)
        finalized += 1
    if selected_slot_ids:
        ShiftOffer.objects.filter(
            shift=shift,
            slot_id__in=selected_slot_ids,
            status__in=[ShiftOffer.Status.PENDING, ShiftOffer.Status.ACCEPTED_AWAITING_PAYMENT],
        ).exclude(id__in=list(target_offer_ids)).update(status=ShiftOffer.Status.EXPIRED, updated_at=timezone.now())
    if return_offers:
        return finalized, finalized_offers
    return finalized

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

    # 1. Ensure the billing account has a Stripe customer ID
    try:
        subscription = _get_or_create_subscription_for_account(account)
    except ValueError as exc:
        return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    if subscription.status == 'active' and subscription.stripe_subscription_id:
        return Response({'error': 'An active subscription already exists for this billing account.'}, status=status.HTTP_400_BAD_REQUEST)

    success_url, cancel_url = _subscription_return_urls(account, platform=platform)

    billing_contact = account.get('billing_contact') or user
    customer_email = getattr(billing_contact, 'email', None) or user.email
    customer_name = billing_account_display_name(account)
    if not subscription.stripe_customer_id:
        try:
            customer = stripe.Customer.create(
                email=customer_email,
                name=customer_name
            )
            subscription.stripe_customer_id = customer.id
            subscription.save()
        except Exception:
            logger.exception('Stripe customer creation failed')
            return Response({'error': 'Unable to initialise billing with the payment provider.'}, status=status.HTTP_400_BAD_REQUEST)

    # 2. Line Items Configuration
    line_items = [
        {'price': BASE_SUB_PRICE, 'quantity': 1}
    ]

    try:
        # 3. IF INVOICE: Create subscription directly without checkout, set to send_invoice
        if payment_method_input == 'invoice':
            sub = stripe.Subscription.create(
                customer=subscription.stripe_customer_id,
                items=line_items,
                collection_method='send_invoice',
                days_until_due=7,
                metadata=_build_subscription_metadata(
                    account,
                    actor_user=user,
                    staff_count=staff_count,
                    pharmacy=pharmacy,
                ),
            )
            # Sync to local DB
            subscription.stripe_subscription_id = sub.id
            subscription.staff_count = staff_count
            subscription.status = 'inactive' # remains inactive until invoice is paid
            subscription.save()
            return Response({
                'message': 'Invoice sent. Check your email.', 
                'subscription_id': sub.id
            })

        # 4. IF CARD: Create a Stripe Checkout Session for collection
        else:
            checkout_session = stripe.checkout.Session.create(
                customer=subscription.stripe_customer_id,
                payment_method_types=['card'],
                line_items=line_items,
                mode='subscription',
                success_url=success_url,
                cancel_url=cancel_url,
                metadata=_build_subscription_metadata(
                    account,
                    actor_user=user,
                    staff_count=staff_count,
                    pharmacy=pharmacy,
                ),
            )
            return Response({'url': checkout_session.url})

    except Exception:
        logger.exception('Billing request failed')
        return Response({'error': 'Unable to complete the billing request.'}, status=status.HTTP_400_BAD_REQUEST)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def current_subscription(request):
    account, _pharmacy, error_response = _current_account_for_user(
        request.user,
        pharmacy_id=request.query_params.get('pharmacy_id'),
    )
    if error_response is not None:
        return error_response

    subscription = _get_subscription_for_account(account)
    payload = _serialize_subscription(subscription)
    payload.update({
        'billingScope': account['scope'],
        'accountName': billing_account_display_name(account),
    })
    return Response(payload)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def update_subscription_seats(request):
    desired_staff_count = int(request.data.get('staff_count', 5))
    if desired_staff_count < 5:
        desired_staff_count = 5
    platform = request.data.get('platform', 'web')

    account, _pharmacy, error_response = _current_account_for_user(
        request.user,
        pharmacy_id=request.data.get('pharmacy_id'),
    )
    if error_response is not None:
        return error_response

    subscription = _get_subscription_for_account(account)
    if not subscription or subscription.status != 'active' or not subscription.stripe_subscription_id:
        return Response({'error': 'No active subscription found for this billing account.'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        desired_extra_seats = max(0, desired_staff_count - 5)
        current_extra_seats = max(0, (subscription.staff_count or 5) - 5)

        if desired_extra_seats <= 0:
            return Response({'error': 'Base subscription already includes 5 seats. Enter at least 1 extra seat.'}, status=status.HTTP_400_BAD_REQUEST)

        if subscription.stripe_extra_seat_subscription_id:
            return Response(
                {'error': 'Extra-seat subscription already exists. Incremental changes to an existing add-on are not supported in this flow yet.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if desired_extra_seats == current_extra_seats:
            payload = _serialize_subscription(subscription)
            payload.update({
                'message': 'No seat change detected.',
                'billingScope': account['scope'],
                'accountName': billing_account_display_name(account),
            })
            return Response(payload)

        success_url, cancel_url = _extra_seat_return_urls(account, platform=platform)
        checkout_session = stripe.checkout.Session.create(
            customer=subscription.stripe_customer_id,
            payment_method_types=['card'],
            line_items=[{'price': EXTRA_SEAT_PRICE, 'quantity': desired_extra_seats}],
            mode='subscription',
            success_url=success_url,
            cancel_url=cancel_url,
            metadata=_build_extra_seat_metadata(
                account,
                actor_user=request.user,
                extra_seat_count=desired_extra_seats,
            ),
        )

        return Response({
            'url': checkout_session.url,
            'message': 'Redirecting to Stripe to purchase extra seats.',
        })
    except Exception:
        logger.exception('Billing request failed')
        return Response({'error': 'Unable to complete the billing request.'}, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
@throttle_classes([ScopedRateThrottle])
def charge_shift_fulfillment(request, shift_id):
    """
    Called when a shift is FILLED (worker assigned and approves).
    Generates a checkout session for the fulfillment fee.
    """
    user = request.user
    from client_profile.models import Shift

    shift = get_object_or_404(Shift, id=shift_id)

    # 0. Authorization check
    if not user_can_manage_billing_for_pharmacy(user, shift.pharmacy):
        return Response({'error': 'Not authorized to charge this shift.'}, status=status.HTTP_403_FORBIDDEN)

    account = resolve_billing_account(shift.pharmacy, acting_user=user)
    billing_state = get_billing_state_for_account(account)
    platform = request.data.get('platform', 'web')

    candidate_id = request.data.get('candidate_id')
    slot_id = request.data.get('slot_id')
    slot_ids = _normalize_slot_ids(request.data.get('slot_ids') or request.data.get('slotIds'), slot_id)
    offer_ids = _normalize_offer_ids(request.data.get('offer_ids') or request.data.get('offerIds'), request.data.get('offer_id') or request.data.get('offerId'))

    if offer_ids:
        from client_profile.models import ShiftOffer
        selected_offers = list(ShiftOffer.objects.filter(
            shift=shift,
            status=ShiftOffer.Status.ACCEPTED_AWAITING_PAYMENT,
            id__in=offer_ids,
        ))
        if len(selected_offers) != len(offer_ids):
            return Response({'error': 'One or more selected offers do not require payment.'}, status=status.HTTP_400_BAD_REQUEST)
        selected_slot_ids = [offer.slot_id for offer in selected_offers if offer.slot_id]
        if len(selected_slot_ids) != len(set(selected_slot_ids)):
            return Response({'error': 'Select only one candidate per slot.'}, status=status.HTTP_400_BAD_REQUEST)
    elif slot_ids:
        from client_profile.models import ShiftOffer
        matching_count = ShiftOffer.objects.filter(
            shift=shift,
            status=ShiftOffer.Status.ACCEPTED_AWAITING_PAYMENT,
            slot_id__in=slot_ids,
        ).values('slot_id').distinct().count()
        if matching_count != len(slot_ids):
            return Response({'error': 'One or more selected slots do not require payment.'}, status=status.HTTP_400_BAD_REQUEST)

    # --- Honeymoon period / free trial: finalize for free ---
    if billing_state in [BILLING_STATE_PRE_LIVE, BILLING_STATE_FREE_TRIAL]:
        finalized_count, finalized_offers = _finalize_pending_offers_for_shift(
            shift,
            candidate_id=candidate_id,
            slot_ids=slot_ids,
            offer_ids=offer_ids,
            return_offers=True,
        )
        from client_profile.models import ShiftOffer
        from client_profile.utils import send_shift_payment_finalized_notifications
        has_pending_payment = ShiftOffer.objects.filter(
            shift=shift,
            status=ShiftOffer.Status.ACCEPTED_AWAITING_PAYMENT,
        ).exists()
        shift.payment_status = 'PENDING' if has_pending_payment else 'PAID'
        shift.save(update_fields=['payment_status'])
        send_shift_payment_finalized_notifications(
            shift=shift,
            offers=finalized_offers,
            paid_by=request.user,
            payment_method="free",
        )
        if billing_state == BILLING_STATE_PRE_LIVE:
            return Response({
                'free': True,
                'billing_state': billing_state,
                'finalized_offers': finalized_count,
                'message': 'Payments not active yet - shift confirmed for free.',
            })
        return Response({
            'free': True,
            'billing_state': billing_state,
            'finalized_offers': finalized_count,
            'message': 'Free trial applied - shift confirmed for free.',
        })


    # Price Logic
    # We could also use `shared-core` logic if we had a node backend, 
    # but since this is Django, we map it internally here for the Stripe Price IDs.
    
    is_subscriber = False
    sub = _get_subscription_for_account(account)
    if sub and sub.status == 'active':
        is_subscriber = True

    # Determine base price based on shift type
    # PT/FT standard: price_1T52ilBQXaySV5uksvQy2RTk ($80)
    # PT/FT subscriber: price_1T52imBQXaySV5ukuwLH3ikI ($40)
    # Locum standard: price_1T52jFBQXaySV5ukezd5JmzS ($30)
    # Locum subscriber: price_1T52jFBQXaySV5ukkXOKPHSV ($15)
    
    is_locum = shift.employment_type == 'LOCUM'

    if is_locum:
        price_id = 'price_1T52jFBQXaySV5ukezd5JmzS'
    else:
        price_id = 'price_1T52ilBQXaySV5uksvQy2RTk'

    success_url, cancel_url = _shift_checkout_return_urls(
        shift,
        acting_user=user,
        platform=platform,
        query_key='payment',
    )

    try:
        session_kwargs = {
            'payment_method_types': ['card'],
            'line_items': [{
                'price': price_id,
                'quantity': max(1, len(offer_ids) or len(slot_ids)),
            }],
            'mode': 'payment',
            'success_url': success_url,
            'cancel_url': cancel_url,
            'metadata': {
                'shift_id': shift.id, 
                'actor_user_id': user.id,
                'owner_user_id': account['owner_user'].id if account.get('owner_user') else '',
                'organization_id': account['organization'].id if account.get('organization') else '',
                'billing_contact_user_id': account['billing_contact'].id if account.get('billing_contact') else '',
                'billing_scope': account['scope'],
                'type': 'fulfillment',
                'candidate_id': candidate_id,
                'slot_id': slot_ids[0] if len(slot_ids) == 1 else '',
                'slot_ids': ','.join(str(value) for value in slot_ids),
                'offer_ids': ','.join(str(value) for value in offer_ids),
            }
        }
        if sub and sub.stripe_customer_id:
            session_kwargs['customer'] = sub.stripe_customer_id
        else:
            billing_contact = account.get('billing_contact') or user
            session_kwargs['customer_email'] = getattr(billing_contact, 'email', None) or user.email
        checkout_session = stripe.checkout.Session.create(**session_kwargs)
        return Response({'url': checkout_session.url})
    except Exception:
        logger.exception('Billing request failed')
        return Response({'error': 'Unable to complete the billing request.'}, status=status.HTTP_400_BAD_REQUEST)


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
    from client_profile.models import Shift, ShiftSlotAssignment
    from django.utils import timezone
    
    shift = get_object_or_404(Shift, id=shift_id)

    # 0. Authorization check
    if not user_can_manage_billing_for_pharmacy(user, shift.pharmacy):
        return Response({'error': 'Not authorized to penalize this shift.'}, status=status.HTTP_403_FORBIDDEN)

    account = resolve_billing_account(shift.pharmacy, acting_user=user)
    sub = _get_subscription_for_account(account)
    platform = request.data.get('platform', 'web')

    # Calculate expected wage
    assignments = ShiftSlotAssignment.objects.filter(shift=shift)
    total_wage = 0.0

    now = timezone.now()
    earliest_start = None

    for assignment in assignments:
        slot = assignment.slot
        slot_date = assignment.slot_date or slot.date
        
        # Combine date and time
        from datetime import datetime
        start_dt = timezone.make_aware(datetime.combine(slot_date, slot.start_time))
        end_dt = timezone.make_aware(datetime.combine(slot_date, slot.end_time))
        
        if not earliest_start or start_dt < earliest_start:
            earliest_start = start_dt

        hours = (end_dt - start_dt).total_seconds() / 3600.0
        rate = float(assignment.unit_rate or 0)
        total_wage += (hours * rate)

    if not earliest_start or total_wage <= 0:
        return Response({'message': 'No penalty required, shift had no value or assignments.'})

    # Calculate Penalty Percentage
    hours_until_shift = (earliest_start - now).total_seconds() / 3600.0

    penalty_percentage = 0.0
    if hours_until_shift <= 24:
        penalty_percentage = 0.20
    elif hours_until_shift <= 72:
        penalty_percentage = 0.10

    if penalty_percentage == 0.0:
        return Response({'message': 'No penalty required, cancelled > 72 hours in advance.'})

    penalty_amount_aud = total_wage * penalty_percentage
    penalty_amount_cents = int(penalty_amount_aud * 100)
    success_url, cancel_url = _shift_checkout_return_urls(
        shift,
        acting_user=user,
        platform=platform,
        query_key='penalty',
    )

    try:
        session_kwargs = {
            'payment_method_types': ['card'],
            'line_items': [{
                'price_data': {
                    'currency': 'aud',
                    'product_data': {
                        'name': f'Cancellation Penalty for Shift #{shift.id}',
                    },
                    'unit_amount': penalty_amount_cents,
                },
                'quantity': 1,
            }],
            'mode': 'payment',
            'success_url': success_url,
            'cancel_url': cancel_url,
            'metadata': {
                'shift_id': shift.id,
                'actor_user_id': user.id,
                'owner_user_id': account['owner_user'].id if account.get('owner_user') else '',
                'organization_id': account['organization'].id if account.get('organization') else '',
                'billing_contact_user_id': account['billing_contact'].id if account.get('billing_contact') else '',
                'billing_scope': account['scope'],
                'type': 'cancellation',
            }
        }
        if sub and sub.stripe_customer_id:
            session_kwargs['customer'] = sub.stripe_customer_id
        else:
            billing_contact = account.get('billing_contact') or user
            session_kwargs['customer_email'] = getattr(billing_contact, 'email', None) or user.email
        checkout_session = stripe.checkout.Session.create(**session_kwargs)
        return Response({'url': checkout_session.url})
    except Exception:
        logger.exception('Billing request failed')
        return Response({'error': 'Unable to complete the billing request.'}, status=status.HTTP_400_BAD_REQUEST)


from django.views.decorators.csrf import csrf_exempt
from django.http import HttpResponse

def _process_stripe_event(event):
    if event.type == 'checkout.session.completed':
        session = event.data.object
        metadata = session.get('metadata', {})
        subscription_kind = metadata.get('subscription_kind', 'base')
        
        # If it was a subscription checkout
        if session.mode == 'subscription':
            try:
                sub = _get_subscription_from_metadata(metadata)
                if not sub:
                    sub = _get_subscription_from_customer(session.customer)
                if not sub:
                    logger.warning('Stripe subscription checkout completed but no local subscription matched.')
                    raise OwnerSubscription.DoesNotExist
                if subscription_kind == 'extra_seats':
                    sub.stripe_extra_seat_subscription_id = session.subscription
                    sub.status = 'active'
                    if 'extra_seat_count' in metadata:
                        sub.staff_count = 5 + int(metadata['extra_seat_count'])
                else:
                    sub.stripe_subscription_id = session.subscription
                    sub.status = 'active'
                    sub.staff_count = 5
                sub.save()
            except OwnerSubscription.DoesNotExist:
                logger.warning(
                    'Stripe checkout.session.completed subscription event ignored because no matching OwnerSubscription was found.'
                )
                
        # If it was a fulfillment or penalty payment
        elif session.mode == 'payment' and session.payment_status == 'paid':
            shift_id = metadata.get('shift_id')
            payment_type = metadata.get('type')
            if shift_id and payment_type:
                amount_aud = 0
                if session.amount_total is not None:
                    amount_aud = session.amount_total / 100.0

                owner_id = metadata.get('owner_user_id') or metadata.get('billing_contact_user_id') or metadata.get('actor_user_id')

                ShiftPayment.objects.create(
                    owner_id=owner_id,
                    shift_id=shift_id,
                    stripe_payment_intent_id=session.payment_intent,
                    amount_aud=amount_aud,
                    payment_type=payment_type,
                    payment_method='card',
                    status='paid',
                    paid_at=timezone.now(),
                )

                # Mark shift paid, then finalize pending offers waiting on payment.
                try:
                    from client_profile.models import Shift as ShiftModel
                    shift_obj = ShiftModel.objects.filter(id=shift_id).first()
                    if shift_obj:
                        finalized_count, finalized_offers = _finalize_pending_offers_for_shift(
                            shift_obj,
                            candidate_id=metadata.get('candidate_id'),
                            slot_id=metadata.get('slot_id'),
                            slot_ids=metadata.get('slot_ids'),
                            offer_ids=metadata.get('offer_ids'),
                            return_offers=True,
                        )
                        from client_profile.utils import send_shift_payment_finalized_notifications
                        from users.models import User
                        paid_by_user = User.objects.filter(id=metadata.get('actor_user_id')).first()
                        send_shift_payment_finalized_notifications(
                            shift=shift_obj,
                            offers=finalized_offers,
                            paid_by=paid_by_user or getattr(shift_obj, 'created_by', None),
                            payment_method='stripe',
                        )
                        from client_profile.models import ShiftOffer
                        has_pending_payment = ShiftOffer.objects.filter(
                            shift=shift_obj,
                            status=ShiftOffer.Status.ACCEPTED_AWAITING_PAYMENT,
                        ).exists()
                        shift_obj.payment_status = 'PENDING' if has_pending_payment else 'PAID'
                        shift_obj.save(update_fields=['payment_status'])
                except Exception as e:
                    logger.warning('Could not finalize paid shift offers: %s', e)
                    # Roll back payment and offer changes together so Stripe can
                    # retry instead of permanently acknowledging partial work.
                    raise


    elif event.type == 'invoice.paid':
        invoice = event.data.object
        sub_id = invoice.get('subscription')
        customer_id = invoice.get('customer')
        if sub_id:
            try:
                sub = OwnerSubscription.objects.filter(stripe_subscription_id=sub_id).first()
                matched_extra_subscription = False
                if not sub:
                    sub = OwnerSubscription.objects.filter(stripe_extra_seat_subscription_id=sub_id).first()
                    matched_extra_subscription = sub is not None
                if not sub:
                    sub = _get_subscription_from_customer(customer_id)
                if not sub:
                    raise OwnerSubscription.DoesNotExist
                if not matched_extra_subscription and not sub.stripe_subscription_id:
                    sub.stripe_subscription_id = sub_id
                sub.status = 'active'
                period_end = invoice.get('lines', {}).get('data', [])
                if period_end:
                    period_end_ts = period_end[0].get('period', {}).get('end')
                    if period_end_ts:
                        sub.current_period_end = datetime.fromtimestamp(period_end_ts, tz=dt_timezone.utc)
                sub.save()
            except OwnerSubscription.DoesNotExist:
                logger.warning(
                    'Stripe invoice.paid could not find matching local subscription.',
                )

    elif event.type == 'customer.subscription.deleted':
        sub_id = event.data.object.id
        try:
            sub = OwnerSubscription.objects.filter(stripe_subscription_id=sub_id).first()
            if sub:
                sub.status = 'inactive'
                sub.save(update_fields=['status'])
            else:
                sub = OwnerSubscription.objects.filter(stripe_extra_seat_subscription_id=sub_id).first()
                if not sub:
                    raise OwnerSubscription.DoesNotExist
                sub.stripe_extra_seat_subscription_id = None
                sub.staff_count = 5
                sub.save(update_fields=['stripe_extra_seat_subscription_id', 'staff_count'])
        except OwnerSubscription.DoesNotExist:
            logger.warning(
                'Stripe customer.subscription.deleted could not find matching local subscription.',
            )
    else:
        pass

@csrf_exempt
@api_view(['POST'])
@permission_classes([AllowAny])
def stripe_webhook(request):
    """Verify, deduplicate, and process one Stripe webhook delivery."""
    payload = request.body
    sig_header = request.META.get('HTTP_STRIPE_SIGNATURE')

    try:
        event = stripe.Webhook.construct_event(
            payload, sig_header, settings.STRIPE_WEBHOOK_SECRET
        )
    except ValueError:
        logger.warning('Stripe webhook rejected due to invalid payload.')
        return HttpResponse(status=400)
    except stripe.error.SignatureVerificationError:
        logger.warning('Stripe webhook signature verification failed.')
        return HttpResponse(status=400)

    event_id = str(getattr(event, 'id', '') or '')
    event_type = str(getattr(event, 'type', '') or '')
    if not event_id or not event_type:
        logger.warning('Stripe webhook rejected because event identity was missing.')
        return HttpResponse(status=400)

    try:
        with transaction.atomic():
            delivery, created = StripeWebhookEvent.objects.select_for_update().get_or_create(
                event_id=event_id,
                defaults={
                    'event_type': event_type,
                    'status': StripeWebhookEvent.Status.PROCESSING,
                },
            )
            if not created and delivery.status == StripeWebhookEvent.Status.PROCESSED:
                return HttpResponse(status=200)

            delivery.event_type = event_type
            delivery.status = StripeWebhookEvent.Status.PROCESSING
            delivery.failed_at = None
            delivery.save(update_fields=['event_type', 'status', 'failed_at'])

            _process_stripe_event(event)

            delivery.status = StripeWebhookEvent.Status.PROCESSED
            delivery.processed_at = timezone.now()
            delivery.save(update_fields=['status', 'processed_at'])
    except Exception:
        logger.exception(
            'Stripe webhook processing failed for event_id=%s event_type=%s',
            event_id,
            event_type,
        )
        with transaction.atomic():
            delivery, _ = StripeWebhookEvent.objects.select_for_update().get_or_create(
                event_id=event_id,
                defaults={'event_type': event_type},
            )
            # Another delivery may have succeeded after this transaction rolled
            # back. Never downgrade its processed marker and enable a replay.
            if delivery.status != StripeWebhookEvent.Status.PROCESSED:
                delivery.status = StripeWebhookEvent.Status.FAILED
                delivery.failed_at = timezone.now()
                delivery.save(update_fields=['status', 'failed_at'])
        return HttpResponse(status=500)

    return HttpResponse(status=200)
