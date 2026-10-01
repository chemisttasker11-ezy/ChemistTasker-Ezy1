"""Moved verbatim from client_profile/views.py (Stage 2 domain split). Behaviour is unchanged; client_profile/views.py re-exports these names."""
from rest_framework import permissions, status
from client_profile.models import (
    FAVORITE_STAFF_EMPLOYMENT_TYPES,
    Membership,
    Pharmacy,
    PHARMACY_STAFF_EMPLOYMENT_TYPES,
    PharmacyClaim,
    Shift,
    ShiftProfileAccessAudit,
)
from invoicing.models import Invoice
from pharmacy_hub.models import PharmacyHubPost
from client_profile.domains.orgs.serializers import PharmacyClaimSerializer
from client_profile.domains.shifts.serializers import ShiftSerializer
from users.permissions import IsExplorer, IsOtherstaff, IsPharmacist, OrganizationRolePermission
from django.core.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import PermissionDenied
from client_profile.admin_helpers import pharmacies_user_admins
from users.serializers import UserProfileSerializer
from django.db.models import Q, Sum
from django.utils import timezone
from client_profile.domains.common.labels import other_staff_role_label
from datetime import date
from datetime import timedelta
from decimal import Decimal
from urllib.parse import urlencode
from users.org_roles import membership_visible_pharmacy_ids
from client_profile.domains.shifts.base import _shift_roles_visible_to_user, COMMUNITY_LEVELS


# Dashboards
def _parse_dashboard_pharmacy_id(request):
    raw = (
        request.query_params.get("pharmacy_id")
        or request.query_params.get("pharmacy")
        or request.query_params.get("pharmacyId")
    )
    if not raw:
        return None
    try:
        return int(raw)
    except (TypeError, ValueError):
        raise ValidationError({"pharmacy_id": "Invalid pharmacy id."})


def _parse_dashboard_workspace(request):
    raw = str(request.query_params.get("workspace") or "").strip().lower()
    if raw in {"internal", "platform"}:
        return raw
    return "internal" if _parse_dashboard_pharmacy_id(request) is not None else "platform"


def _scope_pharmacies(pharmacies, pharmacy_id):
    if pharmacy_id is None:
        return pharmacies
    scoped = pharmacies.filter(id=pharmacy_id)
    if not scoped.exists():
        raise PermissionDenied("You do not have access to this pharmacy.")
    return scoped


def _future_shift_filter(today, now):
    return Q(slots__date__gt=today) | Q(slots__date=today, slots__end_time__gt=now)


def _active_shift_filter(today, now):
    return Q(slots__isnull=True) | _future_shift_filter(today, now)


def _public_platform_shifts(today, now):
    return Shift.objects.filter(
        visibility="PLATFORM",
        dedicated_user__isnull=True,
        slot_assignments__isnull=True,
    ).filter(
        _future_shift_filter(today, now)
    ).distinct()


def _user_confirmed_platform_shifts(user, today, now):
    return Shift.objects.filter(
        visibility="PLATFORM",
        slot_assignments__user=user,
    ).filter(
        _future_shift_filter(today, now)
    ).distinct()


def _pharmacy_confirmed_shifts(pharmacy_ids):
    return Shift.objects.filter(
        pharmacy_id__in=pharmacy_ids,
        slot_assignments__isnull=False,
    ).distinct()


def _open_active_shifts(shifts_qs, today, now):
    return shifts_qs.filter(
        _active_shift_filter(today, now),
        slot_assignments__isnull=True,
    ).distinct()


def _all_active_shifts(shifts_qs, today, now):
    return shifts_qs.filter(_active_shift_filter(today, now)).distinct()


def _membership_visibility_levels(membership):
    employment_type = str(getattr(membership, "employment_type", "") or "").upper()
    if employment_type in PHARMACY_STAFF_EMPLOYMENT_TYPES:
        return ["FULL_PART_TIME"]
    if employment_type in FAVORITE_STAFF_EMPLOYMENT_TYPES:
        return ["LOCUM_CASUAL"]
    return []


def _membership_shift_employment_types(membership):
    employment_type = str(getattr(membership, "employment_type", "") or "").upper()
    if employment_type in PHARMACY_STAFF_EMPLOYMENT_TYPES:
        return ["FULL_TIME", "PART_TIME"]
    if employment_type in FAVORITE_STAFF_EMPLOYMENT_TYPES:
        return ["LOCUM"]
    return []


def _worker_visible_pharmacy_shifts(user, pharmacy_ids):
    memberships = Membership.objects.filter(
        user=user,
        is_active=True,
        pharmacy_id__in=pharmacy_ids,
    ).select_related("pharmacy__owner", "pharmacy__organization")
    eligible_filter = Q()
    for membership in memberships:
        employment_type = str(getattr(membership, "employment_type", "") or "").upper()
        if employment_type in PHARMACY_STAFF_EMPLOYMENT_TYPES:
            eligible_filter |= Q(
                pharmacy_id=membership.pharmacy_id,
                visibility="FULL_PART_TIME",
            )
            eligible_filter |= Q(
                pharmacy_id=membership.pharmacy_id,
                visibility__in=["LOCUM_CASUAL", "PLATFORM"],
                post_anonymously=False,
            )
        elif employment_type in FAVORITE_STAFF_EMPLOYMENT_TYPES:
            eligible_filter |= Q(
                pharmacy_id=membership.pharmacy_id,
                visibility="LOCUM_CASUAL",
            )
            eligible_filter |= Q(
                pharmacy_id=membership.pharmacy_id,
                visibility="PLATFORM",
                post_anonymously=False,
            )

        owner_id = getattr(getattr(membership, "pharmacy", None), "owner_id", None)
        if owner_id:
            eligible_filter |= Q(
                pharmacy_id__in=pharmacy_ids,
                visibility="OWNER_CHAIN",
                pharmacy__owner_id=owner_id,
            )

        organization_id = getattr(getattr(membership, "pharmacy", None), "organization_id", None)
        if organization_id:
            eligible_filter |= Q(
                pharmacy_id__in=pharmacy_ids,
                visibility="ORG_CHAIN",
                pharmacy__organization_id=organization_id,
            )

    if not eligible_filter:
        return Shift.objects.none()

    role = str(getattr(user, "role", "") or "").upper()
    qs = Shift.objects.filter(eligible_filter)
    if role == "PHARMACIST":
        qs = qs.filter(role_needed="PHARMACIST")
    elif role == "OTHER_STAFF":
        qs = qs.exclude(role_needed="PHARMACIST")
    return qs.distinct()


def _dashboard_shift_box(shift):
    slot = shift.slots.order_by("date", "start_time").first()
    return {
        "id": shift.id,
        "pharmacy_name": shift.pharmacy.name if shift.pharmacy else "",
        "date": slot.date if slot else None,
    }


def _format_money(value):
    amount = Decimal(value or 0)
    return f"${amount:,.2f}"


def _dashboard_shift_action_url(shift, dashboard_role):
    if not shift:
        return ""
    role = str(dashboard_role or "").lower()
    if role == "organization":
        return f"/dashboard/organization/shifts/{shift.id}"
    if role == "pharmacist":
        return f"/dashboard/pharmacist/shifts/{shift.id}"
    if role == "otherstaff":
        return f"/dashboard/otherstaff/shifts/{shift.id}"
    return f"/dashboard/owner/shifts/{shift.id}"


def _dashboard_invoice_action_url(invoice, dashboard_role):
    if not invoice:
        return ""
    role = str(dashboard_role or "").lower()
    if role == "pharmacist":
        return f"/dashboard/pharmacist/invoice/{invoice.id}"
    if role == "otherstaff":
        return f"/dashboard/otherstaff/invoice/{invoice.id}"
    if role == "organization":
        return f"/dashboard/organization/invoice/{invoice.id}"
    if role == "owner":
        return f"/dashboard/owner/invoice/{invoice.id}"
    if role == "admin":
        pharmacy_id = getattr(invoice, "pharmacy_id", None)
        return f"/dashboard/admin/{pharmacy_id}/invoice/{invoice.id}" if pharmacy_id else ""
    return ""


def _dashboard_hub_action_url(post):
    if not post:
        return ""
    params = {"post": post.id}
    if post.community_group_id:
        params.update({"scope": "group", "group_id": post.community_group_id})
    elif post.organization_id:
        params.update({"scope": "organization", "organization_id": post.organization_id})
    elif post.pharmacy_id:
        params.update({"scope": "pharmacy", "pharmacy_id": post.pharmacy_id})
    elif post.platform_hub:
        params.update({"scope": "platform", "platform_hub": post.platform_hub})
    return f"/dashboard/pharmacy-hub?{urlencode(params)}"


def _dashboard_activity_time(value):
    return value.strftime("%d %b") if value else ""


def _dashboard_activity(*, shifts_qs, confirmed_qs, invoices_qs, pharmacy_name, dashboard_role=None, selected_pharmacy=None, user=None):
    activity = []
    shift_scope = shifts_qs
    role = str(dashboard_role or "").lower()
    pharmacy_ids = list(
        shift_scope.exclude(pharmacy_id__isnull=True)
        .values_list("pharmacy_id", flat=True)
        .distinct()[:100]
    )

    latest_shift = shift_scope.select_related("pharmacy").order_by("-created_at").first()
    if latest_shift:
        activity.append({
            "title": "Recent shift posted",
            "description": latest_shift.pharmacy.name if latest_shift.pharmacy else pharmacy_name,
            "time": _dashboard_activity_time(latest_shift.created_at),
            "kind": "shift",
            "target_type": "shift",
            "target_id": latest_shift.id,
            "action_url": _dashboard_shift_action_url(latest_shift, dashboard_role),
            "created_at": latest_shift.created_at.isoformat() if latest_shift.created_at else None,
        })

    can_show_internal_hub = role not in {"explorer"} and selected_pharmacy is not None
    if can_show_internal_hub and role in {"pharmacist", "otherstaff"} and user is not None:
        can_show_internal_hub = Membership.objects.filter(
            user=user,
            pharmacy=selected_pharmacy,
            is_active=True,
            employment_type__in=PHARMACY_STAFF_EMPLOYMENT_TYPES,
        ).exists()
    if can_show_internal_hub:
        hub_qs = PharmacyHubPost.objects.filter(deleted_at__isnull=True)
        hub_qs = hub_qs.filter(
            Q(pharmacy=selected_pharmacy)
            | Q(community_group__pharmacy=selected_pharmacy)
            | Q(mentions__membership__user=user, mentions__membership__pharmacy=selected_pharmacy)
        ).distinct()
        latest_hub_post = hub_qs.select_related("pharmacy", "organization", "community_group").order_by("-created_at").first()
        if latest_hub_post:
            description = (
                getattr(latest_hub_post.pharmacy, "name", None)
                or getattr(latest_hub_post.organization, "name", None)
                or getattr(latest_hub_post.community_group, "name", None)
                or "ChemistTasker Hub"
            )
            activity.append({
                "title": "Recent Hub post",
                "description": description,
                "time": _dashboard_activity_time(latest_hub_post.created_at),
                "kind": "hub",
                "target_type": "hub_post",
                "target_id": latest_hub_post.id,
                "action_url": _dashboard_hub_action_url(latest_hub_post),
                "created_at": latest_hub_post.created_at.isoformat() if latest_hub_post.created_at else None,
            })

    reveal_qs = ShiftProfileAccessAudit.objects.filter(
        shift__in=shift_scope,
        action=ShiftProfileAccessAudit.Action.REVEAL_PROFILE,
    ).select_related("shift__pharmacy", "target_user")
    if str(dashboard_role or "").lower() in {"pharmacist", "otherstaff"} and user is not None:
        reveal_qs = reveal_qs.filter(target_user=user)
    latest_reveal = reveal_qs.order_by("-created_at").first()
    if latest_reveal:
        target_name = latest_reveal.target_user.get_full_name() or latest_reveal.target_user.email
        reveal_pharmacy_name = latest_reveal.shift.pharmacy.name if latest_reveal.shift and latest_reveal.shift.pharmacy else pharmacy_name
        activity.append({
            "title": "Shift profile revealed",
            "description": f"{target_name} - {reveal_pharmacy_name}",
            "time": _dashboard_activity_time(latest_reveal.created_at),
            "kind": "reveal",
            "target_type": "shift",
            "target_id": latest_reveal.shift_id,
            "action_url": _dashboard_shift_action_url(latest_reveal.shift, dashboard_role),
            "created_at": latest_reveal.created_at.isoformat() if latest_reveal.created_at else None,
        })

    latest_confirmed = confirmed_qs.select_related("pharmacy").order_by("-slot_assignments__assigned_at").first()
    if latest_confirmed:
        latest_assignment = latest_confirmed.slot_assignments.order_by("-assigned_at").first()
        activity.append({
            "title": "Shift confirmed",
            "description": latest_confirmed.pharmacy.name if latest_confirmed.pharmacy else pharmacy_name,
            "time": _dashboard_activity_time(latest_assignment.assigned_at if latest_assignment else None),
            "kind": "confirmed",
            "target_type": "shift",
            "target_id": latest_confirmed.id,
            "action_url": _dashboard_shift_action_url(latest_confirmed, dashboard_role),
            "created_at": latest_assignment.assigned_at.isoformat() if latest_assignment else None,
        })

    latest_invoice = invoices_qs.select_related("pharmacy").order_by("-created_at").first()
    if latest_invoice:
        status_label = dict(Invoice.STATUS_CHOICES).get(latest_invoice.status, latest_invoice.status).title()
        invoice_pharmacy_name = (
            getattr(latest_invoice.pharmacy, "name", None)
            or latest_invoice.pharmacy_name_snapshot
            or pharmacy_name
        )
        activity.append({
            "title": f"Invoice {status_label}",
            "description": f"{invoice_pharmacy_name} - {_format_money(latest_invoice.total)}",
            "time": _dashboard_activity_time(latest_invoice.created_at),
            "kind": "invoice",
            "target_type": "invoice",
            "target_id": latest_invoice.id,
            "status": latest_invoice.status,
            "status_label": status_label,
            "action_url": _dashboard_invoice_action_url(latest_invoice, dashboard_role),
            "created_at": latest_invoice.created_at.isoformat() if latest_invoice.created_at else None,
        })

    return sorted(
        activity,
        key=lambda item: item.get("created_at") or "",
        reverse=True,
    )[:4]


def _dashboard_invoice_summary(invoices_qs):
    unpaid_qs = invoices_qs.exclude(status="paid")
    paid_qs = invoices_qs.filter(status="paid")
    unpaid_total = unpaid_qs.aggregate(total=Sum("total")).get("total") or Decimal("0")
    paid_total = paid_qs.aggregate(total=Sum("total")).get("total") or Decimal("0")
    total = invoices_qs.aggregate(total=Sum("total")).get("total") or Decimal("0")
    return {
        "total_count": invoices_qs.count(),
        "unpaid_count": unpaid_qs.count(),
        "paid_count": paid_qs.count(),
        "total_billed": _format_money(total),
        "unpaid_total": _format_money(unpaid_total),
        "paid_total": _format_money(paid_total),
    }


def _dashboard_upcoming_stats(shifts_qs, today, now):
    week_end = today + timedelta(days=6)
    month_end = today + timedelta(days=30)
    return {
        "today": shifts_qs.filter(slots__date=today, slots__end_time__gt=now).distinct().count(),
        "week": shifts_qs.filter(slots__date__gte=today, slots__date__lte=week_end).distinct().count(),
        "month": shifts_qs.filter(slots__date__gte=today, slots__date__lte=month_end).distinct().count(),
    }


def _dashboard_payload_extras(*, shifts_qs, confirmed_qs, community_qs=None, invoices_qs=None, selected_pharmacy=None, today=None, now=None, open_qs=None, all_qs=None, dashboard_role=None, user=None):
    today = today or date.today()
    now = now or timezone.now().time()
    invoices_qs = invoices_qs if invoices_qs is not None else Invoice.objects.none()
    community_qs = community_qs if community_qs is not None else Shift.objects.none()
    open_qs = open_qs if open_qs is not None else _open_active_shifts(shifts_qs, today, now)
    all_qs = all_qs if all_qs is not None else _all_active_shifts(shifts_qs, today, now)
    pharmacy_name = selected_pharmacy.name if selected_pharmacy else "All pharmacies"
    upcoming_stats = _dashboard_upcoming_stats(shifts_qs, today, now)
    invoice_summary = _dashboard_invoice_summary(invoices_qs)
    return {
        "selected_pharmacy": (
            {"id": selected_pharmacy.id, "name": selected_pharmacy.name}
            if selected_pharmacy else None
        ),
        "upcoming_stats": upcoming_stats,
        "activity": _dashboard_activity(
            shifts_qs=all_qs,
            confirmed_qs=confirmed_qs,
            invoices_qs=invoices_qs,
            pharmacy_name=pharmacy_name,
            dashboard_role=dashboard_role,
            selected_pharmacy=selected_pharmacy,
            user=user,
        ),
        "shift_summary": {
            "upcoming_count": shifts_qs.count(),
            "confirmed_count": confirmed_qs.count(),
            "community_count": community_qs.count(),
            "open_count": open_qs.count(),
            "all_count": all_qs.count(),
        },
        "invoice_summary": invoice_summary,
        "bills_summary": {
            "total_billed": invoice_summary["total_billed"],
            "unpaid_total": invoice_summary["unpaid_total"],
            "unpaid_count": invoice_summary["unpaid_count"],
            "paid_count": invoice_summary["paid_count"],
        },
    }


class OrganizationDashboardView(APIView):
    """
    Any org-level member may view this dashboard.
    """
    required_roles     = ['ORG_ADMIN', 'CHIEF_ADMIN', 'REGION_ADMIN']
    permission_classes = [permissions.IsAuthenticated, OrganizationRolePermission]

    def get(self, request, organization_pk):
        membership = request.user.organization_memberships.filter(
            organization_id=organization_pk,
            role__in=self.required_roles,
        ).select_related('organization').prefetch_related('pharmacies').first()
        if not membership:
            raise PermissionDenied("You are not a member of this organization.")

        org = membership.organization
        scoped_pharmacy_ids = membership_visible_pharmacy_ids(membership)
        requested_pharmacy_id = _parse_dashboard_pharmacy_id(request)
        workspace = _parse_dashboard_workspace(request)

        claims_qs = PharmacyClaim.objects.filter(
            organization=org
        ).select_related(
            'pharmacy',
            'pharmacy__owner',
            'pharmacy__owner__user',
            'requested_by',
            'responded_by',
        ).order_by('-created_at')

        if membership.role == 'REGION_ADMIN':
            if scoped_pharmacy_ids:
                claims_qs = claims_qs.filter(pharmacy_id__in=scoped_pharmacy_ids)
            else:
                claims_qs = claims_qs.none()

        claims_data = PharmacyClaimSerializer(
            claims_qs,
            many=True,
            context={'request': request},
        ).data

        accepted_data = [
            {
                'claim_id': claim.id,
                'pharmacy_id': claim.pharmacy_id,
                'pharmacy_name': claim.pharmacy.name,
                'pharmacy_email': claim.pharmacy.email,
                'owner_email': getattr(getattr(claim.pharmacy.owner, 'user', None), 'email', None),
            }
            for claim in claims_qs
            if claim.status == PharmacyClaim.Status.ACCEPTED
        ]

        shifts_qs = Shift.objects.filter(pharmacy__organization=org)
        selected_pharmacy = None
        if workspace == "platform":
            shifts_qs = _public_platform_shifts(date.today(), timezone.now().time())
        else:
            if membership.role == 'REGION_ADMIN':
                if scoped_pharmacy_ids:
                    shifts_qs = shifts_qs.filter(pharmacy_id__in=scoped_pharmacy_ids)
                else:
                    shifts_qs = shifts_qs.none()
            if requested_pharmacy_id is not None:
                allowed_pharmacy = Pharmacy.objects.filter(id=requested_pharmacy_id, organization=org)
                if membership.role == 'REGION_ADMIN':
                    allowed_pharmacy = allowed_pharmacy.filter(id__in=scoped_pharmacy_ids)
                if not allowed_pharmacy.exists():
                    raise PermissionDenied("You do not have access to this pharmacy.")
                shifts_qs = shifts_qs.filter(pharmacy_id=requested_pharmacy_id)
                selected_pharmacy = allowed_pharmacy.first()
        shifts = ShiftSerializer(shifts_qs, many=True).data
        today = date.today()
        now = timezone.now().time()
        future_shifts = shifts_qs.filter(_future_shift_filter(today, now)).distinct()
        confirmed_shifts = _user_confirmed_platform_shifts(request.user, today, now) if workspace == "platform" else shifts_qs.filter(slot_assignments__isnull=False).distinct()
        invoices_qs = Invoice.objects.filter(user=request.user, pharmacy__isnull=True) if workspace == "platform" else Invoice.objects.filter(pharmacy__organization=org)
        if workspace != "platform" and requested_pharmacy_id is not None:
            invoices_qs = invoices_qs.filter(pharmacy_id=requested_pharmacy_id)
        open_shifts = _open_active_shifts(shifts_qs, today, now)
        all_active_shifts = _all_active_shifts(shifts_qs, today, now)
        extras = _dashboard_payload_extras(
            shifts_qs=future_shifts,
            confirmed_qs=confirmed_shifts,
            invoices_qs=invoices_qs,
            selected_pharmacy=selected_pharmacy,
            today=today,
            now=now,
            open_qs=open_shifts,
            all_qs=all_active_shifts,
            dashboard_role="organization",
            user=request.user,
        )

        return Response({
            'organization': {
                'id':   org.id,
                'name': org.name,
                'role': membership.role,
                'admin_level': membership.admin_level,
                'job_title': membership.job_title,
                'region': membership.region,
            },
            'claimed_pharmacies': accepted_data,
            'pharmacy_claims': claims_data,
            'shifts':            shifts,
            'active_shifts':      future_shifts.count(),
            'confirmed_shifts_count': confirmed_shifts.count(),
            **extras,
        }, status=status.HTTP_200_OK)


class OwnerDashboard(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        user_serializer = UserProfileSerializer(user)
        requested_pharmacy_id = _parse_dashboard_pharmacy_id(request)
        workspace = _parse_dashboard_workspace(request)
        today = date.today()
        now = timezone.now().time()

        if workspace == "platform":
            public_shifts = _public_platform_shifts(today, now).filter(created_by=user).distinct()
            confirmed_shifts = public_shifts.filter(
                slot_assignments__isnull=False,
                payment_status__in=['PAID', 'NOT_REQUIRED'],
            ).distinct()
            invoices_qs = Invoice.objects.filter(user=user, pharmacy__isnull=True)
            extras = _dashboard_payload_extras(
                shifts_qs=public_shifts,
                confirmed_qs=confirmed_shifts,
                community_qs=public_shifts,
                invoices_qs=invoices_qs,
                selected_pharmacy=None,
                today=today,
                now=now,
                dashboard_role="owner",
                user=user,
            )
            return Response({
                "user": user_serializer.data,
                "upcoming_shifts_count": public_shifts.count(),
                "confirmed_shifts_count": confirmed_shifts.count(),
                "community_shifts_count": public_shifts.count(),
                "shifts": [_dashboard_shift_box(shift) for shift in public_shifts[:12]],
                **extras,
            })

        # Pharmacies I control: Owner pharmacies ∪ pharmacies where I’m PHARMACY_ADMIN
        owner_pharmacies = Pharmacy.objects.filter(owner__user=user)
        admin_pharmacies = pharmacies_user_admins(user)
        pharmacies = _scope_pharmacies((owner_pharmacies | admin_pharmacies).distinct(), requested_pharmacy_id)
        selected_pharmacy = pharmacies.filter(id=requested_pharmacy_id).first() if requested_pharmacy_id else None

        if not pharmacies.exists():
            # Keep your exact empty payload behavior for non-owners/non-admins
            data = {
                "user": user_serializer.data,
                "upcoming_shifts_count": 0,
                "confirmed_shifts_count": 0,
                "shifts": [],
                "bills_summary": {
                    "total_billed": "N/A",
                    "points": "N/A"
                },
            }
            return Response(data)

        # Same as before, just using the unified pharmacies set
        shifts_qs = Shift.objects.filter(pharmacy__in=pharmacies).distinct()
        open_shifts = _open_active_shifts(shifts_qs, today, now)
        all_active_shifts = _all_active_shifts(shifts_qs, today, now)
        personal_shift_scope = shifts_qs.filter(created_by=user).distinct()
        personal_upcoming_shifts = personal_shift_scope.filter(_future_shift_filter(today, now)).distinct()

        # Upcoming shifts
        upcoming_shifts = shifts_qs.filter(
            slots__date__gt=today
        ) | shifts_qs.filter(
            slots__date=today,
            slots__end_time__gt=now
        )
        upcoming_shifts = upcoming_shifts.distinct()

        # ---- Correct confirmed shifts logic ----
        # Confirmed shifts: at least one assignment
        confirmed_shifts = shifts_qs.filter(
            slot_assignments__isnull=False,
            payment_status__in=['PAID', 'NOT_REQUIRED'],
        ).distinct()
        personal_confirmed_shifts = personal_shift_scope.filter(
            slot_assignments__isnull=False,
            payment_status__in=['PAID', 'NOT_REQUIRED'],
        ).distinct()

        # Build shift summary boxes
        shift_boxes = []
        for shift in upcoming_shifts:
            slot = shift.slots.order_by('date').first()
            shift_date = slot.date if slot else None
            shift_boxes.append({
                'id': shift.id,
                'pharmacy_name': shift.pharmacy.name if shift.pharmacy else '',
                'date': shift_date,
            })

        invoices_qs = Invoice.objects.filter(pharmacy__in=pharmacies)
        extras = _dashboard_payload_extras(
            shifts_qs=upcoming_shifts,
            confirmed_qs=confirmed_shifts,
            invoices_qs=invoices_qs,
            selected_pharmacy=selected_pharmacy,
            today=today,
            now=now,
            open_qs=open_shifts,
            all_qs=all_active_shifts,
            dashboard_role="owner",
            user=user,
        )
        extras["upcoming_stats"] = _dashboard_upcoming_stats(personal_upcoming_shifts, today, now)

        data = {
            "user": user_serializer.data,
            "upcoming_shifts_count": upcoming_shifts.count(),
            "confirmed_shifts_count": confirmed_shifts.count(),
            "shifts": shift_boxes,
            **extras,
        }
        return Response(data)


class PharmacistDashboard(APIView):
    permission_classes = [IsAuthenticated, IsPharmacist]

    def get(self, request):
        user = request.user
        user_serializer = UserProfileSerializer(user)
        today = date.today()
        now = timezone.now().time()
        requested_pharmacy_id = _parse_dashboard_pharmacy_id(request)
        workspace = _parse_dashboard_workspace(request)
        member_pharmacy_ids = list(Membership.objects.filter(
            user=user, is_active=True
        ).values_list('pharmacy_id', flat=True))
        if workspace == "platform":
            public_shifts = _public_platform_shifts(today, now).filter(role_needed__in=_shift_roles_visible_to_user(user))
            confirmed_shifts = _user_confirmed_platform_shifts(user, today, now)
            invoices_qs = Invoice.objects.filter(user=user, pharmacy__isnull=True)
            extras = _dashboard_payload_extras(
                shifts_qs=public_shifts,
                confirmed_qs=confirmed_shifts,
                community_qs=public_shifts,
                invoices_qs=invoices_qs,
                selected_pharmacy=None,
                today=today,
                now=now,
                dashboard_role="pharmacist",
                user=user,
            )
            data = {
                "user": user_serializer.data,
                "message": "Welcome Pharmacist!",
                "upcoming_shifts_count": public_shifts.count(),
                "confirmed_shifts_count": confirmed_shifts.count(),
                "community_shifts_count": public_shifts.count(),
                "shifts": [_dashboard_shift_box(shift) for shift in public_shifts[:12]],
                "community_shifts": [_dashboard_shift_box(shift) for shift in public_shifts[:12]],
                **extras,
            }
            return Response(data)
        if requested_pharmacy_id is not None:
            if requested_pharmacy_id not in member_pharmacy_ids:
                raise PermissionDenied("You do not have access to this pharmacy.")
            member_pharmacy_ids = [requested_pharmacy_id]
        selected_pharmacy = Pharmacy.objects.filter(id=requested_pharmacy_id).first() if requested_pharmacy_id else None

        # Internal workspace: selected pharmacy behaves like that pharmacy's home page,
        # scoped to the worker's membership type and current escalation level.
        visible_shifts = _worker_visible_pharmacy_shifts(user, member_pharmacy_ids)
        upcoming_shifts = visible_shifts.filter(_future_shift_filter(today, now)).distinct()
        open_shifts = _open_active_shifts(visible_shifts, today, now)
        all_active_shifts = _all_active_shifts(visible_shifts, today, now)

        confirmed_shifts = _pharmacy_confirmed_shifts(member_pharmacy_ids).filter(slot_assignments__user=user).distinct()

        # Community shifts: future, pharmacy__isnull, NO assignments yet
        community_shifts = Shift.objects.filter(
            pharmacy_id__in=member_pharmacy_ids,
            visibility__in=COMMUNITY_LEVELS, # Use the constant you already have
            slots__date__gte=today
        ).exclude(
            slots__assignments__user=user # Exclude shifts they are already assigned to
        ).distinct()


        shifts_data = []
        for shift in upcoming_shifts:
            pharmacy_name = shift.pharmacy.name if shift.pharmacy else "Community"
            slot = shift.slots.order_by('date').first()
            shift_date = slot.date if slot else None
            shifts_data.append({
                'id': shift.id,
                'pharmacy_name': pharmacy_name,
                'date': shift_date,
            })

        community_shifts_data = []
        for shift in community_shifts:
            slot = shift.slots.order_by('date').first()
            shift_date = slot.date if slot else None
            community_shifts_data.append({
                'id': shift.id,
                'pharmacy_name': "Community",
                'date': shift_date,
            })

        invoices_qs = Invoice.objects.filter(user=user)
        if requested_pharmacy_id is not None:
            invoices_qs = invoices_qs.filter(pharmacy_id=requested_pharmacy_id)
        extras = _dashboard_payload_extras(
            shifts_qs=upcoming_shifts,
            confirmed_qs=confirmed_shifts,
            community_qs=community_shifts,
            invoices_qs=invoices_qs,
            selected_pharmacy=selected_pharmacy,
            today=today,
            now=now,
            open_qs=open_shifts,
            all_qs=all_active_shifts,
            dashboard_role="pharmacist",
            user=user,
        )

        data = {
            "user": user_serializer.data,
            "message": "Welcome Pharmacist!",
            "upcoming_shifts_count": upcoming_shifts.count(),
            "confirmed_shifts_count": confirmed_shifts.count(),
            "community_shifts_count": community_shifts.count(),
            "shifts": shifts_data,
            "community_shifts": community_shifts_data,
            **extras,
        }
        return Response(data)


class OtherStaffDashboard(APIView):
    permission_classes = [IsAuthenticated, IsOtherstaff]

    def get(self, request):
        user = request.user
        user_serializer = UserProfileSerializer(user)
        today = date.today()
        now = timezone.now().time()
        requested_pharmacy_id = _parse_dashboard_pharmacy_id(request)
        workspace = _parse_dashboard_workspace(request)
        member_pharmacy_ids = list(Membership.objects.filter(
            user=user, is_active=True
        ).values_list('pharmacy_id', flat=True))
        if workspace == "platform":
            public_shifts = _public_platform_shifts(today, now).filter(role_needed__in=_shift_roles_visible_to_user(user))
            confirmed_shifts = _user_confirmed_platform_shifts(user, today, now)
            invoices_qs = Invoice.objects.filter(user=user, pharmacy__isnull=True)
            extras = _dashboard_payload_extras(
                shifts_qs=public_shifts,
                confirmed_qs=confirmed_shifts,
                community_qs=public_shifts,
                invoices_qs=invoices_qs,
                selected_pharmacy=None,
                today=today,
                now=now,
                dashboard_role="otherstaff",
                user=user,
            )
            data = {
                "user": user_serializer.data,
                "message": f"Welcome {other_staff_role_label(getattr(getattr(user, 'otherstaffonboarding', None), 'role_type', None))}!",
                "upcoming_shifts_count": public_shifts.count(),
                "confirmed_shifts_count": confirmed_shifts.count(),
                "community_shifts_count": public_shifts.count(),
                "shifts": [_dashboard_shift_box(shift) for shift in public_shifts[:12]],
                "community_shifts": [_dashboard_shift_box(shift) for shift in public_shifts[:12]],
                **extras,
            }
            return Response(data)
        if requested_pharmacy_id is not None:
            if requested_pharmacy_id not in member_pharmacy_ids:
                raise PermissionDenied("You do not have access to this pharmacy.")
            member_pharmacy_ids = [requested_pharmacy_id]
        selected_pharmacy = Pharmacy.objects.filter(id=requested_pharmacy_id).first() if requested_pharmacy_id else None

        visible_shifts = _worker_visible_pharmacy_shifts(user, member_pharmacy_ids)
        upcoming_shifts = visible_shifts.filter(_future_shift_filter(today, now)).distinct()
        open_shifts = _open_active_shifts(visible_shifts, today, now)
        all_active_shifts = _all_active_shifts(visible_shifts, today, now)
        confirmed_shifts = _pharmacy_confirmed_shifts(member_pharmacy_ids).filter(slot_assignments__user=user).distinct()

        community_shifts = Shift.objects.filter(
            pharmacy_id__in=member_pharmacy_ids,
            visibility__in=COMMUNITY_LEVELS, # Use the constant you already have
            slots__date__gte=today
        ).exclude(
            slots__assignments__user=user # Exclude shifts they are already assigned to
        ).distinct()

        shifts_data = []
        for shift in upcoming_shifts:
            pharmacy_name = shift.pharmacy.name if shift.pharmacy else "Community"
            slot = shift.slots.order_by('date').first()
            shift_date = slot.date if slot else None
            shifts_data.append({
                'id': shift.id,
                'pharmacy_name': pharmacy_name,
                'date': shift_date,
            })

        community_shifts_data = []
        for shift in community_shifts:
            slot = shift.slots.order_by('date').first()
            shift_date = slot.date if slot else None
            community_shifts_data.append({
                'id': shift.id,
                'pharmacy_name': "Community",
                'date': shift_date,
            })

        invoices_qs = Invoice.objects.filter(user=user)
        if requested_pharmacy_id is not None:
            invoices_qs = invoices_qs.filter(pharmacy_id=requested_pharmacy_id)
        extras = _dashboard_payload_extras(
            shifts_qs=upcoming_shifts,
            confirmed_qs=confirmed_shifts,
            community_qs=community_shifts,
            invoices_qs=invoices_qs,
            selected_pharmacy=selected_pharmacy,
            today=today,
            now=now,
            open_qs=open_shifts,
            all_qs=all_active_shifts,
            dashboard_role="otherstaff",
            user=user,
        )

        data = {
            "user": user_serializer.data,
            "message": f"Welcome {other_staff_role_label(getattr(getattr(user, 'otherstaffonboarding', None), 'role_type', None))}!",
            "upcoming_shifts_count": upcoming_shifts.count(),
            "confirmed_shifts_count": confirmed_shifts.count(),
            "community_shifts_count": community_shifts.count(),
            "shifts": shifts_data,
            "community_shifts": community_shifts_data,
            **extras,
        }
        return Response(data)


class ExplorerDashboard(APIView):
    permission_classes = [IsAuthenticated, IsExplorer]

    def get(self, request):
        user_serializer = UserProfileSerializer(request.user)
        data = {
            "user": user_serializer.data,
            "message": "Welcome Explorer!",
            # "available_jobs": [],  # Can be populated later with available jobs
        }
        return Response(data)
