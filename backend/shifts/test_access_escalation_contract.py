"""Who manages a pharmacy, which shift roles a worker sees, and how shift visibility escalates.

These rules are used by shifts, offers, roster, chat, rewards, worker finance and the organization serializers. The
tests go through the historical entry points (BaseShiftViewSet static methods, ShiftSerializer.build_allowed_tiers,
organizations.serializers.user_can_view_full_pharmacy), so the same assertions hold while the rules move to their
owners.
"""
from datetime import date, time, timedelta

from django.test import TestCase
from django.utils import timezone

from client_profile.characterization_support import make_owner_with_pharmacy, make_user
from onboarding.models import OtherStaffOnboarding
from organizations.models import Chain, Organization, Pharmacy, PharmacyAdmin
from organizations.serializers import user_can_view_full_pharmacy
from shifts.base import BaseShiftViewSet, _shift_roles_visible_to_user, _user_can_perform_shift_role
from shifts.models import Shift, ShiftInterest, ShiftSlot
from shifts.serializers import ShiftSerializer
from users.models import OrganizationMembership


class ManagePharmacyRuleTests(TestCase):
    def setUp(self):
        self.owner, self.pharmacy = make_owner_with_pharmacy("Managed")
        self.organization = Organization.objects.create(name="Org", slug="org-access")
        self.pharmacy.organization = self.organization
        self.pharmacy.save(update_fields=["organization"])
        _other_owner, self.other = make_owner_with_pharmacy("Other")

    def admin(self, level):
        user = make_user("OWNER")
        PharmacyAdmin.objects.create(user=user, pharmacy=self.pharmacy, admin_level=level)
        return user

    def org_member(self, role, pharmacies=()):
        user = make_user("OWNER")
        membership = OrganizationMembership.objects.create(user=user, organization=self.organization, role=role)
        membership.pharmacies.set(pharmacies)
        return user

    def test_who_can_manage_a_pharmacy(self):
        cases = {
            "owner": (self.owner, True),
            "org admin": (self.org_member("ORG_ADMIN"), True),
            "chief admin of the pharmacy": (self.org_member("CHIEF_ADMIN", [self.pharmacy]), True),
            "region admin of the pharmacy": (self.org_member("REGION_ADMIN", [self.pharmacy]), True),
            "region admin elsewhere": (self.org_member("REGION_ADMIN", [self.other]), False),
            "manager admin": (self.admin(PharmacyAdmin.AdminLevel.MANAGER), True),
            "roster manager admin": (self.admin(PharmacyAdmin.AdminLevel.ROSTER_MANAGER), True),
            "communication manager admin": (self.admin(PharmacyAdmin.AdminLevel.COMMUNICATION_MANAGER), False),
            "stranger": (make_user("PHARMACIST"), False),
        }
        for label, (user, expected) in cases.items():
            with self.subTest(label):
                self.assertEqual(BaseShiftViewSet._user_can_manage_pharmacy(user, self.pharmacy), expected)
                self.assertEqual(user_can_view_full_pharmacy(user, self.pharmacy), expected)

    def test_serializer_rule_refuses_anonymous_and_missing_pharmacy(self):
        from django.contrib.auth.models import AnonymousUser

        self.assertFalse(user_can_view_full_pharmacy(AnonymousUser(), self.pharmacy))
        self.assertFalse(user_can_view_full_pharmacy(self.owner, None))

    def test_managed_pharmacies(self):
        managed = lambda user: set(BaseShiftViewSet._managed_pharmacies(user).values_list("id", flat=True))  # noqa: E731
        self.assertEqual(managed(self.owner), {self.pharmacy.id})
        self.assertEqual(managed(self.org_member("ORG_ADMIN")), {self.pharmacy.id})
        self.assertEqual(managed(self.admin(PharmacyAdmin.AdminLevel.ROSTER_MANAGER)), {self.pharmacy.id})
        self.assertEqual(managed(self.admin(PharmacyAdmin.AdminLevel.COMMUNICATION_MANAGER)), set())
        # CURRENT BEHAVIOUR: CHIEF/REGION admins can manage their pharmacies (rule above) but the managed-pharmacy
        # listing does not include them. Pinned here; aligning the two is a separate, deliberate decision.
        self.assertEqual(managed(self.org_member("CHIEF_ADMIN", [self.pharmacy])), set())
        self.assertEqual(managed(make_user("PHARMACIST")), set())


class ShiftRoleVisibilityTests(TestCase):
    def test_roles_visible_per_worker(self):
        def other_staff(role_type):
            user = make_user("OTHER_STAFF")
            OtherStaffOnboarding.objects.create(user=user, role_type=role_type)
            return user

        cases = {
            "pharmacist": (make_user("PHARMACIST"), ["PHARMACIST"]),
            "explorer": (make_user("EXPLORER"), ["EXPLORER"]),
            "intern": (other_staff("INTERN"), ["INTERN"]),
            "assistant": (other_staff("ASSISTANT"), ["ASSISTANT", "TECHNICIAN", "STUDENT"]),
            "student": (other_staff("STUDENT"), ["ASSISTANT", "TECHNICIAN", "STUDENT"]),
            "owner": (make_user("OWNER"), ["PHARMACIST", "TECHNICIAN", "ASSISTANT", "EXPLORER", "INTERN", "STUDENT"]),
        }
        for label, (user, roles) in cases.items():
            with self.subTest(label):
                self.assertEqual(_shift_roles_visible_to_user(user), roles)
        pharmacist = make_user("PHARMACIST")
        self.assertTrue(_user_can_perform_shift_role(pharmacist, "pharmacist"))
        self.assertFalse(_user_can_perform_shift_role(pharmacist, "ASSISTANT"))


class EscalationRuleTests(TestCase):
    def setUp(self):
        self.owner, self.pharmacy = make_owner_with_pharmacy("Escalating")

    def shift(self, **values):
        shift = Shift.objects.create(
            pharmacy=self.pharmacy, created_by=self.owner, role_needed="PHARMACIST", employment_type="LOCUM",
            visibility="FULL_PART_TIME", **values,
        )
        ShiftSlot.objects.create(shift=shift, date=date.today() + timedelta(days=5), start_time=time(9, 0),
                                 end_time=time(17, 0))
        return shift

    def test_allowed_tiers_follow_chain_and_organization(self):
        self.assertEqual(ShiftSerializer.build_allowed_tiers(self.pharmacy),
                         ["FULL_PART_TIME", "LOCUM_CASUAL", "PLATFORM"])
        chain = Chain.objects.create(owner=self.pharmacy.owner, name="Chain")
        chain.pharmacies.add(self.pharmacy)
        self.pharmacy.organization = Organization.objects.create(name="O", slug="o-escalation")
        self.pharmacy.save(update_fields=["organization"])
        self.assertEqual(ShiftSerializer.build_allowed_tiers(Pharmacy.objects.get(pk=self.pharmacy.pk)),
                         ["FULL_PART_TIME", "LOCUM_CASUAL", "OWNER_CHAIN", "ORG_CHAIN", "PLATFORM"])

    def test_current_index_and_manual_escalation_stamps(self):
        tiers = ["FULL_PART_TIME", "LOCUM_CASUAL", "PLATFORM"]
        shift = self.shift()
        self.assertEqual(BaseShiftViewSet._resolve_current_index(shift, tiers), 0)
        shift.visibility, shift.escalation_level = "ORG_CHAIN", 7  # not an allowed tier: fall back, clamped
        self.assertEqual(BaseShiftViewSet._resolve_current_index(shift, tiers), 2)
        shift = self.shift()
        stamp = timezone.now() - timedelta(minutes=5)
        self.assertEqual(BaseShiftViewSet._apply_escalation(shift, tiers, 2, timestamp=stamp), "PLATFORM")
        shift.refresh_from_db()
        self.assertEqual((shift.visibility, shift.escalation_level), ("PLATFORM", 2))
        self.assertEqual((shift.escalate_to_locum_casual, shift.escalate_to_platform), (stamp, stamp))

    def test_due_escalations_apply_when_the_queryset_is_read(self):
        # CURRENT BEHAVIOUR: BaseShiftViewSet.get_queryset escalates due shifts as a side effect of every read
        now = timezone.now()
        due = self.shift(escalate_to_locum_casual=now - timedelta(minutes=1))
        not_due = self.shift(escalate_to_locum_casual=now + timedelta(hours=1))
        with_interest = self.shift(escalate_to_locum_casual=now - timedelta(minutes=1))
        ShiftInterest.objects.create(shift=with_interest, user=make_user("PHARMACIST"))
        viewset = BaseShiftViewSet()
        viewset._auto_escalate_shifts(now)
        for shift, expected in ((due, "LOCUM_CASUAL"), (not_due, "FULL_PART_TIME"), (with_interest, "FULL_PART_TIME")):
            shift.refresh_from_db()
            self.assertEqual(shift.visibility, expected)


class CanonicalOwnerIdentityTests(TestCase):
    """The historical entry points are the canonical rules themselves, not copies."""

    def test_historical_paths_resolve_to_the_owners(self):
        from organizations import access as organization_access
        from shifts import access as shift_access
        from shifts import base, escalation, serializers

        self.assertIs(BaseShiftViewSet._user_can_manage_pharmacy, organization_access.user_can_manage_pharmacy)
        self.assertIs(BaseShiftViewSet._managed_pharmacies, organization_access.managed_pharmacies)
        self.assertIs(user_can_view_full_pharmacy, organization_access.user_can_manage_pharmacy)
        self.assertIs(BaseShiftViewSet._resolve_current_index, escalation.resolve_current_index)
        self.assertIs(BaseShiftViewSet._apply_escalation, escalation.apply_escalation)
        self.assertIs(serializers.ShiftSerializer.build_allowed_tiers, escalation.allowed_tiers)
        self.assertIs(base.PUBLIC_LEVEL, escalation.PUBLIC_LEVEL)
        self.assertIs(base.COMMUNITY_LEVELS, escalation.COMMUNITY_LEVELS)
        self.assertIs(base._shift_roles_visible_to_user, shift_access._shift_roles_visible_to_user)
        self.assertIs(base.NON_INTERN_OTHER_STAFF_SHIFT_ROLES, shift_access.NON_INTERN_OTHER_STAFF_SHIFT_ROLES)
