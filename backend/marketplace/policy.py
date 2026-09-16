from dataclasses import asdict, dataclass, field

from django.utils import timezone

from client_profile.models import ExplorerOnboarding, OtherStaffOnboarding, OwnerOnboarding, PharmacistOnboarding, Pharmacy
from .models import IdentityVerification, MarketplaceRestriction, MarketplaceTermsAcceptance

CURRENT_TERMS_VERSION = "2026-09"
ROLE_LABELS = {
    "OWNER": "Pharmacy owner",
    "PHARMACIST": "Pharmacist",
    "INTERN": "Intern pharmacist",
    "TECHNICIAN": "Dispensary technician",
    "ASSISTANT": "Pharmacy assistant",
    "STUDENT": "Pharmacy student",
    "EXPLORER": "Explorer",
    "JUNIOR": "Junior explorer",
    "CAREER_SWITCHER": "Career explorer",
}


@dataclass(frozen=True)
class AccessDecision:
    can_trade_personally: bool
    can_trade_for_pharmacy: bool
    role_code: str | None
    role_label: str | None
    blockers: list[dict] = field(default_factory=list)
    eligible_pharmacies: list[dict] = field(default_factory=list)

    def payload(self):
        return asdict(self)


def resolved_role(user):
    if user.role == "OTHER_STAFF":
        profile = OtherStaffOnboarding.objects.filter(user=user).only("role_type").first()
        return getattr(profile, "role_type", None)
    if user.role == "EXPLORER":
        profile = ExplorerOnboarding.objects.filter(user=user).only("role_type").first()
        return getattr(profile, "role_type", None) or "EXPLORER"
    return user.role


def _onboarding(user):
    mapping = {
        "OWNER": OwnerOnboarding,
        "PHARMACIST": PharmacistOnboarding,
        "OTHER_STAFF": OtherStaffOnboarding,
        "EXPLORER": ExplorerOnboarding,
    }
    model = mapping.get(user.role)
    return model.objects.filter(user=user).first() if model else None


def _identity_ok(user, profile):
    explicit = IdentityVerification.objects.filter(user=user, status=IdentityVerification.Status.VERIFIED).exists()
    return explicit or bool(getattr(profile, "gov_id_verified", False))


def evaluate_marketplace_access(user):
    if not getattr(user, "is_authenticated", False):
        return AccessDecision(False, False, None, None, [{"code": "LOGIN_REQUIRED", "message": "Sign in to trade."}])
    role = resolved_role(user)
    profile = _onboarding(user)
    blockers = []
    if not user.is_active or user.deleted_at:
        blockers.append({"code": "ACCOUNT_INACTIVE", "message": "This account cannot trade."})
    if not user.is_otp_verified:
        blockers.append({"code": "EMAIL_UNVERIFIED", "message": "Verify your email."})
    if not user.mobile_number or not user.is_mobile_verified:
        blockers.append({"code": "MOBILE_UNVERIFIED", "message": "Verify your mobile number."})
    if not profile or not getattr(profile, "verified", False):
        blockers.append({"code": "ONBOARDING_INCOMPLETE", "message": "Complete verified onboarding."})
    if not _identity_ok(user, profile):
        blockers.append({"code": "IDENTITY_UNVERIFIED", "message": "Complete identity verification."})
    date_of_birth = getattr(profile, "date_of_birth", None)
    if date_of_birth:
        today = timezone.localdate()
        age = today.year - date_of_birth.year - ((today.month, today.day) < (date_of_birth.month, date_of_birth.day))
        if age < 18:
            blockers.append({"code": "ADULT_TRADING_REQUIRED", "message": "Marketplace trading is currently limited to adults."})
    elif role in {"EXPLORER", "JUNIOR"} and not IdentityVerification.objects.filter(user=user, status="VERIFIED", assurance_method__icontains="AGE").exists():
        blockers.append({"code": "AGE_ASSURANCE_REQUIRED", "message": "Adult age assurance is required for this role."})
    if not MarketplaceTermsAcceptance.objects.filter(user=user, version=CURRENT_TERMS_VERSION).exists():
        blockers.append({"code": "MARKETPLACE_TERMS_REQUIRED", "message": "Accept the current marketplace terms."})
    now = timezone.now()
    if MarketplaceRestriction.objects.filter(user=user, starts_at__lte=now).filter(ends_at__isnull=True).exists() or MarketplaceRestriction.objects.filter(user=user, starts_at__lte=now, ends_at__gt=now).exists():
        blockers.append({"code": "TRADING_RESTRICTED", "message": "Marketplace trading is restricted."})
    eligible = []
    if user.role == "OWNER" and profile:
        for pharmacy in Pharmacy.objects.filter(owner=profile, verified=True).only("id", "name", "suburb", "state"):
            eligible.append({"id": pharmacy.id, "label": pharmacy.name, "suburb": pharmacy.suburb or "", "state": pharmacy.state or ""})
    base_ok = not blockers
    return AccessDecision(base_ok, base_ok and bool(eligible), role, ROLE_LABELS.get(role, "Verified member"), blockers, eligible)


def owns_pharmacy(user, pharmacy):
    return user.role == "OWNER" and getattr(getattr(pharmacy, "owner", None), "user_id", None) == user.id and pharmacy.verified
