from dataclasses import asdict, dataclass, field

from django.utils import timezone

from client_profile.models import OwnerOnboarding, Pharmacy, PharmacyAdmin
from marketplace.policy import evaluate_marketplace_access, owns_pharmacy
from .models import EthicalJurisdictionPolicy, EthicalPharmacyApproval, EthicalPharmacyGrant, EthicalProfessionalAccess

CAPABILITIES = {
    "VIEW_CHAIN_ETHICAL", "MANAGE_OWN_STOCK", "PREPARE_LISTING", "REQUEST_TRANSFER",
    "APPROVE_TRANSFER", "DISPATCH", "RECEIVE",
}


@dataclass(frozen=True)
class EthicalDecision:
    admitted: bool
    action: str
    pharmacy_id: int | None
    is_owner: bool = False
    grant_actions: list[str] = field(default_factory=list)
    blockers: list[dict] = field(default_factory=list)

    def payload(self):
        return asdict(self)


def application_blockers(user, pharmacy):
    decision = evaluate_marketplace_access(user)
    ignored = {"MARKETPLACE_TERMS_REQUIRED"}
    blockers = [row for row in decision.blockers if row["code"] not in ignored]
    owner = owns_pharmacy(user, pharmacy)
    admin = PharmacyAdmin.objects.filter(user=user, pharmacy=pharmacy, is_active=True).exists()
    if not owner and not admin:
        blockers.append({"code": "APPLICATION_AUTHORITY_REQUIRED", "message": "Current owner or assigned pharmacy administrator authority is required."})
    return blockers


def evaluate_ethical_access(user, pharmacy, action="VIEW_CHAIN_ETHICAL", *, product=None, mode=None):
    blockers = application_blockers(user, pharmacy)
    approval = EthicalPharmacyApproval.objects.filter(pharmacy=pharmacy, status=EthicalPharmacyApproval.Status.VERIFIED).first()
    if not approval:
        blockers.append({"code": "PHARMACY_APPROVAL_REQUIRED", "message": "This premises needs a verified ethical marketplace approval."})
    professional = EthicalProfessionalAccess.objects.filter(user=user, status=EthicalProfessionalAccess.Status.VERIFIED).first()
    if not professional or (professional.expires_at and professional.expires_at <= timezone.now()):
        blockers.append({"code": "PROFESSIONAL_ACCESS_REQUIRED", "message": "Reviewed professional access is required."})
    owner = owns_pharmacy(user, pharmacy)
    grant = EthicalPharmacyGrant.objects.filter(user=user, pharmacy=pharmacy, revoked_at__isnull=True, valid_from__lte=timezone.now()).filter(models_q_valid()).first()
    actions = grant.allowed_actions if grant else []
    if not owner and action not in actions:
        blockers.append({"code": "ETHICAL_GRANT_REQUIRED", "message": "The selected action is not granted for this pharmacy."})
    if product and professional:
        if product.schedule not in professional.schedules:
            blockers.append({"code": "SCHEDULE_NOT_APPROVED", "message": "Professional access does not include this schedule."})
        state = (pharmacy.state or "").upper()
        if action not in professional.activities:
            blockers.append({"code": "ACTIVITY_NOT_APPROVED", "message": "Professional access does not include this activity."})
        if state not in {value.upper() for value in professional.jurisdictions}:
            blockers.append({"code": "JURISDICTION_NOT_APPROVED", "message": "Professional access does not include this jurisdiction."})
        now = timezone.now()
        policy = EthicalJurisdictionPolicy.objects.filter(jurisdiction=state, activity=action, schedule=product.schedule, mode__in=(mode or "ANY", "ANY"), allowed=True, effective_from__lte=now).filter(models_q_effective()).exists()
        if not policy:
            blockers.append({"code": "OPERATION_POLICY_NOT_APPROVED", "message": "No current reviewed policy permits this operation."})
    return EthicalDecision(not blockers, action, pharmacy.id, owner, actions, blockers)


def models_q_valid():
    from django.db.models import Q
    now = timezone.now()
    return Q(valid_until__isnull=True) | Q(valid_until__gt=now)


def models_q_effective():
    from django.db.models import Q
    now = timezone.now()
    return Q(effective_until__isnull=True) | Q(effective_until__gt=now)


def listing_visible_to(user, listing):
    # The source pharmacy team always sees its own listing under current access.
    if evaluate_ethical_access(user, listing.pharmacy, "VIEW_CHAIN_ETHICAL", product=listing.product).admitted:
        return True
    owner_profile_id = OwnerOnboarding.objects.filter(user=user).values_list("id", flat=True).first()
    owned = list(Pharmacy.objects.filter(owner_id=owner_profile_id, verified=True))
    admitted_owned = [pharmacy for pharmacy in owned if evaluate_ethical_access(user, pharmacy, "VIEW_CHAIN_ETHICAL", product=listing.product, mode=listing.mode).admitted]
    active_grants = EthicalPharmacyGrant.objects.filter(user=user, revoked_at__isnull=True).filter(models_q_valid())
    active_admin_pharmacy_ids = [grant.pharmacy_id for grant in active_grants if "VIEW_CHAIN_ETHICAL" in grant.allowed_actions]
    admitted_admin = [pharmacy for pharmacy in Pharmacy.objects.filter(id__in=active_admin_pharmacy_ids, verified=True) if evaluate_ethical_access(user, pharmacy, "VIEW_CHAIN_ETHICAL", product=listing.product, mode=listing.mode).admitted]
    # S8 never escapes a real shared organisation and never reaches platform.
    if listing.product.schedule.upper() == "S8":
        return bool(listing.pharmacy.organization_id and any(pharmacy.organization_id == listing.pharmacy.organization_id for pharmacy in admitted_owned + admitted_admin))
    # Chain admins remain eligible at wider circles, but unrelated admins are not
    # added by organisation/platform expansion.
    if listing.scope_chain_id:
        chain_admin = any(listing.scope_chain.pharmacies.filter(pk=pharmacy.pk).exists() for pharmacy in admitted_admin)
    else:
        chain_admin = any(pharmacy.owner_id == listing.scope_owner_id for pharmacy in admitted_admin)
    if chain_admin:
        return True
    if not admitted_owned:
        return False
    if listing.current_circle == "CHAIN_PHARMACIES":
        if listing.scope_chain_id:
            return listing.scope_chain.pharmacies.filter(pk__in=[row.pk for row in admitted_owned]).exists()
        return any(pharmacy.owner_id == listing.scope_owner_id for pharmacy in admitted_owned)
    if listing.current_circle == "ORGANISATION_OWNERS":
        return bool(listing.scope_organization_id and any(pharmacy.organization_id == listing.scope_organization_id for pharmacy in admitted_owned)) or any(pharmacy.owner_id == listing.scope_owner_id for pharmacy in admitted_owned)
    return True


def candidate_listings_for(user):
    """Database-level coarse scope; object policy remains the final authority."""
    from django.db.models import Q
    from .models import EthicalListing

    owner_profile_id = OwnerOnboarding.objects.filter(user=user).values_list("id", flat=True).first()
    owned = Pharmacy.objects.filter(owner_id=owner_profile_id, verified=True)
    owner_ids = list(owned.values_list("owner_id", flat=True))
    organisation_ids = [value for value in owned.values_list("organization_id", flat=True) if value]
    admin_pharmacy_ids = [
        grant.pharmacy_id for grant in EthicalPharmacyGrant.objects.filter(user=user, revoked_at__isnull=True).filter(models_q_valid())
        if "VIEW_CHAIN_ETHICAL" in grant.allowed_actions
    ]
    context_ids = list(owned.values_list("id", flat=True)) + admin_pharmacy_ids
    scope = Q(pharmacy_id__in=context_ids)
    if owner_ids:
        scope |= Q(scope_owner_id__in=owner_ids)
        scope |= Q(current_circle="PLATFORM_OWNERS")
    if organisation_ids:
        scope |= Q(current_circle__in=("ORGANISATION_OWNERS", "PLATFORM_OWNERS"), scope_organization_id__in=organisation_ids)
    if context_ids:
        scope |= Q(scope_chain__pharmacies__id__in=context_ids)
    return EthicalListing.objects.filter(scope).distinct()
