from __future__ import annotations

from datetime import date, datetime, time, timedelta
from decimal import Decimal, ROUND_HALF_UP

from django.core.exceptions import ValidationError
from django.db.models import Q
from django.utils import timezone

from .models import Membership, OtherStaffOnboarding, PharmacistOnboarding

PHARMACY_STAFF_TYPES = {"FULL_TIME", "PART_TIME", "CASUAL"}
PAYMENT_TFN = "TFN"
PAYMENT_ABN = "ABN"
SETTLEMENT_PAYROLL = "PAYROLL"
SETTLEMENT_TIMESHEET_ONLY = "TIMESHEET_ONLY"
SETTLEMENT_INVOICE = "INVOICE"
KIND_STAFF_EMPLOYMENT = "STAFF_EMPLOYMENT"
KIND_SHIFT_EMPLOYMENT = "SHIFT_EMPLOYMENT"
KIND_INDEPENDENT_CONTRACTOR = "INDEPENDENT_CONTRACTOR"


def worker_onboarding(user):
    if str(getattr(user, "role", "") or "").upper() == "PHARMACIST":
        return PharmacistOnboarding.objects.filter(user=user).first()
    return OtherStaffOnboarding.objects.filter(user=user).first()


def direct_pharmacy_staff_membership(*, user, pharmacy):
    return Membership.objects.filter(
        user=user,
        pharmacy=pharmacy,
        is_active=True,
        status=Membership.Status.ACCEPTED,
        employment_type__in=PHARMACY_STAFF_TYPES,
    ).first()


def staff_assignment_defaults(*, user, pharmacy, work_date):
    """Build the immutable payroll snapshot for a direct pharmacy-staff roster assignment."""
    if isinstance(work_date, str):
        work_date = date.fromisoformat(work_date)

    membership = direct_pharmacy_staff_membership(user=user, pharmacy=pharmacy)
    if not membership:
        raise ValidationError({
            "user": (
                "Only direct full-time, part-time or casual pharmacy staff can be assigned "
                "through roster tools. Locum, Shift Hero and external workers must use the "
                "offer acceptance flow so engagement/payment terms are recorded."
            )
        })

    if not getattr(pharmacy, "use_chemisttasker_payroll", False):
        snapshot = {
            "version": 1,
            "engagement_kind": KIND_STAFF_EMPLOYMENT,
            "settlement_channel": SETTLEMENT_TIMESHEET_ONLY,
            "payment_preference": PAYMENT_TFN,
            "membership_id": membership.id,
            "employment_type": membership.employment_type,
            "role": membership.role,
            "payroll_enabled": False,
            "notice": (
                "ChemistTasker Payroll is disabled for this pharmacy. The assignment remains "
                "in roster, attendance and timesheets without requiring ChemistTasker pay rates."
            ),
        }
        return {
            "payment_preference_snapshot": PAYMENT_TFN,
            "settlement_channel": SETTLEMENT_TIMESHEET_ONLY,
            "engagement_kind": KIND_STAFF_EMPLOYMENT,
            "engagement_terms_snapshot": snapshot,
            "engagement_terms_accepted_at": None,
        }

    validate_tfn_payroll_profile(user)

    from workforce.models import EmploymentEngagement

    engagement = (
        EmploymentEngagement.objects.filter(
            membership=membership,
            effective_from__lte=work_date,
        )
        .filter(Q(effective_to__isnull=True) | Q(effective_to__gte=work_date))
        .order_by("-effective_from", "-id")
        .first()
    )
    if not engagement:
        raise ValidationError({
            "employment_engagement": (
                f"No dated EmploymentEngagement covers {work_date}. "
                "Create the employee terms before rostering this worker."
            )
        })

    snapshot = {
        "version": 1,
        "engagement_kind": KIND_STAFF_EMPLOYMENT,
        "settlement_channel": SETTLEMENT_PAYROLL,
        "payment_preference": PAYMENT_TFN,
        "membership_id": membership.id,
        "employment_engagement_public_id": str(engagement.public_id),
        "effective_from": str(engagement.effective_from),
        "effective_to": str(engagement.effective_to) if engagement.effective_to else None,
        "employment_type": engagement.employment_type,
        "role": engagement.role,
        "pay_basis": engagement.pay_basis,
        "award_code": engagement.award_code,
        "award_classification": engagement.award_classification,
        "rates": {
            "weekday": str(engagement.rate_weekday),
            "saturday": str(engagement.rate_saturday),
            "sunday": str(engagement.rate_sunday),
            "public_holiday": str(engagement.rate_public_holiday),
            "early_morning": str(engagement.rate_early_morning) if engagement.rate_early_morning is not None else None,
            "late_night": str(engagement.rate_late_night) if engagement.rate_late_night is not None else None,
        },
    }
    return {
        "payment_preference_snapshot": PAYMENT_TFN,
        "settlement_channel": SETTLEMENT_PAYROLL,
        "engagement_kind": KIND_STAFF_EMPLOYMENT,
        "engagement_terms_snapshot": snapshot,
        "engagement_terms_accepted_at": None,
    }


def _format_abn(value):
    raw = "".join(ch for ch in str(value or "") if ch.isdigit())
    return f"{raw[:2]} {raw[2:5]} {raw[5:8]} {raw[8:]}" if len(raw) == 11 else raw


def _money(value):
    if value in (None, ""):
        return None
    return str(Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def _tfn_payroll_status(onboarding):
    missing = []
    if not getattr(onboarding, "tfn_number", None):
        missing.append("tfn")
    if not getattr(onboarding, "super_fund_name", None):
        missing.append("super_fund_name")
    if not getattr(onboarding, "super_usi", None):
        missing.append("super_usi")
    if not getattr(onboarding, "super_member_number", None):
        missing.append("super_member_number")
    return {
        "ready": not missing,
        "missing_fields": missing,
        "tfn_present": bool(getattr(onboarding, "tfn_number", None)),
        "super": {
            "fund_name": getattr(onboarding, "super_fund_name", None),
            "usi": getattr(onboarding, "super_usi", None),
            "member_number_present": bool(getattr(onboarding, "super_member_number", None)),
        },
    }


def validate_tfn_payroll_profile(user):
    onboarding = worker_onboarding(user)
    if not onboarding:
        raise ValidationError({"payment_profile": "Complete worker onboarding before creating payroll employment terms."})
    if str(onboarding.payment_preference or "").upper() != PAYMENT_TFN:
        raise ValidationError({
            "payment_preference": "Employee/payroll engagements require the TFN pathway. ABN service work is settled through invoicing."
        })
    status = _tfn_payroll_status(onboarding)
    labels = {
        "tfn": "TFN is required for payroll.",
        "super_fund_name": "Super fund name is required for payroll.",
        "super_usi": "Super fund USI is required for payroll.",
        "super_member_number": "Super member number is required for payroll.",
    }
    if status["missing_fields"]:
        raise ValidationError({key: labels[key] for key in status["missing_fields"]})
    return onboarding


def _external_payment_profile(user):
    onboarding = worker_onboarding(user)
    if not onboarding:
        raise ValidationError({"payment_profile": "Complete worker onboarding before accepting this external shift."})
    pref = str(onboarding.payment_preference or "").upper()
    if pref not in {PAYMENT_TFN, PAYMENT_ABN}:
        raise ValidationError({"payment_preference": "Select TFN or ABN in onboarding before accepting this shift."})
    if pref == PAYMENT_ABN:
        errors = {}
        if not getattr(onboarding, "abn", None):
            errors["abn"] = "ABN is required for invoice settlement."
        if not getattr(onboarding, "abn_verified", False):
            errors["abn_verified"] = "ABN must be verified before invoice settlement."
        if not getattr(onboarding, "abn_entity_confirmed", False):
            errors["abn_entity_confirmed"] = "Confirm the ABN entity before invoice settlement."
        if errors:
            raise ValidationError(errors)
    return onboarding, pref


def _offer_occurrences(shift, offer=None):
    if offer and offer.slot_id:
        return [{
            "slot_id": offer.slot_id,
            "date": str(offer.offered_slot_date or offer.slot.date),
            "start_time": str(offer.offered_start_time or offer.slot.start_time),
            "end_time": str(offer.offered_end_time or offer.slot.end_time),
            "agreed_rate": str(
                offer.offered_rate
                if offer.offered_rate is not None
                else (getattr(offer.slot, "rate", None) if offer.slot_id else None)
                or getattr(shift, "fixed_rate", None)
            ) if (
                offer.offered_rate is not None
                or (offer.slot_id and getattr(offer.slot, "rate", None) is not None)
                or getattr(shift, "fixed_rate", None) is not None
            ) else None,
        }]
    return [{
        "slot_id": slot.id,
        "date": str(slot.date),
        "start_time": str(slot.start_time),
        "end_time": str(slot.end_time),
        "agreed_rate": str(getattr(shift, "fixed_rate", None)) if getattr(shift, "fixed_rate", None) is not None else None,
    } for slot in shift.slots.all()]



def _parse_time(value):
    if isinstance(value, time):
        return value
    raw = str(value or "").strip()
    for fmt, length in (("%H:%M:%S", 8), ("%H:%M", 5)):
        try:
            return datetime.strptime(raw[:length], fmt).time()
        except ValueError:
            continue
    raise ValidationError({"shift_time": f"Invalid shift time: {value}"})


def _other_staff_classification(onboarding, role):
    role = str(role or "").upper()
    onboard_role = str(getattr(onboarding, "role_type", "") or "").upper()
    if onboard_role and onboard_role != role:
        raise ValidationError({
            "role": (
                f"This worker onboarded to the public platform as {onboard_role.replace('_', ' ').title()} "
                f"and cannot accept a {role.replace('_', ' ').title()} shift."
            )
        })
    if role in {"ASSISTANT", "TECHNICIAN"}:
        return str(getattr(onboarding, "classification_level", "") or "").upper()
    if role == "INTERN":
        return str(getattr(onboarding, "intern_half", "") or "").upper()
    if role == "STUDENT":
        return str(getattr(onboarding, "student_year", "") or "").upper()
    return ""


def _segment_rate_key(day_type, clock_time):
    if day_type == "public_holiday":
        return ("public_holiday", "all_day")
    if day_type == "weekday":
        if clock_time < time(7, 0):
            return None
        if clock_time < time(8, 0):
            return ("weekday", "early_07_08")
        if clock_time < time(19, 0):
            return ("weekday", "daytime_08_19")
        if clock_time < time(21, 0):
            return ("weekday", "evening_19_21")
        return ("weekday", "late_21_24")
    if day_type == "saturday":
        if clock_time < time(7, 0):
            return None
        if clock_time < time(8, 0):
            return ("saturday", "early_07_08")
        if clock_time < time(18, 0):
            return ("saturday", "daytime_08_18")
        if clock_time < time(21, 0):
            return ("saturday", "evening_18_21")
        return ("saturday", "late_21_24")
    if clock_time < time(7, 0) or clock_time >= time(21, 0):
        return ("sunday", "outside_07_21")
    return ("sunday", "daytime_07_21")


def _award_floor_for_occurrence(award_snapshot, occurrence, pharmacy):
    from client_profile.services import get_day_type

    work_date = date.fromisoformat(str(occurrence["date"]))
    start_time = _parse_time(occurrence["start_time"])
    end_time = _parse_time(occurrence["end_time"])
    start_dt = datetime.combine(work_date, start_time)
    end_dt = datetime.combine(work_date, end_time)
    if end_dt <= start_dt:
        end_dt += timedelta(days=1)

    if end_dt - start_dt > timedelta(hours=12):
        return {
            "rate": None,
            "review_required": True,
            "review_reason": "Shift exceeds 12 hours and needs overtime review before ChemistTasker Payroll can process it.",
            "segments": [],
        }

    schedule = award_snapshot["schedule"]
    state = getattr(pharmacy, "state", "") or ""
    segments = []
    total_hours = Decimal("0")
    total_pay = Decimal("0")
    cursor = start_dt

    while cursor < end_dt:
        day_end = datetime.combine(cursor.date() + timedelta(days=1), time.min)
        segment_end_limit = min(end_dt, day_end)
        day_type = get_day_type(cursor.date(), state)

        if day_type == "weekday":
            boundary_times = [time(7, 0), time(8, 0), time(19, 0), time(21, 0)]
        elif day_type == "saturday":
            boundary_times = [time(7, 0), time(8, 0), time(18, 0), time(21, 0)]
        elif day_type == "sunday":
            boundary_times = [time(7, 0), time(21, 0)]
        else:
            boundary_times = []

        boundaries = [segment_end_limit]
        for boundary_time in boundary_times:
            boundary = datetime.combine(cursor.date(), boundary_time)
            if cursor < boundary < segment_end_limit:
                boundaries.append(boundary)
        next_boundary = min(boundaries)

        rate_key = _segment_rate_key(day_type, cursor.time())
        if rate_key is None:
            return {
                "rate": None,
                "review_required": True,
                "review_reason": (
                    "This occurrence includes hours before 7:00 am on a weekday/Saturday. "
                    "Overtime must be reviewed before ChemistTasker Payroll can process it."
                ),
                "segments": segments,
            }

        rate = Decimal(str(schedule[rate_key[0]][rate_key[1]]))
        hours = Decimal(str((next_boundary - cursor).total_seconds())) / Decimal("3600")
        line_total = rate * hours
        total_hours += hours
        total_pay += line_total
        segments.append({
            "date": str(cursor.date()),
            "start_time": cursor.time().strftime("%H:%M:%S"),
            "end_time": next_boundary.time().strftime("%H:%M:%S"),
            "day_type": day_type,
            "rate_key": rate_key[1],
            "rate": _money(rate),
            "hours": _money(hours),
            "line_total": _money(line_total),
        })
        cursor = next_boundary

    if total_hours <= 0:
        raise ValidationError({"shift_time": "Shift duration must be greater than zero."})
    return {
        "rate": _money(total_pay / total_hours),
        "review_required": False,
        "review_reason": None,
        "segments": segments,
    }


def _build_tfn_award_terms(*, shift, onboarding, occurrences):
    from workforce.award_rates import resolve_award_schedule

    role = str(shift.role_needed or "").upper()
    classification = "PHARMACIST" if role == "PHARMACIST" else _other_staff_classification(onboarding, role)
    if not classification:
        raise ValidationError({
            "award_classification": "Complete the worker's public-platform Award classification before accepting this TFN shift."
        })

    bonus = Decimal(str(getattr(shift, "owner_adjusted_rate", None) or "0"))
    if role == "PHARMACIST":
        bonus = Decimal("0")

    routed_occurrences = []
    payroll_review_required = False
    review_reasons = []
    first_award_snapshot = None

    for occurrence in occurrences:
        work_date = date.fromisoformat(str(occurrence["date"]))
        award_snapshot = resolve_award_schedule(
            role=role,
            classification=classification,
            employment_type="CASUAL",
            date_of_birth=getattr(onboarding, "date_of_birth", None),
            as_of=work_date,
        )
        if first_award_snapshot is None:
            first_award_snapshot = award_snapshot

        floor = _award_floor_for_occurrence(award_snapshot, occurrence, shift.pharmacy)
        posted_rate = (
            Decimal(str(occurrence.get("agreed_rate")))
            if occurrence.get("agreed_rate") not in (None, "")
            else None
        )
        routed = dict(occurrence)
        routed["posted_rate"] = _money(posted_rate)
        routed["award_classification"] = classification
        routed["award_floor_rate"] = floor["rate"]
        routed["award_floor_segments"] = floor["segments"]
        routed["owner_bonus"] = _money(bonus)
        routed["award_review_required"] = floor["review_required"]
        routed["award_review_reason"] = floor["review_reason"]

        if floor["review_required"]:
            payroll_review_required = True
            if floor["review_reason"] and floor["review_reason"] not in review_reasons:
                review_reasons.append(floor["review_reason"])
            if posted_rate is None:
                raise ValidationError({"agreed_rate": "The final agreed hourly rate must be recorded before accepting this shift."})
            routed["agreed_rate"] = _money(posted_rate)
        else:
            floor_rate = Decimal(str(floor["rate"]))
            if role == "PHARMACIST":
                if posted_rate is None:
                    raise ValidationError({"agreed_rate": "A final agreed pharmacist hourly rate is required before accepting the shift."})
                if posted_rate <= floor_rate:
                    raise ValidationError({
                        "agreed_rate": (
                            "Marketplace TFN pharmacist shifts are above-Award engagements. "
                            f"The agreed rate must be above the applicable casual Pharmacist Award floor of {floor_rate:.2f}/hr."
                        )
                    })
                routed["agreed_rate"] = _money(posted_rate)
            else:
                minimum_with_bonus = floor_rate + bonus
                routed["minimum_with_bonus"] = _money(minimum_with_bonus)
                routed["agreed_rate"] = _money(max(posted_rate or Decimal("0"), minimum_with_bonus))

        routed_occurrences.append(routed)

    return {
        "classification": classification,
        "pay_basis": "ABOVE_AWARD" if role == "PHARMACIST" else ("AWARD_PLUS_BONUS" if bonus > 0 else "AWARD_OR_HIGHER"),
        "owner_bonus": _money(bonus),
        "award_floor": first_award_snapshot,
        "occurrences": routed_occurrences,
        "payroll_review_required": payroll_review_required,
        "payroll_review_reasons": review_reasons,
    }

def build_shift_engagement_terms(*, shift, user, offer=None):
    staff_membership = direct_pharmacy_staff_membership(user=user, pharmacy=shift.pharmacy)
    occurrences = _offer_occurrences(shift, offer)
    pharmacy = shift.pharmacy

    if staff_membership:
        membership_role = str(staff_membership.role or "").upper()
        shift_role = str(shift.role_needed or "").upper()
        if membership_role != shift_role:
            raise ValidationError({
                "role": (
                    f"This worker is a {membership_role.replace('_', ' ').title()} member of the pharmacy "
                    f"and cannot be directly allocated to a {shift_role.replace('_', ' ').title()} shift."
                )
            })

        payroll_enabled = bool(getattr(pharmacy, "use_chemisttasker_payroll", False))
        engagement_public_ids = []
        routed_occurrences = []
        for occurrence in occurrences:
            routed = dict(occurrence)
            if payroll_enabled:
                assignment_defaults = staff_assignment_defaults(
                    user=user,
                    pharmacy=pharmacy,
                    work_date=occurrence["date"],
                )
                engagement_snapshot = assignment_defaults["engagement_terms_snapshot"]
                engagement_public_id = engagement_snapshot.get("employment_engagement_public_id")
                routed["employment_engagement_public_id"] = engagement_public_id
                if engagement_public_id and engagement_public_id not in engagement_public_ids:
                    engagement_public_ids.append(engagement_public_id)
            routed_occurrences.append(routed)

        return {
            "version": 1,
            "acceptance_required": False,
            "engagement_kind": KIND_STAFF_EMPLOYMENT,
            "settlement_channel": SETTLEMENT_PAYROLL if payroll_enabled else SETTLEMENT_TIMESHEET_ONLY,
            "payment_preference": PAYMENT_TFN,
            "membership_id": staff_membership.id,
            "pharmacy_id": pharmacy.id,
            "pharmacy_name": pharmacy.name,
            "worker_id": user.id,
            "worker_name": user.get_full_name() or user.email,
            "role": shift.role_needed,
            "occurrences": routed_occurrences,
            "employment_engagement_public_ids": engagement_public_ids,
            "payroll_enabled": payroll_enabled,
            "notice": (
                "Existing pharmacy staff employment uses the dated EmploymentEngagement covering each offered occurrence."
                if payroll_enabled
                else
                "ChemistTasker Payroll is disabled. This shift remains available in roster, attendance and timesheets for the pharmacy's own payroll process."
            ),
        }

    onboarding, pref = _external_payment_profile(user)
    posted_pref = str(getattr(shift, "payment_preference", "") or "").upper()
    if posted_pref in {PAYMENT_TFN, PAYMENT_ABN} and posted_pref != pref:
        raise ValidationError({
            "payment_preference": f"This shift is posted for {posted_pref} settlement, but the worker onboarding profile is {pref}. The pathways must match before acceptance."
        })

    base = {
        "version": 1,
        "acceptance_required": True,
        "pharmacy_id": pharmacy.id,
        "pharmacy_name": pharmacy.name,
        "pharmacy_abn": _format_abn(getattr(pharmacy, "abn", None)),
        "worker_id": user.id,
        "worker_name": user.get_full_name() or user.email,
        "role": shift.role_needed,
        "shift_id": shift.id,
        "source_visibility": shift.visibility,
        "occurrences": occurrences,
        "accepted_at": None,
        "accepted_by_user_id": None,
        "legal_review_notice": "This electronic terms record captures the agreed shift details and routing; it is not a substitute for legal advice about employee/contractor classification.",
    }

    if pref == PAYMENT_TFN:
        payroll_enabled = bool(getattr(pharmacy, "use_chemisttasker_payroll", False))
        award_terms = _build_tfn_award_terms(
            shift=shift,
            onboarding=onboarding,
            occurrences=occurrences,
        )
        profile_status = _tfn_payroll_status(onboarding)
        payroll_ready = bool(
            payroll_enabled
            and profile_status["ready"]
            and not award_terms["payroll_review_required"]
        )
        deferred_reasons = list(profile_status["missing_fields"])
        if award_terms["payroll_review_required"]:
            deferred_reasons.append("award_overtime_review")

        return {
            **base,
            "engagement_kind": KIND_SHIFT_EMPLOYMENT,
            "settlement_channel": SETTLEMENT_PAYROLL if payroll_ready else SETTLEMENT_TIMESHEET_ONLY,
            "payment_preference": PAYMENT_TFN,
            "payroll_enabled": payroll_enabled,
            "payroll_requested": payroll_enabled,
            "payroll_setup_status": "READY" if payroll_ready else ("DEFERRED" if payroll_enabled else "NOT_USED"),
            "payroll_target_settlement_channel": SETTLEMENT_PAYROLL if payroll_enabled else None,
            "payroll_missing_fields": deferred_reasons,
            "payroll_activation_required": bool(payroll_enabled and not payroll_ready),
            "employment_type": "CASUAL",
            "casual_agreement": {
                "employment_type": "CASUAL",
                "award_code": "MA000012",
                "classification": award_terms["classification"],
                "pay_basis": award_terms["pay_basis"],
                "payroll_may_be_activated_after_acceptance": True,
            },
            "award_code": "MA000012",
            "award_classification": award_terms["classification"],
            "pay_basis": award_terms["pay_basis"],
            "award_floor": award_terms["award_floor"],
            "owner_bonus": award_terms["owner_bonus"],
            "occurrences": award_terms["occurrences"],
            "award_payroll_review_required": award_terms["payroll_review_required"],
            "award_payroll_review_reasons": award_terms["payroll_review_reasons"],
            "super": profile_status["super"],
            "facilitator_notice": (
                "ChemistTasker facilitates the connection and records the agreed shift terms. "
                "The casual employment engagement for this shift is between the pharmacy/employer and the worker."
            ),
            "relationship_notice": (
                "ChemistTasker Payroll is available for this pharmacy. TFN/super setup may be completed after shift acceptance; "
                "until it is complete the assignment remains rostered and timesheet-only and is not released to ChemistTasker Payroll."
                if payroll_enabled and not payroll_ready
                else (
                    "The parties intend this shift to be a casual employee engagement settled through ChemistTasker Payroll. "
                    "Applicable Award/NES, tax withholding and superannuation obligations are not displaced by these terms."
                    if payroll_enabled
                    else
                    "The parties intend this shift to be a casual employee engagement. ChemistTasker records the agreed shift and timesheet, "
                    "while the pharmacy processes payroll in its own system. ChemistTasker facilitates the connection and is not the employer."
                )
            ),
            "payroll_setup_notice": (
                "Payroll details are deferred. Assignment is not blocked; complete TFN/super details later and activate payroll for this accepted offer."
                if payroll_enabled and not payroll_ready
                else None
            ),
        }

    return {
        **base,
        "engagement_kind": KIND_INDEPENDENT_CONTRACTOR,
        "settlement_channel": SETTLEMENT_INVOICE,
        "payment_preference": PAYMENT_ABN,
        "provider_abn": _format_abn(onboarding.abn),
        "provider_entity_name": getattr(onboarding, "abn_entity_name", None),
        "gst_registered": bool(getattr(onboarding, "gst_registered", False) or getattr(onboarding, "abn_gst_registered", False)),
        "super_review_required": True,
        "super_payable_confirmed": False,
        "facilitator_notice": "ChemistTasker provides the technology that facilitates the connection and records the agreed shift terms. The services engagement is between the pharmacy/principal and the assignee/provider; ChemistTasker is not the employer or engaging principal for the shift.",
        "relationship_notice": "The parties confirm they intend an independent services engagement. An ABN or invoice does not by itself determine legal contractor status, and these terms do not waive workplace rights that apply by law.",
        "super_notice": "Invoice settlement does not by itself remove superannuation obligations. The pharmacy/principal must review whether super is payable for a labour-only contractor.",
        "invoice_notice": "The worked shift remains visible in roster and timesheet records, but settlement is routed to the existing ChemistTasker invoicing system rather than payroll.",
    }


def require_acceptance_payload(*, terms, data):
    if not terms.get("acceptance_required"):
        return
    if data.get("engagement_terms_accepted") is not True:
        raise ValidationError({"engagement_terms_accepted": "Review and accept the shift engagement terms before confirming the shift."})
    if terms.get("engagement_kind") == KIND_INDEPENDENT_CONTRACTOR and data.get("independent_contractor_status_confirmed") is not True:
        raise ValidationError({"independent_contractor_status_confirmed": "Confirm the intended independent-contractor relationship separately from the ABN/payment selection."})


def freeze_accepted_terms(*, terms, user):
    now = timezone.now()
    return {**terms, "accepted_at": now.isoformat(), "accepted_by_user_id": user.id}, now
