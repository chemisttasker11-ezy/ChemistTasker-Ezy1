"""Onboarding-owned dispensing evidence vocabulary; the generic certificate flag is insufficient."""
from onboarding.services.skill_identity import registry

DISPENSARY_QUALIFICATION_CHOICES = [(item['value'], item['label']) for item in registry()['other_staff_qualifications']['dispensary']]


def has_verified_dispensing_qualification(profile):
    return bool(
        profile and getattr(profile, 'certificate', None)
        and getattr(profile, 'dispensary_qualification_verified', False)
        and getattr(profile, 'dispensary_qualification', '') in dict(DISPENSARY_QUALIFICATION_CHOICES)
    )


def has_claimed_dispensing_competency(profile):
    """Application matching uses claims; evidence verification is a separate owner review signal."""
    if not profile:
        return False
    if getattr(profile, 'dispensary_qualification', '') in dict(DISPENSARY_QUALIFICATION_CHOICES):
        return True
    from onboarding.services.skill_identity import normalize_skills
    return 'PRESCRIPTION_DISPENSING' in normalize_skills(list(getattr(profile, 'skills', []) or []))
