from __future__ import annotations

import uuid
from decimal import Decimal
from datetime import datetime, timedelta

from django.core.exceptions import PermissionDenied as DjangoPermissionDenied
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from django.utils.dateparse import parse_date, parse_datetime, parse_time
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from client_profile.models import AttendanceSession, Membership, Pharmacy, RosterPeriod
from client_profile.timezone_utils import get_pharmacy_timezone

from .attendance_edits import append_missing_punch
from .award_rates import (
    AWARD_CODE,
    AWARD_EFFECTIVE_FROM,
    AWARD_SOURCE_LABEL,
    AWARD_SOURCE_URL,
    classification_options,
    default_membership_classification,
    resolve_award_schedule,
)

from .employment_terms import correspondence_profile, normalise_part_time_pattern

from .models import (
    CoverageRequirement,
    EmploymentEngagement,
    MembershipWorkSettings,
    Timesheet,
    TimesheetCheck,
    TimesheetCheckDecision,
    TimesheetPeriod,
    WorkforceLeaveRequest,
)
from .permissions import can_manage_pharmacy, can_view_worker_timesheet, require_manage_pharmacy
from .roster import publish_period_command, serialize_workspace, validate_period_command
from .tasks import rebuild_timesheet_period_task, rebuild_timesheet_task
from .timesheets import (
    add_comment,
    approve_timesheet,
    build_timesheet,
    decide_check,
    ensure_period_timesheets,
    lock_period,
    period_summary,
    rebuild_period,
    reopen_timesheet,
    serialize_timesheet,
    submit_timesheet,
)


def _validation_response(exc, default_status=status.HTTP_400_BAD_REQUEST):
    if hasattr(exc, "message_dict"):
        payload = exc.message_dict
        if payload.get("code") == ["ROSTER_REVISION_CONFLICT"] or payload.get("code") == "ROSTER_REVISION_CONFLICT":
            return Response(payload, status=status.HTTP_409_CONFLICT)
        return Response(payload, status=default_status)
    messages = getattr(exc, "messages", None)
    return Response({"error": "; ".join(messages) if messages else str(exc)}, status=default_status)


def _pharmacy(pk):
    try:
        return Pharmacy.objects.get(pk=int(pk))
    except (Pharmacy.DoesNotExist, TypeError, ValueError):
        raise DjangoValidationError("Valid pharmacy_id is required.")


def _parse_required_date(value, label):
    parsed = parse_date(str(value or ""))
    if not parsed:
        raise DjangoValidationError(f"{label} must be YYYY-MM-DD.")
    return parsed


def _parse_required_datetime(value, label):
    parsed = parse_datetime(str(value or ""))
    if not parsed:
        raise DjangoValidationError(f"{label} must be an ISO-8601 datetime.")
    if timezone.is_naive(parsed):
        raise DjangoValidationError(f"{label} must include a timezone offset.")
    return parsed


def _serialize_engagement(row):
    membership = row.membership
    user = membership.user
    correspondence = correspondence_profile(row.employment_type, row.pay_basis)
    return {
        "id": row.pk,
        "public_id": str(row.public_id),
        "membership_id": membership.pk,
        "pharmacy_id": membership.pharmacy_id,
        "worker_id": membership.user_id,
        "worker_name": user.get_full_name() or user.email,
        "role": row.role,
        "employment_type": row.employment_type,
        "job_title": row.job_title,
        "effective_from": str(row.effective_from),
        "effective_to": str(row.effective_to) if row.effective_to else None,
        "pay_basis": row.pay_basis,
        "award_code": row.award_code,
        "award_classification": row.award_classification,
        "award_source_label": row.award_source_label,
        "award_source_url": row.award_source_url,
        "award_effective_from": str(row.award_effective_from) if row.award_effective_from else None,
        "award_rate_snapshot": row.award_rate_snapshot,
        "adult_rate_confirmed": row.award_rate_snapshot.get("adult_rate_confirmed"),
        "ordinary_hours_pattern": row.ordinary_hours_pattern,
        "correspondence": {
            **correspondence,
            "employment_type": row.employment_type,
            "pay_basis": row.pay_basis,
            "award_code": row.award_code,
            "award_classification": row.award_classification,
            "award_source_label": row.award_source_label,
            "award_source_url": row.award_source_url,
            "ordinary_hours_pattern": row.ordinary_hours_pattern,
            "rates": {
                "weekday": str(row.rate_weekday),
                "saturday": str(row.rate_saturday),
                "sunday": str(row.rate_sunday),
                "public_holiday": str(row.rate_public_holiday),
                "early_morning": str(row.rate_early_morning) if row.rate_early_morning is not None else None,
                "late_night": str(row.rate_late_night) if row.rate_late_night is not None else None,
            },
        },
        "rate_weekday": str(row.rate_weekday),
        "rate_saturday": str(row.rate_saturday),
        "rate_sunday": str(row.rate_sunday),
        "rate_public_holiday": str(row.rate_public_holiday),
        "rate_early_morning": str(row.rate_early_morning) if row.rate_early_morning is not None else None,
        "rate_late_night": str(row.rate_late_night) if row.rate_late_night is not None else None,
        "early_morning_applicable": row.early_morning_applicable,
        "late_night_applicable": row.late_night_applicable,
        "notes": row.notes,
        "created_at": row.created_at.isoformat(),
        "updated_at": row.updated_at.isoformat(),
        "terms_editable": row.effective_from > timezone.localdate(),
    }


def _engagement_membership(pk):
    try:
        return Membership.objects.select_related("pharmacy", "user").get(pk=int(pk))
    except (Membership.DoesNotExist, TypeError, ValueError):
        raise DjangoValidationError({"membership_id": "Valid membership_id is required."})


def _engagement_payload(request_data, membership, *, existing=None):
    role = str(request_data.get("role") or getattr(existing, "role", None) or membership.role or "").upper()
    employment_type = str(
        request_data.get("employment_type")
        or getattr(existing, "employment_type", None)
        or membership.employment_type
        or ""
    ).upper()
    if role != str(membership.role or "").upper():
        raise DjangoValidationError({"role": "Engagement role must match the membership role."})
    if employment_type not in {"FULL_TIME", "PART_TIME", "CASUAL"}:
        raise DjangoValidationError(
            {"employment_type": "Employment engagement must be FULL_TIME, PART_TIME or CASUAL."}
        )

    pay_basis = str(request_data.get("pay_basis") or getattr(existing, "pay_basis", None) or "").upper()
    if pay_basis not in {EmploymentEngagement.PayBasis.AWARD, EmploymentEngagement.PayBasis.ABOVE_AWARD}:
        raise DjangoValidationError({"pay_basis": "Choose AWARD or ABOVE_AWARD."})

    classification = str(
        request_data.get("award_classification")
        or getattr(existing, "award_classification", None)
        or default_membership_classification(membership)
        or ""
    ).upper()

    def request_bool(key, fallback=False):
        raw = request_data.get(key, fallback)
        if isinstance(raw, bool):
            return raw
        if isinstance(raw, str):
            lowered = raw.strip().lower()
            if lowered in {"true", "1", "yes", "on"}:
                return True
            if lowered in {"false", "0", "no", "off", ""}:
                return False
        return bool(raw)

    existing_adult_confirmation = bool(
        getattr(existing, "award_rate_snapshot", {}).get("adult_rate_confirmed")
        if existing
        else False
    )
    adult_rate_confirmed = request_bool("adult_rate_confirmed", existing_adult_confirmation)
    adult_confirmation_required = (
        role == "ASSISTANT" and classification in {"LEVEL_1", "LEVEL_2"}
    )
    if adult_confirmation_required and not adult_rate_confirmed:
        raise DjangoValidationError(
            {
                "adult_rate_confirmed": (
                    "Pharmacy assistant levels 1 and 2 have junior rates under age 21. "
                    "Confirm the employee is 21 or older before using this adult Schedule B rate."
                )
            }
        )

    if employment_type == "PART_TIME":
        raw_pattern = request_data.get(
            "ordinary_hours_pattern",
            getattr(existing, "ordinary_hours_pattern", None) if existing else None,
        )
        ordinary_hours_pattern = normalise_part_time_pattern(raw_pattern)
    else:
        ordinary_hours_pattern = {}

    # Fail closed if the employment/pay combination has no correspondence profile.
    correspondence_profile(employment_type, pay_basis)

    # Always resolve the Award underpinning. For above-award engagements this is
    # retained as the correspondence/minimum floor rather than discarded.
    resolved = resolve_award_schedule(
        role=role,
        classification=classification,
        employment_type=employment_type,
    )
    resolved["adult_rate_confirmed"] = adult_rate_confirmed if adult_confirmation_required else None

    payload = {
        "role": role,
        "employment_type": employment_type,
        "job_title": str(
            request_data.get("job_title", getattr(existing, "job_title", membership.job_title or ""))
            or ""
        ).strip(),
        "pay_basis": pay_basis,
        "award_code": AWARD_CODE,
        "award_classification": classification,
        "award_source_label": AWARD_SOURCE_LABEL,
        "award_source_url": AWARD_SOURCE_URL,
        "award_effective_from": parse_date(AWARD_EFFECTIVE_FROM),
        "ordinary_hours_pattern": ordinary_hours_pattern,
        "notes": str(request_data.get("notes", getattr(existing, "notes", "")) or "").strip(),
    }

    if pay_basis == EmploymentEngagement.PayBasis.AWARD:
        payload.update(
            award_rate_snapshot=resolved,
            rate_weekday=resolved["rate_weekday"],
            rate_saturday=resolved["rate_saturday"],
            rate_sunday=resolved["rate_sunday"],
            rate_public_holiday=resolved["rate_public_holiday"],
            rate_early_morning=resolved["rate_early_morning"],
            rate_late_night=resolved["rate_late_night"],
            early_morning_applicable=bool(resolved["early_morning_applicable"]),
            late_night_applicable=bool(resolved["late_night_applicable"]),
        )
        return payload

    def required_rate(key):
        raw = request_data.get(key, getattr(existing, key, None) if existing else None)
        if raw in (None, ""):
            raise DjangoValidationError({key: "An agreed hourly rate is required."})
        try:
            value = Decimal(str(raw))
        except Exception as exc:
            raise DjangoValidationError({key: "Enter a valid hourly rate."}) from exc
        if value < 0:
            raise DjangoValidationError({key: "Rate cannot be negative."})
        return value

    agreed = {
        "rate_weekday": required_rate("rate_weekday"),
        "rate_saturday": required_rate("rate_saturday"),
        "rate_sunday": required_rate("rate_sunday"),
        "rate_public_holiday": required_rate("rate_public_holiday"),
    }

    floor_by_field = {
        "rate_weekday": Decimal(resolved["rate_weekday"]),
        "rate_saturday": Decimal(resolved["rate_saturday"]),
        "rate_sunday": Decimal(resolved["rate_sunday"]),
        "rate_public_holiday": Decimal(resolved["rate_public_holiday"]),
    }
    for key, floor in floor_by_field.items():
        if agreed[key] < floor:
            raise DjangoValidationError(
                {key: "Above-award rate cannot be below the selected Award minimum of $" + f"{floor:.2f}/hr."}
            )

    early_applies = request_bool(
        "early_morning_applicable",
        getattr(existing, "early_morning_applicable", False) if existing else False,
    )
    late_applies = request_bool(
        "late_night_applicable",
        getattr(existing, "late_night_applicable", False) if existing else False,
    )
    early_rate = required_rate("rate_early_morning") if early_applies else None
    late_rate = required_rate("rate_late_night") if late_applies else None

    if early_rate is not None and early_rate < Decimal(resolved["rate_early_morning"]):
        raise DjangoValidationError(
            {
                "rate_early_morning": (
                    "Above-award early-morning rate cannot be below the selected Award minimum of $"
                    + f"{Decimal(resolved['rate_early_morning']):.2f}/hr."
                )
            }
        )
    if late_rate is not None and late_rate < Decimal(resolved["rate_late_night"]):
        raise DjangoValidationError(
            {
                "rate_late_night": (
                    "Above-award late-night rate cannot be below the selected Award minimum of $"
                    + f"{Decimal(resolved['rate_late_night']):.2f}/hr."
                )
            }
        )

    def max_rate(agreed_rate, award_rate):
        return str(max(Decimal(str(agreed_rate)), Decimal(str(award_rate))).quantize(Decimal("0.01")))

    # Payroll can use this ordinary-hours floor even when the written agreement
    # only specifies summary weekday/weekend rates. It never lets an agreed
    # above-award rate suppress a higher Award penalty window.
    effective_ordinary_schedule = {
        "weekday": {
            "daytime_08_19": max_rate(agreed["rate_weekday"], resolved["schedule"]["weekday"]["daytime_08_19"]),
            "early_07_08": max_rate(early_rate or agreed["rate_weekday"], resolved["schedule"]["weekday"]["early_07_08"]),
            "evening_19_21": max_rate(agreed["rate_weekday"], resolved["schedule"]["weekday"]["evening_19_21"]),
            "late_21_24": max_rate(late_rate or agreed["rate_weekday"], resolved["schedule"]["weekday"]["late_21_24"]),
        },
        "saturday": {
            key: max_rate(agreed["rate_saturday"], award_rate)
            for key, award_rate in resolved["schedule"]["saturday"].items()
        },
        "sunday": {
            key: max_rate(agreed["rate_sunday"], award_rate)
            for key, award_rate in resolved["schedule"]["sunday"].items()
        },
        "public_holiday": {
            "all_day": max_rate(
                agreed["rate_public_holiday"],
                resolved["schedule"]["public_holiday"]["all_day"],
            )
        },
    }

    agreed_snapshot = {
        **{key: str(value.quantize(Decimal("0.01"))) for key, value in agreed.items()},
        "rate_early_morning": str(early_rate.quantize(Decimal("0.01"))) if early_rate is not None else None,
        "rate_late_night": str(late_rate.quantize(Decimal("0.01"))) if late_rate is not None else None,
        "early_morning_applicable": early_applies,
        "late_night_applicable": late_applies,
    }

    payload.update(
        award_rate_snapshot={
            "kind": "ABOVE_AWARD",
            "award_floor": resolved,
            "agreed_rates": agreed_snapshot,
            "effective_ordinary_schedule": effective_ordinary_schedule,
            "overtime_floor": resolved["schedule"]["overtime"],
            "note": (
                "Agreed summary rates are checked against the Award. For penalty "
                "windows without a separately agreed rate, payroll must use at least "
                "the higher of the agreed summary rate and the frozen Award floor."
            ),
        },
        rate_weekday=agreed["rate_weekday"],
        rate_saturday=agreed["rate_saturday"],
        rate_sunday=agreed["rate_sunday"],
        rate_public_holiday=agreed["rate_public_holiday"],
        rate_early_morning=early_rate,
        rate_late_night=late_rate,
        early_morning_applicable=early_applies,
        late_night_applicable=late_applies,
    )
    return payload


class EmploymentEngagementAwardPreviewView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        try:
            membership = _engagement_membership(request.data.get("membership_id"))
            require_manage_pharmacy(request.user, membership.pharmacy)
            role = str(membership.role or "").upper()
            employment_type = str(request.data.get("employment_type") or membership.employment_type or "").upper()
            classification = str(
                request.data.get("award_classification")
                or default_membership_classification(membership)
                or ""
            ).upper()
            resolved = resolve_award_schedule(
                role=role,
                classification=classification,
                employment_type=employment_type,
            )
            return Response({
                **resolved,
                "classification_options": classification_options(role),
                "default_classification": default_membership_classification(membership),
            })
        except DjangoPermissionDenied as exc:
            return Response({"error": str(exc)}, status=status.HTTP_403_FORBIDDEN)
        except DjangoValidationError as exc:
            return _validation_response(exc)


class EmploymentEngagementListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        try:
            pharmacy = _pharmacy(request.query_params.get("pharmacy_id"))
            require_manage_pharmacy(request.user, pharmacy)
            qs = EmploymentEngagement.objects.filter(
                membership__pharmacy=pharmacy
            ).select_related("membership__user", "membership__pharmacy")
            membership_id = request.query_params.get("membership_id")
            if membership_id:
                qs = qs.filter(membership_id=membership_id)
            rows = [_serialize_engagement(row) for row in qs.order_by("membership_id", "-effective_from")]
            return Response(rows)
        except DjangoPermissionDenied as exc:
            return Response({"error": str(exc)}, status=status.HTTP_403_FORBIDDEN)
        except DjangoValidationError as exc:
            return _validation_response(exc)

    def post(self, request):
        try:
            membership = _engagement_membership(request.data.get("membership_id"))
            require_manage_pharmacy(request.user, membership.pharmacy)
            effective_from = _parse_required_date(request.data.get("effective_from"), "effective_from")
            effective_to_raw = request.data.get("effective_to")
            effective_to = _parse_required_date(effective_to_raw, "effective_to") if effective_to_raw else None
            payload = _engagement_payload(request.data, membership)
            supersedes_public_id = request.data.get("supersedes_public_id")

            with transaction.atomic():
                Membership.objects.select_for_update().get(pk=membership.pk)

                if supersedes_public_id:
                    try:
                        previous = EmploymentEngagement.objects.select_for_update().get(
                            public_id=supersedes_public_id,
                            membership=membership,
                        )
                    except (EmploymentEngagement.DoesNotExist, ValueError) as exc:
                        raise DjangoValidationError(
                            {"supersedes_public_id": "The engagement being superseded was not found for this worker."}
                        ) from exc
                    if effective_from <= previous.effective_from:
                        raise DjangoValidationError(
                            {"effective_from": "Successor engagement must start after the engagement it supersedes."}
                        )
                    previous.effective_to = effective_from - timedelta(days=1)
                    previous.updated_by = request.user
                    previous.full_clean()
                    previous.save(update_fields=["effective_to", "updated_by", "updated_at"])

                row = EmploymentEngagement(
                    membership=membership,
                    effective_from=effective_from,
                    effective_to=effective_to,
                    created_by=request.user,
                    updated_by=request.user,
                    **payload,
                )
                row.full_clean()
                row.save()
            row = EmploymentEngagement.objects.select_related(
                "membership__user", "membership__pharmacy"
            ).get(pk=row.pk)
            return Response(_serialize_engagement(row), status=status.HTTP_201_CREATED)
        except DjangoPermissionDenied as exc:
            return Response({"error": str(exc)}, status=status.HTTP_403_FORBIDDEN)
        except DjangoValidationError as exc:
            return _validation_response(exc)


class EmploymentEngagementDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def patch(self, request, public_id):
        try:
            with transaction.atomic():
                row = EmploymentEngagement.objects.select_for_update().select_related(
                    "membership__pharmacy", "membership__user"
                ).get(public_id=public_id)
                require_manage_pharmacy(request.user, row.membership.pharmacy)
                Membership.objects.select_for_update().get(pk=row.membership_id)

                started = row.effective_from <= timezone.localdate()
                if started:
                    allowed = {"effective_to", "notes"}
                    forbidden = sorted(set(request.data.keys()) - allowed)
                    if forbidden:
                        raise DjangoValidationError(
                            {
                                "error": (
                                    "An engagement that has started is payroll-historical. "
                                    "Only its end date and notes may be changed; create a "
                                    "successor engagement for new employment or pay terms."
                                ),
                                "immutable_fields": forbidden,
                            }
                        )
                    if "effective_to" in request.data:
                        row.effective_to = (
                            _parse_required_date(request.data.get("effective_to"), "effective_to")
                            if request.data.get("effective_to")
                            else None
                        )
                    if "notes" in request.data:
                        row.notes = str(request.data.get("notes") or "").strip()
                else:
                    if "effective_from" in request.data:
                        row.effective_from = _parse_required_date(
                            request.data.get("effective_from"), "effective_from"
                        )
                    if "effective_to" in request.data:
                        row.effective_to = (
                            _parse_required_date(request.data.get("effective_to"), "effective_to")
                            if request.data.get("effective_to")
                            else None
                        )
                    payload = _engagement_payload(request.data, row.membership, existing=row)
                    for key, value in payload.items():
                        setattr(row, key, value)

                row.updated_by = request.user
                row.full_clean()
                row.save()

            return Response(_serialize_engagement(row))
        except EmploymentEngagement.DoesNotExist:
            return Response({"error": "Employment engagement not found."}, status=status.HTTP_404_NOT_FOUND)
        except DjangoPermissionDenied as exc:
            return Response({"error": str(exc)}, status=status.HTTP_403_FORBIDDEN)
        except DjangoValidationError as exc:
            return _validation_response(exc)


class RosterWorkspaceView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        try:
            pharmacy = _pharmacy(request.query_params.get("pharmacy_id"))
            require_manage_pharmacy(request.user, pharmacy)
            week_start = _parse_required_date(request.query_params.get("week_start"), "week_start")
            if week_start.weekday() != 0:
                raise DjangoValidationError("week_start must be a Monday.")
            return Response(serialize_workspace(pharmacy, week_start))
        except DjangoPermissionDenied as exc:
            return Response({"error": str(exc)}, status=status.HTTP_403_FORBIDDEN)
        except DjangoValidationError as exc:
            return _validation_response(exc)


class RosterValidateRevisionView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        try:
            period = RosterPeriod.objects.select_related("pharmacy").get(pk=request.data.get("period_id"))
            result = validate_period_command(
                user=request.user,
                period=period,
                expected_revision=int(request.data.get("expected_revision")),
            )
            return Response(result)
        except RosterPeriod.DoesNotExist:
            return Response({"error": "Roster period not found."}, status=status.HTTP_404_NOT_FOUND)
        except (TypeError, ValueError):
            return Response({"error": "expected_revision is required."}, status=status.HTTP_400_BAD_REQUEST)
        except DjangoPermissionDenied as exc:
            return Response({"error": str(exc)}, status=status.HTTP_403_FORBIDDEN)
        except DjangoValidationError as exc:
            return _validation_response(exc, status.HTTP_409_CONFLICT)


class RosterPublishRevisionView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        try:
            period = RosterPeriod.objects.select_related("pharmacy").get(pk=request.data.get("period_id"))
            operation_id = request.data.get("operation_id") or str(uuid.uuid4())
            result = publish_period_command(
                user=request.user,
                period=period,
                expected_revision=int(request.data.get("expected_revision")),
                operation_id=operation_id,
                acknowledged_warning_keys=request.data.get("acknowledged_warning_keys") or [],
            )
            return Response(result)
        except RosterPeriod.DoesNotExist:
            return Response({"error": "Roster period not found."}, status=status.HTTP_404_NOT_FOUND)
        except (TypeError, ValueError):
            return Response({"error": "expected_revision is required."}, status=status.HTTP_400_BAD_REQUEST)
        except DjangoPermissionDenied as exc:
            return Response({"error": str(exc)}, status=status.HTTP_403_FORBIDDEN)
        except DjangoValidationError as exc:
            return _validation_response(exc, status.HTTP_409_CONFLICT)


class MembershipWorkSettingsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        try:
            pharmacy = _pharmacy(request.query_params.get("pharmacy_id"))
            require_manage_pharmacy(request.user, pharmacy)
            memberships = Membership.objects.filter(
                pharmacy=pharmacy, is_active=True, status=Membership.Status.ACCEPTED
            ).exclude(role="CONTACT").select_related("user").order_by("user__first_name", "user__last_name", "pk")
            rows = []
            for membership in memberships:
                settings = MembershipWorkSettings.objects.filter(membership=membership).first()
                rows.append({
                    "membership_id": membership.pk,
                    "worker_id": membership.user_id,
                    "worker_name": membership.user.get_full_name() or membership.user.username,
                    "role": membership.role,
                    "employment_type": membership.employment_type,
                    "employment_engagement_eligible": membership.employment_type in {"FULL_TIME", "PART_TIME", "CASUAL"},
                    "award_classification_options": classification_options(membership.role),
                    "default_award_classification": default_membership_classification(membership),
                    "contracted_weekly_minutes": settings.contracted_weekly_minutes if settings else None,
                    "effective_from": str(settings.effective_from) if settings and settings.effective_from else None,
                    "work_pattern": settings.work_pattern if settings else {},
                })
            return Response(rows)
        except DjangoPermissionDenied as exc:
            return Response({"error": str(exc)}, status=status.HTTP_403_FORBIDDEN)
        except DjangoValidationError as exc:
            return _validation_response(exc)

    def post(self, request):
        try:
            membership = Membership.objects.select_related("pharmacy", "user").get(pk=request.data.get("membership_id"))
            require_manage_pharmacy(request.user, membership.pharmacy)
            raw_minutes = request.data.get("contracted_weekly_minutes")
            minutes = None if raw_minutes in (None, "") else int(raw_minutes)
            if minutes is not None and (minutes < 0 or minutes > 7 * 24 * 60):
                raise DjangoValidationError("contracted_weekly_minutes is outside the supported range.")
            raw_effective_from = request.data.get("effective_from")
            effective_from = parse_date(str(raw_effective_from or "")) if raw_effective_from else None
            if raw_effective_from and not effective_from:
                raise DjangoValidationError("effective_from must be YYYY-MM-DD.")
            work_pattern = request.data.get("work_pattern") or {}
            if not isinstance(work_pattern, dict):
                raise DjangoValidationError("work_pattern must be an object.")
            row, _ = MembershipWorkSettings.objects.update_or_create(
                membership=membership,
                defaults={
                    "contracted_weekly_minutes": minutes,
                    "effective_from": effective_from,
                    "work_pattern": work_pattern,
                },
            )
            return Response({
                "membership_id": membership.pk,
                "contracted_weekly_minutes": row.contracted_weekly_minutes,
                "effective_from": str(row.effective_from) if row.effective_from else None,
                "work_pattern": row.work_pattern,
            })
        except Membership.DoesNotExist:
            return Response({"error": "Membership not found."}, status=status.HTTP_404_NOT_FOUND)
        except (TypeError, ValueError, DjangoValidationError) as exc:
            return _validation_response(exc)
        except DjangoPermissionDenied as exc:
            return Response({"error": str(exc)}, status=status.HTTP_403_FORBIDDEN)


class CoverageRequirementListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        try:
            pharmacy = _pharmacy(request.query_params.get("pharmacy_id"))
            require_manage_pharmacy(request.user, pharmacy)
            rows = CoverageRequirement.objects.filter(pharmacy=pharmacy).order_by("weekday", "start_time", "role")
            return Response([{ 
                "id": row.pk, "pharmacy_id": row.pharmacy_id, "weekday": row.weekday,
                "start_time": row.start_time.isoformat(timespec="minutes"), "end_time": row.end_time.isoformat(timespec="minutes"),
                "role": row.role, "minimum_staff": row.minimum_staff, "active": row.active,
            } for row in rows])
        except DjangoPermissionDenied as exc:
            return Response({"error": str(exc)}, status=status.HTTP_403_FORBIDDEN)
        except DjangoValidationError as exc:
            return _validation_response(exc)

    def post(self, request):
        try:
            pharmacy = _pharmacy(request.data.get("pharmacy_id"))
            require_manage_pharmacy(request.user, pharmacy)
            start_time = parse_time(str(request.data.get("start_time") or ""))
            end_time = parse_time(str(request.data.get("end_time") or ""))
            if not start_time or not end_time:
                raise DjangoValidationError("start_time and end_time must be HH:MM.")
            role = str(request.data.get("role") or "").upper()
            if role not in {"PHARMACIST", "INTERN", "TECHNICIAN", "ASSISTANT", "STUDENT", "EXPLORER"}:
                raise DjangoValidationError("role is not a supported ChemistTasker roster role.")
            row = CoverageRequirement(
                pharmacy=pharmacy,
                weekday=int(request.data.get("weekday")),
                start_time=start_time,
                end_time=end_time,
                role=role,
                minimum_staff=int(request.data.get("minimum_staff") or 1),
                active=bool(request.data.get("active", True)),
            )
            row.full_clean()
            row.save()
            return Response({"id": row.pk}, status=status.HTTP_201_CREATED)
        except (TypeError, ValueError, DjangoValidationError) as exc:
            return _validation_response(exc)
        except DjangoPermissionDenied as exc:
            return Response({"error": str(exc)}, status=status.HTTP_403_FORBIDDEN)


class CoverageRequirementDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def delete(self, request, pk):
        try:
            row = CoverageRequirement.objects.select_related("pharmacy").get(pk=pk)
            require_manage_pharmacy(request.user, row.pharmacy)
            row.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)
        except CoverageRequirement.DoesNotExist:
            return Response({"error": "Coverage requirement not found."}, status=status.HTTP_404_NOT_FOUND)
        except DjangoPermissionDenied as exc:
            return Response({"error": str(exc)}, status=status.HTTP_403_FORBIDDEN)


class WorkforceLeaveListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        pharmacy_id = request.query_params.get("pharmacy_id")
        qs = WorkforceLeaveRequest.objects.select_related("pharmacy", "user", "membership", "decided_by")
        try:
            if pharmacy_id:
                pharmacy = _pharmacy(pharmacy_id)
                if can_manage_pharmacy(request.user, pharmacy):
                    qs = qs.filter(pharmacy=pharmacy)
                else:
                    qs = qs.filter(pharmacy=pharmacy, user=request.user)
            else:
                qs = qs.filter(user=request.user)
        except DjangoValidationError as exc:
            return _validation_response(exc)
        if request.query_params.get("status"):
            qs = qs.filter(status=request.query_params["status"])
        return Response([{
            "id": row.pk, "pharmacy_id": row.pharmacy_id, "pharmacy_name": row.pharmacy.name,
            "user_id": row.user_id, "worker_name": row.user.get_full_name() or row.user.username,
            "membership_id": row.membership_id, "leave_type": row.leave_type,
            "start_at": row.start_at.isoformat(), "end_at": row.end_at.isoformat(),
            "status": row.status, "note": row.note,
            "manager_note": row.manager_note if can_manage_pharmacy(request.user, row.pharmacy) else "",
            "created_at": row.created_at.isoformat(),
        } for row in qs.order_by("-start_at", "-id")[:500]])

    def post(self, request):
        try:
            membership = Membership.objects.select_related("pharmacy", "user").get(
                pk=request.data.get("membership_id"),
                user=request.user,
                is_active=True,
                status=Membership.Status.ACCEPTED,
            )
            start_at = _parse_required_datetime(request.data.get("start_at"), "start_at")
            end_at = _parse_required_datetime(request.data.get("end_at"), "end_at")
            if end_at <= start_at:
                raise DjangoValidationError("end_at must be after start_at.")
            row = WorkforceLeaveRequest(
                pharmacy=membership.pharmacy,
                membership=membership,
                user=request.user,
                leave_type=request.data.get("leave_type"),
                start_at=start_at,
                end_at=end_at,
                note=(request.data.get("note") or "").strip(),
            )
            row.full_clean()
            row.save()
            return Response({"id": row.pk, "status": row.status}, status=status.HTTP_201_CREATED)
        except Membership.DoesNotExist:
            return Response({"error": "Select one of your active pharmacy memberships."}, status=status.HTTP_403_FORBIDDEN)
        except DjangoValidationError as exc:
            return _validation_response(exc)


class WorkforceLeaveDecisionView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        try:
            with transaction.atomic():
                row = WorkforceLeaveRequest.objects.select_for_update().select_related("pharmacy").get(pk=pk)
                decision = str(request.data.get("decision") or "").upper()
                if decision == WorkforceLeaveRequest.Status.CANCELLED:
                    if row.user_id != request.user.pk:
                        raise DjangoPermissionDenied("Workers can only cancel their own leave requests.")
                    if row.status != WorkforceLeaveRequest.Status.PENDING:
                        raise DjangoValidationError("Only a pending leave request can be cancelled by the worker.")
                    row.status = WorkforceLeaveRequest.Status.CANCELLED
                    row.save(update_fields=["status", "updated_at"])
                    return Response({"id": row.pk, "status": row.status})

                require_manage_pharmacy(request.user, row.pharmacy)
                if decision not in {WorkforceLeaveRequest.Status.APPROVED, WorkforceLeaveRequest.Status.REJECTED}:
                    raise DjangoValidationError("decision must be APPROVED, REJECTED, or worker-owned CANCELLED.")
                if row.status != WorkforceLeaveRequest.Status.PENDING:
                    raise DjangoValidationError("Only pending leave requests can be approved or rejected.")
                if decision == WorkforceLeaveRequest.Status.APPROVED and WorkforceLeaveRequest.objects.filter(
                    user_id=row.user_id, pharmacy_id=row.pharmacy_id,
                    status=WorkforceLeaveRequest.Status.APPROVED,
                    start_at__lt=row.end_at, end_at__gt=row.start_at,
                ).exclude(pk=row.pk).exists():
                    raise DjangoValidationError("This leave request overlaps another approved leave request for the worker.")
                row.status = decision
                row.manager_note = (request.data.get("manager_note") or "").strip()
                row.decided_by = request.user
                row.decided_at = timezone.now()
                row.save(update_fields=["status", "manager_note", "decided_by", "decided_at", "updated_at"])
                return Response({"id": row.pk, "status": row.status})
        except WorkforceLeaveRequest.DoesNotExist:
            return Response({"error": "Leave request not found."}, status=status.HTTP_404_NOT_FOUND)
        except DjangoPermissionDenied as exc:
            return Response({"error": str(exc)}, status=status.HTTP_403_FORBIDDEN)
        except DjangoValidationError as exc:
            return _validation_response(exc)


class TimesheetPeriodListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        try:
            pharmacy = _pharmacy(request.query_params.get("pharmacy_id"))
            require_manage_pharmacy(request.user, pharmacy)
        except DjangoPermissionDenied as exc:
            return Response({"error": str(exc)}, status=status.HTTP_403_FORBIDDEN)
        except DjangoValidationError as exc:
            return _validation_response(exc)
        rows = TimesheetPeriod.objects.filter(pharmacy=pharmacy).order_by("-start_date", "-id")
        return Response([{
            "id": row.pk, "pharmacy_id": row.pharmacy_id, "start_date": str(row.start_date),
            "end_date": str(row.end_date), "status": row.status, "timezone": row.timezone,
            "locked_at": row.locked_at.isoformat() if row.locked_at else None,
        } for row in rows])

    def post(self, request):
        try:
            pharmacy = _pharmacy(request.data.get("pharmacy_id"))
            require_manage_pharmacy(request.user, pharmacy)
            start_date = _parse_required_date(request.data.get("start_date"), "start_date")
            end_date = _parse_required_date(request.data.get("end_date"), "end_date")
            if end_date < start_date:
                raise DjangoValidationError("end_date cannot be before start_date.")
            if (end_date - start_date).days > 30:
                raise DjangoValidationError("A reviewed-time period cannot exceed 31 days.")
            period, created = TimesheetPeriod.objects.get_or_create(
                pharmacy=pharmacy,
                start_date=start_date,
                end_date=end_date,
                defaults={
                    "timezone": str(getattr(pharmacy, "timezone", "") or "Australia/Brisbane"),
                    "created_by": request.user,
                },
            )
            ensure_period_timesheets(period)
            transaction.on_commit(lambda: rebuild_timesheet_period_task.delay(period.pk), robust=True)
            return Response({"id": period.pk, "created": created, "status": period.status}, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)
        except DjangoPermissionDenied as exc:
            return Response({"error": str(exc)}, status=status.HTTP_403_FORBIDDEN)
        except DjangoValidationError as exc:
            return _validation_response(exc)


class TimesheetPeriodSummaryView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk):
        try:
            period = TimesheetPeriod.objects.select_related("pharmacy").get(pk=pk)
            return Response(period_summary(period, request.user))
        except TimesheetPeriod.DoesNotExist:
            return Response({"error": "Timesheet period not found."}, status=status.HTTP_404_NOT_FOUND)
        except DjangoPermissionDenied as exc:
            return Response({"error": str(exc)}, status=status.HTTP_403_FORBIDDEN)


class TimesheetPeriodRecalculateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        try:
            period = TimesheetPeriod.objects.select_related("pharmacy").get(pk=pk)
            require_manage_pharmacy(request.user, period.pharmacy)
            if request.data.get("sync") is True:
                revisions = rebuild_period(period.pk, actor=request.user, force=bool(request.data.get("force")))
                return Response({"status": "rebuilt", "count": len(revisions)})
            rebuild_timesheet_period_task.delay(period.pk)
            return Response({"status": "queued"}, status=status.HTTP_202_ACCEPTED)
        except TimesheetPeriod.DoesNotExist:
            return Response({"error": "Timesheet period not found."}, status=status.HTTP_404_NOT_FOUND)
        except (DjangoPermissionDenied, DjangoValidationError) as exc:
            return _validation_response(exc, status.HTTP_403_FORBIDDEN if isinstance(exc, DjangoPermissionDenied) else status.HTTP_400_BAD_REQUEST)


class TimesheetPeriodLockView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        try:
            period = TimesheetPeriod.objects.select_related("pharmacy").get(pk=pk)
            manifest = lock_period(period, request.user)
            return Response({"status": "LOCKED", "manifest_hash": manifest.manifest_hash, "manifest": manifest.snapshot})
        except TimesheetPeriod.DoesNotExist:
            return Response({"error": "Timesheet period not found."}, status=status.HTTP_404_NOT_FOUND)
        except DjangoPermissionDenied as exc:
            return Response({"error": str(exc)}, status=status.HTTP_403_FORBIDDEN)
        except DjangoValidationError as exc:
            return _validation_response(exc)


class TimesheetListView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        period_id = request.query_params.get("period_id")
        if not period_id:
            return Response({"error": "period_id is required."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            period = TimesheetPeriod.objects.select_related("pharmacy").get(pk=period_id)
            require_manage_pharmacy(request.user, period.pharmacy)
            ensure_period_timesheets(period)
            qs = period.timesheets.select_related("user", "membership").all()
            if request.query_params.get("status"):
                qs = qs.filter(status=request.query_params["status"])
            search = (request.query_params.get("search") or "").strip()
            if search:
                qs = qs.filter(Q(user__first_name__icontains=search) | Q(user__last_name__icontains=search) | Q(user__email__icontains=search))
            return Response([serialize_timesheet(row, user=request.user) for row in qs.order_by("user__first_name", "user__last_name", "user_id")])
        except TimesheetPeriod.DoesNotExist:
            return Response({"error": "Timesheet period not found."}, status=status.HTTP_404_NOT_FOUND)
        except DjangoPermissionDenied as exc:
            return Response({"error": str(exc)}, status=status.HTTP_403_FORBIDDEN)


class TimesheetDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk):
        try:
            timesheet = Timesheet.objects.select_related("period__pharmacy", "user", "membership").get(pk=pk)
            if timesheet.needs_rebuild and can_manage_pharmacy(request.user, timesheet.period.pharmacy):
                build_timesheet(timesheet.pk, actor=request.user)
                timesheet.refresh_from_db()
            return Response(serialize_timesheet(timesheet, detail=True, user=request.user))
        except Timesheet.DoesNotExist:
            return Response({"error": "Timesheet not found."}, status=status.HTTP_404_NOT_FOUND)
        except DjangoPermissionDenied as exc:
            return Response({"error": str(exc)}, status=status.HTTP_403_FORBIDDEN)


class TimesheetRecalculateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        try:
            timesheet = Timesheet.objects.select_related("period__pharmacy").get(pk=pk)
            require_manage_pharmacy(request.user, timesheet.period.pharmacy)
            revision = build_timesheet(timesheet.pk, actor=request.user, force=bool(request.data.get("force")))
            timesheet.refresh_from_db()
            return Response(serialize_timesheet(timesheet, detail=True, user=request.user))
        except Timesheet.DoesNotExist:
            return Response({"error": "Timesheet not found."}, status=status.HTTP_404_NOT_FOUND)
        except DjangoPermissionDenied as exc:
            return Response({"error": str(exc)}, status=status.HTTP_403_FORBIDDEN)
        except DjangoValidationError as exc:
            return _validation_response(exc)


class TimesheetMissingPunchView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        try:
            timesheet = Timesheet.objects.select_related("period__pharmacy", "user").get(pk=pk)
            occurred_at_local = str(request.data.get("occurred_at_local") or "").strip()
            if occurred_at_local:
                try:
                    local_value = datetime.fromisoformat(occurred_at_local)
                except ValueError as exc:
                    raise DjangoValidationError("occurred_at_local must be YYYY-MM-DDTHH:MM.") from exc
                if timezone.is_aware(local_value):
                    raise DjangoValidationError("occurred_at_local must not include a timezone offset.")
                occurred_at = timezone.make_aware(local_value, get_pharmacy_timezone(timesheet.period.pharmacy))
            else:
                occurred_at = _parse_required_datetime(request.data.get("occurred_at"), "occurred_at")
            event = append_missing_punch(
                timesheet=timesheet,
                manager=request.user,
                session_id=int(request.data.get("session_id")),
                event_type=request.data.get("event_type"),
                occurred_at=occurred_at,
                reason=request.data.get("reason") or "",
            )
            build_timesheet(timesheet.pk, actor=request.user, force=True)
            timesheet.refresh_from_db()
            return Response({
                "created_event_id": event.pk,
                "timesheet": serialize_timesheet(timesheet, detail=True, user=request.user),
            }, status=status.HTTP_201_CREATED)
        except Timesheet.DoesNotExist:
            return Response({"error": "Timesheet not found."}, status=status.HTTP_404_NOT_FOUND)
        except AttendanceSession.DoesNotExist:
            return Response({"error": "Attendance session not found."}, status=status.HTTP_404_NOT_FOUND)
        except DjangoPermissionDenied as exc:
            return Response({"error": str(exc)}, status=status.HTTP_403_FORBIDDEN)
        except (DjangoValidationError, TypeError, ValueError) as exc:
            return _validation_response(exc)


class TimesheetSubmitView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        try:
            timesheet = Timesheet.objects.select_related("period__pharmacy", "user").get(pk=pk)
            submit_timesheet(timesheet, request.user, request.data.get("revision_number"))
            timesheet.refresh_from_db()
            return Response(serialize_timesheet(timesheet, detail=True, user=request.user))
        except Timesheet.DoesNotExist:
            return Response({"error": "Timesheet not found."}, status=status.HTTP_404_NOT_FOUND)
        except (DjangoPermissionDenied, DjangoValidationError, TypeError, ValueError) as exc:
            return _validation_response(exc)


class TimesheetApproveView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        try:
            timesheet = Timesheet.objects.select_related("period__pharmacy", "user").get(pk=pk)
            approve_timesheet(
                timesheet,
                request.user,
                request.data.get("revision_number"),
                reason=request.data.get("reason") or "",
            )
            timesheet.refresh_from_db()
            return Response(serialize_timesheet(timesheet, detail=True, user=request.user))
        except Timesheet.DoesNotExist:
            return Response({"error": "Timesheet not found."}, status=status.HTTP_404_NOT_FOUND)
        except DjangoPermissionDenied as exc:
            return Response({"error": str(exc)}, status=status.HTTP_403_FORBIDDEN)
        except (DjangoValidationError, TypeError, ValueError) as exc:
            return _validation_response(exc)


class TimesheetReopenView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        try:
            timesheet = Timesheet.objects.select_related("period__pharmacy", "user").get(pk=pk)
            reopen_timesheet(timesheet, request.user, request.data.get("reason") or "")
            timesheet.refresh_from_db()
            return Response(serialize_timesheet(timesheet, detail=True, user=request.user))
        except Timesheet.DoesNotExist:
            return Response({"error": "Timesheet not found."}, status=status.HTTP_404_NOT_FOUND)
        except DjangoPermissionDenied as exc:
            return Response({"error": str(exc)}, status=status.HTTP_403_FORBIDDEN)
        except DjangoValidationError as exc:
            return _validation_response(exc)


class TimesheetCheckDecisionView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        try:
            check = TimesheetCheck.objects.select_related("revision__timesheet__period__pharmacy").get(pk=pk)
            row = decide_check(
                check,
                request.user,
                str(request.data.get("decision") or "").upper(),
                request.data.get("reason") or "",
            )
            return Response({"id": row.pk, "decision": row.decision, "created_at": row.created_at.isoformat()})
        except TimesheetCheck.DoesNotExist:
            return Response({"error": "Timesheet check not found."}, status=status.HTTP_404_NOT_FOUND)
        except DjangoPermissionDenied as exc:
            return Response({"error": str(exc)}, status=status.HTTP_403_FORBIDDEN)
        except DjangoValidationError as exc:
            return _validation_response(exc)


class TimesheetCommentView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        try:
            timesheet = Timesheet.objects.select_related("period__pharmacy", "user").get(pk=pk)
            comment = add_comment(
                timesheet,
                request.user,
                request.data.get("body") or "",
                worker_visible=request.data.get("worker_visible", True),
            )
            return Response({"id": comment.pk, "created_at": comment.created_at.isoformat()}, status=status.HTTP_201_CREATED)
        except Timesheet.DoesNotExist:
            return Response({"error": "Timesheet not found."}, status=status.HTTP_404_NOT_FOUND)
        except DjangoPermissionDenied as exc:
            return Response({"error": str(exc)}, status=status.HTTP_403_FORBIDDEN)
        except DjangoValidationError as exc:
            return _validation_response(exc)


class MyHoursView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        qs = Timesheet.objects.filter(user=request.user).select_related("period__pharmacy", "user", "membership")
        if request.query_params.get("pharmacy_id"):
            qs = qs.filter(period__pharmacy_id=request.query_params["pharmacy_id"])
        if request.query_params.get("period_id"):
            qs = qs.filter(period_id=request.query_params["period_id"])
        rows = []
        for timesheet in qs.order_by("-period__start_date", "period__pharmacy__name")[:100]:
            rows.append({
                **serialize_timesheet(timesheet, user=request.user),
                "pharmacy": {"id": timesheet.period.pharmacy_id, "name": timesheet.period.pharmacy.name},
                "start_date": str(timesheet.period.start_date),
                "end_date": str(timesheet.period.end_date),
            })
        return Response(rows)
