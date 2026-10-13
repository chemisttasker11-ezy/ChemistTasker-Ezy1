"""Onboarding completeness per role. It only measures; the Verified flag is refreshed by the onboarding serializers
before they render (RefreshVerifiedMixin, onboarding/verification/policy.py)."""


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

    # Role details: interns need their AHPRA number, the other roles their classification
    role = str(getattr(obj, 'role_type', '') or '').upper()
    classification_ok = (
        (role == 'INTERN' and _filled_str(getattr(obj, 'ahpra_number', None)))
        or (role == 'TECHNICIAN' and obj.classification_level in {'LEVEL_3', 'LEVEL_4'})
        or (role == 'ASSISTANT' and obj.classification_level in {'LEVEL_1', 'LEVEL_2', 'LEVEL_3', 'LEVEL_4'})
        or (role == 'STUDENT' and obj.student_year in {'YEAR_1', 'YEAR_2', 'YEAR_3', 'YEAR_4'})
    )
    checks.append(classification_ok)

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
