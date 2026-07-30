from django.test import TestCase
from django.contrib import admin
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.test import RequestFactory

from client_profile.admin import (
    ExplorerOnboardingAdmin,
    OtherStaffOnboardingAdmin,
    OwnerOnboardingAdmin,
    PharmacistOnboardingAdmin,
)
from client_profile.models import (
    ExplorerOnboarding,
    OtherStaffOnboarding,
    OwnerOnboarding,
    PharmacistOnboarding,
    PillLedgerEntry,
    PillReferralEvent,
)
from client_profile.rewards import (
    RewardError,
    award_verified_referrals_for_user,
    claim_referral_code,
    get_or_create_referral_code,
    get_pill_balance,
    seed_default_reward_rules,
)
from client_profile.serializers import OwnerOnboardingV2Serializer


class OnboardingRoleInvariantTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.owner = User.objects.create_user(email="owner-role@example.com", password="password", role="OWNER")
        self.pharmacist = User.objects.create_user(email="pharmacist-role@example.com", password="password", role="PHARMACIST")
        self.other_staff = User.objects.create_user(email="other-role@example.com", password="password", role="OTHER_STAFF")
        self.explorer = User.objects.create_user(email="explorer-role@example.com", password="password", role="EXPLORER")

    def test_model_validation_rejects_cross_role_onboarding(self):
        with self.assertRaises(ValidationError):
            PharmacistOnboarding(user=self.owner).full_clean()

        with self.assertRaises(ValidationError):
            OtherStaffOnboarding(user=self.pharmacist).full_clean()

        with self.assertRaises(ValidationError):
            OwnerOnboarding(
                user=self.pharmacist,
                phone_number="0400000000",
                role="MANAGER",
                chain_pharmacy=False,
            ).full_clean()

        with self.assertRaises(ValidationError):
            ExplorerOnboarding(user=self.owner).full_clean()

    def test_admin_querysets_only_include_matching_user_roles(self):
        valid_owner = OwnerOnboarding.objects.create(
            user=self.owner,
            phone_number="0400000000",
            role="MANAGER",
            chain_pharmacy=False,
        )
        invalid_owner = OwnerOnboarding.objects.create(
            user=self.pharmacist,
            phone_number="0400000001",
            role="MANAGER",
            chain_pharmacy=False,
        )
        valid_pharmacist = PharmacistOnboarding.objects.create(user=self.pharmacist)
        invalid_pharmacist = PharmacistOnboarding.objects.create(user=self.owner)
        valid_other_staff = OtherStaffOnboarding.objects.create(user=self.other_staff)
        invalid_other_staff = OtherStaffOnboarding.objects.create(user=self.pharmacist)
        valid_explorer = ExplorerOnboarding.objects.create(user=self.explorer)
        invalid_explorer = ExplorerOnboarding.objects.create(user=self.owner)

        request = RequestFactory().get("/")
        admin_site = admin.site

        self.assertQuerySetEqual(
            OwnerOnboardingAdmin(OwnerOnboarding, admin_site).get_queryset(request),
            [valid_owner],
            transform=lambda obj: obj,
        )
        self.assertNotIn(invalid_owner, OwnerOnboardingAdmin(OwnerOnboarding, admin_site).get_queryset(request))

        self.assertQuerySetEqual(
            PharmacistOnboardingAdmin(PharmacistOnboarding, admin_site).get_queryset(request),
            [valid_pharmacist],
            transform=lambda obj: obj,
        )
        self.assertNotIn(invalid_pharmacist, PharmacistOnboardingAdmin(PharmacistOnboarding, admin_site).get_queryset(request))

        self.assertQuerySetEqual(
            OtherStaffOnboardingAdmin(OtherStaffOnboarding, admin_site).get_queryset(request),
            [valid_other_staff],
            transform=lambda obj: obj,
        )
        self.assertNotIn(invalid_other_staff, OtherStaffOnboardingAdmin(OtherStaffOnboarding, admin_site).get_queryset(request))

        self.assertQuerySetEqual(
            ExplorerOnboardingAdmin(ExplorerOnboarding, admin_site).get_queryset(request),
            [valid_explorer],
            transform=lambda obj: obj,
        )
        self.assertNotIn(invalid_explorer, ExplorerOnboardingAdmin(ExplorerOnboarding, admin_site).get_queryset(request))


class OwnerOnboardingV2SerializerTests(TestCase):
    def test_submission_flag_is_saved_and_returned(self):
        User = get_user_model()
        user = User.objects.create_user(
            email="owner@example.com",
            password="password",
            role="OWNER",
            username="owneruser",
            first_name="Owner",
            last_name="User",
            mobile_number="0400000000",
            is_otp_verified=True,
            is_mobile_verified=True,
        )
        onboarding = OwnerOnboarding.objects.create(
            user=user,
            phone_number="0400000000",
            role=OwnerOnboarding.ROLE_CHOICES[0][0],
            chain_pharmacy=False,
            number_of_pharmacies=1,
        )

        serializer = OwnerOnboardingV2Serializer(
            onboarding,
            data={
                "first_name": "Owner",
                "last_name": "User",
                "username": "owneruser",
                "phone_number": "0400000000",
                "role": "MANAGER",
                "chain_pharmacy": False,
                "number_of_pharmacies": 1,
                "submitted_for_verification": True,
            },
            partial=True,
        )

        self.assertTrue(serializer.is_valid(), serializer.errors)
        serializer.save()
        onboarding.refresh_from_db()

        self.assertTrue(onboarding.submitted_for_verification)
        self.assertTrue(OwnerOnboardingV2Serializer(onboarding).data["submitted_for_verification"])


class PillRewardsTests(TestCase):
    def setUp(self):
        seed_default_reward_rules()
        User = get_user_model()
        self.referrer = User.objects.create_user(
            email="referrer@example.com",
            password="password",
            role="PHARMACIST",
        )
        self.referred = User.objects.create_user(
            email="referred@example.com",
            password="password",
            role="PHARMACIST",
        )

    def test_referral_claim_waits_until_referred_user_is_verified(self):
        code = get_or_create_referral_code(self.referrer)

        event = claim_referral_code(referred_user=self.referred, code=code.code)
        claim_referral_code(referred_user=self.referred, code=code.code)

        event.refresh_from_db()
        self.assertEqual(event.status, PillReferralEvent.Status.CLAIMED)
        self.assertEqual(get_pill_balance(self.referrer), 0)
        self.assertEqual(PillLedgerEntry.objects.filter(user=self.referrer).count(), 0)

        self.referred.role = "OWNER"
        self.referred.is_otp_verified = True
        self.referred.save(update_fields=["role", "is_otp_verified"])
        OwnerOnboarding.objects.create(
            user=self.referred,
            phone_number="0400000000",
            role=OwnerOnboarding.ROLE_CHOICES[0][0],
            chain_pharmacy=False,
            verified=True,
        )
        award_verified_referrals_for_user(self.referred)
        event.refresh_from_db()

        self.assertEqual(event.status, PillReferralEvent.Status.AWARDED)
        self.assertEqual(get_pill_balance(self.referrer), 100)
        self.assertEqual(PillLedgerEntry.objects.filter(user=self.referrer).count(), 1)

    def test_self_referral_is_blocked(self):
        code = get_or_create_referral_code(self.referrer)

        with self.assertRaises(RewardError):
            claim_referral_code(referred_user=self.referrer, code=code.code)

        self.assertEqual(get_pill_balance(self.referrer), 0)
