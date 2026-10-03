"""Serializers for the roster views: users, shifts and assignments."""
from django.contrib.auth import get_user_model

User = get_user_model()


from rest_framework import serializers
from memberships.models import Membership
from shifts.models import Shift, ShiftSlotAssignment
from shifts.serializers import ShiftSerializer, ShiftSlotSerializer


# === Rosters ===
class RosterUserDetailSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'first_name', 'last_name', 'email']


class RosterShiftDetailSerializer(serializers.ModelSerializer):
    pharmacy_name = serializers.CharField(source='pharmacy.name', read_only=True)
    # ADD THIS LINE:
    allowed_escalation_levels = serializers.SerializerMethodField()

    class Meta:
        model = Shift
        fields = ['id', 'role_needed', 'pharmacy_name', 'visibility', 'allowed_escalation_levels']

    def get_allowed_escalation_levels(self, obj):
        return ShiftSerializer.build_allowed_tiers(obj.pharmacy)


class RosterAssignmentSerializer(serializers.ModelSerializer):
    user_detail = RosterUserDetailSerializer(source='user', read_only=True)
    slot_detail = ShiftSlotSerializer(source='slot', read_only=True)
    shift_detail = RosterShiftDetailSerializer(source='shift', read_only=True)
    leave_request = serializers.SerializerMethodField()
    origin = serializers.SerializerMethodField()
    workforce_status = serializers.SerializerMethodField()

    class Meta:
        model = ShiftSlotAssignment
        fields = [
            "id", "slot_date", "unit_rate", "rate_reason", "is_rostered",
            "payment_preference_snapshot", "settlement_channel", "engagement_kind",
            "engagement_terms_accepted_at", "workforce_status",
            "user", "slot", "shift",
            "user_detail",
            "slot_detail",
            "shift_detail",
            "leave_request",
            "origin",
        ]

    def get_workforce_status(self, obj):
        request = self.context.get("request")
        if request is not None and obj.user_id != request.user.id:
            from workforce.permissions import can_manage_pharmacy
            if not can_manage_pharmacy(request.user, obj.shift.pharmacy):
                return None

        snapshot = obj.engagement_terms_snapshot or {}
        timesheet = None
        if obj.user_id and obj.shift_id and obj.slot_date:
            prefetched = list(obj.user.workforce_timesheets.all())
            matches = [
                row for row in prefetched
                if row.period.pharmacy_id == obj.shift.pharmacy_id
                and row.period.start_date <= obj.slot_date <= row.period.end_date
            ]
            if matches:
                timesheet = max(matches, key=lambda row: (row.period.start_date, row.id))

        rates = snapshot.get("rates") or {}
        occurrences = snapshot.get("occurrences") or []
        occurrence = next(
            (item for item in occurrences if str(item.get("date") or "") == str(obj.slot_date)),
            occurrences[0] if occurrences else {},
        )
        agreed_rate = (
            occurrence.get("agreed_rate")
            or snapshot.get("agreed_rate")
            or obj.unit_rate
        )
        return {
            "payment_preference": obj.payment_preference_snapshot or snapshot.get("payment_preference") or "",
            "settlement_channel": obj.settlement_channel or snapshot.get("settlement_channel") or "",
            "engagement_kind": obj.engagement_kind or snapshot.get("engagement_kind") or "",
            "employment_type": snapshot.get("employment_type") or "",
            "pay_basis": snapshot.get("pay_basis") or "",
            "award_code": snapshot.get("award_code") or "",
            "award_classification": snapshot.get("award_classification") or "",
            "employment_engagement_public_id": snapshot.get("employment_engagement_public_id"),
            "rates": rates,
            "agreed_rate": str(agreed_rate) if agreed_rate not in (None, "") else None,
            "payroll_ready": (
                (obj.settlement_channel or snapshot.get("settlement_channel")) != "PAYROLL"
                or bool(obj.payroll_activated_at)
                or not bool(snapshot.get("payroll_activation_required"))
            ),
            "payroll_activation_required": bool(snapshot.get("payroll_activation_required")),
            "payroll_missing_fields": snapshot.get("payroll_missing_fields") or [],
            "payroll_activated_at": obj.payroll_activated_at.isoformat() if obj.payroll_activated_at else None,
            "timesheet": {
                "id": timesheet.id,
                "period_id": timesheet.period_id,
                "period_status": timesheet.period.status,
                "status": timesheet.status,
                "needs_rebuild": timesheet.needs_rebuild,
                "rostered_minutes": timesheet.rostered_minutes,
                "worked_minutes": timesheet.worked_minutes,
                "reviewed_minutes": timesheet.reviewed_minutes,
                "blocking_checks": timesheet.blocking_checks,
                "warning_checks": timesheet.warning_checks,
            } if timesheet else None,
        }

    def get_leave_request(self, obj):
        from workforce.models import WorkforceLeaveRequest

        leave = WorkforceLeaveRequest.objects.filter(
            slot_assignment=obj,
            user_id=obj.user_id,
            status__in=[
                WorkforceLeaveRequest.Status.PENDING,
                WorkforceLeaveRequest.Status.APPROVED,
            ],
        ).order_by("-created_at", "-id").first()
        if leave:
            return {
                "id": leave.id,
                "leave_type": leave.leave_type,
                "status": leave.status,
                "note": leave.note,
                "date_applied": leave.created_at,
                "date_resolved": leave.decided_at,
            }
        return None

    def get_origin(self, obj):
        """
        Returns a small descriptor showing where this worker came from
        relative to the shift's pharmacy: pharmacy staff, favourite staff
        (locum/shift hero in the same pharmacy), chain staff, organization
        staff (with org name), or public ChemistTasker pool.
        """
        shift = getattr(obj, "shift", None)
        user = getattr(obj, "user", None)
        if not shift or not user or not shift.pharmacy:
            return {"type": "UNKNOWN", "label": "Unknown"}

        pharmacy = shift.pharmacy

        # 1) Direct membership in the pharmacy
        membership = Membership.objects.filter(
            user=user,
            pharmacy=pharmacy,
            is_active=True
        ).first()
        if membership:
            if membership.employment_type in ("LOCUM", "SHIFT_HERO"):
                return {"type": "FAV_STAFF", "label": "Fav Staff"}
            return {"type": "PHARMACY_STAFF", "label": "Pharmacy staff"}

        # 2) Membership in any pharmacy that sits in the same chain(s)
        chain_qs = pharmacy.chains.all()
        if chain_qs.exists():
            org_name = chain_qs.filter(
                organization__isnull=False,
                pharmacies__memberships__user=user,
                pharmacies__memberships__is_active=True
            ).values_list("organization__name", flat=True).distinct().first()
            if org_name:
                return {
                    "type": "ORG_STAFF",
                    "label": f"Organization staff ({org_name})",
                    "organization_name": org_name,
                }
            owner_chain_match = chain_qs.filter(
                organization__isnull=True,
                pharmacies__memberships__user=user,
                pharmacies__memberships__is_active=True
            ).exists()
            if owner_chain_match:
                return {"type": "CHAIN_STAFF", "label": "Chain staff"}

        # 3) Public/other pool
        return {"type": "PUBLIC", "label": "ChemistTasker"}
