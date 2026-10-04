"""Who may do what in the pharmacy hub, across scopes and user types, and what the hub tells each user.

Complements test_api.py (pharmacy-scope posts, comments, reactions, polls). This file records, for one fixture of an
organization with two pharmacies and users in different roles, the scope resolver's answers (it is also used by
team_calendar and public_hub), the permission map behind /hub/context/, the context payload, group / organization /
platform posting, owner alerts and profile edits. The expected tables were recorded from the code before the hub
module was split, so they pin the rules exactly while the code moves.
"""
import json

from django.core.exceptions import PermissionDenied as DjangoPermissionDenied
from django.test import TestCase
from rest_framework.exceptions import PermissionDenied

from client_profile.characterization_support import BASE, client_for, make_owner_with_pharmacy, make_user
from memberships.models import Membership
from notifications.models import Notification
from onboarding.models import OtherStaffOnboarding
from organizations.models import Organization, PharmacyAdmin
from pharmacy_hub.models import PharmacyCommunityGroup, PharmacyCommunityGroupMembership, PharmacyHubPost
from users.models import OrganizationMembership

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
                              'organizations': [],
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
                              'organization': [403, 403],
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
              'owner': [200, 200],
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
        with self.assertRaises(PermissionDenied):
            Resolver(self.users["region_admin"]).organization_scope(self.org.id)

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


class PostingAcrossScopesTests(HubFixture):
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
    def test_who_may_edit_profiles(self):
        actual = {}
        for label, user in self.users.items():
            pharmacy = client_for(user).patch(HUB + f"pharmacies/{self.pharmacy.id}/profile/", {"about": label},
                                              format="multipart")
            organization = client_for(user).patch(HUB + f"organizations/{self.org.id}/profile/", {"about": label},
                                                  format="multipart")
            actual[label] = [pharmacy.status_code, organization.status_code]
        self.check_recorded("profiles", actual)
