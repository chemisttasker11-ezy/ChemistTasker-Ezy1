"""Bind foundation use cases to their feature owners after model discovery.

Bindings are configuration only. Live lookup preserves the former function-local
imports' behavior when an owning operation is replaced (including test patches).
Business transactions, exception handling and callback timing stay in the caller.
"""
from functools import partial

from billing import utils as billing_utils
from marketplace import public_sitemap as marketplace_sitemap
from public_hub import permissions as content_permissions, sitemap_sources as content_sitemap
from rewards import registration, services as reward_services
from shifts import access, cancellation, deletion, engagement, escalation, holidays, interest, pricing_data
from shifts import public_sitemap as shift_sitemap
from talent import account_cleanup
from workforce import award_rates, membership_services, permissions as workforce_permissions

from core.sitemap_port import SitemapSources, configure_sitemap_sources
from memberships.employment_port import EmploymentServices, configure_employment_services
from onboarding.feature_port import VerificationFeatures, configure_verification_features
from organizations.feature_port import PharmacyFeatures, configure_pharmacy_features
from users.feature_port import UserFeatures, configure_user_features


def _call(module, name, *args, **kwargs):
    return getattr(module, name)(*args, **kwargs)


def _live(module, name):
    return partial(_call, module, name)


def configure_foundation_services():
    configure_user_features(UserFeatures(
        is_billing_active=_live(billing_utils, 'is_billing_active'),
        is_in_free_trial=_live(billing_utils, 'is_in_free_trial'),
        content_capabilities=_live(content_permissions, 'capabilities'),
        member_hubs=_live(content_permissions, 'member_hubs'),
        claim_signup_referral=_live(registration, 'claim_signup_referral'),
        delete_talent_posts=_live(account_cleanup, 'delete_user_posts'),
    ))
    configure_pharmacy_features(PharmacyFeatures(
        full_day_public_holidays=_live(holidays, 'full_day_public_holidays'),
        part_day_public_holidays=_live(holidays, 'part_day_public_holidays'),
        holiday_calendar_status=_live(holidays, 'holiday_calendar_status'),
        region_details=_live(holidays, 'region_details'),
        pricing_data_error=lambda: pricing_data.PricingDataError,
        can_manage_roster_pharmacy=_live(workforce_permissions, 'can_manage_roster_pharmacy'),
        protect_pharmacy_shift_deletion=_live(deletion, 'protect_pharmacy_shift_deletion'),
    ))
    configure_employment_services(EmploymentServices(
        worker_payment_profile_status=_live(engagement, 'worker_payment_profile_status'),
        create_engagement=_live(membership_services, 'create_engagement'),
        latest_engagement=_live(membership_services, 'latest_engagement'),
        classification_options=_live(award_rates, 'classification_options'),
        resolve_award_schedule=_live(award_rates, 'resolve_award_schedule'),
    ))
    configure_verification_features(VerificationFeatures(
        shift_refusal_type=lambda: access.ShiftActionRefused,
        is_public_shift=lambda shift: shift.visibility == escalation.PUBLIC_LEVEL,
        is_public_shift_member_access=_live(interest, 'is_public_shift_member_access'),
        require_public_shift_onboarding=_live(interest, '_require_public_shift_onboarding'),
        cancel_upcoming_assignments=_live(cancellation, 'cancel_upcoming_assignments'),
        announce_bookings=_live(cancellation, 'announce_bookings'),
        award_verified_referrals=_live(reward_services, 'award_verified_referrals_for_user'),
        remove_newcomer_posts=_live(account_cleanup, 'remove_newcomer_posts'),
    ))
    configure_sitemap_sources(SitemapSources(
        active_public_shifts=_live(shift_sitemap, 'active_public_shifts'),
        content_urls=_live(content_sitemap, 'content_urls'),
        marketplace_urls=_live(marketplace_sitemap, 'listing_urls'),
    ))
