"""Central attendance eligibility resolution service.

Evaluates whether a worker attempting to clock in at a pharmacy is authorized,
resolving the exact eligibility tier:
1. Confirmed Assignment: Scheduled ShiftSlotAssignment at target pharmacy.
   Rostered workers and confirmed marketplace locums clock normally (non-provisional).
   A confirmed assignment does not require permanent pharmacy membership.
2. Unscheduled Local Staff: Active, accepted employed staff (Full-Time, Part-Time,
   Casual) at the target pharmacy. Provisional (pending manager approval).
3. Cross-Site Staff: Active, accepted employed staff at another pharmacy sharing
   the same owner chain (same owner or active Chain) or same organization.
   Provisional (pending manager approval). Records the source membership.

Unauthorized attempts (inactive, pending, favourite contacts without an assignment,
unrelated staff, null-to-null owner/org matches, org-admin without membership)
are rejected. The service is strictly read-only and never auto-creates shifts
or memberships.
"""

from dataclasses import dataclass
from datetime import datetime, time, timedelta
from typing import Optional
import zoneinfo

from django.db.models import Q
from django.utils import timezone

from client_profile.models import (
    Chain,
    FAVORITE_STAFF_EMPLOYMENT_TYPES,
    Membership,
    PHARMACY_STAFF_EMPLOYMENT_TYPES,
    Pharmacy,
    ProvisionalAttendance,
    ShiftSlotAssignment,
)


class EligibilityType:
    CONFIRMED_ASSIGNMENT = "CONFIRMED_ASSIGNMENT"
    UNROSTERED_LOCAL = "UNROSTERED_LOCAL"
    CROSS_SITE_CHAIN = "CROSS_SITE_CHAIN"
    CROSS_SITE_ORG = "CROSS_SITE_ORG"
    REJECTED = "REJECTED"


@dataclass(frozen=True)
class AttendanceEligibilityResult:
    is_eligible: bool
    eligibility_type: str
    is_provisional: bool
    cover_type: Optional[str] = None
    assignment: Optional[ShiftSlotAssignment] = None
    source_membership: Optional[Membership] = None
    rejection_reason: Optional[str] = None

    def __bool__(self) -> bool:
        return self.is_eligible


def _is_staff_membership(membership: Membership) -> bool:
    """Return True if the membership represents active, accepted employed staff."""
    if not membership or not membership.is_active:
        return False
    if membership.status != Membership.Status.ACCEPTED:
        return False
    if membership.role == "CONTACT":
        return False
    return membership.employment_type in PHARMACY_STAFF_EMPLOYMENT_TYPES


def _get_pharmacy_tz(pharmacy, eval_time: datetime):
    """Determine the relevant timezone for evaluating scheduled times."""
    if pharmacy and getattr(pharmacy, "timezone", None):
        try:
            return zoneinfo.ZoneInfo(pharmacy.timezone)
        except Exception:
            pass
    if eval_time and timezone.is_aware(eval_time):
        return eval_time.tzinfo
    return timezone.get_current_timezone()


def is_draft_roster_assignment(assignment: ShiftSlotAssignment) -> bool:
    """
    Check if an assignment belongs to an unpublished draft roster period.
    When an assignment has is_rostered=True, it is part of a planned roster.
    If the roster period for that pharmacy and week is in DRAFT status (or not published),
    it has not been published yet and cannot confer normal attendance eligibility.
    """
    if not getattr(assignment, "is_rostered", False):
        return False

    slot_date = assignment.slot_date or getattr(assignment.slot, "date", None)
    if not slot_date:
        return False

    monday = slot_date - timedelta(days=slot_date.weekday())
    pharmacy = getattr(assignment.shift, "pharmacy", None) if assignment.shift else None
    if not pharmacy:
        return False

    try:
        from client_profile.models import RosterPeriod
        draft_period = RosterPeriod.objects.filter(
            pharmacy=pharmacy,
            week_start=monday,
            status=RosterPeriod.Status.DRAFT,
        ).exists()
        if draft_period:
            return True

        period = RosterPeriod.objects.filter(
            pharmacy=pharmacy,
            week_start=monday,
        ).first()
        if period and period.status != RosterPeriod.Status.PUBLISHED:
            return True
    except Exception:
        pass

    return False


def _find_matching_assignment(
    user,
    pharmacy,
    target_time: datetime,
    assignment_id: Optional[int] = None,
) -> Optional[ShiftSlotAssignment]:
    """Find a confirmed assignment for user at pharmacy matching target_time or assignment_id."""
    base_qs = ShiftSlotAssignment.objects.filter(
        user=user,
        shift__pharmacy=pharmacy,
    ).select_related("shift", "slot")

    if assignment_id is not None:
        cand = base_qs.filter(id=assignment_id).first()
        if cand and is_draft_roster_assignment(cand):
            return None
        return cand

    tz = _get_pharmacy_tz(pharmacy, target_time)
    eval_local = target_time.astimezone(tz) if timezone.is_aware(target_time) and tz else target_time

    target_date = eval_local.date()
    candidate_dates = [target_date, target_date - timedelta(days=1)]

    candidates = base_qs.filter(
        Q(slot_date__in=candidate_dates)
        | Q(slot_date__isnull=True, slot__date__in=candidate_dates)
    )

    for assignment in candidates:
        if is_draft_roster_assignment(assignment):
            continue

        slot = assignment.slot
        slot_date = assignment.slot_date or slot.date
        if not slot_date:
            continue

        start_time = slot.start_time or time(0, 0)
        end_time = slot.end_time or time(23, 59, 59)

        if tz and timezone.is_aware(target_time):
            start_dt = datetime.combine(slot_date, start_time, tzinfo=tz)
            if end_time <= start_time:
                end_dt = datetime.combine(slot_date + timedelta(days=1), end_time, tzinfo=tz)
            else:
                end_dt = datetime.combine(slot_date, end_time, tzinfo=tz)
        else:
            start_dt = datetime.combine(slot_date, start_time)
            if end_time <= start_time:
                end_dt = datetime.combine(slot_date + timedelta(days=1), end_time)
            else:
                end_dt = datetime.combine(slot_date, end_time)

        # Allow clock-in up to 2 hours before start and up to 2 hours after end
        window_start = start_dt - timedelta(hours=2)
        window_end = end_dt + timedelta(hours=2)

        if window_start <= eval_local <= window_end:
            return assignment

    return None


def resolve_attendance_eligibility(
    user,
    pharmacy: Pharmacy,
    target_time: Optional[datetime] = None,
    assignment_id: Optional[int] = None,
) -> AttendanceEligibilityResult:
    """
    Resolve attendance eligibility for a user at a given pharmacy.

    Strict Order of Precedence:
    1. Confirmed Assignment -> Eligible, non-provisional.
    2. Unscheduled Local Staff -> Eligible, provisional UNROSTERED_LOCAL.
    3. Cross-Site Staff under same owner chain -> Eligible, provisional CROSS_SITE_CHAIN.
    4. Cross-Site Staff under same organization -> Eligible, provisional CROSS_SITE_ORG.
    5. Rejection with reason.

    Negative Rules:
    - Never match on null owner or null organization.
    - Never infer eligibility from onboarding flags or org-admin roles.
    - Favourite contacts / locums in directory without an assignment are rejected.
    - Read-only evaluation; never creates shifts or memberships.
    """
    if user is None or pharmacy is None:
        return AttendanceEligibilityResult(
            is_eligible=False,
            eligibility_type=EligibilityType.REJECTED,
            is_provisional=False,
            rejection_reason="MISSING_USER_OR_PHARMACY",
        )

    eval_time = target_time or timezone.now()

    # -------------------------------------------------------------------------
    # Tier 1: Confirmed Assignment
    # -------------------------------------------------------------------------
    assignment = _find_matching_assignment(
        user=user,
        pharmacy=pharmacy,
        target_time=eval_time,
        assignment_id=assignment_id,
    )
    if assignment is not None:
        # Locums with a confirmed assignment clock normally without permanent membership
        local_membership = Membership.objects.filter(
            user=user,
            pharmacy=pharmacy,
        ).first()
        source_mem = local_membership if (local_membership and _is_staff_membership(local_membership)) else None
        return AttendanceEligibilityResult(
            is_eligible=True,
            eligibility_type=EligibilityType.CONFIRMED_ASSIGNMENT,
            is_provisional=False,
            assignment=assignment,
            source_membership=source_mem,
            cover_type=None,
        )

    # -------------------------------------------------------------------------
    # Tier 2: Unscheduled Local Staff
    # -------------------------------------------------------------------------
    local_membership = Membership.objects.filter(
        user=user,
        pharmacy=pharmacy,
    ).first()

    if local_membership is not None and _is_staff_membership(local_membership):
        return AttendanceEligibilityResult(
            is_eligible=True,
            eligibility_type=EligibilityType.UNROSTERED_LOCAL,
            is_provisional=True,
            cover_type=ProvisionalAttendance.CoverType.UNROSTERED_LOCAL,
            assignment=None,
            source_membership=local_membership,
        )

    # -------------------------------------------------------------------------
    # Tier 3: Cross-Site Staff (Same Owner Chain or Same Organization)
    # -------------------------------------------------------------------------
    remote_memberships = Membership.objects.filter(
        user=user,
        is_active=True,
        status=Membership.Status.ACCEPTED,
        employment_type__in=PHARMACY_STAFF_EMPLOYMENT_TYPES,
    ).exclude(role="CONTACT").exclude(pharmacy=pharmacy).select_related("pharmacy")

    # Tier 3A: Cross-Site Same Owner Chain
    for mem in remote_memberships:
        remote_pharmacy = mem.pharmacy
        if not remote_pharmacy:
            continue

        # Non-null same owner
        if (
            pharmacy.owner_id is not None
            and remote_pharmacy.owner_id is not None
            and pharmacy.owner_id == remote_pharmacy.owner_id
        ):
            return AttendanceEligibilityResult(
                is_eligible=True,
                eligibility_type=EligibilityType.CROSS_SITE_CHAIN,
                is_provisional=True,
                cover_type=ProvisionalAttendance.CoverType.CROSS_SITE_CHAIN,
                assignment=None,
                source_membership=mem,
            )

        # Or shared active Chain
        if (
            Chain.objects.filter(is_active=True, pharmacies=pharmacy)
            .filter(pharmacies=remote_pharmacy)
            .exists()
        ):
            return AttendanceEligibilityResult(
                is_eligible=True,
                eligibility_type=EligibilityType.CROSS_SITE_CHAIN,
                is_provisional=True,
                cover_type=ProvisionalAttendance.CoverType.CROSS_SITE_CHAIN,
                assignment=None,
                source_membership=mem,
            )

    # Tier 3B: Cross-Site Same Organization
    for mem in remote_memberships:
        remote_pharmacy = mem.pharmacy
        if not remote_pharmacy:
            continue

        # Non-null same organization
        if (
            pharmacy.organization_id is not None
            and remote_pharmacy.organization_id is not None
            and pharmacy.organization_id == remote_pharmacy.organization_id
        ):
            return AttendanceEligibilityResult(
                is_eligible=True,
                eligibility_type=EligibilityType.CROSS_SITE_ORG,
                is_provisional=True,
                cover_type=ProvisionalAttendance.CoverType.CROSS_SITE_ORG,
                assignment=None,
                source_membership=mem,
            )

    # -------------------------------------------------------------------------
    # Rejections: Diagnose and report specific reason
    # -------------------------------------------------------------------------
    if local_membership is not None:
        if not local_membership.is_active:
            rejection_reason = "LOCAL_MEMBERSHIP_INACTIVE"
        elif local_membership.status == Membership.Status.PENDING:
            rejection_reason = "LOCAL_MEMBERSHIP_PENDING"
        elif local_membership.status in (Membership.Status.REJECTED, Membership.Status.LEFT):
            rejection_reason = f"LOCAL_MEMBERSHIP_{local_membership.status}"
        elif (
            local_membership.role == "CONTACT"
            or local_membership.employment_type in FAVORITE_STAFF_EMPLOYMENT_TYPES
        ):
            rejection_reason = "FAVORITE_CONTACT_WITHOUT_ASSIGNMENT"
        else:
            rejection_reason = "LOCAL_MEMBERSHIP_INELIGIBLE"
    elif remote_memberships.exists():
        rejection_reason = "REMOTE_MEMBERSHIP_NO_CHAIN_OR_ORG_MATCH"
    else:
        rejection_reason = "NO_ASSIGNMENT_OR_MEMBERSHIP"

    return AttendanceEligibilityResult(
        is_eligible=False,
        eligibility_type=EligibilityType.REJECTED,
        is_provisional=False,
        assignment=None,
        source_membership=None,
        cover_type=None,
        rejection_reason=rejection_reason,
    )
