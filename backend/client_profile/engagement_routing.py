from __future__ import annotations

from datetime import date

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


def validate_tfn_payroll_profile(user):
    onboarding = worker_onboarding(user)
    if not onboarding:
        raise ValidationError({"payment_profile": "Complete worker onboarding before creating payroll employment terms."})
    if str(onboarding.payment_preference or "").upper() != PAYMENT_TFN:
        raise ValidationError({
            "payment_preference": "Employee/payroll engagements require the TFN pathway. ABN service work is settled through invoicing."
        })
    errors = {}
    if not getattr(onboarding, "tfn_number", None):
        errors["tfn"] = "TFN is required for payroll."
    if not getattr(onboarding, "super_fund_name", None):
        errors["super_fund_name"] = "Super fund name is required for payroll."
    if not getattr(onboarding, "super_usi", None):
        errors["super_usi"] = "Super fund USI is required for payroll."
    if not getattr(onboarding, "super_member_number", None):
        errors["super_member_number"] = "Super member number is required for payroll."
    if errors:
        raise ValidationError(errors)
    return onboarding


def _external_payment_profile(user):
    onboarding = worker_onboarding(user)
    if not onboarding:
        raise ValidationError({"payment_profile": "Complete and verify worker onboarding before accepting this external shift."})
    pref = str(onboarding.payment_preference or "").upper()
    if pref not in {PAYMENT_TFN, PAYMENT_ABN}:
        raise ValidationError({"payment_preference": "Select TFN or ABN in onboarding before accepting this shift."})
    if pref == PAYMENT_TFN:
        validate_tfn_payroll_profile(user)
    else:
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


def build_shift_engagement_terms(*, shift, user, offer=None):
    staff_membership = direct_pharmacy_staff_membership(user=user, pharmacy=shift.pharmacy)
    occurrences = _offer_occurrences(shift, offer)
    pharmacy = shift.pharmacy

    if staff_membership:
        payroll_enabled = bool(getattr(pharmacy, "use_chemisttasker_payroll", False))
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
            "occurrences": occurrences,
            "payroll_enabled": payroll_enabled,
            "notice": (
                "Existing pharmacy staff employment uses the worker's dated EmploymentEngagement for ChemistTasker Payroll."
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
        return {
            **base,
            "engagement_kind": KIND_SHIFT_EMPLOYMENT,
            "settlement_channel": SETTLEMENT_PAYROLL if payroll_enabled else SETTLEMENT_TIMESHEET_ONLY,
            "payment_preference": PAYMENT_TFN,
            "payroll_enabled": payroll_enabled,
            "employment_type": "CASUAL",
            "award_code": "MA000012",
            "super": {
                "fund_name": onboarding.super_fund_name,
                "usi": onboarding.super_usi,
                "member_number_present": bool(onboarding.super_member_number),
            },
            "facilitator_notice": "ChemistTasker facilitates the connection and records acceptance. The employment engagement for this shift is between the pharmacy/employer and the worker.",
            "relationship_notice": (
                "The parties intend this shift to be an employee engagement settled through ChemistTasker Payroll. Applicable Award/NES, tax withholding and superannuation obligations are not displaced by these terms."
                if payroll_enabled
                else
                "The parties intend this shift to be an employee engagement. ChemistTasker records the agreed shift and timesheet, while the pharmacy processes payroll in its own system. Applicable Award/NES, tax withholding and superannuation obligations are not displaced by these terms."
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
        "facilitator_notice": "ChemistTasker provides the technology that facilitates the connection and records the agreed shift terms. The services engagement is between the pharmacy/principal and the assignee/provider; ChemistTasker is not the employer or engaging principal for the shift.",
        "relationship_notice": "The parties confirm they intend an independent services engagement. An ABN or invoice does not by itself determine legal contractor status, and these terms do not waive workplace rights that apply by law.",
        "super_notice": "Invoice settlement does not by itself remove superannuation obligations. The pharmacy/principal must review whether super is payable for a labour-only contractor.",
        "invoice_notice": "The worked shift remains visible in roster and timesheet records, but settlement is routed to the invoicing system rather than payroll.",
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
