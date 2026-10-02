"""Serializers for the onboarding flows (owner, pharmacist, other staff, explorer) and referee responses."""
from pathlib import Path


_SKILLS_CATALOG_CACHE = None


def _load_skills_catalog():
    global _SKILLS_CATALOG_CACHE
    if _SKILLS_CATALOG_CACHE is not None:
        return _SKILLS_CATALOG_CACHE
    from django.conf import settings
    base_dir = settings.BASE_DIR.parent
    catalog_path = base_dir / "shared-core" / "skills_catalog.json"
    try:
        with open(catalog_path, "r", encoding="utf-8") as f:
            _SKILLS_CATALOG_CACHE = json.load(f)
    except Exception:
        _SKILLS_CATALOG_CACHE = {}
    return _SKILLS_CATALOG_CACHE


from rest_framework import serializers
from onboarding.models import (
    ExplorerOnboarding,
    OtherStaffOnboarding,
    OwnerOnboarding,
    PharmacistOnboarding,
    RefereeResponse,
)
from django.utils import timezone
from core.task_queue import async_task
import os
import json
from django.utils.text import slugify
from django.core.files.storage import default_storage
from core.file_validation import DOCUMENT_UPLOAD_POLICY, IMAGE_UPLOAD_POLICY, validate_uploaded_file
from client_profile.domains.common.serializers import (
    _build_absolute_media_url,
    _delete_file_if_unreferenced,
    _file_has_changed,
    _should_clear_flag,
    _update_locked_user_fields,
    clean_email,
    q6,
    UploadValidationMixin,
)


def _required_cert_skill_codes(role_key: str) -> set[str]:
    catalog = _load_skills_catalog()
    role = (catalog or {}).get(role_key, {})
    required = set()
    for group_key in ("clinical_services", "dispense_software", "expanded_scope"):
        for item in role.get(group_key, []) or []:
            if item.get("requires_certificate"):
                required.add(item.get("code"))
    return {c for c in required if c}


class OwnerOnboardingV2Serializer(UploadValidationMixin, serializers.ModelSerializer):
    """
    Single-tab onboarding for owners/managers.
    Mirrors the V2 pattern used by pharmacist/other staff/explorer flows.
    """

    username = serializers.CharField(source="user.username", required=False, allow_blank=True)
    first_name = serializers.CharField(source="user.first_name", required=False, allow_blank=True)
    last_name = serializers.CharField(source="user.last_name", required=False, allow_blank=True)
    phone_number = serializers.CharField(source="user.mobile_number", required=False, allow_blank=True, allow_null=True)
    profile_photo = serializers.ImageField(required=False, allow_null=True)
    profile_photo_url = serializers.SerializerMethodField(read_only=True)
    tab = serializers.CharField(write_only=True, required=False)
    submitted_for_verification = serializers.BooleanField(required=False)
    progress_percent = serializers.SerializerMethodField()
    ahpra_years_since_first_registration = serializers.SerializerMethodField(read_only=True)
    upload_validation_map = {
        "profile_photo": IMAGE_UPLOAD_POLICY,
        "government_id": DOCUMENT_UPLOAD_POLICY,
        "identity_secondary_file": DOCUMENT_UPLOAD_POLICY,
    }

    class Meta:
        model = OwnerOnboarding
        fields = [
            "username",
            "first_name",
            "last_name",
            "phone_number",
            "gender",
            "role",
            "chain_pharmacy",
            "number_of_pharmacies",
            "profile_photo",
            "profile_photo_url",
            "government_id",
            "government_id_type",
            "identity_meta",
            "identity_secondary_file",
            "gov_id_verified",
            "gov_id_verification_note",
            "ahpra_number",
            "ahpra_verified",
            "ahpra_registration_status",
            "ahpra_registration_type",
            "ahpra_expiry_date",
            "ahpra_first_registration_date",
            "ahpra_verification_note",
            "ahpra_years_since_first_registration",
            "organization",
            "verified",
            "progress_percent",
            "tab",
            "submitted_for_verification",
        ]
        extra_kwargs = {
            "organization": {"read_only": True},
            "gender": {"required": False, "allow_blank": True, "allow_null": True},
            "ahpra_verified": {"read_only": True},
            "ahpra_registration_status": {"read_only": True},
            "ahpra_registration_type": {"read_only": True},
            "ahpra_expiry_date": {"read_only": True},
            "ahpra_first_registration_date": {"read_only": True},
            "ahpra_verification_note": {"read_only": True},
            "verified": {"read_only": True},
            "profile_photo": {"required": False, "allow_null": True},
            "government_id": {"required": False, "allow_null": True},
            "government_id_type": {"required": False, "allow_blank": True, "allow_null": True},
            "identity_meta": {"required": False},
            "identity_secondary_file": {"required": False, "allow_null": True},
            "gov_id_verified": {"read_only": True},
            "gov_id_verification_note": {"read_only": True},
        }

    def update(self, instance, validated_data):
        tab = (self.initial_data.get("tab") or "basic").strip().lower()
        submit = bool(validated_data.pop("submitted_for_verification", False))

        if tab == "identity":
            return PharmacistOnboardingV2Serializer._identity_tab(self, instance, validated_data, submit)
        if tab != "basic":
            tab = "basic"

        if tab == "basic":
            return self._basic_tab(instance, validated_data, submit)
        return super().update(instance, validated_data)

    def _basic_tab(self, instance: OwnerOnboarding, vdata: dict, submit: bool):
        user_data = vdata.pop("user", {})
        update_fields: list[str] = []

        if user_data:
            _update_locked_user_fields(instance.user, user_data)

        clear_photo = _should_clear_flag(self.initial_data, "profile_photo_clear")
        if "profile_photo" in vdata or clear_photo:
            new_photo = vdata.pop("profile_photo", None)
            old_photo = getattr(instance, "profile_photo", None)
            if new_photo is None and clear_photo:
                if old_photo:
                    try:
                        _delete_file_if_unreferenced(old_photo, current_instance=instance)
                    except Exception:
                        pass
                instance.profile_photo = None
                update_fields.append("profile_photo")
            elif new_photo is not None:
                if old_photo and _file_has_changed(new_photo, old_photo):
                    try:
                        _delete_file_if_unreferenced(old_photo, current_instance=instance)
                    except Exception:
                        pass
                instance.profile_photo = new_photo
                update_fields.append("profile_photo")

        direct_fields = ["gender", "role", "chain_pharmacy", "number_of_pharmacies", "ahpra_number"]
        role_changed = "role" in vdata and vdata.get("role") != instance.role
        ahpra_changed = "ahpra_number" in vdata and vdata.get("ahpra_number") != instance.ahpra_number

        for field in direct_fields:
            if field in vdata:
                setattr(instance, field, vdata[field])
                update_fields.append(field)

        reset_ahpra = role_changed or ahpra_changed
        if reset_ahpra:
            instance.ahpra_verified = False
            instance.ahpra_verification_note = ""
            update_fields.extend(["ahpra_verified", "ahpra_verification_note"])

        first_submit = submit and not instance.submitted_for_verification
        if first_submit:
            instance.submitted_for_verification = True
            update_fields.append("submitted_for_verification")

        if submit:
            instance.verified = False
            update_fields.append("verified")

        if update_fields:
            instance.save(update_fields=list(set(update_fields)))

        # Notify on any update to this onboarding (manual review required).
        if update_fields:
            from onboarding.emails import notify_superuser_on_onboarding
            try:
                notify_superuser_on_onboarding(instance)
            except Exception:
                pass

        # NOTE: AHPRA verification is handled manually to avoid automated scraping.
        # if submit and instance.role == "PHARMACIST":
        #     should_verify_ahpra = bool(instance.ahpra_number) and (
        #         ahpra_changed or not instance.ahpra_verified
        #     )
        #     if should_verify_ahpra:
        #         async_task(
        #             "client_profile.tasks.verify_ahpra_task",
        #             instance._meta.model_name,
        #             instance.pk,
        #             instance.ahpra_number,
        #             instance.user.first_name or "",
        #             instance.user.last_name or "",
        #             instance.user.email or "",
        #         )

        return instance

    def get_progress_percent(self, obj: OwnerOnboarding):
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

    def get_profile_photo_url(self, obj):
        return _build_absolute_media_url(self.context.get("request"), getattr(obj, "profile_photo", None))

    def get_ahpra_years_since_first_registration(self, obj):
        return obj.ahpra_years_since_first_registration


class RefereeResponseSerializer(serializers.ModelSerializer):
    class Meta:
        model = RefereeResponse
        fields = [
            "referee_name",
            "referee_position",
            "relationship_to_candidate",
            "association_period",
            "contact_details",
            "role_and_responsibilities",
            "reliability_rating",
            "professionalism_notes",
            "skills_rating",
            "skills_strengths_weaknesses",
            "teamwork_communication_notes",
            "feedback_conflict_notes",
            "conduct_concerns",
            "conduct_explanation",
            "compliance_adherence",
            "compliance_incidents",
            "would_rehire",
            "rehire_explanation",
            "additional_comments",
        ]


class PharmacistOnboardingV2Serializer(UploadValidationMixin, serializers.ModelSerializer):
    """
    V2 single-endpoint, tab-aware serializer.
    Implements ONLY the Basic tab (as requested).
    """

    # user fields (read/write through User)
    username   = serializers.CharField(source='user.username',   required=False, allow_blank=True)
    first_name = serializers.CharField(source='user.first_name', required=False, allow_blank=True)
    last_name  = serializers.CharField(source='user.last_name',  required=False, allow_blank=True)
    phone_number = serializers.CharField(source='user.mobile_number', required=False, allow_blank=True, allow_null=True)
    profile_photo = serializers.ImageField(required=False, allow_null=True)
    profile_photo_url = serializers.SerializerMethodField(read_only=True)


    latitude  = serializers.DecimalField(max_digits=18, decimal_places=12, required=False, allow_null=True)
    longitude = serializers.DecimalField(max_digits=18, decimal_places=12, required=False, allow_null=True)

    tfn = serializers.CharField(
        source='tfn_number', write_only=True, required=False, allow_blank=True, allow_null=True
    )
    tfn_masked = serializers.SerializerMethodField(read_only=True)


    skills = serializers.ListField(child=serializers.CharField(), required=False)
    skill_certificates = serializers.SerializerMethodField(read_only=True)
   
    # write-only control flags
    tab = serializers.CharField(write_only=True, required=False)
    submitted_for_verification = serializers.BooleanField(write_only=True, required=False)

    # computed
    progress_percent = serializers.SerializerMethodField()
    upload_validation_map = {
        "profile_photo": IMAGE_UPLOAD_POLICY,
        "government_id": DOCUMENT_UPLOAD_POLICY,
        "identity_secondary_file": DOCUMENT_UPLOAD_POLICY,
        "resume": DOCUMENT_UPLOAD_POLICY,
    }

    class Meta:
        model = PharmacistOnboarding
        fields = [
            # ---------- BASIC ----------
            'username','first_name','last_name','phone_number','date_of_birth','gender',
            'emergency_contact_number','emergency_contact_relation','profile_photo','profile_photo_url',
            'profile_photo','profile_photo_url',
            'ahpra_number',
            'street_address','suburb','state','postcode','google_place_id','latitude','longitude','open_to_travel','travel_states','coverage_radius_km',
            'ahpra_verified','ahpra_registration_status','ahpra_registration_type','ahpra_expiry_date',
            'ahpra_verification_note',
            'ahpra_years_since_first_registration',

            # -------- IDENTITY (new tab) --------
            'government_id','identity_secondary_file','government_id_type','identity_meta','gov_id_verified','gov_id_verification_note',

            # -------- PAYMENT (add tfn here) --------
            'payment_preference',
            'abn','gst_registered',
            'tfn',            # <— NEW write-only alias to tfn_number
            'tfn_masked',     # <— read-only masked view
            'super_fund_name','super_usi','super_member_number',
            'abn_verified','abn_verification_note',
            'abn_entity_name','abn_entity_type','abn_status',
            'abn_gst_registered','abn_gst_from','abn_gst_to','abn_last_checked',
            'abn_entity_confirmed',


            # ----- REFEREES -----
            'referee1_name','referee1_relation','referee1_email','referee1_workplace',
            'referee1_confirmed','referee1_rejected','referee1_last_sent',
            'referee2_name','referee2_relation','referee2_email','referee2_workplace',
            'referee2_confirmed','referee2_rejected','referee2_last_sent',


            # ---------- SKILLS ----------
            'skills',
            'skill_certificates',   # read-only summary


            # ---------- Rete preferences ----------
            'rate_preference',

            # ---------- Profile preferences ----------
            'short_bio', 'resume',

            'verified','progress_percent',
            'tab','submitted_for_verification',
        ]
        extra_kwargs = {
            # user names are optional
            'username': {'required': False, 'allow_blank': True},
            'first_name': {'required': False, 'allow_blank': True},
            'last_name': {'required': False, 'allow_blank': True},

            # pharmacist fields optional here
            'phone_number': {'required': False, 'allow_blank': True, 'allow_null': True},
            'date_of_birth': {'required': False, 'allow_null': True},
            'gender': {'required': False, 'allow_blank': True, 'allow_null': True},
            'emergency_contact_number': {'required': False, 'allow_blank': True, 'allow_null': True},
            'emergency_contact_relation': {'required': False, 'allow_blank': True, 'allow_null': True},
            'ahpra_number': {'required': False, 'allow_blank': True, 'allow_null': True},
            'government_id': {'required': False, 'allow_null': True},
            'government_id_type': {'required': False, 'allow_blank': True, 'allow_null': True},
            'gov_id_verified': {'read_only': True},
            'gov_id_verification_note': {'read_only': True},
            'identity_secondary_file': {'required': False, 'allow_null': True},
            'identity_meta': {'required': False},

            # address optional
            'street_address':  {'required': False, 'allow_blank': True, 'allow_null': True},
            'suburb':          {'required': False, 'allow_blank': True, 'allow_null': True},
            'state':           {'required': False, 'allow_blank': True, 'allow_null': True},
            'postcode':        {'required': False, 'allow_blank': True, 'allow_null': True},
            'google_place_id': {'required': False, 'allow_blank': True, 'allow_null': True},
            'latitude':        {'required': False, 'allow_null': True},
            'longitude':       {'required': False, 'allow_null': True},
            'open_to_travel':  {'required': False},
            'travel_states':   {'required': False},
            'coverage_radius_km': {'required': False, 'allow_null': True},
            'open_to_travel':  {'required': False},
            'travel_states':   {'required': False},
            'coverage_radius_km': {'required': False, 'allow_null': True},
            'open_to_travel':  {'required': False},
            'coverage_radius_km': {'required': False, 'allow_null': True},
            'coverage_radius_km': {'required': False, 'allow_null': True},
            'coverage_radius_km': {'required': False, 'allow_null': True},
            'open_to_travel':  {'required': False},
            'open_to_travel':  {'required': False},
            'profile_photo': {'required': False, 'allow_null': True},
            'profile_photo_url': {'read_only': True},
            'profile_photo': {'required': False, 'allow_null': True},
            'profile_photo_url': {'read_only': True},

            # payment (optional – tab decides what’s required)
            'payment_preference': {'required': False, 'allow_blank': True},
            'abn':                {'required': False, 'allow_blank': True},
            'gst_registered':     {'required': False},
            'super_fund_name':    {'required': False, 'allow_blank': True},
            'super_usi':          {'required': False, 'allow_blank': True},
            'super_member_number':{'required': False, 'allow_blank': True},
            'abn_entity_confirmed': {'required': False},
            'tfn_masked': {'read_only': True},


            # read-only verification outputs
            'gov_id_verified': {'read_only': True},
            'gov_id_verification_note': {'read_only': True},
            'ahpra_verified': {'read_only': True},
            'ahpra_registration_status': {'read_only': True},
            'ahpra_registration_type': {'read_only': True},
            'ahpra_expiry_date': {'read_only': True},
            'ahpra_verification_note': {'read_only': True},

            'abn_verified': {'read_only': True},
            'abn_verification_note': {'read_only': True},
            'abn_entity_name': {'read_only': True},
            'abn_entity_type': {'read_only': True},
            'abn_status': {'read_only': True},
            'abn_gst_registered': {'read_only': True},
            'abn_gst_from': {'read_only': True},
            'abn_gst_to': {'read_only': True},
            'abn_last_checked': {'read_only': True},


            # referees input
            'referee1_name':       {'required': False, 'allow_blank': True, 'allow_null': True},
            'referee1_relation':   {'required': False, 'allow_blank': True, 'allow_null': True},
            'referee1_email':      {'required': False, 'allow_blank': True, 'allow_null': True},
            'referee1_workplace':  {'required': False, 'allow_blank': True, 'allow_null': True},

            'referee2_name':       {'required': False, 'allow_blank': True, 'allow_null': True},
            'referee2_relation':   {'required': False, 'allow_blank': True, 'allow_null': True},
            'referee2_email':      {'required': False, 'allow_blank': True, 'allow_null': True},
            'referee2_workplace':  {'required': False, 'allow_blank': True, 'allow_null': True},

            # status/read-only
            'referee1_confirmed':  {'read_only': True},
            'referee1_rejected':   {'read_only': True},
            'referee1_last_sent':  {'read_only': True},
            'referee2_confirmed':  {'read_only': True},
            'referee2_rejected':   {'read_only': True},
            'referee2_last_sent':  {'read_only': True},

            # Skills
            'skills': {'required': False},          # optional tab
            'skill_certificates': {'read_only': True},


            # Rate
            'short_bio': {'required': False, 'allow_blank': True, 'allow_null': True},
            'resume':    {'required': False, 'allow_null': True},

            # Rate Preferences
            'rate_preference': {'required': False, 'allow_null': True},
            'verified': {'read_only': True},
            'progress_percent': {'read_only': True},
        }


    # ---------------- representation helpers ----------------
    def get_tfn_masked(self, obj):
        """
        Never expose raw TFN back to the client.
        TFNs are stored through the encrypted `tfn_number` field and masked on output.
        """
        tfn = getattr(obj, 'tfn_number', '') or ''
        if not tfn:
            return ''
        return f'*** *** {tfn[-3:]}'

    def _files_by_skill(self):
        """
        Accept files either as flat keys ('CBR') or nested 'skill_files[CBR]'.
        """
        req = self.context.get("request")
        out = {}
        if not req or not hasattr(req, "FILES"):
            return out
        for key, f in req.FILES.items():
            if key.startswith("skill_files[") and key.endswith("]"):
                code = key[len("skill_files["):-1]
                out[code] = f
            else:
                out[key] = f
        return out

    def _save_skill_file(self, user_id: int, code: str, uploaded_file):
        """
        Save to: skill_certs/<user_id>/<CODE>/<base>_<CODE>_<YYYYmmddHHMMSS>.<ext>
        (keeps historical versions; no deletes)
        """
        validate_uploaded_file(uploaded_file, DOCUMENT_UPLOAD_POLICY, f"skill certificate {code}")
        base, ext = os.path.splitext(uploaded_file.name or "certificate")
        safe = slugify(base) or "certificate"
        code_up = (code or "UNKNOWN").upper()
        ts = timezone.now().strftime("%Y%m%d%H%M%S")
        rel_path = f"skill_certs/{user_id}/{code_up}/{safe}_{code_up}_{ts}{ext.lower()}"
        return default_storage.save(rel_path, uploaded_file)

    def _list_existing(self, user_id: int, code: str):
        folder = f"skill_certs/{user_id}/{(code or 'UNKNOWN').upper()}/"
        try:
            _dirs, files = default_storage.listdir(folder)
        except Exception:
            return []
        return sorted(folder + name for name in files)

    # -------- progress --------
    def get_progress_percent(self, obj):
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

    # -------- update --------
    def update(self, instance, validated_data):
        tab = (self.initial_data.get('tab') or 'basic').strip().lower()
        submit = bool(self.initial_data.get('submitted_for_verification'))

        # --- Superuser notify: first-time submission gate (BASIC tab only) ---
        first_submit = submit and (tab == 'basic') and not bool(getattr(instance, 'submitted_for_verification', False))
        if first_submit:
            # Persist first submission so we don't email again
            instance.submitted_for_verification = True
            instance.save(update_fields=['submitted_for_verification'])

            # Local import avoids circular dependencies
            from onboarding.emails import notify_superuser_on_onboarding
            try:
                notify_superuser_on_onboarding(instance)
            except Exception:
                # Never block user flow on email issues
                pass

        if tab == 'basic':
            return self._basic_tab(instance, validated_data, submit)
        if tab == 'payment':
            return self._payment_tab(instance, validated_data, submit)
        if tab == 'referees':
            return self._referees_tab(instance, validated_data, submit)
        if tab == 'skills':
            return self._skills_tab(instance, validated_data, submit)
        if tab == 'rate':
            return self._rate_tab(instance, validated_data, submit)
        if tab == 'profile':
            return self._profile_tab(instance, validated_data, submit)
        if tab == 'identity':
            return self._identity_tab(instance, validated_data, submit)

        return super().update(instance, validated_data)

    # ---------------- BASIC TAB ----------------
    def _basic_tab(self, instance: PharmacistOnboarding, vdata: dict, submit: bool):
        # nested user data
        user_data = vdata.pop('user', {})

        update_fields = []

        if user_data:
            _update_locked_user_fields(instance.user, user_data)

        clear_photo = _should_clear_flag(self.initial_data, "profile_photo_clear")
        if "profile_photo" in vdata or clear_photo:
            new_photo = vdata.pop("profile_photo", None)
            old_photo = getattr(instance, "profile_photo", None)
            if new_photo is None and clear_photo:
                if old_photo:
                    try:
                        _delete_file_if_unreferenced(old_photo, current_instance=instance)
                    except Exception:
                        pass
                instance.profile_photo = None
                update_fields.append("profile_photo")
            elif new_photo is not None:
                if old_photo and _file_has_changed(new_photo, old_photo):
                    try:
                        _delete_file_if_unreferenced(old_photo, current_instance=instance)
                    except Exception:
                        pass
                instance.profile_photo = new_photo
                update_fields.append("profile_photo")

        # helper to compare file names safely
        def _fname(f):
            return getattr(f, 'name', None) if f else None

        # We will handle government_id explicitly (to delete old files safely),
        # so do NOT include it in direct_fields.
        direct_fields = [
        'ahpra_number',
        'street_address', 'suburb', 'state', 'postcode', 'google_place_id',
        'open_to_travel', 'travel_states', 'coverage_radius_km',
        'date_of_birth', 'gender', 'emergency_contact_number', 'emergency_contact_relation',
        ]

        # Detect changes that affect verification flags
        ahpra_changed = 'ahpra_number' in vdata and (vdata.get('ahpra_number') != getattr(instance, 'ahpra_number'))

        # --- government_id: delete old file on replace or explicit clear ---
        # gov_id_changed = False
        # if 'government_id' in vdata:
        #     new_file = vdata.get('government_id')  # may be a file object or None
        #     old_file = getattr(instance, 'government_id', None)
        #     gov_id_changed = (_fname(new_file) != _fname(old_file))

        #     if new_file is None:
        #         # explicit clear
        #         if old_file:
        #             try:
        #                 _delete_file_if_unreferenced(old_file, current_instance=instance)   # Azure/local safe
        #             except Exception:
        #                 pass
        #         instance.government_id = None
        #         update_fields.append('government_id')
        #     else:
        #         # replacing: delete old first if it's different
        #         if old_file and _fname(old_file) and _fname(old_file) != _fname(new_file):
        #             try:
        #                 _delete_file_if_unreferenced(old_file, current_instance=instance)
        #             except Exception:
        #                 pass
        #         instance.government_id = new_file
        #         update_fields.append('government_id')

        # regular writes for other basic fields
        for f in direct_fields:
            if f in vdata:
                setattr(instance, f, vdata[f])
                update_fields.append(f)

        # round/quantize lat/lon to 6 dp if provided
        if 'latitude' in vdata:
            instance.latitude = q6(vdata.get('latitude'))
            update_fields.append('latitude')
        if 'longitude' in vdata:
            instance.longitude = q6(vdata.get('longitude'))
            update_fields.append('longitude')

        # reset only relevant flags when inputs changed
        if ahpra_changed:
            instance.ahpra_verified = False
            instance.ahpra_verification_note = ""
            update_fields += ['ahpra_verified', 'ahpra_verification_note']

        # if gov_id_changed:
        #     instance.gov_id_verified = False
        #     instance.gov_id_verification_note = ""
        #     update_fields += ['gov_id_verified', 'gov_id_verification_note']

        # full profile remains unverified until all tabs pass
        if submit:
            instance.verified = False
            update_fields.append('verified')

        if update_fields:
            instance.save(update_fields=list(set(update_fields)))

        # trigger ONLY the basic-tab tasks when submitting
        if submit:
            ahpra = vdata.get('ahpra_number', instance.ahpra_number)
            # gov   = vdata.get('government_id', instance.government_id)
            errors = {}
            if not ahpra:
                errors['ahpra_number'] = ['AHPRA number is required to submit.']
            # if not gov:
            #     errors['government_id'] = ['Government ID file is required to submit.']
            if errors:
                raise serializers.ValidationError(errors)

            # NOTE: AHPRA verification is handled manually to avoid automated scraping.
            # if instance.ahpra_number and (ahpra_changed or not instance.ahpra_verified):
            #     async_task(
            #         'client_profile.tasks.verify_ahpra_task',
            #         instance._meta.model_name, instance.pk,
            #         instance.ahpra_number, instance.user.first_name,
            #         instance.user.last_name, instance.user.email,
            #     )

            # GOV ID: file changed OR not verified yet
            # if instance.government_id and (gov_id_changed or not instance.gov_id_verified):
            #     async_task(
            #         'client_profile.tasks.verify_filefield_task',
            #         instance._meta.model_name, instance.pk,
            #         'government_id',
            #         instance.user.first_name or '',
            #         instance.user.last_name or '',
            #         instance.user.email or '',
            #         verification_field='gov_id_verified',
            #         note_field='gov_id_verification_note',
            #     )

        return instance

    def get_ahpra_years_since_first_registration(self, obj):
        return obj.ahpra_years_since_first_registration


    # ---------------- Identity TAB (new) ----------------
    def _identity_tab(self, instance: PharmacistOnboarding, vdata: dict, submit: bool):
        """
        Handles:
        - government_id_type (dropdown)
        - government_id (primary file)
        - identity_secondary_file (secondary file for paired docs)
        - identity_meta (JSON with per-type fields)
        Normalises per document type and validates on submit.
        """
        update_fields = []

        # helper to compare file names safely
        def _fname(f):
            return getattr(f, 'name', None) if f else None

        # Track changes to drive verification resets
        type_changed = False
        gov_id_changed = False
        sec_changed = False
        meta_changed = False

        # --- type (dropdown) – optional
        if 'government_id_type' in vdata:
            new_type = vdata.get('government_id_type')
            type_changed = (new_type != getattr(instance, 'government_id_type'))
            instance.government_id_type = new_type
            update_fields.append('government_id_type')

            # If switching to a type that doesn't need a secondary file, clear it
            if new_type in ('DRIVER_LICENSE', 'AUS_PASSPORT', 'AGE_PROOF'):
                old_sec = getattr(instance, 'identity_secondary_file', None)
                if old_sec:
                    try:
                        _delete_file_if_unreferenced(old_sec, current_instance=instance)
                    except Exception:
                        pass
                    instance.identity_secondary_file = None
                    update_fields.append('identity_secondary_file')
                    sec_changed = True

            # If type changes and no new meta provided, wipe old meta to avoid stale keys
            if 'identity_meta' not in vdata:
                instance.identity_meta = {}
                update_fields.append('identity_meta')
                meta_changed = True

        # --- primary file handling (replace / clear)
        if 'government_id' in vdata:
            new_file = vdata.get('government_id')
            old_file = getattr(instance, 'government_id', None)
            gov_id_changed = (_fname(new_file) != _fname(old_file))

            if new_file is None:
                if old_file:
                    try:
                        _delete_file_if_unreferenced(old_file, current_instance=instance)
                    except Exception:
                        pass
                instance.government_id = None
                update_fields.append('government_id')
            else:
                if old_file and _fname(old_file) and _fname(old_file) != _fname(new_file):
                    try:
                        _delete_file_if_unreferenced(old_file, current_instance=instance)
                    except Exception:
                        pass
                instance.government_id = new_file
                update_fields.append('government_id')

        # --- secondary file handling (replace / clear)
        if 'identity_secondary_file' in vdata:
            new_sec = vdata.get('identity_secondary_file')  # may be file or None
            old_sec = getattr(instance, 'identity_secondary_file', None)
            sec_changed = (_fname(new_sec) != _fname(old_sec))

            if new_sec is None:
                if old_sec:
                    try:
                        _delete_file_if_unreferenced(old_sec, current_instance=instance)
                    except Exception:
                        pass
                instance.identity_secondary_file = None
                update_fields.append('identity_secondary_file')
            else:
                if old_sec and _fname(old_sec) and _fname(old_sec) != _fname(new_sec):
                    try:
                        _delete_file_if_unreferenced(old_sec, current_instance=instance)
                    except Exception:
                        pass
                instance.identity_secondary_file = new_sec
                update_fields.append('identity_secondary_file')

        # --- identity_meta (JSON) – normalise per document type
        if 'identity_meta' in vdata:
            incoming_meta = vdata.get('identity_meta') or {}
            meta = dict(incoming_meta)  # shallow copy
            doc_type = getattr(instance, 'government_id_type')

            if doc_type == 'DRIVER_LICENSE':
                keep = {'state', 'expiry'}
                meta = {k: v for k, v in meta.items() if k in keep}

            elif doc_type == 'VISA':
                # Visa + Overseas passport (secondary file)
                keep = {'visa_type_number', 'valid_to', 'passport_country', 'passport_expiry'}
                meta = {k: v for k, v in meta.items() if k in keep}

            elif doc_type == 'AUS_PASSPORT':
                keep = {'expiry'}
                meta = {k: v for k, v in meta.items() if k in keep}
                meta['country'] = 'Australia'

            elif doc_type == 'OTHER_PASSPORT':
                # Overseas passport + Visa (secondary file)
                keep = {'country', 'expiry', 'visa_type_number', 'valid_to'}
                meta = {k: v for k, v in meta.items() if k in keep}

            elif doc_type == 'AGE_PROOF':
                keep = {'state', 'expiry'}
                meta = {k: v for k, v in meta.items() if k in keep}

            # Detect change
            if meta != (instance.identity_meta or {}):
                instance.identity_meta = meta
                update_fields.append('identity_meta')
                meta_changed = True

        # --- reset verification flags if any relevant identity input changed
        if gov_id_changed or sec_changed or type_changed or meta_changed:
            instance.gov_id_verified = False
            instance.gov_id_verification_note = ""
            update_fields += ['gov_id_verified', 'gov_id_verification_note']

        # Owner identity is a separate marketplace gate; do not revoke an
        # approved owner profile or unrelated dashboard access on submission.
        if submit and not isinstance(instance, OwnerOnboarding):
            instance.verified = False
            update_fields.append('verified')

        if update_fields:
            instance.save(update_fields=list(set(update_fields)))

        # --- Validate on submit (per type)
        if submit:
            errors = {}
            doc_type = getattr(instance, 'government_id_type')
            meta_now = getattr(instance, 'identity_meta') or {}

            if not doc_type:
                errors['government_id_type'] = ['Select a document type.']

            # Primary file required for all types
            if not getattr(instance, 'government_id', None):
                errors['government_id'] = ['This file is required.']

            if doc_type == 'DRIVER_LICENSE':
                if not meta_now.get('state'):  errors['identity_meta.state'] = ['Required.']
                if not meta_now.get('expiry'): errors['identity_meta.expiry'] = ['Required.']

            elif doc_type == 'VISA':
                if not meta_now.get('visa_type_number'):  errors['identity_meta.visa_type_number'] = ['Required.']
                if not meta_now.get('valid_to'):         errors['identity_meta.valid_to'] = ['Required.']
                if not getattr(instance, 'identity_secondary_file', None):
                    errors['identity_secondary_file'] = ['Overseas passport file is required with a Visa.']
                if not meta_now.get('passport_country'): errors['identity_meta.passport_country'] = ['Required.']
                if not meta_now.get('passport_expiry'):  errors['identity_meta.passport_expiry'] = ['Required.']

            elif doc_type == 'AUS_PASSPORT':
                if not meta_now.get('expiry'): errors['identity_meta.expiry'] = ['Required.']
                # country forced to Australia in normalisation

            elif doc_type == 'OTHER_PASSPORT':
                if not meta_now.get('country'): errors['identity_meta.country'] = ['Required.']
                if not meta_now.get('expiry'):  errors['identity_meta.expiry'] = ['Required.']
                if not getattr(instance, 'identity_secondary_file', None):
                    errors['identity_secondary_file'] = ['Visa file is required with an Overseas passport.']
                if not meta_now.get('visa_type_number'): errors['identity_meta.visa_type_number'] = ['Required.']
                if not meta_now.get('valid_to'):         errors['identity_meta.valid_to'] = ['Required.']

            elif doc_type == 'AGE_PROOF':
                if not meta_now.get('state'):  errors['identity_meta.state'] = ['Required.']
                if not meta_now.get('expiry'): errors['identity_meta.expiry'] = ['Required.']

            if errors:
                raise serializers.ValidationError(errors)

            # On submit: schedule verification task if needed (primary file)
            if instance.government_id and (gov_id_changed or type_changed or meta_changed or not instance.gov_id_verified):
                async_task(
                    'client_profile.tasks.verify_filefield_task',
                    instance._meta.model_name, instance.pk,
                    'government_id',
                    instance.user.first_name or '',
                    instance.user.last_name or '',
                    instance.user.email or '',
                    verification_field='gov_id_verified',
                    note_field='gov_id_verification_note',
                )

        # Recompute final verified gate on every pass
        return instance

    # ---------------- Payment TAB ----------------
    def _payment_tab(self, instance: PharmacistOnboarding, vdata: dict, submit: bool):
        """
        Payment fields only. No GST file in V2.
        - ABN: task scrapes ABR fields; user must confirm => abn_verified=True
        - TFN: store through encrypted model field `tfn_number`, show only tfn_masked on reads
        - When pref=TFN and submit=True -> TFN + super_* are required
        """
        payment_fields = [
            'payment_preference', 'abn', 'gst_registered',
            'super_fund_name', 'super_usi', 'super_member_number',
            'abn_entity_confirmed',
        ]
        update_fields: list[str] = []

        # normalize pref for logic below
        pref_in = (vdata.get('payment_preference') or instance.payment_preference or '').upper()

        # 1) regular writes
        for f in payment_fields:
            if f in vdata:
                setattr(instance, f, vdata[f])
                update_fields.append(f)

        # 2) TFN payload – client sends "tfn" (source='tfn_number'), DRF puts it in vdata['tfn_number']
        if 'tfn_number' in vdata:
            instance.tfn_number = (vdata['tfn_number'] or '').strip()
            update_fields.append('tfn_number')

        # 3) if ABN changed -> reset verification + confirmation
        abn_changed = ('abn' in vdata) and (vdata.get('abn') != getattr(instance, 'abn'))
        if abn_changed:
            instance.abn_verified = False
            instance.abn_entity_confirmed = False
            instance.abn_verification_note = ""
            update_fields += ['abn_verified', 'abn_entity_confirmed', 'abn_verification_note']

        # 4) confirmation gate: only user confirmation can set abn_verified=True
        if 'abn_entity_confirmed' in vdata:
            confirmed = bool(vdata['abn_entity_confirmed'])
            if confirmed and instance.abn_entity_name:   # must have scraped data to confirm
                instance.abn_verified = True
                if not instance.abn_verification_note:
                    instance.abn_verification_note = 'User confirmed ABN entity details.'
                update_fields += ['abn_verified', 'abn_verification_note']
            else:
                if instance.abn_verified:
                    instance.abn_verified = False
                    update_fields.append('abn_verified')

        # 5) optional sync of boolean gst_registered from ABR result if client didn’t send it
        if 'gst_registered' not in vdata:
            if instance.abn_gst_registered is True and not instance.gst_registered:
                instance.gst_registered = True
                update_fields.append('gst_registered')

        # 6) TFN validation: when submitting TFN path, enforce super_* required
        if submit and (pref_in or instance.payment_preference):
            pref_effective = (pref_in or instance.payment_preference or '').upper()
            if pref_effective == 'TFN':
                errors = {}
                if not instance.tfn_number:
                    errors['tfn'] = ['TFN is required.']
                if not instance.super_fund_name:
                    errors['super_fund_name'] = ['Super fund name is required for TFN.']
                if not instance.super_usi:
                    errors['super_usi'] = ['USI is required for TFN.']
                if not instance.super_member_number:
                    errors['super_member_number'] = ['Member number is required for TFN.']
                if errors:
                    raise serializers.ValidationError(errors)

        # 7) submitting this tab keeps the whole profile unverified until all tabs pass
        if submit:
            instance.verified = False
            update_fields.append('verified')

        if update_fields:
            instance.save(update_fields=list(set(update_fields)))

        # 8) run ABN task on submit (TFN has no task)
        if submit:
            pref_effective = (pref_in or instance.payment_preference or '').upper()
            if pref_effective == 'ABN' and instance.abn:
                async_task(
                    'client_profile.tasks.verify_abn_task',
                    instance._meta.model_name,
                    instance.pk,
                    instance.abn,
                    instance.user.first_name or '',
                    instance.user.last_name or '',
                    instance.user.email or '',
                    note_field='abn_verification_note',  # task will only fill ABR fields + note
                )
        return instance

    # ---------------- Referees TAB ----------------
    def _referees_tab(self, instance, vdata: dict, submit: bool):
        """
        Two referees are required on submit.
        Required per referee: name, relation, workplace, email.
        If referee is already confirmed -> ignore edits (lock).
        On change for a pending referee -> reset confirmed/rejected + last_sent.
        On submit -> send referee emails (no final-eval). Scheduling happens in utils.
        """
        from onboarding.emails import send_referee_emails
        update_fields = []

        def apply_ref(idx: int):
            prefix = f"referee{idx}_"
            locked = bool(getattr(instance, f"{prefix}confirmed", False))

            incoming = {
                'name': vdata.get(f"{prefix}name", getattr(instance, f"{prefix}name")),
                'relation': vdata.get(f"{prefix}relation", getattr(instance, f"{prefix}relation")),
                'email': clean_email(vdata.get(f"{prefix}email", getattr(instance, f"{prefix}email"))),
                'workplace': vdata.get(f"{prefix}workplace", getattr(instance, f"{prefix}workplace")),
            }

            if locked:
                return

            changed = False
            for key in ['name', 'relation', 'email', 'workplace']:
                field = f"{prefix}{key}"
                if field in vdata and getattr(instance, field) != incoming[key]:
                    setattr(instance, field, incoming[key])
                    update_fields.append(field)
                    changed = True

            if changed:
                if getattr(instance, f"{prefix}confirmed", False):
                    setattr(instance, f"{prefix}confirmed", False)
                    update_fields.append(f"{prefix}confirmed")
                if getattr(instance, f"{prefix}rejected", False):
                    setattr(instance, f"{prefix}rejected", False)
                    update_fields.append(f"{prefix}rejected")
                if getattr(instance, f"{prefix}last_sent", None) is not None:
                    setattr(instance, f"{prefix}last_sent", None)
                    update_fields.append(f"{prefix}last_sent")

        apply_ref(1)
        apply_ref(2)

        if submit:
            errors = {}
            for idx in [1, 2]:
                prefix = f"referee{idx}_"
                name = getattr(instance, f"{prefix}name")
                relation = getattr(instance, f"{prefix}relation")
                email = getattr(instance, f"{prefix}email")
                workplace = getattr(instance, f"{prefix}workplace")
                if not name:
                    errors[prefix + 'name'] = ['Required.']
                if not relation:
                    errors[prefix + 'relation'] = ['Required.']
                if not email:
                    errors[prefix + 'email'] = ['Required.']
                if not workplace:
                    errors[prefix + 'workplace'] = ['Required.']
            if errors:
                raise serializers.ValidationError(errors)

            if not instance.verified:
                instance.verified = False
                update_fields.append('verified')

        if update_fields:
            instance.save(update_fields=list(set(update_fields)))

        if submit:
            send_referee_emails(instance, is_reminder=False)  # schedules per-ref inside
        return instance

    # ---------------- Skills tab ----------------
    def _skills_tab(self, instance, vdata: dict, submit: bool):
        """
        Rules:
        - Checking a skill is optional.
        - If a skill is checked, a certificate MUST exist (already saved or uploaded now).
        - We store per-skill file metadata in instance.skill_certificates (JSON).
        - This version deletes old files when replacing (and when a skill is unchecked) unless KEEP_SKILL_HISTORY=True.
        """
        # accept JSON string or list
        raw = self.initial_data.get("skills", vdata.get("skills", []))
        if isinstance(raw, str):
            try:
                skills = json.loads(raw)
            except Exception:
                raise serializers.ValidationError({"skills": "Must be a JSON array or list."})
        else:
            skills = list(raw or [])

        uploads = self._files_by_skill()
        cert_map = dict(instance.skill_certificates or {})
        user_id = instance.user_id

        # (A) If a skill was **unchecked/removed**, optionally delete its last stored file
        if not getattr(self, "KEEP_SKILL_HISTORY", False):
            removed_codes = [code for code in list(cert_map.keys()) if code not in skills]
            for code in removed_codes:
                old_path = (cert_map.get(code) or {}).get("path")
                if old_path:
                    try:
                        default_storage.delete(old_path)  # works with Azure Blob via django-storages
                    except Exception:
                        pass
                cert_map.pop(code, None)

        # (B) Save any uploaded files for checked skills
        #     Safe order: save the new file first; if it succeeds, delete the old one (if any).
        for code, f in uploads.items():
            if code in skills:
                # remember old path (if any)
                old_path = (cert_map.get(code) or {}).get("path")

                # save new file
                saved = self._save_skill_file(user_id, code, f)

                # delete old file unless we're keeping history
                if old_path and not getattr(self, "KEEP_SKILL_HISTORY", False):
                    try:
                        default_storage.delete(old_path)
                    except Exception:
                        # swallow storage deletion errors; user flow should not break
                        pass

                # point to the new file
                cert_map[code] = {
                    "path": saved,
                    "uploaded_at": timezone.now().isoformat(),
                }

        # (C) Validation: only skills that require certificates must have one
        required_codes = _required_cert_skill_codes("pharmacist")
        missing = [code for code in skills if code in required_codes and code not in cert_map]
        if missing:
            raise serializers.ValidationError(
                {"skills": f"Certificate required for checked skill(s): {', '.join(missing)}"}
            )

        # Persist
        instance.skills = skills
        instance.skill_certificates = cert_map
        instance.save(update_fields=["skills", "skill_certificates"])
        return instance

    # --------------- read-only summary for UI ---------------
    def get_skill_certificates(self, obj):
        """
        Return latest file per skill (by name sort). If you want all versions, expand here.
        """
        data = []
        for code, meta in (obj.skill_certificates or {}).items():
            path = (meta or {}).get("path")
            if not path:
                continue
            try:
                url = default_storage.url(path)
            except Exception:
                url = None
            data.append({"skill_code": code, "path": path, "url": url, "uploaded_at": meta.get("uploaded_at")})
        # stable order
        return sorted(data, key=lambda r: r["skill_code"])

    def get_profile_photo_url(self, obj):
        return _build_absolute_media_url(self.context.get("request"), getattr(obj, "profile_photo", None))

    # ---------------- Rate tab ----------------
    def _rate_tab(self, instance, vdata: dict, submit: bool):
        """
        Stores rate_preference JSON.
        Accepts stringified JSON or dict with keys:
        weekday, saturday, sunday, public_holiday, early_morning, late_night (strings),
        early_morning_same_as_day (bool), late_night_same_as_day (bool)
        """
        raw = self.initial_data.get('rate_preference', vdata.get('rate_preference'))
        if raw is None:
            # allow clearing: leave as-is if not provided
            return instance

        try:
            rp = json.loads(raw) if isinstance(raw, str) else dict(raw)
        except Exception:
            raise serializers.ValidationError({"rate_preference": "Must be a JSON object."})

        # Soft sanitize: ensure keys exist, store as strings/booleans
        def to_s(x): return '' if x is None else str(x)
        rp_norm = {
            "weekday": to_s(rp.get("weekday")),
            "saturday": to_s(rp.get("saturday")),
            "sunday": to_s(rp.get("sunday")),
            "public_holiday": to_s(rp.get("public_holiday")),
            "early_morning": to_s(rp.get("early_morning")),
            "late_night": to_s(rp.get("late_night")),
            "early_morning_same_as_day": bool(rp.get("early_morning_same_as_day", False)),
            "late_night_same_as_day": bool(rp.get("late_night_same_as_day", False)),
        }

        instance.rate_preference = rp_norm
        if submit:
            instance.verified = False  # stays unverified until all tabs pass
            instance.save(update_fields=["rate_preference", "verified"])
        else:
            instance.save(update_fields=["rate_preference"])

        return instance

    # ---------------- Profile tab ----------------
    def _profile_tab(self, instance, vdata: dict, submit: bool):
        """
        Profile tab: resume file + short note (short_bio).
        Behavior:
        - If a new resume is uploaded, delete the old file first (Azure + dev parity).
        - If resume is explicitly set to None, delete existing file.
        - short_bio is plain text, optional.
        """
        update_fields = []

        # Handle short_bio (optional)
        if 'short_bio' in vdata:
            instance.short_bio = vdata['short_bio']
            update_fields.append('short_bio')

        # Handle resume
        if 'resume' in vdata:
            new_file = vdata['resume']  # may be a file object or None
            old_file = getattr(instance, 'resume', None)

            if new_file is None:
                # explicit clear
                if old_file:
                    _delete_file_if_unreferenced(old_file, current_instance=instance)  # Azure/local safe
                instance.resume = None
                update_fields.append('resume')
            else:
                # replace file: delete old first to mimic overwrite behavior everywhere
                if old_file:
                    try:
                        # delete only if name differs (optional; safe to always delete)
                        if getattr(old_file, 'name', None) != getattr(new_file, 'name', None):
                            _delete_file_if_unreferenced(old_file, current_instance=instance)
                    except Exception:
                        # swallow storage deletion errors to avoid blocking user save
                        pass
                instance.resume = new_file
                update_fields.append('resume')

        # Submit does not auto-verify anything here; keep profile unverified until all tabs pass
        if submit:
            instance.verified = False
            update_fields.append('verified')

        if update_fields:
            instance.save(update_fields=list(set(update_fields)))
        return instance


class OtherStaffOnboardingV2Serializer(UploadValidationMixin, serializers.ModelSerializer):
    """
    V2 single-endpoint, tab-aware serializer for OtherStaff.
    Mirrors the Pharmacist V2 procedure but without AHPRA and with a Regulatory tab.
    """

    # user fields (read/write through User)
    username     = serializers.CharField(source='user.username',   required=False, allow_blank=True)
    first_name   = serializers.CharField(source='user.first_name', required=False, allow_blank=True)
    last_name    = serializers.CharField(source='user.last_name',  required=False, allow_blank=True)
    phone_number = serializers.CharField(source='user.mobile_number', required=False, allow_blank=True, allow_null=True)
    profile_photo = serializers.ImageField(required=False, allow_null=True)
    profile_photo_url = serializers.SerializerMethodField(read_only=True)

    latitude  = serializers.DecimalField(max_digits=18, decimal_places=12, required=False, allow_null=True)
    longitude = serializers.DecimalField(max_digits=18, decimal_places=12, required=False, allow_null=True)

    # TFN aliasing (store encrypted; only expose masked)
    tfn = serializers.CharField(
        source='tfn_number', write_only=True, required=False, allow_blank=True, allow_null=True
    )
    tfn_masked = serializers.SerializerMethodField(read_only=True)

    # Skills
    skills = serializers.ListField(child=serializers.CharField(), required=False)
    skill_certificates = serializers.SerializerMethodField(read_only=True)

    # write-only control flags
    tab = serializers.CharField(write_only=True, required=False)
    submitted_for_verification = serializers.BooleanField(write_only=True, required=False)

    # computed
    progress_percent = serializers.SerializerMethodField()
    upload_validation_map = {
        "profile_photo": IMAGE_UPLOAD_POLICY,
        "government_id": DOCUMENT_UPLOAD_POLICY,
        "identity_secondary_file": DOCUMENT_UPLOAD_POLICY,
        "ahpra_proof": DOCUMENT_UPLOAD_POLICY,
        "hours_proof": DOCUMENT_UPLOAD_POLICY,
        "certificate": DOCUMENT_UPLOAD_POLICY,
        "university_id": DOCUMENT_UPLOAD_POLICY,
        "cpr_certificate": DOCUMENT_UPLOAD_POLICY,
        "s8_certificate": DOCUMENT_UPLOAD_POLICY,
        "resume": DOCUMENT_UPLOAD_POLICY,
    }

    class Meta:
        model = OtherStaffOnboarding
        fields = [
            # ---------- BASIC ----------
            'username','first_name','last_name','phone_number','date_of_birth','gender',
            'emergency_contact_number','emergency_contact_relation','profile_photo','profile_photo_url',
            'street_address','suburb','state','postcode','google_place_id','latitude','longitude','open_to_travel','travel_states','coverage_radius_km',

            # ---------- IDENTITY ----------
            'government_id','identity_secondary_file','government_id_type','identity_meta',
            'gov_id_verified','gov_id_verification_note',

            # ---------- REGULATORY DOCS (role + files) ----------
            'role_type','classification_level','student_year','intern_half',
            'ahpra_proof','hours_proof','certificate','university_id','cpr_certificate','s8_certificate',
            'ahpra_proof_verified','ahpra_proof_verification_note',
            'hours_proof_verified','hours_proof_verification_note',
            'certificate_verified','certificate_verification_note',
            'university_id_verified','university_id_verification_note',
            'cpr_certificate_verified','cpr_certificate_verification_note',
            's8_certificate_verified','s8_certificate_verification_note',

            # ---------- PAYMENT ----------
            'payment_preference',
            'abn','gst_registered',
            'tfn', 'tfn_masked',
            'super_fund_name','super_usi','super_member_number',
            'abn_verified','abn_verification_note',
            'abn_entity_name','abn_entity_type','abn_status',
            'abn_gst_registered','abn_gst_from','abn_gst_to','abn_last_checked',
            'abn_entity_confirmed',

            # ---------- REFEREES ----------
            'referee1_name','referee1_relation','referee1_email','referee1_workplace',
            'referee1_confirmed','referee1_rejected','referee1_last_sent',
            'referee2_name','referee2_relation','referee2_email','referee2_workplace',
            'referee2_confirmed','referee2_rejected','referee2_last_sent',

            # ---------- SKILLS ----------
            'skills',
            'skill_certificates',   # read-only summary
            'years_experience',  

            # ---------- PROFILE ----------
            'short_bio','resume',

            'verified','progress_percent',
            'tab','submitted_for_verification',
        ]
        extra_kwargs = {
            # user names optional
            'username': {'required': False, 'allow_blank': True},
            'first_name': {'required': False, 'allow_blank': True},
            'last_name': {'required': False, 'allow_blank': True},

            # basic optional
            'phone_number': {'required': False, 'allow_blank': True, 'allow_null': True},
            'profile_photo': {'required': False, 'allow_null': True},
            'profile_photo_url': {'read_only': True},
            'date_of_birth': {'required': False, 'allow_null': True},
            'gender': {'required': False, 'allow_blank': True, 'allow_null': True},
            'emergency_contact_number': {'required': False, 'allow_blank': True, 'allow_null': True},
            'emergency_contact_relation': {'required': False, 'allow_blank': True, 'allow_null': True},
            'street_address':  {'required': False, 'allow_blank': True, 'allow_null': True},
            'suburb':          {'required': False, 'allow_blank': True, 'allow_null': True},
            'state':           {'required': False, 'allow_blank': True, 'allow_null': True},
            'postcode':        {'required': False, 'allow_blank': True, 'allow_null': True},
            'google_place_id': {'required': False, 'allow_blank': True, 'allow_null': True},
            'latitude':        {'required': False, 'allow_null': True},
            'longitude':       {'required': False, 'allow_null': True},

            # identity optional (tab handles requiredness)
            'government_id': {'required': False, 'allow_null': True},
            'government_id_type': {'required': False, 'allow_blank': True, 'allow_null': True},
            'identity_secondary_file': {'required': False, 'allow_null': True},
            'identity_meta': {'required': False},
            'gov_id_verified': {'read_only': True},
            'gov_id_verification_note': {'read_only': True},

            # regulatory files optional (tab decides requiredness)
            'role_type': {'required': False, 'allow_blank': True, 'allow_null': True},
            'classification_level': {'required': False, 'allow_blank': True, 'allow_null': True},
            'student_year': {'required': False, 'allow_blank': True, 'allow_null': True},
            'intern_half': {'required': False, 'allow_blank': True, 'allow_null': True},

            'ahpra_proof': {'required': False, 'allow_null': True},
            'hours_proof': {'required': False, 'allow_null': True},
            'certificate': {'required': False, 'allow_null': True},
            'university_id': {'required': False, 'allow_null': True},
            'cpr_certificate': {'required': False, 'allow_null': True},
            's8_certificate': {'required': False, 'allow_null': True},

            'ahpra_proof_verified': {'read_only': True},
            'ahpra_proof_verification_note': {'read_only': True},
            'hours_proof_verified': {'read_only': True},
            'hours_proof_verification_note': {'read_only': True},
            'certificate_verified': {'read_only': True},
            'certificate_verification_note': {'read_only': True},
            'university_id_verified': {'read_only': True},
            'university_id_verification_note': {'read_only': True},
            'cpr_certificate_verified': {'read_only': True},
            'cpr_certificate_verification_note': {'read_only': True},
            's8_certificate_verified': {'read_only': True},
            's8_certificate_verification_note': {'read_only': True},

            # payment (tab decides requiredness)
            'payment_preference': {'required': False, 'allow_blank': True},
            'abn':                {'required': False, 'allow_blank': True},
            'gst_registered':     {'required': False},
            'super_fund_name':    {'required': False, 'allow_blank': True},
            'super_usi':          {'required': False, 'allow_blank': True},
            'super_member_number':{'required': False, 'allow_blank': True},
            'abn_entity_confirmed': {'required': False},
            'tfn_masked': {'read_only': True},

            # ABR outputs read-only
            'abn_verified': {'read_only': True},
            'abn_verification_note': {'read_only': True},
            'abn_entity_name': {'read_only': True},
            'abn_entity_type': {'read_only': True},
            'abn_status': {'read_only': True},
            'abn_gst_registered': {'read_only': True},
            'abn_gst_from': {'read_only': True},
            'abn_gst_to': {'read_only': True},
            'abn_last_checked': {'read_only': True},

            # referees
            'referee1_name':       {'required': False, 'allow_blank': True, 'allow_null': True},
            'referee1_relation':   {'required': False, 'allow_blank': True, 'allow_null': True},
            'referee1_email':      {'required': False, 'allow_blank': True, 'allow_null': True},
            'referee1_workplace':  {'required': False, 'allow_blank': True, 'allow_null': True},
            'referee2_name':       {'required': False, 'allow_blank': True, 'allow_null': True},
            'referee2_relation':   {'required': False, 'allow_blank': True, 'allow_null': True},
            'referee2_email':      {'required': False, 'allow_blank': True, 'allow_null': True},
            'referee2_workplace':  {'required': False, 'allow_blank': True, 'allow_null': True},
            'referee1_confirmed':  {'read_only': True},
            'referee1_rejected':   {'read_only': True},
            'referee1_last_sent':  {'read_only': True},
            'referee2_confirmed':  {'read_only': True},
            'referee2_rejected':   {'read_only': True},
            'referee2_last_sent':  {'read_only': True},

            # skills
            'skills': {'required': False},
            'skill_certificates': {'read_only': True},
            'years_experience': {'required': False, 'allow_blank': True, 'allow_null': True},

            # profile
            'short_bio': {'required': False, 'allow_blank': True, 'allow_null': True},
            'resume':    {'required': False, 'allow_null': True},

            'verified': {'read_only': True},
            'progress_percent': {'read_only': True},
        }

    # ---------------- representation helpers ----------------
    def get_tfn_masked(self, obj):
        tfn = getattr(obj, 'tfn_number', '') or ''
        if not tfn:
            return ''
        return f'*** *** {tfn[-3:]}'  # never expose full TFN

    def _files_by_skill(self):
        req = self.context.get("request")
        out = {}
        if not req or not hasattr(req, "FILES"):
            return out
        for key, f in req.FILES.items():
            if key.startswith("skill_files[") and key.endswith("]"):
                code = key[len("skill_files["):-1]
                out[code] = f
            else:
                out[key] = f
        return out

    def _save_skill_file(self, user_id: int, code: str, uploaded_file):
        validate_uploaded_file(uploaded_file, DOCUMENT_UPLOAD_POLICY, f"skill certificate {code}")
        base, ext = os.path.splitext(uploaded_file.name or "certificate")
        safe = slugify(base) or "certificate"
        code_up = (code or "UNKNOWN").upper()
        ts = timezone.now().strftime("%Y%m%d%H%M%S")
        rel_path = f"skill_certs/{user_id}/{code_up}/{safe}_{code_up}_{ts}{ext.lower()}"
        return default_storage.save(rel_path, uploaded_file)

    def _list_existing(self, user_id: int, code: str):
        folder = f"skill_certs/{user_id}/{(code or 'UNKNOWN').upper()}/"
        try:
            _dirs, files = default_storage.listdir(folder)
        except Exception:
            return []
        return sorted(folder + name for name in files)

    # -------- utility: regulatory requirements by role --------
    def _required_docs_for_role(self, instance):
        """
        Returns list of (field_name, verified_flag, note_field) tuples required for the selected role.
        """
        role = (instance.role_type or '').upper()
        mapping = {
            'INTERN': [
                ('ahpra_proof', 'ahpra_proof_verified', 'ahpra_proof_verification_note'),
                ('hours_proof', 'hours_proof_verified', 'hours_proof_verification_note'),
            ],
            'TECHNICIAN': [
                ('certificate', 'certificate_verified', 'certificate_verification_note'),
            ],
            'ASSISTANT': [
                ('certificate', 'certificate_verified', 'certificate_verification_note'),
            ],
            'STUDENT': [
                ('university_id', 'university_id_verified', 'university_id_verification_note'),
            ],
        }
        return mapping.get(role, [])

    # -------- progress --------
    def get_progress_percent(self, obj):
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
        req = self._required_docs_for_role(obj)
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

    # ---------------- update router ----------------
    def update(self, instance, validated_data):
        tab = (self.initial_data.get('tab') or 'basic').strip().lower()
        submit = bool(self.initial_data.get('submitted_for_verification'))

        # --- Superuser notify: first-time submission gate (BASIC tab only) ---
        first_submit = submit and (tab == 'basic') and not bool(getattr(instance, 'submitted_for_verification', False))
        if first_submit:
            instance.submitted_for_verification = True
            instance.save(update_fields=['submitted_for_verification'])
            from onboarding.emails import notify_superuser_on_onboarding
            try:
                notify_superuser_on_onboarding(instance)
            except Exception:
                pass

        if tab == 'basic':
            return self._basic_tab(instance, validated_data, submit)
        if tab == 'identity':
            return self._identity_tab(instance, validated_data, submit)
        if tab == 'regulatory':
            return self._regulatory_tab(instance, validated_data, submit)
        if tab == 'payment':
            return self._payment_tab(instance, validated_data, submit)
        if tab == 'referees':
            return self._referees_tab(instance, validated_data, submit)
        if tab == 'skills':
            return self._skills_tab(instance, validated_data, submit)
        if tab == 'profile':
            return self._profile_tab(instance, validated_data, submit)

        return super().update(instance, validated_data)

    # ---------------- BASIC TAB ----------------
    def _basic_tab(self, instance: OtherStaffOnboarding, vdata: dict, submit: bool):
        # nested user data
        user_data = vdata.pop('user', {})
        if user_data:
            _update_locked_user_fields(instance.user, user_data)

        update_fields = []

        clear_photo = _should_clear_flag(self.initial_data, "profile_photo_clear")
        if "profile_photo" in vdata or clear_photo:
            new_photo = vdata.pop("profile_photo", None)
            old_photo = getattr(instance, "profile_photo", None)
            if new_photo is None and clear_photo:
                if old_photo:
                    try:
                        _delete_file_if_unreferenced(old_photo, current_instance=instance)
                    except Exception:
                        pass
                instance.profile_photo = None
                update_fields.append("profile_photo")
            elif new_photo is not None:
                if old_photo and _file_has_changed(new_photo, old_photo):
                    try:
                        _delete_file_if_unreferenced(old_photo, current_instance=instance)
                    except Exception:
                        pass
                instance.profile_photo = new_photo
                update_fields.append("profile_photo")

        # regular writes for basic fields (address + dob)
        direct_fields = [
            'street_address','suburb','state','postcode','google_place_id','open_to_travel','travel_states','coverage_radius_km','date_of_birth',
            'gender','emergency_contact_number','emergency_contact_relation',
            'role_type','classification_level','student_year','intern_half',  # allow role data in Basic if FE sends them early
        ]
        for f in direct_fields:
            if f in vdata:
                setattr(instance, f, vdata[f])
                update_fields.append(f)

        # lat/lon rounding to 6 dp
        if 'latitude' in vdata:
            instance.latitude = q6(vdata.get('latitude'))
            update_fields.append('latitude')
        if 'longitude' in vdata:
            instance.longitude = q6(vdata.get('longitude'))
            update_fields.append('longitude')

        if submit:
            instance.verified = False
            update_fields.append('verified')

        if update_fields:
            instance.save(update_fields=list(set(update_fields)))
        return instance

    # ---------------- Identity TAB ----------------
    def _identity_tab(self, instance: OtherStaffOnboarding, vdata: dict, submit: bool):
        update_fields = []

        def _fname(f):
            return getattr(f, 'name', None) if f else None

        # track changes
        type_changed = False
        gov_id_changed = False
        sec_changed = False
        meta_changed = False

        # type
        if 'government_id_type' in vdata:
            new_type = vdata.get('government_id_type')
            type_changed = (new_type != getattr(instance, 'government_id_type'))
            instance.government_id_type = new_type
            update_fields.append('government_id_type')

            # wipe secondary doc when not needed
            if new_type in ('DRIVER_LICENSE', 'AUS_PASSPORT', 'AGE_PROOF'):
                old_sec = getattr(instance, 'identity_secondary_file', None)
                if old_sec:
                    try: _delete_file_if_unreferenced(old_sec, current_instance=instance)
                    except Exception: pass
                instance.identity_secondary_file = None
                update_fields.append('identity_secondary_file')
                sec_changed = True

            # clear stale meta if not provided
            if 'identity_meta' not in vdata:
                instance.identity_meta = {}
                update_fields.append('identity_meta')
                meta_changed = True

        # primary file
        if 'government_id' in vdata:
            new_file = vdata.get('government_id')
            old_file = getattr(instance, 'government_id', None)
            gov_id_changed = (_fname(new_file) != _fname(old_file))
            if new_file is None:
                if old_file:
                    try: _delete_file_if_unreferenced(old_file, current_instance=instance)
                    except Exception: pass
                instance.government_id = None
                update_fields.append('government_id')
            else:
                if old_file and _fname(old_file) and _fname(old_file) != _fname(new_file):
                    try: _delete_file_if_unreferenced(old_file, current_instance=instance)
                    except Exception: pass
                instance.government_id = new_file
                update_fields.append('government_id')

        # secondary file
        if 'identity_secondary_file' in vdata:
            new_sec = vdata.get('identity_secondary_file')
            old_sec = getattr(instance, 'identity_secondary_file', None)
            sec_changed = (_fname(new_sec) != _fname(old_sec)) or sec_changed
            if new_sec is None:
                if old_sec:
                    try: _delete_file_if_unreferenced(old_sec, current_instance=instance)
                    except Exception: pass
                instance.identity_secondary_file = None
                update_fields.append('identity_secondary_file')
            else:
                if old_sec and _fname(old_sec) and _fname(old_sec) != _fname(new_sec):
                    try: _delete_file_if_unreferenced(old_sec, current_instance=instance)
                    except Exception: pass
                instance.identity_secondary_file = new_sec
                update_fields.append('identity_secondary_file')

        # identity_meta normalisation per type
        if 'identity_meta' in vdata:
            incoming_meta = vdata.get('identity_meta') or {}
            meta = dict(incoming_meta)
            doc_type = getattr(instance, 'government_id_type')

            if doc_type == 'DRIVER_LICENSE':
                meta = {k: v for k, v in meta.items() if k in {'state','expiry'}}

            elif doc_type == 'VISA':
                meta = {k: v for k, v in meta.items() if k in {'visa_type_number','valid_to','passport_country','passport_expiry'}}

            elif doc_type == 'AUS_PASSPORT':
                meta = {k: v for k, v in meta.items() if k in {'expiry'}}
                meta['country'] = 'Australia'

            elif doc_type == 'OTHER_PASSPORT':
                meta = {k: v for k, v in meta.items() if k in {'country','expiry','visa_type_number','valid_to'}}

            elif doc_type == 'AGE_PROOF':
                meta = {k: v for k, v in meta.items() if k in {'state','expiry'}}

            if meta != (instance.identity_meta or {}):
                instance.identity_meta = meta
                update_fields.append('identity_meta')
                meta_changed = True

        # reset verification if any identity input changed
        if gov_id_changed or sec_changed or type_changed or meta_changed:
            instance.gov_id_verified = False
            instance.gov_id_verification_note = ""
            update_fields += ['gov_id_verified', 'gov_id_verification_note']

        if submit:
            instance.verified = False
            update_fields.append('verified')

        if update_fields:
            instance.save(update_fields=list(set(update_fields)))

        # Validate on submit
        if submit:
            errors = {}
            doc_type = getattr(instance, 'government_id_type')
            meta_now = getattr(instance, 'identity_meta') or {}

            if not doc_type:
                errors['government_id_type'] = ['Select a document type.']
            if not getattr(instance, 'government_id', None):
                errors['government_id'] = ['This file is required.']

            if doc_type == 'DRIVER_LICENSE':
                if not meta_now.get('state'):  errors['identity_meta.state'] = ['Required.']
                if not meta_now.get('expiry'): errors['identity_meta.expiry'] = ['Required.']
            elif doc_type == 'VISA':
                if not meta_now.get('visa_type_number'):  errors['identity_meta.visa_type_number'] = ['Required.']
                if not meta_now.get('valid_to'):         errors['identity_meta.valid_to'] = ['Required.']
                if not getattr(instance, 'identity_secondary_file', None):
                    errors['identity_secondary_file'] = ['Overseas passport file is required with a Visa.']
                if not meta_now.get('passport_country'): errors['identity_meta.passport_country'] = ['Required.']
                if not meta_now.get('passport_expiry'):  errors['identity_meta.passport_expiry'] = ['Required.']
            elif doc_type == 'AUS_PASSPORT':
                if not meta_now.get('expiry'): errors['identity_meta.expiry'] = ['Required.']
            elif doc_type == 'OTHER_PASSPORT':
                if not meta_now.get('country'): errors['identity_meta.country'] = ['Required.']
                if not meta_now.get('expiry'):  errors['identity_meta.expiry'] = ['Required.']
                if not getattr(instance, 'identity_secondary_file', None):
                    errors['identity_secondary_file'] = ['Visa file is required with an Overseas passport.']
                if not meta_now.get('visa_type_number'): errors['identity_meta.visa_type_number'] = ['Required.']
                if not meta_now.get('valid_to'):         errors['identity_meta.valid_to'] = ['Required.']
            elif doc_type == 'AGE_PROOF':
                if not meta_now.get('state'):  errors['identity_meta.state'] = ['Required.']
                if not meta_now.get('expiry'): errors['identity_meta.expiry'] = ['Required.']

            if errors:
                raise serializers.ValidationError(errors)

            # schedule verification task if needed
            if instance.government_id and (gov_id_changed or type_changed or meta_changed or not instance.gov_id_verified):
                async_task(
                    'client_profile.tasks.verify_filefield_task',
                    instance._meta.model_name, instance.pk,
                    'government_id',
                    instance.user.first_name or '',
                    instance.user.last_name or '',
                    instance.user.email or '',
                    verification_field='gov_id_verified',
                    note_field='gov_id_verification_note',
                )
        return instance

    # ---------------- Regulatory TAB ----------------
    def _regulatory_tab(self, instance: OtherStaffOnboarding, vdata: dict, submit: bool):
        """
        Keeps your current role/subrole logic and per-role docs,
        but runs per-field resets and schedules file verifications.
        """
        update_fields = []
        file_fields = [
            'ahpra_proof','hours_proof','certificate','university_id','cpr_certificate','s8_certificate'
        ]

        def _fname(f):
            return getattr(f, 'name', None) if f else None

        # role classification inputs
        for f in ['role_type','classification_level','student_year','intern_half']:
            if f in vdata:
                if getattr(instance, f) != vdata[f]:
                    setattr(instance, f, vdata[f])
                    update_fields.append(f)

        # Handle each file: replace/clear safely; reset its verified flag on change
        def handle_file(field):
            changed = False
            if field in vdata:
                new_file = vdata.get(field)  # may be file or None
                old_file = getattr(instance, field, None)
                changed = (_fname(new_file) != _fname(old_file))
                if new_file is None:
                    if old_file:
                        try: _delete_file_if_unreferenced(old_file, current_instance=instance)
                        except Exception: pass
                    setattr(instance, field, None)
                    update_fields.append(field)
                else:
                    if old_file and _fname(old_file) and _fname(old_file) != _fname(new_file):
                        try: _delete_file_if_unreferenced(old_file, current_instance=instance)
                        except Exception: pass
                    setattr(instance, field, new_file)
                    update_fields.append(field)

                # reset verification when changed
                if changed:
                    vflag = f"{field}_verified"
                    vnote = f"{field}_verification_note"
                    if hasattr(instance, vflag):
                        setattr(instance, vflag, False)
                        update_fields.append(vflag)
                    if hasattr(instance, vnote):
                        setattr(instance, vnote, "")
                        update_fields.append(vnote)
            return changed

        changed_map = {f: handle_file(f) for f in file_fields}

        if submit:
            instance.verified = False
            update_fields.append('verified')

            # Validate required per role
            req = self._required_docs_for_role(instance)
            errors = {}
            for field, _, _ in req:
                if not getattr(instance, field, None):
                    errors[field] = ['This file is required for the selected role.']
            if errors:
                raise serializers.ValidationError(errors)

        if update_fields:
            instance.save(update_fields=list(set(update_fields)))

        # schedule verification tasks for any provided file that changed or is not verified
        if submit:
            for field, changed in changed_map.items():
                vflag = f"{field}_verified"
                if getattr(instance, field, None) and (changed or not getattr(instance, vflag, False)):
                    async_task(
                        'client_profile.tasks.verify_filefield_task',
                        instance._meta.model_name, instance.pk,
                        field,
                        instance.user.first_name or '',
                        instance.user.last_name or '',
                        instance.user.email or '',
                        verification_field=f"{field}_verified",
                        note_field=f"{field}_verification_note",
                    )
        return instance

    # ---------------- Payment TAB ----------------
    def _payment_tab(self, instance: OtherStaffOnboarding, vdata: dict, submit: bool):
        payment_fields = [
            'payment_preference','abn','gst_registered',
            'super_fund_name','super_usi','super_member_number',
            'abn_entity_confirmed',
        ]
        update_fields: list[str] = []
        pref_in = (vdata.get('payment_preference') or instance.payment_preference or '').upper()

        # regular writes
        for f in payment_fields:
            if f in vdata:
                setattr(instance, f, vdata[f])
                update_fields.append(f)

        # TFN
        if 'tfn_number' in vdata:
            instance.tfn_number = (vdata['tfn_number'] or '').strip()
            update_fields.append('tfn_number')

        # ABN changed -> reset
        abn_changed = ('abn' in vdata) and (vdata.get('abn') != getattr(instance, 'abn'))
        if abn_changed:
            instance.abn_verified = False
            instance.abn_entity_confirmed = False
            instance.abn_verification_note = ""
            update_fields += ['abn_verified','abn_entity_confirmed','abn_verification_note']

        # confirmation gate
        if 'abn_entity_confirmed' in vdata:
            confirmed = bool(vdata['abn_entity_confirmed'])
            if confirmed and instance.abn_entity_name:
                instance.abn_verified = True
                if not instance.abn_verification_note:
                    instance.abn_verification_note = 'User confirmed ABN entity details.'
                update_fields += ['abn_verified','abn_verification_note']
            else:
                if instance.abn_verified:
                    instance.abn_verified = False
                    update_fields.append('abn_verified')

        # optional sync gst_registered from ABR
        if 'gst_registered' not in vdata:
            if instance.abn_gst_registered is True and not instance.gst_registered:
                instance.gst_registered = True
                update_fields.append('gst_registered')

        # TFN path validation on submit
        if submit and (pref_in or instance.payment_preference):
            pref_effective = (pref_in or instance.payment_preference or '').upper()
            if pref_effective == 'TFN':
                errors = {}
                if not instance.tfn_number:
                    errors['tfn'] = ['TFN is required.']
                if not instance.super_fund_name:
                    errors['super_fund_name'] = ['Super fund name is required for TFN.']
                if not instance.super_usi:
                    errors['super_usi'] = ['USI is required for TFN.']
                if not instance.super_member_number:
                    errors['super_member_number'] = ['Member number is required for TFN.']
                if errors:
                    raise serializers.ValidationError(errors)

        if submit:
            instance.verified = False
            update_fields.append('verified')

        if update_fields:
            instance.save(update_fields=list(set(update_fields)))

        # run ABN task on submit
        if submit:
            pref_effective = (pref_in or instance.payment_preference or '').upper()
            if pref_effective == 'ABN' and instance.abn:
                async_task(
                    'client_profile.tasks.verify_abn_task',
                    instance._meta.model_name, instance.pk,
                    instance.abn,
                    instance.user.first_name or '',
                    instance.user.last_name or '',
                    instance.user.email or '',
                    note_field='abn_verification_note',
                )
        return instance

    # ---------------- Referees TAB ----------------
    def _referees_tab(self, instance: OtherStaffOnboarding, vdata: dict, submit: bool):
        from onboarding.emails import send_referee_emails
        update_fields = []

        def apply_ref(idx: int):
            prefix = f"referee{idx}_"
            locked = bool(getattr(instance, f"{prefix}confirmed", False))

            incoming = {
                'name': vdata.get(f"{prefix}name", getattr(instance, f"{prefix}name")),
                'relation': vdata.get(f"{prefix}relation", getattr(instance, f"{prefix}relation")),
                'email': clean_email(vdata.get(f"{prefix}email", getattr(instance, f"{prefix}email"))),
                'workplace': vdata.get(f"{prefix}workplace", getattr(instance, f"{prefix}workplace")),
            }
            if locked:
                return

            changed = False
            for key in ['name','relation','email','workplace']:
                field = f"{prefix}{key}"
                if field in vdata and getattr(instance, field) != incoming[key]:
                    setattr(instance, field, incoming[key])
                    update_fields.append(field)
                    changed = True

            if changed:
                for flag in ['confirmed','rejected']:
                    f = f"{prefix}{flag}"
                    if getattr(instance, f, False):
                        setattr(instance, f, False)
                        update_fields.append(f)
                last = f"{prefix}last_sent"
                if getattr(instance, last, None) is not None:
                    setattr(instance, last, None)
                    update_fields.append(last)

        apply_ref(1)
        apply_ref(2)

        if submit:
            errors = {}
            for idx in [1,2]:
                prefix = f"referee{idx}_"
                if not getattr(instance, f"{prefix}name"):       errors[prefix+'name'] = ['Required.']
                if not getattr(instance, f"{prefix}relation"):   errors[prefix+'relation'] = ['Required.']
                if not getattr(instance, f"{prefix}email"):      errors[prefix+'email'] = ['Required.']
                if not getattr(instance, f"{prefix}workplace"):  errors[prefix+'workplace'] = ['Required.']
            if errors:
                raise serializers.ValidationError(errors)
            if not instance.verified:
                instance.verified = False
                update_fields.append('verified')

        if update_fields:
            instance.save(update_fields=list(set(update_fields)))

        if submit:
            send_referee_emails(instance, is_reminder=False)
        return instance

    # ---------------- Skills TAB ----------------
    def _skills_tab(self, instance: OtherStaffOnboarding, vdata: dict, submit: bool):
        """
        Legacy-aligned Skills tab:
        - `skills`: list of codes (string or JSON array)
        - Per-skill certificate upload (must exist if the skill is selected)
        - `years_experience`: simple string bucket stored on the model
        """
        # 1) Parse skills array (accept JSON string or list)
        raw = self.initial_data.get("skills", vdata.get("skills", []))
        if isinstance(raw, str):
            try:
                skills = json.loads(raw)
            except Exception:
                raise serializers.ValidationError({"skills": "Must be a JSON array or list."})
        else:
            skills = list(raw or [])

        # 2) Years of experience (optional)
        yrs = self.initial_data.get("years_experience", vdata.get("years_experience", None))
        if yrs is not None:
            # store as plain string; keep legacy buckets (e.g. '', '0-1', '1-2', '2-3', '3-5', '5+')
            instance.years_experience = (yrs or "").strip()

        uploads = self._files_by_skill()                    # accepts both flat keys and skill_files[CODE]
        cert_map = dict(instance.skill_certificates or {})  # latest file per skill
        user_id = instance.user_id

        # 3) If a skill was unchecked, remove its stored certificate (unless keeping history)
        if not getattr(self, "KEEP_SKILL_HISTORY", False):
            removed = [code for code in list(cert_map.keys()) if code not in skills]
            for code in removed:
                old_path = (cert_map.get(code) or {}).get("path")
                if old_path:
                    try:
                        default_storage.delete(old_path)
                    except Exception:
                        pass
                cert_map.pop(code, None)

        # 4) Save any uploaded files for checked skills
        for code, f in uploads.items():
            if code in skills and f:
                # remember old path (if any)
                old_path = (cert_map.get(code) or {}).get("path")

                # save new file (keeps historical versions if you change _save_skill_file to do so)
                saved = self._save_skill_file(user_id, code, f)

                # delete old file unless keeping history
                if old_path and not getattr(self, "KEEP_SKILL_HISTORY", False):
                    try:
                        default_storage.delete(old_path)
                    except Exception:
                        pass

                # record new pointer
                cert_map[code] = {
                    "path": saved,
                    "uploaded_at": timezone.now().isoformat(),
                }

        # 5) Validation: only skills that require certificates must have one
        required_codes = _required_cert_skill_codes("otherstaff")
        missing = [code for code in skills if code in required_codes and code not in cert_map]
        if missing:
            raise serializers.ValidationError(
                {"skills": f"Certificate required for: {', '.join(missing)}"}
            )

        # 6) Persist changes
        instance.skills = skills
        instance.skill_certificates = cert_map

        # Save only the changed fields; include years_experience if we set it above
        update_fields = ["skills", "skill_certificates"]
        if yrs is not None:
            update_fields.append("years_experience")

        instance.save(update_fields=update_fields)
        return instance

    # ---------------- Profile TAB ----------------
    def _profile_tab(self, instance: OtherStaffOnboarding, vdata: dict, submit: bool):
        update_fields = []
        if 'short_bio' in vdata:
            instance.short_bio = vdata['short_bio']
            update_fields.append('short_bio')

        if 'resume' in vdata:
            new_file = vdata['resume']
            old_file = getattr(instance, 'resume', None)
            if new_file is None:
                if old_file:
                    _delete_file_if_unreferenced(old_file, current_instance=instance)
                instance.resume = None
                update_fields.append('resume')
            else:
                if old_file:
                    try:
                        if getattr(old_file, 'name', None) != getattr(new_file, 'name', None):
                            _delete_file_if_unreferenced(old_file, current_instance=instance)
                    except Exception:
                        pass
                instance.resume = new_file
                update_fields.append('resume')

        if submit:
            instance.verified = False
            update_fields.append('verified')

        if update_fields:
            instance.save(update_fields=list(set(update_fields)))
        return instance

    # ---------------- read-only summary for UI ----------------
    def get_skill_certificates(self, obj):
        data = []
        for code, meta in (obj.skill_certificates or {}).items():
            path = (meta or {}).get("path")
            if not path:
                continue
            try:
                url = default_storage.url(path)
            except Exception:
                url = None
            data.append({"skill_code": code, "path": path, "url": url, "uploaded_at": meta.get("uploaded_at")})
        return sorted(data, key=lambda r: r["skill_code"])

    def get_profile_photo_url(self, obj):
        return _build_absolute_media_url(self.context.get("request"), getattr(obj, "profile_photo", None))


class ExplorerOnboardingV2Serializer(UploadValidationMixin, serializers.ModelSerializer):
    """
    V2 tab-aware serializer for Explorer.
    Tabs: basic, identity, interests, referees, profile.
    """

    # user pass-through
    username     = serializers.CharField(source='user.username',   required=False, allow_blank=True)
    first_name   = serializers.CharField(source='user.first_name', required=False, allow_blank=True)
    last_name    = serializers.CharField(source='user.last_name',  required=False, allow_blank=True)
    phone_number = serializers.CharField(source='user.mobile_number', required=False, allow_blank=True, allow_null=True)
    profile_photo = serializers.ImageField(required=False, allow_null=True)
    profile_photo_url = serializers.SerializerMethodField(read_only=True)

    latitude  = serializers.DecimalField(max_digits=18, decimal_places=12, required=False, allow_null=True)
    longitude = serializers.DecimalField(max_digits=18, decimal_places=12, required=False, allow_null=True)

    # write-only control flags
    tab = serializers.CharField(write_only=True, required=False)
    submitted_for_verification = serializers.BooleanField(write_only=True, required=False)

    # computed
    progress_percent = serializers.SerializerMethodField()
    upload_validation_map = {
        "profile_photo": IMAGE_UPLOAD_POLICY,
        "government_id": DOCUMENT_UPLOAD_POLICY,
        "identity_secondary_file": DOCUMENT_UPLOAD_POLICY,
        "resume": DOCUMENT_UPLOAD_POLICY,
    }

    class Meta:
        model = ExplorerOnboarding
        fields = [
            "id",
            # ---------- BASIC ----------
            'username','first_name','last_name','phone_number','profile_photo','profile_photo_url',
            'role_type','gender','emergency_contact_number','emergency_contact_relation',
            'street_address','suburb','state','postcode','google_place_id','latitude','longitude','open_to_travel','travel_states','coverage_radius_km',

            # ---------- IDENTITY ----------
            'government_id','identity_secondary_file','government_id_type','identity_meta',
            'gov_id_verified','gov_id_verification_note',

            # ---------- INTERESTS ----------
            'interests',   # JSON (array of codes, e.g. ["SHADOWING","VOLUNTEERING","PLACEMENT","JUNIOR_ASSISTANT"])

            # ---------- REFEREES ----------
            'referee1_name','referee1_relation','referee1_email','referee1_workplace',
            'referee1_confirmed','referee1_rejected','referee1_last_sent',
            'referee2_name','referee2_relation','referee2_email','referee2_workplace',
            'referee2_confirmed','referee2_rejected','referee2_last_sent',

            # ---------- PROFILE ----------
            'short_bio','resume',

            'verified','progress_percent',
            'tab','submitted_for_verification',
        ]
        extra_kwargs = {
            "id": {"read_only": True},
            # user names optional
            'username': {'required': False, 'allow_blank': True},
            'first_name': {'required': False, 'allow_blank': True},
            'last_name': {'required': False, 'allow_blank': True},
            'phone_number': {'required': False, 'allow_blank': True, 'allow_null': True},
            'profile_photo': {'required': False, 'allow_null': True},
            'profile_photo_url': {'read_only': True},

            # basic
            'role_type': {'required': False, 'allow_blank': True, 'allow_null': True},
            'gender': {'required': False, 'allow_blank': True, 'allow_null': True},
            'emergency_contact_number': {'required': False, 'allow_blank': True, 'allow_null': True},
            'emergency_contact_relation': {'required': False, 'allow_blank': True, 'allow_null': True},
            'street_address':  {'required': False, 'allow_blank': True, 'allow_null': True},
            'suburb':          {'required': False, 'allow_blank': True, 'allow_null': True},
            'state':           {'required': False, 'allow_blank': True, 'allow_null': True},
            'postcode':        {'required': False, 'allow_blank': True, 'allow_null': True},
            'google_place_id': {'required': False, 'allow_blank': True, 'allow_null': True},
            'latitude':        {'required': False, 'allow_null': True},
            'longitude':       {'required': False, 'allow_null': True},
            'open_to_travel':  {'required': False},
            'travel_states':   {'required': False},
            'coverage_radius_km': {'required': False, 'allow_null': True},

            # identity (tab decides requiredness)
            'government_id': {'required': False, 'allow_null': True},
            'government_id_type': {'required': False, 'allow_blank': True, 'allow_null': True},
            'identity_secondary_file': {'required': False, 'allow_null': True},
            'identity_meta': {'required': False},
            'gov_id_verified': {'read_only': True},
            'gov_id_verification_note': {'read_only': True},

            # interests
            'interests': {'required': False},

            # referees
            'referee1_name':       {'required': False, 'allow_blank': True, 'allow_null': True},
            'referee1_relation':   {'required': False, 'allow_blank': True, 'allow_null': True},
            'referee1_email':      {'required': False, 'allow_blank': True, 'allow_null': True},
            'referee1_workplace':  {'required': False, 'allow_blank': True, 'allow_null': True},
            'referee2_name':       {'required': False, 'allow_blank': True, 'allow_null': True},
            'referee2_relation':   {'required': False, 'allow_blank': True, 'allow_null': True},
            'referee2_email':      {'required': False, 'allow_blank': True, 'allow_null': True},
            'referee2_workplace':  {'required': False, 'allow_blank': True, 'allow_null': True},
            'referee1_confirmed':  {'read_only': True},
            'referee1_rejected':   {'read_only': True},
            'referee1_last_sent':  {'read_only': True},
            'referee2_confirmed':  {'read_only': True},
            'referee2_rejected':   {'read_only': True},
            'referee2_last_sent':  {'read_only': True},

            # profile
            'short_bio': {'required': False, 'allow_blank': True, 'allow_null': True},
            'resume':    {'required': False, 'allow_null': True},

            'verified': {'read_only': True},
            'progress_percent': {'read_only': True},
        }

    # ---------------- progress gate ----------------
    def get_progress_percent(self, obj):
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

    # ---------------- update router ----------------
    def update(self, instance, validated_data):
        tab = (self.initial_data.get('tab') or 'basic').strip().lower()
        submit = bool(self.initial_data.get('submitted_for_verification'))

        # first-time submission notify (Basic only)
        first_submit = submit and (tab == 'basic') and not bool(getattr(instance, 'submitted_for_verification', False))
        if first_submit:
            instance.submitted_for_verification = True
            instance.save(update_fields=['submitted_for_verification'])
            from onboarding.emails import notify_superuser_on_onboarding
            try:
                notify_superuser_on_onboarding(instance)
            except Exception:
                pass

        if tab == 'basic':
            return self._basic_tab(instance, validated_data, submit)
        if tab == 'identity':
            return self._identity_tab(instance, validated_data, submit)
        if tab == 'interests':
            return self._interests_tab(instance, validated_data, submit)
        if tab == 'referees':
            return self._referees_tab(instance, validated_data, submit)
        if tab == 'profile':
            return self._profile_tab(instance, validated_data, submit)

        return super().update(instance, validated_data)

    # ---------------- BASIC TAB ----------------
    def _basic_tab(self, instance: ExplorerOnboarding, vdata: dict, submit: bool):
        # nested user data
        user_data = vdata.pop('user', {})
        if user_data:
            _update_locked_user_fields(instance.user, user_data)

        update_fields = []

        clear_photo = _should_clear_flag(self.initial_data, "profile_photo_clear")
        if "profile_photo" in vdata or clear_photo:
            new_photo = vdata.pop("profile_photo", None)
            old_photo = getattr(instance, "profile_photo", None)
            if new_photo is None and clear_photo:
                if old_photo:
                    try:
                        _delete_file_if_unreferenced(old_photo, current_instance=instance)
                    except Exception:
                        pass
                instance.profile_photo = None
                update_fields.append("profile_photo")
            elif new_photo is not None:
                if old_photo and _file_has_changed(new_photo, old_photo):
                    try:
                        _delete_file_if_unreferenced(old_photo, current_instance=instance)
                    except Exception:
                        pass
                instance.profile_photo = new_photo
                update_fields.append("profile_photo")

        # role + address
        direct_fields = [
            'role_type','gender','emergency_contact_number','emergency_contact_relation',
            'street_address','suburb','state','postcode','google_place_id','open_to_travel','travel_states','coverage_radius_km',
        ]
        for f in direct_fields:
            if f in vdata:
                setattr(instance, f, vdata[f])
                update_fields.append(f)

        # lat/lon rounding
        if 'latitude' in vdata:
            instance.latitude = q6(vdata.get('latitude'))
            update_fields.append('latitude')
        if 'longitude' in vdata:
            instance.longitude = q6(vdata.get('longitude'))
            update_fields.append('longitude')

        if submit:
            instance.verified = False
            update_fields.append('verified')

        if update_fields:
            instance.save(update_fields=list(set(update_fields)))
        return instance

    # ---------------- Identity TAB (identical behavior) ----------------
    def _identity_tab(self, instance: ExplorerOnboarding, vdata: dict, submit: bool):
        update_fields = []

        def _fname(f):
            return getattr(f, 'name', None) if f else None

        type_changed = False
        gov_id_changed = False
        sec_changed = False
        meta_changed = False

        # type
        if 'government_id_type' in vdata:
            new_type = vdata.get('government_id_type')
            type_changed = (new_type != getattr(instance, 'government_id_type'))
            instance.government_id_type = new_type
            update_fields.append('government_id_type')

            # clear secondary when not needed
            if new_type in ('DRIVER_LICENSE', 'AUS_PASSPORT', 'AGE_PROOF'):
                old_sec = getattr(instance, 'identity_secondary_file', None)
                if old_sec:
                    try: _delete_file_if_unreferenced(old_sec, current_instance=instance)
                    except Exception: pass
                instance.identity_secondary_file = None
                update_fields.append('identity_secondary_file')
                sec_changed = True

            # clear stale meta if not provided
            if 'identity_meta' not in vdata:
                instance.identity_meta = {}
                update_fields.append('identity_meta')
                meta_changed = True

        # primary file
        if 'government_id' in vdata:
            new_file = vdata.get('government_id')
            old_file = getattr(instance, 'government_id', None)
            gov_id_changed = (_fname(new_file) != _fname(old_file))
            if new_file is None:
                if old_file:
                    try: _delete_file_if_unreferenced(old_file, current_instance=instance)
                    except Exception: pass
                instance.government_id = None
                update_fields.append('government_id')
            else:
                if old_file and _fname(old_file) and _fname(old_file) != _fname(new_file):
                    try: _delete_file_if_unreferenced(old_file, current_instance=instance)
                    except Exception: pass
                instance.government_id = new_file
                update_fields.append('government_id')

        # secondary file
        if 'identity_secondary_file' in vdata:
            new_sec = vdata.get('identity_secondary_file')
            old_sec = getattr(instance, 'identity_secondary_file', None)
            sec_changed = (_fname(new_sec) != _fname(old_sec)) or sec_changed
            if new_sec is None:
                if old_sec:
                    try: _delete_file_if_unreferenced(old_sec, current_instance=instance)
                    except Exception: pass
                instance.identity_secondary_file = None
                update_fields.append('identity_secondary_file')
            else:
                if old_sec and _fname(old_sec) and _fname(old_sec) != _fname(new_sec):
                    try: _delete_file_if_unreferenced(old_sec, current_instance=instance)
                    except Exception: pass
                instance.identity_secondary_file = new_sec
                update_fields.append('identity_secondary_file')

        # meta normalization
        if 'identity_meta' in vdata:
            incoming = vdata.get('identity_meta') or {}
            meta = dict(incoming)
            doc_type = getattr(instance, 'government_id_type')

            if doc_type == 'DRIVER_LICENSE':
                meta = {k: v for k, v in meta.items() if k in {'state','expiry'}}
            elif doc_type == 'VISA':
                meta = {k: v for k, v in meta.items() if k in {'visa_type_number','valid_to','passport_country','passport_expiry'}}
            elif doc_type == 'AUS_PASSPORT':
                meta = {k: v for k, v in meta.items() if k in {'expiry'}}
                meta['country'] = 'Australia'
            elif doc_type == 'OTHER_PASSPORT':
                meta = {k: v for k, v in meta.items() if k in {'country','expiry','visa_type_number','valid_to'}}
            elif doc_type == 'AGE_PROOF':
                meta = {k: v for k, v in meta.items() if k in {'state','expiry'}}

            if meta != (instance.identity_meta or {}):
                instance.identity_meta = meta
                update_fields.append('identity_meta')
                meta_changed = True

        # reset verification
        if gov_id_changed or sec_changed or type_changed or meta_changed:
            instance.gov_id_verified = False
            instance.gov_id_verification_note = ""
            update_fields += ['gov_id_verified','gov_id_verification_note']

        if submit:
            instance.verified = False
            update_fields.append('verified')

        if update_fields:
            instance.save(update_fields=list(set(update_fields)))

        # validate + schedule on submit
        if submit:
            errors = {}
            doc_type = getattr(instance, 'government_id_type')
            meta_now = getattr(instance, 'identity_meta') or {}

            if not doc_type:
                errors['government_id_type'] = ['Select a document type.']
            if not getattr(instance, 'government_id', None):
                errors['government_id'] = ['This file is required.']

            if doc_type == 'DRIVER_LICENSE':
                if not meta_now.get('state'):  errors['identity_meta.state'] = ['Required.']
                if not meta_now.get('expiry'): errors['identity_meta.expiry'] = ['Required.']
            elif doc_type == 'VISA':
                if not meta_now.get('visa_type_number'):  errors['identity_meta.visa_type_number'] = ['Required.']
                if not meta_now.get('valid_to'):         errors['identity_meta.valid_to'] = ['Required.']
                if not getattr(instance, 'identity_secondary_file', None):
                    errors['identity_secondary_file'] = ['Overseas passport file is required with a Visa.']
                if not meta_now.get('passport_country'): errors['identity_meta.passport_country'] = ['Required.']
                if not meta_now.get('passport_expiry'):  errors['identity_meta.passport_expiry'] = ['Required.']
            elif doc_type == 'AUS_PASSPORT':
                if not meta_now.get('expiry'): errors['identity_meta.expiry'] = ['Required.']
            elif doc_type == 'OTHER_PASSPORT':
                if not meta_now.get('country'): errors['identity_meta.country'] = ['Required.']
                if not meta_now.get('expiry'):  errors['identity_meta.expiry'] = ['Required.']
                if not getattr(instance, 'identity_secondary_file', None):
                    errors['identity_secondary_file'] = ['Visa file is required with an Overseas passport.']
                if not meta_now.get('visa_type_number'): errors['identity_meta.visa_type_number'] = ['Required.']
                if not meta_now.get('valid_to'):         errors['identity_meta.valid_to'] = ['Required.']
            elif doc_type == 'AGE_PROOF':
                if not meta_now.get('state'):  errors['identity_meta.state'] = ['Required.']
                if not meta_now.get('expiry'): errors['identity_meta.expiry'] = ['Required.']

            if errors:
                raise serializers.ValidationError(errors)

            # schedule verification task
            if instance.government_id and (gov_id_changed or type_changed or meta_changed or not instance.gov_id_verified):
                from core.task_queue import async_task
                async_task(
                    'client_profile.tasks.verify_filefield_task',
                    instance._meta.model_name, instance.pk,
                    'government_id',
                    instance.user.first_name or '',
                    instance.user.last_name or '',
                    instance.user.email or '',
                    verification_field='gov_id_verified',
                    note_field='gov_id_verification_note',
                )
        return instance

    # ---------------- Interests TAB ----------------
    def _interests_tab(self, instance: ExplorerOnboarding, vdata: dict, submit: bool):
        """
        Accepts list or JSON string.
        Allowed (suggested) values: SHADOWING, VOLUNTEERING, PLACEMENT, JUNIOR_ASSISTANT
        """
        raw = self.initial_data.get('interests', vdata.get('interests'))
        if raw is None:
            return instance

        if isinstance(raw, str):
            try:
                vals = json.loads(raw)
            except Exception:
                raise serializers.ValidationError({"interests": "Must be a JSON array or list."})
        else:
            vals = list(raw or [])

        instance.interests = vals
        if submit:
            instance.verified = False
            instance.save(update_fields=['interests','verified'])
        else:
            instance.save(update_fields=['interests'])
        return instance

    # ---------------- Referees TAB ----------------
    def _referees_tab(self, instance: ExplorerOnboarding, vdata: dict, submit: bool):
        from onboarding.emails import send_referee_emails
        update_fields = []

        def apply_ref(idx: int):
            prefix = f"referee{idx}_"
            locked = bool(getattr(instance, f"{prefix}confirmed", False))
            incoming = {
                'name': vdata.get(f"{prefix}name", getattr(instance, f"{prefix}name")),
                'relation': vdata.get(f"{prefix}relation", getattr(instance, f"{prefix}relation")),
                'email': clean_email(vdata.get(f"{prefix}email", getattr(instance, f"{prefix}email"))),
                'workplace': vdata.get(f"{prefix}workplace", getattr(instance, f"{prefix}workplace")),
            }
            if locked:
                return
            changed = False
            for key in ['name','relation','email','workplace']:
                field = f"{prefix}{key}"
                if field in vdata and getattr(instance, field) != incoming[key]:
                    setattr(instance, field, incoming[key])
                    update_fields.append(field)
                    changed = True
            if changed:
                for flag in ['confirmed','rejected']:
                    f = f"{prefix}{flag}"
                    if getattr(instance, f, False):
                        setattr(instance, f, False)
                        update_fields.append(f)
                last = f"{prefix}last_sent"
                if getattr(instance, last, None) is not None:
                    setattr(instance, last, None)
                    update_fields.append(last)

        apply_ref(1)
        apply_ref(2)

        if submit:
            errors = {}
            for idx in [1,2]:
                prefix = f"referee{idx}_"
                if not getattr(instance, f"{prefix}name"):       errors[prefix+'name'] = ['Required.']
                if not getattr(instance, f"{prefix}relation"):   errors[prefix+'relation'] = ['Required.']
                if not getattr(instance, f"{prefix}email"):      errors[prefix+'email'] = ['Required.']
                if not getattr(instance, f"{prefix}workplace"):  errors[prefix+'workplace'] = ['Required.']
            if errors:
                raise serializers.ValidationError(errors)
            if not instance.verified:
                instance.verified = False
                update_fields.append('verified')

        if update_fields:
            instance.save(update_fields=list(set(update_fields)))

        if submit:
            send_referee_emails(instance, is_reminder=False)
        return instance

    # ---------------- Profile TAB ----------------
    def _profile_tab(self, instance: ExplorerOnboarding, vdata: dict, submit: bool):
        update_fields = []
        if 'short_bio' in vdata:
            instance.short_bio = vdata['short_bio']
            update_fields.append('short_bio')

        if 'resume' in vdata:
            new_file = vdata['resume']
            old_file = getattr(instance, 'resume', None)
            if new_file is None:
                if old_file:
                    _delete_file_if_unreferenced(old_file, current_instance=instance)
                instance.resume = None
                update_fields.append('resume')
            else:
                if old_file:
                    try:
                        if getattr(old_file, 'name', None) != getattr(new_file, 'name', None):
                            _delete_file_if_unreferenced(old_file, current_instance=instance)
                    except Exception:
                        pass
                instance.resume = new_file
                update_fields.append('resume')

        if submit:
            instance.verified = False
            update_fields.append('verified')

        if update_fields:
            instance.save(update_fields=list(set(update_fields)))
        return instance

    def get_profile_photo_url(self, obj):
        return _build_absolute_media_url(self.context.get("request"), getattr(obj, "profile_photo", None))
