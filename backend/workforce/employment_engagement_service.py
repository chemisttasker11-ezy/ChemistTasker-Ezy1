from __future__ import annotations

from datetime import datetime, timedelta
from decimal import Decimal

from django.core.exceptions import ValidationError as DjangoValidationError
from django.utils import timezone
from django.utils.dateparse import parse_date

from client_profile.models import MembershipApplication, OtherStaffOnboarding, PharmacistOnboarding

from .award_rates import (
    AWARD_CODE,
    AWARD_EFFECTIVE_FROM,
    AWARD_SOURCE_LABEL,
    AWARD_SOURCE_URL,
    default_membership_classification,
    resolve_award_schedule,
)
from .employment_terms import correspondence_profile, normalise_part_time_pattern
from .models import EmploymentEngagement


def membership_date_of_birth(membership):
    user = membership.user
    onboarding = (
        PharmacistOnboarding.objects.filter(user=user).only("date_of_birth").first()
        if str(membership.role or "").upper() == "PHARMACIST"
        else OtherStaffOnboarding.objects.filter(user=user).only("date_of_birth").first()
    )
    if onboarding and onboarding.date_of_birth:
        return onboarding.date_of_birth
    application = MembershipApplication.objects.filter(
        pharmacy=membership.pharmacy,
        role=membership.role,
        email__iexact=user.email,
        status="APPROVED",
    ).order_by("-decided_at", "-id").only("date_of_birth").first()
    return application.date_of_birth if application else None


def build_employment_engagement_payload(request_data, membership, *, effective_from=None, effective_to=None, existing=None):
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

    effective_from = effective_from or getattr(existing, "effective_from", None) or timezone.localdate()
    effective_to = effective_to if effective_to is not None else getattr(existing, "effective_to", None)
    date_of_birth = membership_date_of_birth(membership)

    if employment_type == "PART_TIME":
        raw_pattern = request_data.get(
            "ordinary_hours_pattern",
            getattr(existing, "ordinary_hours_pattern", None) if existing else None,
        )
        ordinary_hours_pattern = normalise_part_time_pattern(raw_pattern)
    else:
        ordinary_hours_pattern = {}

    # Fail closed if the employment/pay combination has no correspondence profile,
    # then freeze that selection with the engagement's rate snapshot.
    correspondence = correspondence_profile(employment_type, pay_basis)

    # Always resolve the Award underpinning. For above-award engagements this is
    # retained as the correspondence/minimum floor rather than discarded.
    resolved = resolve_award_schedule(
        role=role,
        classification=classification,
        employment_type=employment_type,
        date_of_birth=date_of_birth,
        as_of=effective_from,
    )
    resolved["adult_rate_confirmed"] = None
    resolved["correspondence"] = correspondence
    next_review = parse_date(resolved.get("next_rate_review_date") or "")
    if next_review and (effective_to is None or effective_to >= next_review):
        raise DjangoValidationError({
            "effective_to": (
                "Junior Award rates change on the employee's next birthday. "
                f"End this dated engagement by {next_review - timedelta(days=1)} and create successor terms from {next_review}."
            )
        })

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

    is_genuinely_above_award = any(
        agreed[key] > floor
        for key, floor in floor_by_field.items()
    )
    if early_rate is not None:
        is_genuinely_above_award = (
            is_genuinely_above_award
            or early_rate > Decimal(resolved["rate_early_morning"])
        )
    if late_rate is not None:
        is_genuinely_above_award = (
            is_genuinely_above_award
            or late_rate > Decimal(resolved["rate_late_night"])
        )
    if not is_genuinely_above_award:
        raise DjangoValidationError(
            {"pay_basis": "Above-award terms must contain at least one agreed rate above the selected Award minimum."}
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
            "adult_rate_confirmed": None,
            "correspondence": correspondence,
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


