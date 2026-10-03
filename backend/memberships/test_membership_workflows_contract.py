"""What the membership workflows do: invites (single and bulk), who may invite / modify / decide, which memberships
and applications a user sees, invite links and the magic link, application approval and rejection, and a worker
accepting, rejecting or quitting a membership.

Driven through the real endpoints; e-mails and tasks are captured at Celery send_task with on-commit callbacks run,
so the assertions hold while the workflows move to membership services.
"""
from contextlib import contextmanager
from datetime import timedelta
from unittest import mock

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone

from client_profile.characterization_support import client_for, make_owner_with_pharmacy, make_user
from memberships.models import Membership, MembershipApplication, MembershipInviteLink
from notifications.models import Notification
from onboarding.models import OtherStaffOnboarding
from organizations.models import Organization, PharmacyAdmin
from users.models import OrganizationMembership

User = get_user_model()
API = "/api/client-profile/"


@contextmanager
def captured_work(test):
    work = {"emails": [], "tasks": []}

    def record(name, args=None, kwargs=None, **options):
        kwargs = kwargs or {}
        if name == "users.tasks.send_email_task":
            work["emails"].append((kwargs.get("template_name"), tuple(kwargs.get("recipient_list") or [])))
        else:
            work["tasks"].append((name, tuple(args or ())))

    with mock.patch("celery.app.base.Celery.send_task", side_effect=record), \
            test.captureOnCommitCallbacks(execute=True):
        yield work


class MembershipFixture(TestCase):
    def setUp(self):
        self.owner, self.pharmacy = make_owner_with_pharmacy("Members Pharmacy")
        self.org = Organization.objects.create(name="Org", slug="org-members")
        self.pharmacy.organization = self.org
        self.pharmacy.save(update_fields=["organization"])

    def call(self, user, method, path, data=None):
        with captured_work(self) as work:
            response = getattr(client_for(user), method)(f"{API}{path}", data or {}, format="json")
        return response, work

    def admin(self, level):
        user = make_user("OWNER")
        PharmacyAdmin.objects.create(user=user, pharmacy=self.pharmacy, admin_level=level, is_active=True)
        return user

    def org_admin(self):
        user = make_user("OWNER")
        OrganizationMembership.objects.create(user=user, organization=self.org, role="ORG_ADMIN")
        return user

    def member(self, role="PHARMACIST", employment_type="LOCUM", status=Membership.Status.ACCEPTED, active=True,
               pharmacy=None, user_role=None):
        user = make_user(user_role or ("PHARMACIST" if role == "PHARMACIST" else "OTHER_STAFF"))
        membership = Membership.objects.create(user=user, pharmacy=pharmacy or self.pharmacy, role=role,
                                               employment_type=employment_type, status=status, is_active=active,
                                               invited_by=self.owner)
        return user, membership


class InviteTests(MembershipFixture):
    def invite(self, user=None, **data):
        payload = {"pharmacy": self.pharmacy.id, "role": "PHARMACIST", "employment_type": "LOCUM", **data}
        return self.call(user or self.owner, "post", "memberships/", payload)

    def test_inviting_a_new_person_creates_an_active_account_and_emails_a_password_link(self):
        response, work = self.invite(email=" New.Person@Example.com ", invited_name="New Person")
        self.assertEqual(response.status_code, 201, response.data)
        user = User.objects.get(email="new.person@example.com")
        self.assertEqual((user.role, user.is_otp_verified), ("PHARMACIST", False))
        membership = Membership.objects.get(user=user, pharmacy=self.pharmacy)
        self.assertEqual((membership.status, membership.is_active, membership.invited_by_id, membership.invited_name),
                         (Membership.Status.ACCEPTED, True, self.owner.id, "New Person"))
        self.assertEqual(work["emails"], [("emails/pharmacy_invite_new_user.html", ("new.person@example.com",))])

    def test_inviting_an_existing_worker_is_pending_until_they_respond(self):
        worker = make_user("PHARMACIST")
        response, work = self.invite(email=worker.email)
        self.assertEqual(response.status_code, 201, response.data)
        membership = Membership.objects.get(user=worker)
        self.assertEqual((membership.status, membership.is_active), (Membership.Status.PENDING, False))
        self.assertEqual(work["emails"], [("emails/pharmacy_invite_existing_user.html", (worker.email,))])
        self.assertEqual(Notification.objects.filter(user=worker, title=f"Invitation to join {self.pharmacy.name}").count(), 1)

        again, _ = self.invite(email=worker.email)
        self.assertEqual((again.status_code, again.data["detail"]),
                         (400, "This user already has a pending invitation for this pharmacy."))

        other = make_user("PHARMACIST")
        response, work = self.invite(email=other.email, activate_immediately=True)
        membership = Membership.objects.get(user=other)
        self.assertEqual((membership.status, membership.is_active, work["emails"]), (Membership.Status.ACCEPTED, True, []))
        already, _ = self.invite(email=other.email)
        self.assertEqual(already.data["detail"], "User is already a member of this pharmacy.")

    def test_invite_refusals(self):
        assistant = make_user("OTHER_STAFF")
        busy = make_user("PHARMACIST")
        for _ in range(3):
            _, pharmacy = make_owner_with_pharmacy("Busy")
            Membership.objects.create(user=busy, pharmacy=pharmacy, role="PHARMACIST", employment_type="LOCUM",
                                      status=Membership.Status.ACCEPTED, is_active=True)
        link = MembershipInviteLink.objects.create(pharmacy=self.pharmacy, created_by=self.owner, category="LOCUM_CASUAL",
                                                   expires_at=timezone.now() + timedelta(days=7))
        MembershipApplication.objects.create(
            invite_link=link, pharmacy=self.pharmacy, category="LOCUM_CASUAL", role="PHARMACIST", first_name="A",
            last_name="B", email="applicant@example.com", mobile_number="0400000099", status="PENDING",
        )
        cases = {
            "no pharmacy": ({"pharmacy": None, "email": "a@example.com"}, 400, 'Field "pharmacy" is required.'),
            "unknown pharmacy": ({"pharmacy": 999999, "email": "a@example.com"}, 404, "Pharmacy not found."),
            "no email": ({"email": ""}, 400, "email, pharmacy, and role are required."),
            "admin role": ({"email": "a@example.com", "role": "PHARMACY_ADMIN"}, 400,
                           "Use the pharmacy admin management endpoint to invite admins."),
            "pending application": ({"email": "applicant@example.com"}, 400,
                                    "This person already has a pending membership application for this pharmacy. "
                                    "Review that application instead of creating a duplicate invitation."),
            "wrong account role": ({"email": assistant.email}, 400, None),
            "membership limit": ({"email": busy.email}, 400, "This user already a member in 3 pharmacies."),
        }
        for label, (data, status_code, detail) in cases.items():
            with self.subTest(label):
                response, work = self.invite(**data)
                self.assertEqual(response.status_code, status_code, response.data)
                if detail:
                    self.assertEqual(response.data["detail"], detail)
                self.assertEqual(work["emails"], [])
        self.assertIn("cannot be added as Pharmacist", self.invite(email=assistant.email)[0].data["detail"])
        self.assertFalse(User.objects.filter(email="a@example.com").exists())

    def test_who_may_invite(self):
        outsider_owner, _ = make_owner_with_pharmacy("Elsewhere")
        cases = {
            "owner": (self.owner, 201),
            "org admin": (self.org_admin(), 201),
            "manager admin": (self.admin(PharmacyAdmin.AdminLevel.MANAGER), 201),
            "roster manager admin": (self.admin(PharmacyAdmin.AdminLevel.ROSTER_MANAGER), 403),
            "communication manager": (self.admin(PharmacyAdmin.AdminLevel.COMMUNICATION_MANAGER), 403),
            "platform staff": (make_user("OWNER", is_staff=True), 201),
            "another pharmacy's owner": (outsider_owner, 403),
            "a member": (self.member()[0], 403),
        }
        for index, (label, (user, status_code)) in enumerate(cases.items()):
            with self.subTest(label):
                response, _ = self.invite(user=user, email=f"invitee{index}@example.com")
                self.assertEqual(response.status_code, status_code, response.data)

    def test_bulk_invite_reports_each_row(self):
        _, elsewhere = make_owner_with_pharmacy("Elsewhere")
        response, work = self.call(self.owner, "post", "memberships/bulk_invite/", {"invitations": [
            {"email": "one@example.com", "pharmacy": self.pharmacy.id, "role": "PHARMACIST", "employment_type": "LOCUM"},
            {"email": "two@example.com", "role": "PHARMACIST"},
            {"email": "three@example.com", "pharmacy": elsewhere.id, "role": "PHARMACIST"},
            {"email": "four@example.com", "pharmacy": self.pharmacy.id, "role": "PHARMACY_ADMIN"},
            {"email": "five@example.com", "pharmacy": 999999, "role": "PHARMACIST"},
        ]})
        self.assertEqual(response.status_code, 207, response.data)
        self.assertEqual([(r["email"], r["status"], r["membership_status"]) for r in response.data["results"]],
                         [("one@example.com", "invited", Membership.Status.ACCEPTED)])
        self.assertEqual([(e["line"], e["error"]) for e in response.data["errors"]], [
            (2, 'Field "pharmacy" is required.'),
            (3, "Not permitted to invite into this pharmacy."),
            (4, "Pharmacy admin invitations must use the admin management endpoint."),
            (5, "Pharmacy not found."),
        ])
        ok, _ = self.call(self.owner, "post", "memberships/bulk_invite/", {"invitations": [
            {"email": "six@example.com", "pharmacy": self.pharmacy.id, "role": "PHARMACIST", "employment_type": "LOCUM"},
        ]})
        self.assertEqual((ok.status_code, "errors" in ok.data), (201, False))
        bad, _ = self.call(self.owner, "post", "memberships/bulk_invite/", {"invitations": "x"})
        self.assertEqual((bad.status_code, bad.data["detail"]), (400, "Invitations must be a list."))


class MembershipVisibilityTests(MembershipFixture):
    def test_who_sees_and_who_may_change_the_pharmacy_members(self):
        member_user, membership = self.member()
        _, pending = self.member(status=Membership.Status.PENDING, active=False)
        self.member(status=Membership.Status.LEFT, active=False)
        _, elsewhere = make_owner_with_pharmacy("Elsewhere")
        _, foreign = self.member(pharmacy=elsewhere)
        org_admin = self.org_admin()
        manager = self.admin(PharmacyAdmin.AdminLevel.MANAGER)
        comms = self.admin(PharmacyAdmin.AdminLevel.COMMUNICATION_MANAGER)
        outsider = make_user("PHARMACIST")
        expected_ids = {membership.id, pending.id}
        for label, user in {"owner": self.owner, "org admin": org_admin, "manager": manager, "comms": comms,
                            "member": member_user}.items():
            with self.subTest(label):
                response, _ = self.call(user, "get", "memberships/")
                ids = {row["id"] for row in (response.data["results"] if isinstance(response.data, dict) else response.data)}
                self.assertTrue(expected_ids <= ids, (label, ids))
                self.assertNotIn(foreign.id, ids)
        response, _ = self.call(outsider, "get", "memberships/")
        rows = response.data["results"] if isinstance(response.data, dict) else response.data
        self.assertEqual(rows, [])
        filtered, _ = self.call(self.owner, "get", f"memberships/?pharmacy_id={elsewhere.id}")
        self.assertEqual(filtered.data["results"] if isinstance(filtered.data, dict) else filtered.data, [])
        junk, _ = self.call(self.owner, "get", "memberships/?pharmacy_id=abc")
        self.assertEqual(junk.data["results"] if isinstance(junk.data, dict) else junk.data, [])

        for label, user, status_code in (("owner", self.owner, 200), ("org admin", org_admin, 200),
                                         ("manager", manager, 200), ("comms", comms, 403),
                                         ("member", member_user, 403)):
            with self.subTest(change=label):
                response, _ = self.call(user, "patch", f"memberships/{membership.id}/", {"invited_name": label})
                self.assertEqual(response.status_code, status_code, response.data)

    def test_organization_filter_does_not_expand_an_ordinary_member_to_sibling_pharmacies(self):
        member_user, own_membership = self.member(employment_type="FULL_TIME")
        _, sibling = make_owner_with_pharmacy("Sibling Pharmacy")
        sibling.organization = self.org
        sibling.save(update_fields=["organization"])
        _, sibling_membership = self.member(
            pharmacy=sibling,
            employment_type="FULL_TIME",
        )

        response, _ = self.call(
            member_user,
            "get",
            f"memberships/?organization={self.org.id}",
        )
        rows = response.data["results"] if isinstance(response.data, dict) else response.data
        ids = {row["id"] for row in rows}

        self.assertIn(own_membership.id, ids)
        self.assertNotIn(
            sibling_membership.id,
            ids,
            "organization filtering must narrow the caller's authorized pharmacies, not widen them",
        )

    def test_removing_a_member(self):
        _, membership = self.member()
        response, _ = self.call(self.owner, "delete", f"memberships/{membership.id}/")
        self.assertEqual(response.status_code, 204)
        self.assertFalse(Membership.objects.filter(pk=membership.pk).exists())


class InviteLinkTests(MembershipFixture):
    def test_links_are_created_by_those_who_may_invite_and_resolved_by_anyone(self):
        response, _ = self.call(self.owner, "post", "membership-invite-links/",
                                {"pharmacy": self.pharmacy.id, "category": "LOCUM_CASUAL", "expires_in_days": 3})
        self.assertEqual(response.status_code, 201, response.data)
        link = MembershipInviteLink.objects.get(pharmacy=self.pharmacy)
        self.assertAlmostEqual(link.expires_at, timezone.now() + timedelta(days=3), delta=timedelta(minutes=1))
        refused, _ = self.call(self.admin(PharmacyAdmin.AdminLevel.COMMUNICATION_MANAGER), "post",
                               "membership-invite-links/", {"pharmacy": self.pharmacy.id, "category": "LOCUM_CASUAL"})
        self.assertEqual((refused.status_code, refused.data["detail"]), (403, "Not allowed to generate links for this pharmacy."))
        missing, _ = self.call(self.owner, "post", "membership-invite-links/", {"pharmacy": self.pharmacy.id})
        self.assertEqual(missing.status_code, 400)

        for user, seen in ((self.owner, True), (self.org_admin(), True),
                           (self.admin(PharmacyAdmin.AdminLevel.MANAGER), True), (make_user("PHARMACIST"), False)):
            listed, _ = self.call(user, "get", "membership-invite-links/")
            rows = listed.data["results"] if isinstance(listed.data, dict) else listed.data
            self.assertEqual(bool(rows), seen)

        info, _ = self.call(None, "get", f"magic/memberships/{link.token}/")
        self.assertEqual((info.status_code, info.data["pharmacy_name"], info.data["category"]),
                         (200, self.pharmacy.name, "LOCUM_CASUAL"))
        unknown, _ = self.call(None, "get", "magic/memberships/not-a-uuid/")
        self.assertEqual(unknown.status_code, 404)
        link.expires_at = timezone.now() - timedelta(days=1)
        link.save(update_fields=["expires_at"])
        expired, _ = self.call(None, "get", f"magic/memberships/{link.token}/")
        self.assertEqual(expired.status_code, 410)


class ApplicationDecisionTests(MembershipFixture):
    def application(self, **extra):
        link = MembershipInviteLink.objects.create(pharmacy=self.pharmacy, created_by=self.owner,
                                                   category=extra.pop("category", "LOCUM_CASUAL"),
                                                   expires_at=timezone.now() + timedelta(days=7))
        payload = {"role": "PHARMACIST", "first_name": "Ana", "last_name": "Lee", "username": "ana.lee",
                   "mobile_number": "0412000111", "date_of_birth": "1991-02-03", "email": "ana@example.com", **extra}
        response, work = self.call(None, "post", f"magic/memberships/{link.token}/apply/", payload)
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(work["tasks"], [("client_profile.tasks.email_membership_application_submitted",
                                          (response.data["id"],))])
        return MembershipApplication.objects.get(pk=response.data["id"])

    def test_approving_a_favourite_creates_an_active_membership_for_a_new_account(self):
        app = self.application()
        response, work = self.call(self.owner, "post", f"membership-applications/{app.id}/approve/")
        self.assertEqual(response.status_code, 200, response.data)
        app.refresh_from_db()
        membership = Membership.objects.get(pk=response.data["membership_id"])
        self.assertEqual((app.status, app.approved_membership_id, app.decided_by_id), ("APPROVED", membership.id, self.owner.id))
        self.assertEqual((membership.status, membership.is_active, membership.employment_type, membership.invited_name),
                         (Membership.Status.ACCEPTED, True, "LOCUM", "Ana Lee"))
        self.assertEqual((membership.user.first_name, membership.user.username, membership.user.mobile_number),
                         ("Ana", "ana.lee", "0412000111"))
        self.assertEqual(response.data, {"status": "approved", "membership_id": membership.id,
                                         "employment_engagement_public_id": None, "payroll_enabled": False})
        self.assertIn(("client_profile.tasks.email_membership_application_approved", (app.id,)), work["tasks"])
        self.assertEqual(work["emails"], [("emails/pharmacy_invite_new_user.html", ("ana@example.com",))])
        twice, _ = self.call(self.owner, "post", f"membership-applications/{app.id}/approve/")
        self.assertEqual((twice.status_code, twice.data["detail"]), (400, "Already approved."))

    def test_approval_refusals_and_rejection(self):
        app = self.application()
        bad_type, _ = self.call(self.owner, "post", f"membership-applications/{app.id}/approve/", {"employment_type": "CASUAL"})
        self.assertEqual((bad_type.status_code, bad_type.data["employment_type"]), (400, ["Choose LOCUM or SHIFT_HERO."]))
        comms = self.admin(PharmacyAdmin.AdminLevel.COMMUNICATION_MANAGER)
        hidden, _ = self.call(comms, "post", f"membership-applications/{app.id}/approve/")
        self.assertEqual(hidden.status_code, 404)
        preview, _ = self.call(self.owner, "post", f"membership-applications/{app.id}/award-preview/")
        self.assertEqual((preview.status_code, preview.data["detail"]),
                         (400, "Award preview is only available for pharmacy-staff applications."))

        response, work = self.call(self.owner, "post", f"membership-applications/{app.id}/reject/")
        self.assertEqual((response.status_code, response.data), (200, {"status": "rejected"}))
        app.refresh_from_db()
        self.assertEqual(app.status, "REJECTED")
        self.assertEqual(work["tasks"], [("client_profile.tasks.email_membership_application_rejected", (app.id,))])
        again, _ = self.call(self.owner, "post", f"membership-applications/{app.id}/reject/")
        self.assertEqual((again.status_code, again.data["detail"]), (400, "Already rejected."))

    def test_scoped_region_admin_can_see_and_decide_assigned_pharmacy_applications(self):
        app = self.application()
        region_admin = make_user("OWNER")
        org_membership = OrganizationMembership.objects.create(
            user=region_admin,
            organization=self.org,
            role="REGION_ADMIN",
            region="Gold Coast",
        )
        org_membership.pharmacies.add(self.pharmacy)

        listed, _ = self.call(region_admin, "get", "membership-applications/")
        rows = listed.data["results"] if isinstance(listed.data, dict) else listed.data
        self.assertIn(app.id, {row["id"] for row in rows})

        approved, _ = self.call(
            region_admin,
            "post",
            f"membership-applications/{app.id}/approve/",
        )
        self.assertEqual(approved.status_code, 200, approved.data)

    def test_staff_application_requires_the_tfn_pathway(self):
        app = self.application(category="FULL_PART_TIME", job_title="Pharmacist", email="staff@example.com",
                               mobile_number="0412000222")
        response, _ = self.call(self.owner, "post", f"membership-applications/{app.id}/approve/")
        self.assertEqual(response.status_code, 400)
        self.assertIn("payment_profile", response.data)

    def test_org_admin_visibility_keeps_separately_owned_pharmacies(self):
        app = self.application()

        other_org = Organization.objects.create(name="Other Org", slug="other-org-members")
        _, other_pharmacy = make_owner_with_pharmacy("Other Org Pharmacy")
        other_pharmacy.organization = other_org
        other_pharmacy.save(update_fields=["organization"])
        OrganizationMembership.objects.create(
            user=self.owner,
            organization=other_org,
            role="ORG_ADMIN",
        )

        response, _ = self.call(self.owner, "get", "membership-applications/")
        rows = response.data["results"] if isinstance(response.data, dict) else response.data
        self.assertIn(
            app.id,
            {row["id"] for row in rows},
            "organization administration must not hide applications for a separately owned pharmacy",
        )

    def test_who_sees_applications(self):
        app = self.application()
        org_admin = self.org_admin()
        for label, user, seen in (("owner", self.owner, True), ("org admin", org_admin, True),
                                  ("manager", self.admin(PharmacyAdmin.AdminLevel.MANAGER), True),
                                  ("comms", self.admin(PharmacyAdmin.AdminLevel.COMMUNICATION_MANAGER), False),
                                  ("worker", make_user("PHARMACIST"), False)):
            with self.subTest(label):
                response, _ = self.call(user, "get", "membership-applications/")
                rows = response.data["results"] if isinstance(response.data, dict) else response.data
                self.assertEqual(app.id in {row["id"] for row in rows}, seen)


class MyMembershipTests(MembershipFixture):
    def test_accept_reject_and_quit_notify_the_pharmacy(self):
        worker, membership = self.member(status=Membership.Status.PENDING, active=False)
        response, work = self.call(worker, "post", f"my-memberships/{membership.id}/accept/")
        self.assertEqual(response.status_code, 200, response.data)
        membership.refresh_from_db()
        self.assertEqual((membership.status, membership.is_active), (Membership.Status.ACCEPTED, True))
        self.assertIsNotNone(membership.responded_at)
        self.assertEqual(work["emails"], [("emails/membership_invitation_response.html", (self.owner.email,))])
        # Regression: the response e-mail used to create a second, identical in-app alert on top of notify_users.
        titles = list(Notification.objects.filter(user=self.owner).values_list("title", flat=True))
        self.assertEqual(titles, [f"{worker.get_full_name()} accepted {self.pharmacy.name}"])

        response, work = self.call(worker, "post", f"my-memberships/{membership.id}/quit/")
        self.assertEqual((response.status_code, response.data), (200, {"status": "left"}))
        membership.refresh_from_db()
        self.assertEqual((membership.status, membership.is_active), (Membership.Status.LEFT, False))
        self.assertEqual(len(work["emails"]), 1)

        worker2, invite = self.member(status=Membership.Status.PENDING, active=False)
        response, _ = self.call(worker2, "post", f"my-memberships/{invite.id}/reject/")
        self.assertEqual((response.status_code, response.data), (200, {"status": "rejected"}))
        invite.refresh_from_db()
        self.assertEqual(invite.status, Membership.Status.REJECTED)

    def test_refusals_and_owner_membership(self):
        worker, active = self.member()
        not_pending, _ = self.call(worker, "post", f"my-memberships/{active.id}/accept/")
        self.assertEqual(not_pending.data["detail"], "Only pending invitations can be accepted.")
        someone_else, _ = self.call(make_user("PHARMACIST"), "post", f"my-memberships/{active.id}/quit/")
        self.assertEqual(someone_else.status_code, 404)

        response, _ = self.call(self.owner, "get", "my-memberships/")
        owner_membership = Membership.objects.get(user=self.owner, pharmacy=self.pharmacy)
        self.assertEqual((owner_membership.role, owner_membership.status), ("OWNER", Membership.Status.ACCEPTED))
        quit_owner, _ = self.call(self.owner, "post", f"my-memberships/{owner_membership.id}/quit/")
        self.assertEqual(quit_owner.data["detail"], "Pharmacy owners cannot quit their owner membership.")

        busy_worker, pending = self.member(status=Membership.Status.PENDING, active=False)
        for _ in range(3):
            _, pharmacy = make_owner_with_pharmacy("Busy")
            Membership.objects.create(user=busy_worker, pharmacy=pharmacy, role="PHARMACIST", employment_type="LOCUM",
                                      status=Membership.Status.ACCEPTED, is_active=True)
        full, _ = self.call(busy_worker, "post", f"my-memberships/{pending.id}/accept/")
        self.assertEqual((full.status_code, full.data["detail"]), (400, "You already belong to 3 pharmacies."))
