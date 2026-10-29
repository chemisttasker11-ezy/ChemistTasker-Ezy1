"""Tenant-scope and capability validation for organization and pharmacy managers."""
from django.test import TestCase
from attendance.approvals import is_authorized_attendance_manager
from attendance.credentials import is_authorized_kiosk_manager
from client_profile.characterization_support import make_owner_with_pharmacy, make_user
from memberships.access import (
    user_can_change_membership,
    user_can_decide_applications,
    user_can_invite_members_to_pharmacy,
)
from memberships.models import Membership
from organizations.models import Organization, Pharmacy, PharmacyAdmin
from organizations.access import managed_pharmacies, user_can_manage_pharmacy, user_can_edit_pharmacy_record
from users.models import OrganizationMembership
from workforce.permissions import can_manage_roster_pharmacy, can_manage_staff_pharmacy


class ScopedRoleSeparationContracts(TestCase):
    def setUp(self):
        self.org_a = Organization.objects.create(name="Scope Org A")
        self.org_b = Organization.objects.create(name="Scope Org B")
        self.owner_a, self.a = make_owner_with_pharmacy("Scope A")
        self.owner_b, self.b = make_owner_with_pharmacy("Scope B")
        self.a.organization = self.org_a
        self.a.save(update_fields=["organization"])
        self.b.organization = self.org_b
        self.b.save(update_fields=["organization"])
        self.manager = make_user("ORG_STAFF")
        self.role = OrganizationMembership.objects.create(
            user=self.manager, organization=self.org_a,
            role="REGION_ADMIN", admin_level="ROSTER_MANAGER",
            region="Synthetic A",
        )
        self.role.pharmacies.add(self.a)

    def test_region_roster_manager_can_manage_assigned_store(self):
        self.assertTrue(can_manage_roster_pharmacy(self.manager, self.a))
        self.assertTrue(user_can_manage_pharmacy(self.manager, self.a))
        self.assertIn(self.a.pk, managed_pharmacies(self.manager).values_list("pk", flat=True))
        self.assertFalse(user_can_edit_pharmacy_record(self.manager, self.a))
        from workforce.permissions import can_manage_workforce_pharmacy
        self.assertTrue(can_manage_workforce_pharmacy(self.manager, self.a))
        self.assertFalse(can_manage_workforce_pharmacy(self.manager, self.b))

    def test_cross_organization_m2m_never_grants_roster_or_visibility(self):
        self.role.pharmacies.add(self.b)
        self.assertFalse(can_manage_roster_pharmacy(self.manager, self.b))
        self.assertFalse(user_can_manage_pharmacy(self.manager, self.b))
        self.assertNotIn(self.b.pk, managed_pharmacies(self.manager).values_list("pk", flat=True))
        from users.org_roles import membership_visible_pharmacy_ids
        self.assertNotIn(self.b.pk, membership_visible_pharmacy_ids(self.role))

    def test_comms_only_region_admin_cannot_manage_roster_or_staff(self):
        self.role.admin_level = "COMMUNICATION_MANAGER"
        self.role.save(update_fields=["admin_level"])
        self.assertFalse(user_can_manage_pharmacy(self.manager, self.a))
        self.assertFalse(can_manage_roster_pharmacy(self.manager, self.a))
        self.assertFalse(can_manage_staff_pharmacy(self.manager, self.a))
        self.assertNotIn(self.a.pk, managed_pharmacies(self.manager).values_list("pk", flat=True))

    def test_role_removed_immediately_revokes_access(self):
        self.role.delete()
        self.assertFalse(user_can_manage_pharmacy(self.manager, self.a))
        self.assertFalse(can_manage_roster_pharmacy(self.manager, self.a))

    def test_inactive_manager_cannot_use_existing_org_role(self):
        self.manager.is_active = False
        self.manager.save(update_fields=["is_active"])
        self.assertFalse(can_manage_roster_pharmacy(self.manager, self.a))
        self.assertFalse(user_can_manage_pharmacy(self.manager, self.a))
        self.assertFalse(user_can_edit_pharmacy_record(self.manager, self.a))
        self.assertFalse(managed_pharmacies(self.manager).exists())

    def test_inactive_pharmacy_admin_and_owner_do_not_retain_authority(self):
        staff = make_user("OTHER_STAFF")
        PharmacyAdmin.objects.create(
            pharmacy=self.a, user=staff,
            admin_level=PharmacyAdmin.AdminLevel.ROSTER_MANAGER,
        )
        self.assertTrue(can_manage_roster_pharmacy(staff, self.a))
        staff.is_active = False
        staff.save(update_fields=["is_active"])
        self.assertFalse(can_manage_roster_pharmacy(staff, self.a))
        self.assertFalse(user_can_manage_pharmacy(staff, self.a))
        self.owner_a.is_active = False
        self.owner_a.save(update_fields=["is_active"])
        self.assertFalse(can_manage_roster_pharmacy(self.owner_a, self.a))

    def test_org_admin_has_own_org_only_and_not_cross_org(self):
        self.role.role = "ORG_ADMIN"
        self.role.admin_level = "MANAGER"
        self.role.save(update_fields=["role", "admin_level"])
        self.assertTrue(can_manage_roster_pharmacy(self.manager, self.a))
        self.assertFalse(can_manage_roster_pharmacy(self.manager, self.b))

    def test_manager_level_region_admin_and_org_wide_roles_keep_roster_and_staff(self):
        self.role.admin_level = "MANAGER"
        self.role.save(update_fields=["admin_level"])
        self.assertTrue(can_manage_roster_pharmacy(self.manager, self.a))
        self.assertTrue(can_manage_staff_pharmacy(self.manager, self.a))
        self.assertFalse(can_manage_staff_pharmacy(self.manager, self.b))
        for role in ("ORG_ADMIN", "CHIEF_ADMIN"):
            self.role.role = role
            self.role.save(update_fields=["role"])
            self.assertTrue(can_manage_roster_pharmacy(self.manager, self.a), role)
            self.assertTrue(can_manage_staff_pharmacy(self.manager, self.a), role)
        self.assertTrue(can_manage_staff_pharmacy(self.owner_a, self.a))

    def test_region_scope_keeps_invitation_staff_roster_and_pairing_actions_distinct(self):
        unassigned = Pharmacy.objects.create(
            name="Unassigned Scope A", organization=self.org_a, owner=self.a.owner,
        )
        # Even a malformed cross-organisation M2M assignment must not grant authority.
        self.role.pharmacies.add(self.b)
        worker = make_user("PHARMACIST")
        memberships = {
            pharmacy.pk: Membership.objects.create(
                pharmacy=pharmacy, user=worker, role="PHARMACIST",
                employment_type="FULL_TIME", status=Membership.Status.ACCEPTED, is_active=True,
            )
            for pharmacy in (self.a, unassigned, self.b)
        }
        cases = (
            ("REGION_ADMIN", "MANAGER", {
                "invite", "change_membership", "decide_applications", "manage_staff",
                "manage_roster", "review_attendance", "pair_kiosk",
            }),
            ("REGION_ADMIN", "ROSTER_MANAGER", {"invite", "manage_roster", "review_attendance"}),
            ("REGION_ADMIN", "COMMUNICATION_MANAGER", {"invite"}),
            ("UNSUPPORTED", "MANAGER", set()),
        )
        for role, level, allowed in cases:
            self.role.role, self.role.admin_level = role, level
            self.role.save(update_fields=["role", "admin_level"])
            for scope, pharmacy in (("assigned", self.a), ("unassigned", unassigned), ("foreign", self.b)):
                with self.subTest(role=role, level=level, scope=scope):
                    actual = {
                        "invite": user_can_invite_members_to_pharmacy(self.manager, pharmacy),
                        "change_membership": user_can_change_membership(self.manager, memberships[pharmacy.pk]),
                        "decide_applications": user_can_decide_applications(self.manager, pharmacy),
                        "manage_staff": can_manage_staff_pharmacy(self.manager, pharmacy),
                        "manage_roster": can_manage_roster_pharmacy(self.manager, pharmacy),
                        "review_attendance": is_authorized_attendance_manager(self.manager, pharmacy),
                        "pair_kiosk": is_authorized_kiosk_manager(self.manager, pharmacy),
                    }
                    expected = {action: scope == "assigned" and action in allowed for action in actual}
                    self.assertEqual(actual, expected)
