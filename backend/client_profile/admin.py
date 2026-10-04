"""Historical import path of the domain admin classes; the admin implementations and registrations live in each
domain app's admin module (organizations, onboarding, memberships, shifts)."""
from organizations.admin import (  # noqa: F401
    OrganizationAdmin,
    ChainAdmin,
    PharmacyModelAdmin,
    PharmacyAdminAssignmentAdmin,
)
from onboarding.admin import (  # noqa: F401
    RoleScopedOnboardingAdminMixin,
    OwnerOnboardingAdminForm,
    OwnerOnboardingAdmin,
    PharmacistOnboardingAdmin,
    OtherStaffOnboardingAdmin,
    ExplorerOnboardingAdmin,
)
from memberships.admin import (  # noqa: F401
    MembershipAdmin,
)
from shifts.admin import (  # noqa: F401
    ShiftSlotInline,
    ShiftAdmin,
    ShiftSlotAssignmentAdmin,
    ShiftInterestAdmin,
    ShiftRejectionAdmin,
    ShiftCounterOfferSlotInline,
    ShiftCounterOfferAdmin,
    ShiftOfferAdmin,
)
