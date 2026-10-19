"""What the profile "Verified" flag needs per role, and the badges a profile shows.

Verified is the trust gate for applying to public shifts and publishing on the talent hub: email + mobile, plus AHPRA
for pharmacists and interns. A newcomer who skipped the mobile check from overseas needs a verified ID instead.
Everything else (ID, referees, documents, skill certificates) is a badge: shown verified or not, never blocking,
unless the owner lists it in settings.VERIFICATION_EXTRA_REQUIREMENTS. Tightening keeps already-verified profiles
verified until settings.VERIFICATION_GRACE_UNTIL; `manage.py reevaluate_verification` applies the rule afterwards.
"""
from django.conf import settings
from django.utils import timezone

from onboarding.qualifications import has_verified_dispensing_qualification
from onboarding.services.skill_identity import canonical_skill, registry

VERIFIED, PENDING, NOT_SUPPLIED, FAILED = 'verified', 'pending', 'not_supplied', 'failed'
EXTRA_REQUIREMENTS = ('gov_id', 'referees')


def _role(profile) -> str:
    """PHARMACIST, INTERN, TECHNICIAN, ASSISTANT, STUDENT, EXPLORER or '' (Pharmacy team role not chosen yet)."""
    account = str(getattr(profile.user, 'role', '') or '').upper()
    if account in ('PHARMACIST', 'EXPLORER'):
        return account
    return str(getattr(profile, 'role_type', '') or '').upper()


def _flag_state(profile, value, flag: str, note: str) -> str:
    if getattr(profile, flag, False):
        return VERIFIED
    if not value:
        return NOT_SUPPLIED
    # Document and AHPRA checks write a note only when they reject.
    return FAILED if (getattr(profile, note, '') or '').strip() else PENDING


def _referees_state(profile) -> str:
    if all(getattr(profile, f'referee{i}_confirmed', False) for i in (1, 2)):
        return VERIFIED
    if any(getattr(profile, f'referee{i}_rejected', False) for i in (1, 2)):
        return FAILED
    return PENDING if any(getattr(profile, f'referee{i}_email', None) for i in (1, 2)) else NOT_SUPPLIED


def mobile_waived(profile) -> bool:
    """Overseas newcomers may skip the Australian mobile check; ID then becomes required."""
    return _role(profile) == 'EXPLORER' and bool(getattr(profile.user, 'mobile_check_skipped', False))


def requirements(profile) -> dict[str, bool]:
    """Every check the Verified flag needs for this profile, mapped to whether it is met."""
    user = profile.user
    role = _role(profile)
    checks = {'email': bool(getattr(user, 'is_otp_verified', False))}
    if mobile_waived(profile):
        checks['gov_id'] = bool(getattr(profile, 'gov_id_verified', False))
    else:
        checks['mobile'] = bool(getattr(user, 'is_mobile_verified', False))
    if role in ('PHARMACIST', 'INTERN'):
        checks['ahpra'] = bool(getattr(profile, 'ahpra_verified', False))
    if not role:
        checks['role'] = False
    for extra in getattr(settings, 'VERIFICATION_EXTRA_REQUIREMENTS', ()):
        if extra == 'gov_id':
            checks['gov_id'] = bool(getattr(profile, 'gov_id_verified', False))
        elif extra == 'referees':
            checks['referees'] = _referees_state(profile) == VERIFIED
    return checks


def missing_requirements(profile) -> list[str]:
    return [name for name, met in requirements(profile).items() if not met]


def _in_grace() -> bool:
    grace = getattr(settings, 'VERIFICATION_GRACE_UNTIL', None)
    return bool(grace) and timezone.localdate() <= grace


def evaluate(profile) -> dict:
    """The one verification decision; the onboarding screens, final_evaluation and reevaluate_verification all use it.

    verified: whether the profile has public access now. Profiles are promoted automatically. The only automatic
    demotion is tightening: an already-verified profile that lacks only the extra requirements keeps Verified until the
    grace date and loses it afterwards. Base requirements never auto-demote (admin decisions stand); the tabs reset the
    flag when the evidence itself changes.
    missing: everything full verification needs and lacks. grace: the missing extras that do not count yet because the
    profile was verified before the tightening; they are due by grace_until."""
    missing = missing_requirements(profile)
    was_verified = bool(profile.verified)
    extras_only = bool(missing) and set(missing) <= set(EXTRA_REQUIREMENTS)
    grace = missing if (was_verified and extras_only and _in_grace()) else []
    if not missing:
        verified = True
    elif was_verified and extras_only:
        verified = bool(grace)
    else:
        # Preserve existing verified profiles until the evidence itself changes.
        # Explicit change paths revoke immediately; ordinary saves do not.
        verified = was_verified
    if getattr(profile, 'ahpra_number', None) and hasattr(profile, '_meta'):
        from onboarding.verification.state import ahpra_state
        if ahpra_state(profile)['state'] in ('suspended', 'unreadable'):
            verified = False
    return {'verified': verified, 'missing': missing, 'grace': grace,
            'grace_until': getattr(settings, 'VERIFICATION_GRACE_UNTIL', None) if grace else None}


def refresh_verified(profile) -> bool:
    """Save the Verified flag evaluate() gives this profile and return it."""
    verified = evaluate(profile)['verified']
    if verified != bool(profile.verified):
        profile.verified = verified
        profile.save(update_fields=['verified'])
    return verified


def revoke_for_changed_evidence(profile, requirement: str) -> bool:
    """Owner decision 2026-10-14: Verified is removed only when evidence it relies on changes (AHPRA number, photo ID
    for those who need it, mobile number), never by an ordinary save or Submit. Sets the flag (caller saves) and
    returns True when `requirement` is one this profile's Verified needs."""
    if requirement in requirements(profile) and profile.verified:
        profile.verified = False
        return True
    return False


def _certificate_skill_codes(profile) -> list[str]:
    role = _role(profile)
    skills = {item['code']: item for item in registry().get('skills', [])}
    codes = []
    for raw in getattr(profile, 'skills', None) or []:
        code = canonical_skill(raw) or raw
        item = skills.get(code)
        mode = (item or {}).get('eligibility', {}).get(role, 'none')
        if item and item.get('certificate') and mode not in ('none', 'familiarity') and code not in codes:
            codes.append(code)
    return codes


def skill_evidence(profile) -> dict[str, str]:
    """State of each claimed skill that carries a certificate in the registry; other skills have no badge."""
    stored = {canonical_skill(code) or code: meta for code, meta in (getattr(profile, 'skill_certificates', None) or {}).items()}
    result = {}
    for code in _certificate_skill_codes(profile):
        meta = stored.get(code) if isinstance(stored.get(code), dict) else {}
        if meta.get('verified') is True:
            result[code] = VERIFIED
        elif not meta.get('path'):
            result[code] = NOT_SUPPLIED
        else:
            result[code] = FAILED if (meta.get('note') or '').strip() else PENDING
    return result


def badges(profile) -> list[dict]:
    """Profile-level evidence in display order: {code, state}. Labels and explanations live in shared-core."""
    role = _role(profile)
    rows = []
    if role in ('PHARMACIST', 'INTERN'):
        rows.append({'code': 'AHPRA_PROVISIONAL' if role == 'INTERN' else 'AHPRA',
                     'state': _flag_state(profile, getattr(profile, 'ahpra_number', None), 'ahpra_verified', 'ahpra_verification_note')})
    if role in ('ASSISTANT', 'TECHNICIAN'):
        rows.append({'code': 'QUALIFICATION',
                     'state': _flag_state(profile, getattr(profile, 'certificate', None), 'certificate_verified', 'certificate_verification_note')})
        if getattr(profile, 'dispensary_qualification', ''):
            rows.append({'code': 'DISPENSING',
                         'state': VERIFIED if has_verified_dispensing_qualification(profile)
                         else PENDING if getattr(profile, 'certificate', None) else NOT_SUPPLIED})
    if role == 'STUDENT':
        rows.append({'code': 'ENROLMENT',
                     'state': _flag_state(profile, getattr(profile, 'university_id', None), 'university_id_verified', 'university_id_verification_note')})
    rows.append({'code': 'ID', 'state': _flag_state(profile, getattr(profile, 'government_id', None), 'gov_id_verified', 'gov_id_verification_note')})
    rows.append({'code': 'REFERENCES', 'state': _referees_state(profile)})
    if getattr(profile, 'abn_verified', False):
        # The ABN is confirmed by its owner in the payment tab; there is no pending state worth showing.
        rows.append({'code': 'ABN', 'state': VERIFIED})
    return rows


def verification_summary(profile) -> dict:
    """What employers and the worker see: the Verified flag, every badge, certificate skills and the overseas label."""
    from onboarding.verification.state import ahpra_state
    decision = evaluate(profile)
    return {
        # Employers see the register status only; the worker's own `ahpra` field carries the note.
        'ahpra': {**ahpra_state(profile), 'note': '', 'checked_at': None, 'recheck_available_at': None},
        'verified': bool(profile.verified),
        # What Verified still needs (email, mobile, ahpra, gov_id, referees, role); empty once verified.
        'missing': [] if profile.verified else decision['missing'],
        # Extras a verified profile must add by grace_until to keep Verified ("References needed by ...").
        'outstanding': decision['grace'],
        'grace_until': decision['grace_until'].isoformat() if decision['grace_until'] else None,
        'badges': badges(profile),
        'skill_evidence': skill_evidence(profile),
        # Two separate facts: where the person trained (a label they chose) and which route verified them.
        'overseas': _role(profile) == 'EXPLORER' and getattr(profile, 'role_type', '') == 'OVERSEAS',
        'mobile_waived': mobile_waived(profile),
        # Self-declared right to work in Australia ('' when not answered); "NONE" shows a label to employers.
        'work_rights': getattr(profile, 'work_rights', '') or '',
        'under_18': under_18(profile),
    }


def under_18(profile, today=None) -> bool:
    """From the date of birth on the person's current profile, whatever the role (it carries over on upgrade).
    Under-18s show their first name only on the talent hub."""
    born = getattr(profile, 'date_of_birth', None)
    if not born:
        return False
    today = today or timezone.localdate()
    return today.year - born.year - ((today.month, today.day) < (born.month, born.day)) < 18
