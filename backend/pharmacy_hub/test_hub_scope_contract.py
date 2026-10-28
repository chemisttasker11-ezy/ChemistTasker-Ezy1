"""Who may do what in the pharmacy hub, across scopes and user types, and what the hub tells each user.

Complements test_api.py (pharmacy-scope posts, comments, reactions, polls). This file records, for one fixture of an
organization with two pharmacies and users in different roles, the scope resolver's answers (it is also used by
team_calendar and public_hub), the permission map behind /hub/context/, the context payload, group / organization /
platform posting, owner alerts and profile edits. The expected tables were recorded from the code before the hub
module was split, so they pin the rules exactly while the code moves.
"""
import io
import json
from unittest import mock

from django.core.exceptions import PermissionDenied as DjangoPermissionDenied
from django.core.files.storage import default_storage
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from PIL import Image
from rest_framework.exceptions import PermissionDenied

from client_profile.characterization_support import BASE, client_for, make_owner_with_pharmacy, make_user
from memberships.models import Membership
from notifications.models import Notification
from onboarding.models import OtherStaffOnboarding
from organizations.models import Organization, PharmacyAdmin
from pharmacy_hub.models import PharmacyCommunityGroup, PharmacyCommunityGroupMembership, PharmacyHubPost
from users.models import OrganizationMembership

def png_upload(name):
    buffer = io.BytesIO()
    Image.new("RGB", (1, 1)).save(buffer, format="PNG")
    return SimpleUploadedFile(name, buffer.getvalue(), content_type="image/png")


HUB = BASE + "hub/"
RECORDED = {'context': {'admin_member': {'groups': ['Night team'],
                              'hubs': ['public', 'owner'],
                              'keys': ['chemisttasker_hubs',
                                       'community_groups',
                                       'default_organization_id',
                                       'default_pharmacy_id',
                                       'organization_groups',
                                       'organizations',
                                       'pharmacies'],
                              'organizations': ['Hub Org'],
                              'pharmacies': ['Hub Pharmacy'],
                              'status': 200},
             'explorer': {'groups': [],
                          'hubs': ['public', 'explorer'],
                          'keys': ['chemisttasker_hubs',
                                   'community_groups',
                                   'default_organization_id',
                                   'default_pharmacy_id',
                                   'organization_groups',
                                   'organizations',
                                   'pharmacies'],
                          'organizations': [],
                          'pharmacies': [],
                          'status': 200},
             'intern': {'groups': ['Night team'],
                        'hubs': ['public', 'intern'],
                        'keys': ['chemisttasker_hubs',
                                 'community_groups',
                                 'default_organization_id',
                                 'default_pharmacy_id',
                                 'organization_groups',
                                 'organizations',
                                 'pharmacies'],
                        'organizations': ['Hub Org'],
                        'pharmacies': ['Hub Pharmacy'],
                        'status': 200},
             'locum': {'groups': [],
                       'hubs': ['public', 'pharmacist'],
                       'keys': ['chemisttasker_hubs',
                                'community_groups',
                                'default_organization_id',
                                'default_pharmacy_id',
                                'organization_groups',
                                'organizations',
                                'pharmacies'],
                       'organizations': [],
                       'pharmacies': [],
                       'status': 200},
             'org_admin': {'groups': ['Night team'],
                           'hubs': ['public', 'owner'],
                           'keys': ['chemisttasker_hubs',
                                    'community_groups',
                                    'default_organization_id',
                                    'default_pharmacy_id',
                                    'organization_groups',
                                    'organizations',
                                    'pharmacies'],
                           'organizations': ['Hub Org'],
                           'pharmacies': ['Hub Pharmacy', 'Sibling Pharmacy'],
                           'status': 200},
             'outsider': {'groups': [],
                          'hubs': ['public', 'pharmacist'],
                          'keys': ['chemisttasker_hubs',
                                   'community_groups',
                                   'default_organization_id',
                                   'default_pharmacy_id',
                                   'organization_groups',
                                   'organizations',
                                   'pharmacies'],
                          'organizations': [],
                          'pharmacies': [],
                          'status': 200},
             'owner': {'groups': ['Night team'],
                       'hubs': ['public', 'owner'],
                       'keys': ['chemisttasker_hubs',
                                'community_groups',
                                'default_organization_id',
                                'default_pharmacy_id',
                                'organization_groups',
                                'organizations',
                                'pharmacies'],
                       'organizations': ['Hub Org'],
                       'pharmacies': ['Hub Pharmacy'],
                       'status': 200},
             'region_admin': {'groups': [],
                              'hubs': ['public', 'owner'],
                              'keys': ['chemisttasker_hubs',
                                       'community_groups',
                                       'default_organization_id',
                                       'default_pharmacy_id',
                                       'organization_groups',
                                       'organizations',
                                       'pharmacies'],
                              'organizations': ['Hub Org'],
                              'pharmacies': [],
                              'status': 200},
             'shift_manager': {'groups': [],
                               'hubs': ['public', 'owner'],
                               'keys': ['chemisttasker_hubs',
                                        'community_groups',
                                        'default_organization_id',
                                        'default_pharmacy_id',
                                        'organization_groups',
                                        'organizations',
                                        'pharmacies'],
                               'organizations': [],
                               'pharmacies': [],
                               'status': 200},
             'sibling_staff': {'groups': [],
                               'hubs': ['public', 'pharmacist'],
                               'keys': ['chemisttasker_hubs',
                                        'community_groups',
                                        'default_organization_id',
                                        'default_pharmacy_id',
                                        'organization_groups',
                                        'organizations',
                                        'pharmacies'],
                               'organizations': ['Hub Org'],
                               'pharmacies': ['Sibling Pharmacy'],
                               'status': 200},
             'staff': {'groups': ['Night team'],
                       'hubs': ['public', 'pharmacist'],
                       'keys': ['chemisttasker_hubs',
                                'community_groups',
                                'default_organization_id',
                                'default_pharmacy_id',
                                'organization_groups',
                                'organizations',
                                'pharmacies'],
                       'organizations': ['Hub Org'],
                       'pharmacies': ['Hub Pharmacy'],
                       'status': 200}},
 'permissions': {'admin_member': {'admin': ['Hub Pharmacy'], 'org_admin': False, 'pharmacies': ['Hub Pharmacy']},
                 'explorer': {'admin': [], 'org_admin': False, 'pharmacies': []},
                 'intern': {'admin': [], 'org_admin': False, 'pharmacies': ['Hub Pharmacy']},
                 'locum': {'admin': [], 'org_admin': False, 'pharmacies': []},
                 'org_admin': {'admin': ['Hub Pharmacy', 'Sibling Pharmacy'],
                               'org_admin': True,
                               'pharmacies': ['Hub Pharmacy', 'Sibling Pharmacy']},
                 'outsider': {'admin': [], 'org_admin': False, 'pharmacies': []},
                 'owner': {'admin': ['Hub Pharmacy'], 'org_admin': False, 'pharmacies': ['Hub Pharmacy']},
                 'region_admin': {'admin': [], 'org_admin': False, 'pharmacies': []},
                 'shift_manager': {'admin': [], 'org_admin': False, 'pharmacies': []},
                 'sibling_staff': {'admin': [], 'org_admin': False, 'pharmacies': ['Sibling Pharmacy']},
                 'staff': {'admin': [], 'org_admin': False, 'pharmacies': ['Hub Pharmacy']}},
 'posting': {'admin_member': {'group': [201, 200],
                              'organization': [201, 200],
                              'pharmacy': [201, 200],
                              'platform_pharmacist': [403, 403],
                              'platform_public': [403, 403]},
             'explorer': {'group': [403, 403],
                          'organization': [403, 403],
                          'pharmacy': [403, 403],
                          'platform_pharmacist': [403, 403],
                          'platform_public': [403, 403]},
             'intern': {'group': [403, 403],
                        'organization': [201, 200],
                        'pharmacy': [201, 200],
                        'platform_pharmacist': [403, 403],
                        'platform_public': [403, 403]},
             'locum': {'group': [403, 403],
                       'organization': [403, 403],
                       'pharmacy': [403, 403],
                       'platform_pharmacist': [403, 403],
                       'platform_public': [403, 403]},
             'org_admin': {'group': [201, 200],
                           'organization': [201, 200],
                           'pharmacy': [201, 200],
                           'platform_pharmacist': [403, 403],
                           'platform_public': [403, 403]},
             'outsider': {'group': [403, 403],
                          'organization': [403, 403],
                          'pharmacy': [403, 403],
                          'platform_pharmacist': [403, 403],
                          'platform_public': [403, 403]},
             'owner': {'group': [201, 200],
                       'organization': [201, 200],
                       'pharmacy': [201, 200],
                       'platform_pharmacist': [403, 403],
                       'platform_public': [403, 403]},
             'region_admin': {'group': [403, 403],
                              'organization': [201, 200],
                              'pharmacy': [403, 403],
                              'platform_pharmacist': [403, 403],
                              'platform_public': [403, 403]},
             'shift_manager': {'group': [403, 403],
                               'organization': [403, 403],
                               'pharmacy': [403, 403],
                               'platform_pharmacist': [403, 403],
                               'platform_public': [403, 403]},
             'sibling_staff': {'group': [403, 403],
                               'organization': [201, 200],
                               'pharmacy': [403, 403],
                               'platform_pharmacist': [403, 403],
                               'platform_public': [403, 403]},
             'staff': {'group': [201, 200],
                       'organization': [201, 200],
                       'pharmacy': [201, 200],
                       'platform_pharmacist': [403, 403],
                       'platform_public': [403, 403]}},
 'profiles': {'admin_member': [200, 403],
              'explorer': [403, 403],
              'intern': [403, 403],
              'locum': [403, 403],
              'org_admin': [200, 200],
              'outsider': [403, 403],
              'owner': [200, 403],
              'region_admin': [403, 403],
              'shift_manager': [403, 403],
              'sibling_staff': [403, 403],
              'staff': [403, 403]},
 'resolver': {'admin_member': {'group': [True, False, True], 'pharmacy': [True, False, False]},
              'explorer': {'group': 'denied', 'pharmacy': 'denied'},
              'intern': {'group': 'denied', 'pharmacy': [False, False, False]},
              'locum': {'group': 'denied', 'pharmacy': 'denied'},
              'org_admin': {'group': [True, True, True], 'pharmacy': [True, True, False]},
              'outsider': {'group': 'denied', 'pharmacy': 'denied'},
              'owner': {'group': [True, False, True], 'pharmacy': [True, False, False]},
              'region_admin': {'group': 'denied', 'pharmacy': 'denied'},
              'shift_manager': {'group': 'denied', 'pharmacy': 'denied'},
              'sibling_staff': {'group': 'denied', 'pharmacy': 'denied'},
              'staff': {'group': [False, False, False], 'pharmacy': [False, False, False]}}}


def resolver_class():
    from pharmacy_hub import views  # the historical import path that team_calendar and public_hub use
    return views.HubScopeResolver


def permissions_function():
    from pharmacy_hub import views
    return views.get_user_pharmacy_permissions


class HubFixture(TestCase):
    maxDiff = None

    @classmethod
    def setUpTestData(cls):
        cls.org = Organization.objects.create(name="Hub Org", slug="hub-org")
        cls.owner, cls.pharmacy = make_owner_with_pharmacy("Hub Pharmacy")
        cls.pharmacy.organization = cls.org
        cls.pharmacy.save(update_fields=["organization"])
        _, cls.sibling = make_owner_with_pharmacy("Sibling Pharmacy")
        cls.sibling.organization = cls.org
        cls.sibling.save(update_fields=["organization"])

        def member(employment_type, role="PHARMACIST", user_role="PHARMACIST", pharmacy=None):
            user = make_user(user_role)
            membership = Membership.objects.create(user=user, pharmacy=pharmacy or cls.pharmacy, role=role,
                                                   employment_type=employment_type,
                                                   status=Membership.Status.ACCEPTED, is_active=True)
            return user, membership

        def org_member(role):
            user = make_user("OWNER")
            OrganizationMembership.objects.create(user=user, organization=cls.org, role=role)
            return user

        cls.users = {"owner": cls.owner}
        cls.users["staff"], cls.staff_membership = member("FULL_TIME")
        cls.users["intern"], _ = member("PART_TIME", role="INTERN", user_role="OTHER_STAFF")
        OtherStaffOnboarding.objects.create(user=cls.users["intern"], role_type="INTERN")
        cls.users["locum"], _ = member("LOCUM")
        cls.users["sibling_staff"], _ = member("CASUAL", pharmacy=cls.sibling)
        cls.users["admin_member"], admin_membership = member("FULL_TIME", role="PHARMACY_ADMIN", user_role="OWNER")
        PharmacyAdmin.objects.create(user=cls.users["admin_member"], pharmacy=cls.pharmacy, membership=admin_membership,
                                     admin_level=PharmacyAdmin.AdminLevel.MANAGER, is_active=True)
        cls.users["org_admin"] = org_member("ORG_ADMIN")
        cls.users["region_admin"] = org_member("REGION_ADMIN")
        cls.users["shift_manager"] = org_member("SHIFT_MANAGER")
        cls.users["explorer"] = make_user("EXPLORER")
        cls.users["outsider"] = make_user("PHARMACIST")

        cls.group = PharmacyCommunityGroup.objects.create(pharmacy=cls.pharmacy, name="Night team",
                                                          created_by=cls.owner)
        PharmacyCommunityGroupMembership.objects.create(group=cls.group, membership=cls.staff_membership)

    def check_recorded(self, key, actual):
        expected = RECORDED[key]
        if expected is None:
            print(f"RECORD {key} " + json.dumps(actual, sort_keys=True))
            self.fail(f"record {key}")
        self.assertEqual(actual, expected)


class ResolverAndPermissionTests(HubFixture):
    def test_active_unaccepted_memberships_cannot_access_private_hubs(self):
        scopes = [
            {"scope": "pharmacy", "pharmacy_id": self.pharmacy.id},
            {"scope": "group", "group_id": self.group.id},
            {"scope": "organization", "organization_id": self.org.id},
        ]
        posts = []
        for scope in scopes:
            created = client_for(self.owner).post(HUB + "posts/", {**scope, "body": "Private"}, format="json")
            self.assertEqual(created.status_code, 201, created.content)
            posts.append(created.json()["id"])

        staff = client_for(self.users["staff"])
        for status in (Membership.Status.PENDING, Membership.Status.REJECTED, Membership.Status.LEFT):
            Membership.objects.filter(pk=self.staff_membership.pk).update(status=status)
            for scope, post_id in zip(scopes, posts):
                with self.subTest(status=status, scope=scope["scope"]):
                    self.assertEqual(staff.get(HUB + "posts/", scope).status_code, 403)
                    self.assertEqual(staff.get(HUB + f"posts/{post_id}/").status_code, 403)
                    self.assertEqual(staff.post(HUB + "posts/", {**scope, "body": "Denied"}, format="json").status_code, 403)
            context = staff.get(HUB + "context/").json()
            self.assertEqual(context["pharmacies"], [])
            self.assertEqual(context["organizations"], [])
            self.assertEqual(context["community_groups"], [])
            self.assertEqual(staff.get(HUB + "groups/").json(), [])

        Membership.objects.filter(pk=self.staff_membership.pk).update(status=Membership.Status.ACCEPTED)
        for scope, post_id in zip(scopes, posts):
            with self.subTest(accepted_scope=scope["scope"]):
                self.assertEqual(staff.get(HUB + "posts/", scope).status_code, 200)
                self.assertEqual(staff.get(HUB + f"posts/{post_id}/").status_code, 200)
                self.assertEqual(staff.post(HUB + "posts/", {**scope, "body": "Accepted"}, format="json").status_code, 201)
        self.assertTrue(staff.get(HUB + "context/").json()["community_groups"])
        self.assertTrue(staff.get(HUB + "groups/").json())

    def test_scope_resolver_answers(self):
        Resolver = resolver_class()
        actual = {}
        for label, user in self.users.items():
            resolver = Resolver(user)
            row = {}
            for scope, call in (("pharmacy", lambda: resolver.pharmacy_scope(self.pharmacy.id)),
                                ("group", lambda: resolver.group_scope(self.group.id))):
                try:
                    result = call()
                    row[scope] = [bool(result["has_admin_permissions"]), bool(result.get("is_org_admin")),
                                  bool(result.get("has_group_admin_permissions"))]
                except (PermissionDenied, DjangoPermissionDenied):
                    row[scope] = "denied"
            actual[label] = row
        self.check_recorded("resolver", actual)

    def test_scoped_org_roles_cannot_escape_their_canonical_pharmacy_scope(self):
        Resolver = resolver_class()

        with self.assertRaises(PermissionDenied):
            Resolver(self.users["region_admin"]).pharmacy_scope(self.pharmacy.id)
        with self.assertRaises(PermissionDenied):
            Resolver(self.users["shift_manager"]).pharmacy_scope(self.pharmacy.id)
        with self.assertRaises(PermissionDenied):
            Resolver(self.users["shift_manager"]).organization_scope(self.org.id)

        region_membership = OrganizationMembership.objects.get(
            user=self.users["region_admin"],
            organization=self.org,
        )
        region_membership.pharmacies.add(self.pharmacy)

        scoped = Resolver(self.users["region_admin"]).pharmacy_scope(self.pharmacy.id)
        self.assertTrue(scoped["has_admin_permissions"])
        self.assertFalse(scoped["is_org_admin"])
        with self.assertRaises(PermissionDenied):
            Resolver(self.users["region_admin"]).pharmacy_scope(self.sibling.id)
        # Their own organisation hub is open to them, without organisation administration.
        org_scope = Resolver(self.users["region_admin"]).organization_scope(self.org.id)
        self.assertFalse(org_scope["has_admin_permissions"])
        self.assertFalse(org_scope["is_org_admin"])

        membership_count = Membership.objects.filter(
            user=self.users["region_admin"],
            pharmacy=self.pharmacy,
        ).count()
        admin_count = PharmacyAdmin.objects.filter(
            user=self.users["region_admin"],
            pharmacy=self.pharmacy,
        ).count()
        created = client_for(self.users["region_admin"]).post(
            HUB + "posts/",
            {"scope": "pharmacy", "pharmacy_id": self.pharmacy.id, "body": "Scoped region update"},
            format="json",
        )
        self.assertEqual(created.status_code, 201, created.content)
        self.assertEqual(
            Membership.objects.filter(user=self.users["region_admin"], pharmacy=self.pharmacy).count(),
            membership_count,
            "hub posting must not manufacture a pharmacy membership for scoped org authority",
        )
        self.assertEqual(
            PharmacyAdmin.objects.filter(user=self.users["region_admin"], pharmacy=self.pharmacy).count(),
            admin_count,
            "hub posting must not promote a scoped org role to PharmacyAdmin",
        )

    def test_region_admin_reads_and_posts_in_own_org_hub_only(self):
        region = self.users["region_admin"]
        client = client_for(region)
        feed = client.get(HUB + "posts/", {"scope": "organization", "organization_id": self.org.id})
        self.assertEqual(feed.status_code, 200, feed.content)

        memberships_before = Membership.objects.filter(user=region).count()
        created = client.post(
            HUB + "posts/",
            {"scope": "organization", "organization_id": self.org.id, "body": "Region update"},
            format="json",
        )
        self.assertEqual(created.status_code, 201, created.content)
        self.assertNotIn(
            "email",
            created.json()["author"]["user_details"],
            "Hub author payloads expose display identity, not contact e-mail",
        )
        self.assertEqual(
            Membership.objects.filter(user=region).count(),
            memberships_before,
            "an organisation role posts as its user, never through a manufactured pharmacy membership",
        )
        post = PharmacyHubPost.objects.get(pk=created.json()["id"])
        self.assertEqual(post.author_user_id, region.id)
        self.assertIsNone(post.author_membership_id)

        pin = client.post(HUB + f"posts/{post.id}/pin/")
        self.assertEqual(pin.status_code, 403, "a region admin is not an organisation hub administrator")

        other_org = Organization.objects.create(name="Other Hub Org", slug="other-hub-org")
        with self.assertRaises(PermissionDenied):
            resolver_class()(region).organization_scope(other_org.id)

    def test_chief_admin_is_an_organisation_wide_hub_admin(self):
        chief = make_user("OWNER")
        OrganizationMembership.objects.create(user=chief, organization=self.org, role="CHIEF_ADMIN")
        Resolver = resolver_class()

        org_scope = Resolver(chief).organization_scope(self.org.id)
        self.assertTrue(org_scope["has_admin_permissions"])
        self.assertTrue(org_scope["is_org_admin"])
        for pharmacy in (self.pharmacy, self.sibling):
            with self.subTest(pharmacy=pharmacy.name):
                self.assertTrue(Resolver(chief).pharmacy_scope(pharmacy.id)["has_admin_permissions"])

        profile = client_for(chief).patch(
            HUB + f"organizations/{self.org.id}/profile/", {"about": "Chief edit"}, format="json"
        )
        self.assertEqual(profile.status_code, 200, profile.content)

    def test_member_directory_is_names_only_own_pharmacy_first_and_searchable(self):
        staff = self.users["staff"]
        client = client_for(staff)
        response = client.get(HUB + "members/", {"scope": "organization", "organization_id": self.org.id})
        self.assertEqual(response.status_code, 200, response.content)
        rows = response.json()
        self.assertEqual(
            set(rows[0]),
            {"membership_id", "user_id", "full_name", "profile_photo_url", "role", "employment_type", "job_title",
             "pharmacy_id", "pharmacy_name", "is_own_pharmacy"},
            "the directory returns the avatar but never contact details",
        )
        pharmacies = [row["pharmacy_id"] for row in rows]
        self.assertIn(self.sibling.id, pharmacies, "organisation scope lists sibling pharmacies' staff")
        first_sibling = pharmacies.index(self.sibling.id)
        self.assertTrue(all(row["is_own_pharmacy"] for row in rows[:first_sibling]))
        self.assertFalse(any(row["is_own_pharmacy"] for row in rows[first_sibling:]))
        self.assertNotIn(
            self.users["locum"].id, {row["user_id"] for row in rows}, "only active pharmacy staff can be tagged"
        )

        sibling_user = self.users["sibling_staff"]
        sibling_user.first_name = "Zelda"
        sibling_user.save(update_fields=["first_name"])
        searched = client.get(
            HUB + "members/", {"scope": "organization", "organization_id": self.org.id, "search": "zel"}
        ).json()
        self.assertEqual([row["user_id"] for row in searched], [sibling_user.id])

        own = client.get(HUB + "members/", {"scope": "pharmacy", "pharmacy_id": self.pharmacy.id}).json()
        self.assertEqual({row["pharmacy_id"] for row in own}, {self.pharmacy.id})

        outsider = client_for(self.users["outsider"]).get(
            HUB + "members/", {"scope": "organization", "organization_id": self.org.id}
        )
        self.assertEqual(outsider.status_code, 403)
        self.assertEqual(client.get(HUB + "members/").status_code, 400)

    def test_group_creator_stays_group_admin_while_active_staff_and_owner_always_admins(self):
        manager = self.users["admin_member"]
        created = client_for(manager).post(
            HUB + "groups/",
            {"pharmacy_id": self.pharmacy.id, "name": "Dispensary team"},
            format="json",
        )
        self.assertEqual(created.status_code, 201, created.content)
        group = PharmacyCommunityGroup.objects.get(pk=created.json()["id"])
        self.assertTrue(
            group.memberships.get(membership__user=manager).is_admin,
            "the creator is flagged as a group admin at creation",
        )
        Resolver = resolver_class()

        # Demoted from pharmacy admin but still active staff: still the group's admin.
        PharmacyAdmin.objects.filter(user=manager, pharmacy=self.pharmacy).update(is_active=False)
        self.assertTrue(Resolver(manager).group_scope(group.id)["has_group_admin_permissions"])

        # Left the pharmacy: no group access at all; the owner remains the group's admin.
        Membership.objects.filter(user=manager, pharmacy=self.pharmacy).update(is_active=False)
        with self.assertRaises(PermissionDenied):
            Resolver(manager).group_scope(group.id)
        self.assertTrue(Resolver(self.owner).group_scope(group.id)["has_group_admin_permissions"])

    def test_group_creator_loses_admin_access_when_current_pharmacy_scope_is_removed(self):
        Resolver = resolver_class()
        region_admin = self.users["region_admin"]
        region_membership = OrganizationMembership.objects.get(
            user=region_admin,
            organization=self.org,
        )
        region_membership.pharmacies.add(self.pharmacy)

        created = client_for(region_admin).post(
            HUB + "groups/",
            {
                "pharmacy_id": self.pharmacy.id,
                "name": "Scoped temporary group",
                "description": "scope must remain current",
            },
            format="json",
        )
        self.assertEqual(created.status_code, 201, created.content)
        group_id = created.json()["id"]
        group = PharmacyCommunityGroup.objects.get(pk=group_id)
        self.assertEqual(group.created_by_id, region_admin.id)
        self.assertTrue(
            Resolver(region_admin).group_scope(group_id)["has_group_admin_permissions"]
        )

        region_membership.pharmacies.clear()

        with self.assertRaises(PermissionDenied):
            Resolver(region_admin).group_scope(group_id)

        Membership.objects.create(
            user=region_admin,
            pharmacy=self.pharmacy,
            role="CONTACT",
            employment_type="FULL_TIME",
            status=Membership.Status.ACCEPTED,
            is_active=True,
        )
        detail = client_for(region_admin).get(HUB + f"groups/{group_id}/")
        self.assertEqual(detail.status_code, 200, detail.content)
        self.assertFalse(
            detail.json()["is_admin"],
            "historical creator identity must not advertise stale group-admin authority",
        )
        denied = client_for(region_admin).patch(
            HUB + f"groups/{group_id}/",
            {"description": "must not update"},
            format="json",
        )
        self.assertEqual(denied.status_code, 403, denied.content)

    def test_control_plane_hub_authoring_does_not_reactivate_membership_or_create_admin(self):
        org_admin = self.users["org_admin"]
        stale = Membership.objects.create(
            user=org_admin,
            pharmacy=self.pharmacy,
            role="CONTACT",
            employment_type="FULL_TIME",
            status=Membership.Status.LEFT,
            is_active=False,
        )
        admin_count = PharmacyAdmin.objects.filter(
            user=org_admin,
            pharmacy=self.pharmacy,
        ).count()

        created = client_for(org_admin).post(
            HUB + "posts/",
            {"scope": "pharmacy", "pharmacy_id": self.pharmacy.id, "body": "Org admin update"},
            format="json",
        )
        self.assertEqual(created.status_code, 201, created.content)

        stale.refresh_from_db()
        self.assertEqual(stale.status, Membership.Status.LEFT)
        self.assertFalse(stale.is_active)
        self.assertEqual(
            PharmacyAdmin.objects.filter(user=org_admin, pharmacy=self.pharmacy).count(),
            admin_count,
            "hub authoring must not manufacture a PharmacyAdmin assignment",
        )

        post = PharmacyHubPost.objects.get(pk=created.data["id"])
        self.assertEqual(post.author_user_id, org_admin.id)
        self.assertIsNone(post.author_membership_id)

    def test_user_keyed_control_plane_post_uses_real_author_for_tag_notifications(self):
        org_admin = self.users["org_admin"]
        self.assertFalse(
            Membership.objects.filter(user=org_admin, pharmacy=self.pharmacy).exists()
        )

        with mock.patch(
            "pharmacy_hub.posts.async_task",
            side_effect=RuntimeError("broker unavailable"),
        ):
            created = client_for(org_admin).post(
                HUB + "posts/",
                {
                    "scope": "pharmacy",
                    "pharmacy_id": self.pharmacy.id,
                    "body": "Tagged update",
                    "tagged_member_ids": [self.staff_membership.id],
                },
                format="json",
            )
        self.assertEqual(created.status_code, 201, created.content)

        alert = Notification.objects.filter(user=self.users["staff"]).latest("id")
        expected_author = org_admin.get_full_name().strip() or org_admin.email
        self.assertIn(expected_author, alert.title)
        self.assertNotIn("A teammate", alert.title)

    def test_pharmacy_admin_does_not_become_organization_admin(self):
        Resolver = resolver_class()
        scope = Resolver(self.users["admin_member"]).organization_scope(self.org.id)
        self.assertFalse(scope["has_admin_permissions"])
        self.assertFalse(scope["is_org_admin"])

        pharmacy = client_for(self.users["admin_member"]).patch(
            HUB + f"pharmacies/{self.pharmacy.id}/profile/",
            {"about": "pharmacy-admin-change"},
            format="multipart",
        )
        organization = client_for(self.users["admin_member"]).patch(
            HUB + f"organizations/{self.org.id}/profile/",
            {"about": "must-not-change"},
            format="multipart",
        )
        self.assertEqual(pharmacy.status_code, 200, pharmacy.content)
        self.assertEqual(organization.status_code, 403, organization.content)

    def test_permission_map_behind_the_context(self):
        get_permissions = permissions_function()
        actual = {}
        for label, user in self.users.items():
            pharmacies, permissions, memberships, org_admin_ids = get_permissions(user)
            actual[label] = {
                "pharmacies": sorted(p.name for p in pharmacies.values()),
                "admin": sorted(pharmacies[pid].name for pid, entry in permissions.items()
                                if entry.get("has_admin_permissions")),
                "org_admin": bool(org_admin_ids),
            }
        self.check_recorded("permissions", actual)


class ContextTests(HubFixture):
    def test_context_payload_per_user(self):
        actual = {}
        for label, user in self.users.items():
            response = client_for(user).get(HUB + "context/")
            data = response.json()
            actual[label] = {
                "status": response.status_code,
                "keys": sorted(data),
                "pharmacies": sorted(p["name"] for p in data["pharmacies"]),
                "organizations": sorted(o["name"] for o in data["organizations"]),
                "groups": sorted(g["name"] for g in data["community_groups"]),
                "hubs": [h["key"] for h in data["chemisttasker_hubs"]],
            }
        self.check_recorded("context", actual)

    def test_owner_context_does_not_advertise_organization_profile_authority(self):
        # A pharmacy owner inside an organisation manages only their pharmacy profile.
        response = client_for(self.users["owner"]).get(HUB + "context/")
        self.assertEqual(response.status_code, 200, response.content)
        organization = next(
            item for item in response.json()["organizations"] if item["id"] == self.org.id
        )
        self.assertFalse(organization["can_manage_profile"])
        self.assertFalse(organization["is_org_admin"])


class PostingAcrossScopesTests(HubFixture):
    def test_removed_group_author_receives_no_comment_or_reaction_notifications(self):
        author = self.users["staff"]
        owner = client_for(self.owner)
        created = client_for(author).post(
            HUB + "posts/", {"scope": "group", "group_id": self.group.id, "body": "Private"}, format="json"
        )
        self.assertEqual(created.status_code, 201, created.content)
        post_id = created.json()["id"]
        comments = HUB + f"posts/{post_id}/comments/"

        with mock.patch("notifications.services._broadcast") as broadcast, \
                mock.patch("notifications.services._send_expo_push") as push:
            control = owner.post(comments, {"body": "Visible comment"}, format="json")
            self.assertEqual(control.status_code, 201, control.content)
            self.assertTrue(Notification.objects.filter(user=author, body="Visible comment").exists())
            self.assertTrue(broadcast.called)
            self.assertEqual(push.call_args.kwargs["body"], "Visible comment")
            Notification.objects.filter(user=author).delete()
            broadcast.reset_mock()
            push.reset_mock()

            removed = owner.patch(HUB + f"groups/{self.group.id}/", {"member_ids": []}, format="json")
            self.assertEqual(removed.status_code, 200, removed.content)
            self.assertEqual(client_for(author).get(HUB + f"posts/{post_id}/").status_code, 403)
            comment = owner.post(comments, {"body": "Secret after removal"}, format="json")
            self.assertEqual(comment.status_code, 201, comment.content)
            reaction = owner.post(HUB + f"posts/{post_id}/reactions/", {"reaction_type": "LIKE"}, format="json")
            self.assertEqual(reaction.status_code, 200, reaction.content)
            self.assertFalse(Notification.objects.filter(user=author).exists())
            broadcast.assert_not_called()
            push.assert_not_called()

    def test_who_may_post_where(self):
        scopes = {
            "pharmacy": {"scope": "pharmacy", "pharmacy_id": self.pharmacy.id},
            "group": {"scope": "group", "group_id": self.group.id},
            "organization": {"scope": "organization", "organization_id": self.org.id},
            "platform_public": {"scope": "platform", "platform_hub": "PUBLIC"},
            "platform_pharmacist": {"scope": "platform", "platform_hub": "PHARMACIST"},
        }
        actual = {}
        for label, user in self.users.items():
            actual[label] = {}
            for scope_label, scope in scopes.items():
                created = client_for(user).post(HUB + "posts/", {**scope, "body": f"{label} in {scope_label}"},
                                                format="json")
                listed = client_for(user).get(HUB + "posts/", scope)
                actual[label][scope_label] = [created.status_code, listed.status_code]
        self.check_recorded("posting", actual)

    def test_comments_and_reactions_alert_the_post_author(self):
        post = client_for(self.users["staff"]).post(HUB + "posts/", {"scope": "pharmacy", "pharmacy_id": self.pharmacy.id,
                                                                     "body": "Shift swap?"}, format="json").json()
        commenter = self.users["admin_member"]
        response = client_for(commenter).post(HUB + f"posts/{post['id']}/comments/", {"body": "Yes"}, format="json")
        self.assertEqual(response.status_code, 201, response.content)
        response = client_for(commenter).post(HUB + f"posts/{post['id']}/reactions/", {"reaction_type": "LIKE"},
                                              format="json")
        self.assertIn(response.status_code, (200, 201), response.content)
        alerts = list(Notification.objects.filter(user=self.users["staff"]).order_by("id").values_list(
            "title", "action_url"))
        self.assertTrue(alerts)
        self.assertTrue(all(url.startswith("/dashboard/pharmacy-hub?post=") for _, url in alerts), alerts)
        own = client_for(self.users["staff"]).post(HUB + f"posts/{post['id']}/comments/", {"body": "me"}, format="json")
        self.assertEqual(own.status_code, 201)
        self.assertEqual(Notification.objects.filter(user=self.users["staff"]).count(), len(alerts))


class ProfileTests(HubFixture):
    def test_cover_replacement_cleans_old_storage_for_pharmacy_and_organization(self):
        targets = [
            (
                self.pharmacy,
                HUB + f"pharmacies/{self.pharmacy.id}/profile/",
                client_for(self.users["owner"]),
            ),
            (
                self.org,
                HUB + f"organizations/{self.org.id}/profile/",
                client_for(self.users["org_admin"]),
            ),
        ]

        for index, (target, url, owner_client) in enumerate(targets):
            with self.subTest(target=target.__class__.__name__):
                target.cover_image.save(
                    f"old-cover-{index}.png",
                    png_upload(f"old-cover-{index}.png"),
                    save=True,
                )
                old_name = target.cover_image.name
                self.assertTrue(default_storage.exists(old_name))

                with self.captureOnCommitCallbacks(execute=True):
                    response = owner_client.patch(
                        url,
                        {"cover_image": png_upload(f"new-cover-{index}.png")},
                        format="multipart",
                    )

                self.assertEqual(response.status_code, 200, response.content)
                target.refresh_from_db()
                self.assertNotEqual(target.cover_image.name, old_name)
                self.assertFalse(default_storage.exists(old_name))
                self.assertTrue(default_storage.exists(target.cover_image.name))

    def test_who_may_edit_profiles(self):
        actual = {}
        for label, user in self.users.items():
            pharmacy = client_for(user).patch(HUB + f"pharmacies/{self.pharmacy.id}/profile/", {"about": label},
                                              format="multipart")
            organization = client_for(user).patch(HUB + f"organizations/{self.org.id}/profile/", {"about": label},
                                                  format="multipart")
            actual[label] = [pharmacy.status_code, organization.status_code]
        self.check_recorded("profiles", actual)


class PollScopeTests(HubFixture):
    def poll(self, **scope):
        from pharmacy_hub.models import PharmacyHubPoll
        return PharmacyHubPoll.objects.create(question="Which roster?", created_by=self.owner, **scope)

    def listed(self, params):
        response = client_for(self.users["staff"]).get(f"{BASE}hub/polls/", params)
        self.assertEqual(response.status_code, 200, response.data)
        rows = response.data["results"] if isinstance(response.data, dict) else response.data
        return {row["id"] for row in rows}

    def test_organization_scope_lists_only_org_wide_polls(self):
        org_poll = self.poll(organization=self.org)
        own_poll = self.poll(pharmacy=self.pharmacy)
        sibling_poll = self.poll(pharmacy=self.sibling)
        self.assertEqual(self.listed({"scope": "organization", "organization_id": self.org.id}), {org_poll.id})
        self.assertEqual(self.listed({"scope": "pharmacy", "pharmacy_id": self.pharmacy.id}), {own_poll.id})
        self.assertNotIn(sibling_poll.id, self.listed({"scope": "organization", "organization_id": self.org.id}))
