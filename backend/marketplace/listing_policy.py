from __future__ import annotations

from dataclasses import dataclass

from client_profile.models import PharmacyAdmin

from .models import MarketplaceCategory, MarketplaceListing
from .policy import evaluate_marketplace_access, owns_pharmacy, resolved_role


PERSONAL_SELLER_ROLES = {
    "OWNER", "PHARMACIST", "INTERN", "TECHNICIAN", "ASSISTANT", "STUDENT", "EXPLORER", "CAREER_SWITCHER",
}

ROLE_GUIDANCE = {
    "OWNER": ["Personally owned books, workwear and approved work accessories", "Pharmacy-owned fixtures, shelving, counters, furniture and approved ordinary stock", "Private ethical medicine stock only through an approved pharmacy context"],
    "PHARMACIST": ["Personally owned professional books and reference material", "Personally owned uniforms, white coats, work bags, calculators and approved professional tools", "Education and study material"],
    "INTERN": ["Intern and exam study material", "Personally owned uniforms, placement items, calculators and work accessories"],
    "TECHNICIAN": ["Dispensary training and reference material", "Personally owned workwear and approved workplace accessories"],
    "ASSISTANT": ["Pharmacy or retail training material", "Personally owned workwear, footwear, bags and ordinary work accessories"],
    "STUDENT": ["Textbooks and study resources", "Placement clothing, lab coats, calculators, stationery and appropriate student equipment"],
    "EXPLORER": ["Appropriate personally owned career, study and ordinary work items"],
    "CAREER_SWITCHER": ["Appropriate personally owned career, study and ordinary work items"],
}


@dataclass(frozen=True)
class ListingPolicyDecision:
    allowed: bool
    code: str | None = None
    message: str | None = None


def category_seller_roles(category: MarketplaceCategory) -> set[str]:
    schema = category.field_schema if isinstance(category.field_schema, dict) else {}
    configured = schema.get("allowed_seller_roles") or schema.get("seller_roles") or []
    if configured:
        return {str(value).upper() for value in configured}
    return set(PERSONAL_SELLER_ROLES)


def can_list_category(user, category: MarketplaceCategory, seller_context: str, pharmacy=None) -> ListingPolicyDecision:
    access = evaluate_marketplace_access(user)
    if access.blockers:
        blocker = access.blockers[0]
        return ListingPolicyDecision(False, blocker.get("code"), blocker.get("message"))

    role = resolved_role(user)
    context = str(seller_context or "").upper()
    if category.is_medicine:
        return ListingPolicyDecision(False, "MEDICINE_PRIVATE_ONLY", "Medicines belong to the private ethical marketplace.")
    if not category.is_active:
        return ListingPolicyDecision(False, "CATEGORY_INACTIVE", "This marketplace category is not available.")
    if category.context not in (context, MarketplaceCategory.Context.BOTH):
        return ListingPolicyDecision(False, "CATEGORY_CONTEXT_MISMATCH", "This category is not available in that seller context.")

    if context == MarketplaceListing.SellerContext.PERSONAL:
        if role not in PERSONAL_SELLER_ROLES:
            return ListingPolicyDecision(False, "PERSONAL_LISTING_ROLE_NOT_ALLOWED", "Your current role cannot create personal marketplace listings.")
        if role not in category_seller_roles(category):
            return ListingPolicyDecision(False, "CATEGORY_SELLER_ROLE_NOT_ALLOWED", "This category is not available for your verified role.")
        return ListingPolicyDecision(True)

    if context == MarketplaceListing.SellerContext.PHARMACY:
        if not pharmacy or not owns_pharmacy(user, pharmacy):
            return ListingPolicyDecision(False, "PHARMACY_OWNER_REQUIRED", "Only the verified current owner can list ordinary pharmacy-owned goods.")
        if role != "OWNER":
            return ListingPolicyDecision(False, "PHARMACY_OWNER_REQUIRED", "Pharmacy-admin status does not grant ordinary pharmacy asset selling authority.")
        return ListingPolicyDecision(True)

    return ListingPolicyDecision(False, "INVALID_SELLER_CONTEXT", "Choose personal or pharmacy seller context.")


def category_payload(category: MarketplaceCategory) -> dict:
    schema = category.field_schema if isinstance(category.field_schema, dict) else {}
    return {"id": category.id, "slug": category.slug, "name": category.name, "description": category.description, "context": category.context, "permitted_modes": category.permitted_modes, "maximum_buyer_roles": category.maximum_buyer_roles, "field_schema": schema, "policy_version": category.policy_version}


def listing_options_for(user) -> dict:
    access = evaluate_marketplace_access(user)
    role = access.role_code
    categories = list(MarketplaceCategory.objects.filter(is_active=True, is_medicine=False).order_by("name"))

    personal_categories = []
    if access.can_trade_personally:
        for category in categories:
            if can_list_category(user, category, MarketplaceListing.SellerContext.PERSONAL).allowed:
                personal_categories.append(category_payload(category))

    pharmacy_categories = []
    if access.can_trade_for_pharmacy:
        pharmacy = None
        if access.eligible_pharmacies:
            from client_profile.models import Pharmacy
            pharmacy = Pharmacy.objects.filter(pk=access.eligible_pharmacies[0]["id"]).select_related("owner", "owner__user").first()
        if pharmacy:
            for category in categories:
                if can_list_category(user, category, MarketplaceListing.SellerContext.PHARMACY, pharmacy).allowed:
                    pharmacy_categories.append(category_payload(category))

    ethical_candidate = False
    if getattr(user, "is_authenticated", False):
        if user.role == "OWNER" and access.eligible_pharmacies:
            ethical_candidate = True
        elif PharmacyAdmin.objects.filter(user=user, is_active=True, pharmacy__verified=True).exists():
            ethical_candidate = True

    return {**access.payload(), "role_guidance": ROLE_GUIDANCE.get(role, []), "personal_categories": personal_categories, "pharmacy_categories": pharmacy_categories, "ethical_entry_available": ethical_candidate, "seller_policy_version": "2026-09-17", "rules": {"ordinary_pharmacy_assets_owner_only": True, "medicine_private_only": True, "admin_ordinary_asset_authority": False}}
