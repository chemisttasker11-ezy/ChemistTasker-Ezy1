"""Pharmacy identity disclosed to a viewer of a shift."""
from organizations.access import user_can_manage_pharmacy
from organizations.serializers import anonymize_pharmacy_detail
from shifts.models import ShiftOffer


def should_mask_shift_pharmacy(shift, user):
    """Anonymous shifts hide the pharmacy until the viewer manages it or is booked on it."""
    if not shift.post_anonymously:
        return False
    memo = shift.__dict__.setdefault("_pharmacy_mask_by_reader", {})
    key = getattr(user, "pk", None)
    if key not in memo:
        memo[key] = _mask_for(shift, user)
    return memo[key]


def _mask_for(shift, user):
    if user_can_manage_pharmacy(user, shift.pharmacy):
        return False
    if not getattr(user, "is_authenticated", False):
        return True
    return not (
        shift.slot_assignments.filter(user_id=user.pk).exists()
        or shift.offers.filter(user_id=user.pk, status=ShiftOffer.Status.ACCEPTED).exists()
    )


def project_shift_pharmacy(shift, user, detail):
    if should_mask_shift_pharmacy(shift, user):
        return anonymize_pharmacy_detail(detail)
    return detail


def shift_pharmacy_name(shift, user):
    return project_shift_pharmacy(shift, user, {"name": shift.pharmacy.name})["name"]
