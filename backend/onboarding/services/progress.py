"""Onboarding completeness per role, and the verified gate.

CURRENT BEHAVIOUR kept from the serializers: computing the pharmacist, other-staff and explorer progress also saves
verified=True once the role's gate passes (both referees confirmed, the role's key check verified and the phone
verified). The calculation runs whenever the onboarding is rendered.
"""
from onboarding.services.regulatory import required_documents_for_role


def pharmacist_progress_percent(obj):
    user = getattr(obj, 'user', None)

    def _filled_str(x):
        return bool(x and str(x).strip())

    checks = [
        bool(getattr(user, 'username', None)),
        bool(getattr(user, 'first_name', None)),
        bool(getattr(user, 'last_name', None)),
        bool(getattr(user, 'mobile_number', None)),
        bool(getattr(obj, 'profile_photo', None)),
        bool(obj.gov_id_verified),
        bool(obj.ahpra_verified),
        bool(getattr(obj, 'referee1_confirmed', False)),
        bool(getattr(obj, 'referee2_confirmed', False)),
    ]

    # Address completeness counts as one unit
    addr_ok = all([
        _filled_str(getattr(obj, 'street_address', None)),
        _filled_str(getattr(obj, 'suburb', None)),
        _filled_str(getattr(obj, 'state', None)),
        _filled_str(getattr(obj, 'postcode', None)),
    ])
    checks.append(addr_ok)

    # Profile tab
    checks.append(bool(getattr(obj, 'resume', None)))
    checks.append(_filled_str(getattr(obj, 'short_bio', None)))

    # Payment contribution
    pref = (obj.payment_preference or '').upper()
    if pref == 'ABN':
        checks.append(bool(obj.abn) and bool(obj.abn_verified))
    elif pref == 'TFN':
        checks.append(bool(getattr(obj, 'tfn_number', None)))

    # Rates contribution (all fields)
    rp = getattr(obj, 'rate_preference', None) or {}
    checks.append(_filled_str(rp.get('weekday')))
    checks.append(_filled_str(rp.get('saturday')))
    checks.append(_filled_str(rp.get('sunday')))
    checks.append(_filled_str(rp.get('public_holiday')))
    early_ok = bool(rp.get('early_morning_same_as_day')) or _filled_str(rp.get('early_morning'))
    late_ok  = bool(rp.get('late_night_same_as_day'))   or _filled_str(rp.get('late_night'))
    checks.append(early_ok)
    checks.append(late_ok)

    # ---------- NEW: flip overall verified here, based on your gate ----------
    phone_ok = bool(getattr(user, 'is_mobile_verified', False))
    gate_ok = (
        bool(getattr(obj, 'referee1_confirmed', False)) and
        bool(getattr(obj, 'referee2_confirmed', False)) and
        bool(getattr(obj, 'ahpra_verified', False)) and
        phone_ok
    )
    if gate_ok and not bool(getattr(obj, 'verified', False)):
        try:
            obj.verified = True
            obj.save(update_fields=['verified'])
            # print("[VERIFY DEBUG] progress flip -> verified=True", {"pk": obj.pk}, flush=True)
        except Exception as e:
            # print("[VERIFY DEBUG] progress flip failed", {"pk": obj.pk, "err": str(e)}, flush=True)
            pass
    # ------------------------------------------------------------------------

    filled = sum(1 for x in checks if x)
    total = len(checks) or 1
    return int(100 * filled / total)


def otherstaff_progress_percent(obj):
    user = getattr(obj, 'user', None)

    def _filled_str(x):
        return bool(x and str(x).strip())

    checks = [
        bool(getattr(user, 'username', None)),
        bool(getattr(user, 'first_name', None)),
        bool(getattr(user, 'last_name', None)),
        bool(getattr(user, 'mobile_number', None)),
        bool(getattr(obj, 'profile_photo', None)),
        bool(obj.gov_id_verified),
        bool(getattr(obj, 'referee1_confirmed', False)),
        bool(getattr(obj, 'referee2_confirmed', False)),
    ]

    # Address completeness counts as one unit
    addr_ok = all([
        _filled_str(getattr(obj, 'street_address', None)),
        _filled_str(getattr(obj, 'suburb', None)),
        _filled_str(getattr(obj, 'state', None)),
        _filled_str(getattr(obj, 'postcode', None)),
    ])
    checks.append(addr_ok)

    # Profile tab
    checks.append(bool(getattr(obj, 'resume', None)))
    checks.append(_filled_str(getattr(obj, 'short_bio', None)))

    # Payment contribution
    pref = (obj.payment_preference or '').upper()
    if pref == 'ABN':
        checks.append(bool(obj.abn) and bool(obj.abn_verified))
    elif pref == 'TFN':
        checks.append(bool(getattr(obj, 'tfn_number', None)))

    # Regulatory docs gate: all required docs for the role must be verified
    req = required_documents_for_role(obj)
    docs_ok = all(getattr(obj, verified_flag, False) for _, verified_flag, _ in req)
    checks.append(docs_ok)

    # Final verified flip (role-specific)
    phone_ok = bool(getattr(user, 'is_mobile_verified', False))
    gate_ok = (
        bool(getattr(obj, 'referee1_confirmed', False)) and
        bool(getattr(obj, 'referee2_confirmed', False)) and
        bool(getattr(obj, 'gov_id_verified', False))   and
        docs_ok and
        phone_ok
    )
    if gate_ok and not bool(getattr(obj, 'verified', False)):
        try:
            obj.verified = True
            obj.save(update_fields=['verified'])
            # print("[VERIFY DEBUG] otherstaff progress flip -> verified=True", {"pk": obj.pk}, flush=True)
        except Exception as e:
            # print("[VERIFY DEBUG] otherstaff progress flip failed", {"pk": obj.pk, "err": str(e)}, flush=True)
            pass

    filled = sum(1 for x in checks if x)
    total = len(checks) or 1
    return int(100 * filled / total)


def explorer_progress_percent(obj):
    user = getattr(obj, 'user', None)

    def _filled_str(x):
        return bool(x and str(x).strip())

    checks = [
        bool(getattr(user, 'username', None)),
        bool(getattr(user, 'first_name', None)),
        bool(getattr(user, 'last_name', None)),
        bool(getattr(user, 'mobile_number', None)),
        bool(getattr(obj, 'profile_photo', None)),
        bool(obj.gov_id_verified),
        bool(getattr(obj, 'referee1_confirmed', False)),
        bool(getattr(obj, 'referee2_confirmed', False)),
    ]

    # Address as one unit
    addr_ok = all([
        _filled_str(getattr(obj, 'street_address', None)),
        _filled_str(getattr(obj, 'suburb', None)),
        _filled_str(getattr(obj, 'state', None)),
        _filled_str(getattr(obj, 'postcode', None)),
    ])
    checks.append(addr_ok)

    # Interests present?
    interests_ok = bool(getattr(obj, 'interests', None))
    checks.append(interests_ok)

    # Profile
    checks.append(bool(getattr(obj, 'resume', None)))
    checks.append(_filled_str(getattr(obj, 'short_bio', None)))

    # Final flip
    phone_ok = bool(getattr(user, 'is_mobile_verified', False))
    gate_ok = (
        bool(getattr(obj, 'referee1_confirmed', False)) and
        bool(getattr(obj, 'referee2_confirmed', False)) and
        bool(getattr(obj, 'gov_id_verified', False))    and
        phone_ok
    )
    if gate_ok and not bool(getattr(obj, 'verified', False)):
        try:
            obj.verified = True
            obj.save(update_fields=['verified'])
        except Exception:
            pass

    filled = sum(1 for x in checks if x)
    total = len(checks) or 1
    return int(100 * filled / total)


def owner_progress_percent(obj):
    user = getattr(obj, "user", None)
    checks = [
        bool(getattr(user, "username", None)),
        bool(getattr(user, "first_name", None)),
        bool(getattr(user, "last_name", None)),
        bool(getattr(user, "mobile_number", None)),
        bool(obj.role),
        bool(getattr(obj, "number_of_pharmacies", None)),
        bool(getattr(obj, "profile_photo")),
    ]
    if obj.role == "PHARMACIST":
        checks.append(bool(obj.ahpra_number))
        checks.append(bool(obj.ahpra_verified))

    filled = sum(1 for flag in checks if flag)
    return int(100 * filled / (len(checks) or 1))
