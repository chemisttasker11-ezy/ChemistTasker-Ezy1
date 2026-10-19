"""New to pharmacy: sign-up questions and minimum age, the overseas mobile skip, and the one-post talent rules."""
from datetime import date, timedelta
from unittest import mock

from django.core.cache import cache
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from client_profile.characterization_support import BASE, client_for, make_user
from onboarding.models import ExplorerOnboarding
from talent.models import ExplorerPost


def years_ago(years, days=0):
    today = date.today()
    return (today.replace(year=today.year - years) - timedelta(days=days)).isoformat()


def register(**extra):
    cache.clear()  # throttle counters
    data = {"email": "new@example.test", "password": "NewcomerPassword123!", "confirm_password": "NewcomerPassword123!",
            "role": "EXPLORER", "accepted_terms": True, "captcha_token": "t", **extra}
    with override_settings(CELERY_TASK_ALWAYS_EAGER=False), mock.patch("users.api_auth.verify_recaptcha", return_value=True), mock.patch("celery.app.base.Celery.send_task"):
        return APIClient().post(f"{BASE}users/register/", data, format="json")


class NewcomerSignupTests(TestCase):
    def test_newcomers_say_who_they_are_and_must_be_fifteen(self):
        response = register()
        self.assertEqual(response.status_code, 400)
        self.assertEqual(set(response.data), {"newcomer_type", "date_of_birth"})
        self.assertIn("at least 15", str(register(newcomer_type="JUNIOR", date_of_birth=years_ago(15, days=-1)).data))

        response = register(newcomer_type="OVERSEAS", date_of_birth=years_ago(30))
        self.assertEqual(response.status_code, 201, response.data)
        profile = ExplorerOnboarding.objects.get(user__email="new@example.test")
        self.assertEqual((profile.role_type, profile.age()), ("OVERSEAS", 30))

    def test_only_overseas_newcomers_may_skip_the_mobile_check(self):
        url = f"{BASE}users/mobile/skip-overseas/"
        junior = make_user("EXPLORER", is_otp_verified=True)
        ExplorerOnboarding.objects.create(user=junior, role_type="JUNIOR")
        self.assertEqual(client_for(junior).post(url, {}, format="json").status_code, 403)
        overseas = make_user("EXPLORER", is_otp_verified=True)
        profile = ExplorerOnboarding.objects.create(user=overseas, role_type="OVERSEAS")
        self.assertIn("first_name", client_for(overseas).post(url, {}, format="json").data)  # name still required
        response = client_for(overseas).post(url, {"first_name": "Ana", "last_name": "Silva", "username": "ana.silva"}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertTrue(response.data["user"]["mobile_check_skipped"])
        # Verified then needs a checked photo ID instead of the mobile.
        from onboarding.verification.policy import missing_requirements
        overseas.refresh_from_db()
        profile.refresh_from_db()
        self.assertEqual(missing_requirements(profile), ["gov_id"])


class NewcomerTalentPostTests(TestCase):
    URL = BASE + "explorer-posts/"

    def newcomer(self, verified=True, **profile):
        user = make_user("EXPLORER", first_name="Sam", last_name="Lee", is_otp_verified=True, is_mobile_verified=True)
        ExplorerOnboarding.objects.create(user=user, verified=verified, **profile)
        return user

    def post(self, user):
        return client_for(user).post(self.URL, {"headline": "Keen to learn", "body": "b", "role_category": "EXPLORER"}, format="json")

    def test_unverified_newcomers_cannot_post(self):
        self.assertEqual(self.post(self.newcomer(verified=False)).status_code, 403)

    def test_one_post_and_reposting_within_seven_days_keeps_the_feed_place(self):
        user = self.newcomer()
        first = self.post(user)
        self.assertEqual(first.status_code, 201, first.data)
        self.assertEqual(self.post(user).status_code, 400)  # one active post

        original = ExplorerPost.objects.get(pk=first.data["id"]).created_at
        client_for(user).delete(f"{self.URL}{first.data['id']}/")
        again = self.post(user)
        self.assertEqual(again.status_code, 201, again.data)
        self.assertEqual(ExplorerPost.objects.get(pk=again.data["id"]).created_at, original)

        ExplorerOnboarding.objects.filter(user=user).update(last_talent_post_at=timezone.now() - timedelta(days=8))
        client_for(user).delete(f"{self.URL}{again.data['id']}/")
        fresh = self.post(user)
        self.assertGreater(ExplorerPost.objects.get(pk=fresh.data["id"]).created_at, original)

    def test_under_eighteen_shows_first_name_only(self):
        user = self.newcomer(date_of_birth=date.fromisoformat(years_ago(16)))
        post_id = self.post(user).data["id"]
        viewer = make_user("OWNER")
        detail = client_for(viewer).get(f"{self.URL}{post_id}/").data
        self.assertEqual(detail["explorer_name"], "Sam")
        self.assertTrue(detail["verification"]["under_18"])


class NewcomerUpgradeTests(TestCase):
    URL = f"{BASE}users/me/account-type/"

    def test_upgrade_carries_the_profile_removes_the_post_and_applies_the_new_roles_checks(self):
        user = make_user("EXPLORER", is_otp_verified=True, mobile_check_skipped=True)
        newcomer = ExplorerOnboarding.objects.create(user=user, role_type="OVERSEAS", verified=True, suburb="Parramatta",
                                                     date_of_birth=date(1995, 5, 1), government_id="id/passport.pdf", gov_id_verified=True,
                                                     referee1_name="Dr Lee", referee1_confirmed=True)
        post = ExplorerPost.objects.create(explorer_profile=newcomer, author_user=user, headline="Hi", body="b", role_category="EXPLORER")

        self.assertEqual(client_for(user).post(self.URL, {"role": "OTHER_STAFF", "staff_role": "OWNER"}, format="json").status_code, 400)
        response = client_for(user).post(self.URL, {"role": "PHARMACIST"}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertTrue(response.data["onboarding_url"].endswith("/dashboard/pharmacist/onboarding"))

        from onboarding.models import PharmacistOnboarding
        from onboarding.verification.policy import missing_requirements
        user.refresh_from_db()
        profile = PharmacistOnboarding.objects.get(user=user)
        self.assertEqual((user.role, user.mobile_check_skipped), ("PHARMACIST", False))
        self.assertEqual((profile.suburb, profile.date_of_birth, profile.gov_id_verified, profile.referee1_confirmed, profile.verified),
                         ("Parramatta", date(1995, 5, 1), True, True, False))
        self.assertEqual(missing_requirements(profile), ["mobile", "ahpra"])
        # Owner decision 2026-10-13: the New to pharmacy post comes off the board; they post again in the new role.
        self.assertFalse(ExplorerPost.objects.filter(pk=post.pk).exists())
        # Once only: the account is no longer New to pharmacy.
        self.assertEqual(client_for(user).post(self.URL, {"role": "OTHER_STAFF", "staff_role": "ASSISTANT"}, format="json").status_code, 400)
