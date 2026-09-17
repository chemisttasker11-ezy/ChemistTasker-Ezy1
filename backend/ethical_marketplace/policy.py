from dataclasses import asdict, dataclass, field

from django.utils import timezone

from client_profile.models import OwnerOnboarding, Pharmacy, PharmacyAdmin
from marketplace.policy import evaluate_marketplace_access, owns_pharmacy
from .models import EthicalJurisdictionPolicy, EthicalPharmacyApproval, EthicalPharmacyGrant, EthicalProfessionalAccess

CAPABILITIES = {"VIEW_CHAIN_ETHICAL", "MANAGE_OWN_STOCK", "PREPARE_LISTING", "REQUEST_TRANSFER", "APPROVE_TRANSFER", "DISPATCH", "RECEIVE"}


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


def _pharmacy_in_source_chain(listing, pharmacy):
    if listing.scope_chain_id:
        return listing.scope_chain.pharmacies.filter(pk=pharmacy.pk).exists()
    return pharmacy.owner_id == listing.scope_owner_id


def listing_visible_to(user, listing):
    # Source pharmacy team always sees its own listing under current exact access.
    if evaluate_ethical_access(user, listing.pharmacy, "VIEW_CHAIN_ETHICAL", product=listing.product, mode=listing.mode).admitted:
        return True

    owner_profile_id = OwnerOnboarding.objects.filter(user=user).values_list("id", flat=True).first()
    owned = list(Pharmacy.objects.filter(owner_id=owner_profile_id, verified=True))
    admitted_owned = [pharmacy for pharmacy in owned if evaluate_ethical_access(user, pharmacy, "VIEW_CHAIN_ETHICAL", product=listing.product, mode=listing.mode).admitted]

    active_grants = EthicalPharmacyGrant.objects.filter(user=user, revoked_at__isnull=True).filter(models_q_valid())
    active_admin_pharmacy_ids = [grant.pharmacy_id for grant in active_grants if "VIEW_CHAIN_ETHICAL" in grant.allowed_actions]
    admitted_admin = [pharmacy for pharmacy in Pharmacy.objects.filter(id__in=active_admin_pharmacy_ids, verified=True) if evaluate_ethical_access(user, pharmacy, "VIEW_CHAIN_ETHICAL", product=listing.product, mode=listing.mode).admitted]

    chain_admin = any(_pharmacy_in_source_chain(listing, pharmacy) for pharmacy in admitted_admin)
    current = listing.current_circle
    is_s8 = (listing.product.schedule or "").upper() == "S8"

    if current == "CHAIN_PHARMACIES":
        owner_in_chain = any(_pharmacy_in_source_chain(listing, pharmacy) for pharmacy in admitted_owned)
        return chain_admin or owner_in_chain

    if current == "ORGANISATION_OWNERS":
        owner_in_org = bool(listing.scope_organization_id and any(pharmacy.organization_id == listing.scope_organization_id for pharmacy in admitted_owned))
        source_owner = any(pharmacy.owner_id == listing.scope_owner_id for pharmacy in admitted_owned)
        if is_s8:
            if not listing.scope_organization_id:
                return False
            chain_admin_same_org = chain_admin and any(pharmacy.organization_id == listing.scope_organization_id for pharmacy in admitted_admin if _pharmacy_in_source_chain(listing, pharmacy))
            return owner_in_org or chain_admin_same_org
        return owner_in_org or source_owner or chain_admin

    if current == "PLATFORM_OWNERS":
        if is_s8:
            return False
        return chain_admin or bool(admitted_owned)

    return False


def candidate_listings_for(user):
    from django.db.models import Q
    from .models import EthicalListing

    owner_profile_id = OwnerOnboarding.objects.filter(user=user).values_list("id", flat=True).first()
    owned = Pharmacy.objects.filter(owner_id=owner_profile_id, verified=True)
    owner_ids = list(owned.values_list("owner_id", flat=True))
    organisation_ids = [value for value in owned.values_list("organization_id", flat=True) if value]
    admin_pharmacy_ids = [grant.pharmacy_id for grant in EthicalPharmacyGrant.objects.filter(user=user, revoked_at__isnull=True).filter(models_q_valid()) if "VIEW_CHAIN_ETHICAL" in grant.allowed_actions]
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
