"""Serializers for organisations, pharmacies, chains, pharmacy admins and pharmacy claims."""
from rest_framework import serializers
from drf_spectacular.utils import extend_schema_field, OpenApiTypes
from organizations.models import Chain, Organization, Pharmacy, PharmacyAdmin, PharmacyClaim
from users.models import OrganizationMembership
from users.serializers import UserProfileSerializer
from django.db import transaction
from organizations.access import CAPABILITY_MANAGE_ROSTER, has_admin_capability
from core.task_queue import async_task
from core.serializer_lifecycle import RemoveOldFilesMixin
from core.serializer_mixins import UploadValidationMixin
from core.file_validation import DOCUMENT_UPLOAD_POLICY, IMAGE_UPLOAD_POLICY


# === Onboardings ===
class OrganizationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Organization
        fields = ['id', 'name']
        read_only_fields = ['id']


class PublicOrganizationSerializer(serializers.ModelSerializer):
    cover_image_url = serializers.SerializerMethodField()

    class Meta:
        model = Organization
        fields = ['id', 'name', 'slug', 'about', 'cover_image_url']
        read_only_fields = fields

    def get_cover_image_url(self, obj):
        request = self.context.get("request")
        if not obj.cover_image:
            return None
        url = obj.cover_image.url
        if request is not None:
            return request.build_absolute_uri(url)
        return url


def user_can_view_full_pharmacy(user, pharmacy) -> bool:
    """
    Mirrors BaseShiftViewSet._user_can_manage_pharmacy so serializers can reuse it.
    """
    if not user or not getattr(user, "is_authenticated", False) or pharmacy is None:
        return False

    owner = getattr(pharmacy, "owner", None)
    if owner and getattr(owner, "user", None) == user:
        return True

    if OrganizationMembership.objects.filter(
        user=user,
        role='ORG_ADMIN',
        organization_id=pharmacy.organization_id,
    ).exists():
        return True

    if OrganizationMembership.objects.filter(
        user=user,
        role__in=['CHIEF_ADMIN', 'REGION_ADMIN'],
        pharmacies=pharmacy,
    ).exists():
        return True

    if has_admin_capability(user, pharmacy, CAPABILITY_MANAGE_ROSTER):
        return True

    return False


def anonymize_pharmacy_detail(detail: dict | None) -> dict | None:
    """
    Strip sensitive pharmacy fields. Keep only the suburb-level context.
    """
    if not isinstance(detail, dict):
        return detail

    suburb = detail.get('suburb')
    state = detail.get('state')
    postcode = detail.get('postcode')

    masked = {
        'id': detail.get('id'),
        'name': 'Anonymous Pharmacy',
        'suburb': suburb,
    }
    if state is not None:
        masked['state'] = state
    if postcode is not None:
        masked['postcode'] = postcode

    return masked


class PharmacySerializer(RemoveOldFilesMixin, UploadValidationMixin, serializers.ModelSerializer):
    # explicitly declare your FileFields so DRF will return the URLs
    methadone_s8_protocols = serializers.FileField(
        use_url=True, allow_null=True, required=False
    )
    qld_sump_docs = serializers.FileField(
        use_url=True, allow_null=True, required=False
    )
    sops = serializers.FileField(
        use_url=True, allow_null=True, required=False
    )
    induction_guides = serializers.FileField(
        use_url=True, allow_null=True, required=False
    )
    has_chain = serializers.SerializerMethodField()
    claimed   = serializers.SerializerMethodField()
    claim_status = serializers.SerializerMethodField()
    claim_request_id = serializers.SerializerMethodField()
    public_holiday_dates = serializers.SerializerMethodField()
    email = serializers.EmailField(required=False, allow_blank=True, allow_null=True)
    submitted_for_verification = serializers.BooleanField(write_only=True, required=False)
    file_fields = [
        'methadone_s8_protocols',
        'qld_sump_docs',
        'sops',
        'induction_guides',
    ]
    abn = serializers.CharField(required=True, allow_blank=False)
    upload_validation_map = {
        "methadone_s8_protocols": DOCUMENT_UPLOAD_POLICY,
        "qld_sump_docs": DOCUMENT_UPLOAD_POLICY,
        "sops": DOCUMENT_UPLOAD_POLICY,
        "induction_guides": DOCUMENT_UPLOAD_POLICY,
    }

    class Meta:
        model = Pharmacy

        fields = [
            "id",
            "name",
            "email",
            "street_address",
            "suburb",
            "postcode",
            "google_place_id",
            "latitude",
            "longitude",
            "state",
            "owner",
            "organization",
            "verified",
            "abn",
            "abn_entity_name",
            "abn_entity_type",
            "abn_status",
            "abn_gst_registered",
            "abn_gst_from",
            "abn_gst_to",
            "abn_last_checked",
            "abn_entity_confirmed",
            "abn_verification_note",
            "timezone",
            # "asic_number",
            # your file fields:
            "methadone_s8_protocols",
            "qld_sump_docs",
            "sops",
            "induction_guides",
            # hours:
            "weekdays_start",
            "weekdays_end",
            "monday_start",
            "monday_end",
            "monday_closed",
            "tuesday_start",
            "tuesday_end",
            "tuesday_closed",
            "wednesday_start",
            "wednesday_end",
            "wednesday_closed",
            "thursday_start",
            "thursday_end",
            "thursday_closed",
            "friday_start",
            "friday_end",
            "friday_closed",
            "saturdays_start",
            "saturdays_end",
            "saturdays_closed",
            "sundays_start",
            "sundays_end",
            "sundays_closed",
            "public_holidays_start",
            "public_holidays_end",
            "public_holidays_closed",
            "public_holiday_dates",
            # arrays:
            "employment_types",
            "roles_needed",
            "use_chemisttasker_payroll",
            # rates & about:
            "default_rate_type",
            "default_fixed_rate",
            "rate_weekday",
            "rate_saturday",
            "rate_sunday",
            "rate_public_holiday",
            "rate_early_morning",
            "rate_late_night",
            "about",
            "auto_publish_worker_requests",

            'has_chain',
            'claimed',
            'claim_status',
            'claim_request_id',
            'submitted_for_verification',
        ]

        read_only_fields = ["owner", "organization", "verified"]
        extra_kwargs = {
            "abn_entity_name": {"read_only": True},
            "abn_entity_type": {"read_only": True},
            "abn_status": {"read_only": True},
            "abn_gst_registered": {"read_only": True},
            "abn_gst_from": {"read_only": True},
            "abn_gst_to": {"read_only": True},
            "abn_last_checked": {"read_only": True},
            "abn_verification_note": {"read_only": True},
        }

    _weekday_day_names = ("monday", "tuesday", "wednesday", "thursday", "friday")
    _hours_day_names = _weekday_day_names + ("saturdays", "sundays", "public_holidays")

    def get_public_holiday_dates(self, obj):
        from shifts.pricing import _normalize_state_code
        from shifts.pricing_data import public_holidays

        state_code = _normalize_state_code(getattr(obj, "state", ""))
        return public_holidays().get(state_code, [])

    def _apply_weekday_hours_compat(self, attrs):
        weekday_start = attrs.get("weekdays_start", serializers.empty)
        weekday_end = attrs.get("weekdays_end", serializers.empty)

        if weekday_start is not serializers.empty:
            for day_name in self._weekday_day_names:
                if not attrs.get(f"{day_name}_closed", getattr(self.instance, f"{day_name}_closed", False) if self.instance else False):
                    attrs.setdefault(f"{day_name}_start", weekday_start)
        if weekday_end is not serializers.empty:
            for day_name in self._weekday_day_names:
                if not attrs.get(f"{day_name}_closed", getattr(self.instance, f"{day_name}_closed", False) if self.instance else False):
                    attrs.setdefault(f"{day_name}_end", weekday_end)

        monday_start = attrs.get("monday_start", serializers.empty)
        monday_end = attrs.get("monday_end", serializers.empty)
        if "weekdays_start" not in attrs and monday_start is not serializers.empty:
            attrs["weekdays_start"] = monday_start
        if "weekdays_end" not in attrs and monday_end is not serializers.empty:
            attrs["weekdays_end"] = monday_end

        return attrs

    def _clear_closed_day_hours(self, attrs):
        for day_name in self._hours_day_names:
            closed_key = f"{day_name}_closed"
            is_closed = attrs.get(
                closed_key,
                getattr(self.instance, closed_key, False) if self.instance else False,
            )
            if is_closed:
                attrs[f"{day_name}_start"] = None
                attrs[f"{day_name}_end"] = None
        if any(attrs.get(f"{day_name}_closed") for day_name in self._weekday_day_names):
            attrs["weekdays_start"] = None
            attrs["weekdays_end"] = None
        return attrs

    def validate(self, attrs):
        attrs = super().validate(attrs)
        if self.instance and "abn" in attrs:
            incoming_abn = attrs.get("abn")
            current_abn = getattr(self.instance, "abn", None)
            is_locked = bool(
                getattr(self.instance, "abn_verified", False)
                and getattr(self.instance, "abn_entity_confirmed", False)
            )
            if is_locked and incoming_abn != current_abn:
                raise serializers.ValidationError(
                    {"abn": ["This ABN is locked after verification and confirmation."]}
                )
        attrs = self._apply_weekday_hours_compat(attrs)
        return self._clear_closed_day_hours(attrs)

    def to_representation(self, instance):
        data = super().to_representation(instance)
        weekday_start = data.get("weekdays_start")
        weekday_end = data.get("weekdays_end")
        for day_name in self._weekday_day_names:
            start_key = f"{day_name}_start"
            end_key = f"{day_name}_end"
            if not data.get(start_key):
                data[start_key] = weekday_start
            if not data.get(end_key):
                data[end_key] = weekday_end
        if not weekday_start:
            data["weekdays_start"] = data.get("monday_start")
        if not weekday_end:
            data["weekdays_end"] = data.get("monday_end")
        return data

    @extend_schema_field(OpenApiTypes.BOOL)
    def get_has_chain(self, obj) -> bool:
        if not obj.owner:
            return False
        return Chain.objects.filter(owner=obj.owner, pharmacies=obj).exists()


    @extend_schema_field(OpenApiTypes.BOOL)
    def get_claimed(self, obj) -> bool:
        if obj.organization_id:
            return True
        return obj.claims.filter(status__in=["PENDING", "ACCEPTED"]).exists()

    def _get_active_claim(self, obj):
        cached = getattr(obj, "_active_pharmacy_claim", None)
        if cached is not None:
            return cached
        claim = obj.claims.filter(status__in=["PENDING", "ACCEPTED"]).order_by('-created_at').first()
        setattr(obj, "_active_pharmacy_claim", claim)
        return claim

    def get_claim_status(self, obj):
        claim = self._get_active_claim(obj)
        return claim.status if claim else None

    def get_claim_request_id(self, obj):
        claim = self._get_active_claim(obj)
        return claim.id if claim else None

    def validate_abn(self, value: str) -> str:
        digits = ''.join(ch for ch in value if ch.isdigit())
        if len(digits) != 11:
            raise serializers.ValidationError("ABN must be 11 digits.")
        # store normalized (digits only)
        return digits

    def validate_state(self, value):
        if not value:
            return value
        v = value.strip()
        long_to_short = {
            "NEW SOUTH WALES": "NSW",
            "QUEENSLAND": "QLD",
            "VICTORIA": "VIC",
            "SOUTH AUSTRALIA": "SA",
            "WESTERN AUSTRALIA": "WA",
            "TASMANIA": "TAS",
            "AUSTRALIAN CAPITAL TERRITORY": "ACT",
            "NORTHERN TERRITORY": "NT",
        }
        upper = v.upper()
        if upper in long_to_short:
            return long_to_short[upper]
        allowed = {"QLD","NSW","VIC","SA","WA","TAS","ACT","NT"}
        if upper not in allowed:
            raise serializers.ValidationError("Invalid Australian state/territory.")
        return upper

    def _owner_identity_for_abn(self, instance: Pharmacy):
        owner_user = getattr(getattr(instance, "owner", None), "user", None)
        return (
            getattr(owner_user, "first_name", "") or "",
            getattr(owner_user, "last_name", "") or "",
            getattr(owner_user, "email", "") or "",
        )

    def _apply_abn_side_effects(
        self,
        instance: Pharmacy,
        *,
        previous_abn: str | None,
        submitted_for_verification: bool,
        confirmation_provided: bool,
        confirmation_value: bool,
    ) -> None:
        update_fields: list[str] = []
        current_abn = getattr(instance, "abn", None)
        abn_changed = previous_abn != current_abn

        if abn_changed:
            instance.abn_verified = False
            instance.abn_entity_confirmed = False
            instance.abn_entity_name = None
            instance.abn_entity_type = None
            instance.abn_status = None
            instance.abn_gst_registered = None
            instance.abn_gst_from = None
            instance.abn_gst_to = None
            instance.abn_last_checked = None
            instance.abn_verification_note = ""
            update_fields.extend([
                "abn_verified",
                "abn_entity_confirmed",
                "abn_entity_name",
                "abn_entity_type",
                "abn_status",
                "abn_gst_registered",
                "abn_gst_from",
                "abn_gst_to",
                "abn_last_checked",
                "abn_verification_note",
            ])

        if confirmation_provided:
            instance.abn_entity_confirmed = confirmation_value
            update_fields.append("abn_entity_confirmed")
            if confirmation_value and instance.abn_entity_name:
                instance.abn_verified = True
                if not instance.abn_verification_note:
                    instance.abn_verification_note = "User confirmed ABN entity details."
                update_fields.extend(["abn_verified", "abn_verification_note"])
            else:
                instance.abn_verified = False
                update_fields.append("abn_verified")

        if update_fields:
            instance.save(update_fields=list(dict.fromkeys(update_fields)))

        if submitted_for_verification and instance.abn:
            first_name, last_name, email = self._owner_identity_for_abn(instance)

            def enqueue_abn_check():
                async_task(
                    "client_profile.tasks.verify_abn_task",
                    instance._meta.model_name,
                    instance.pk,
                    instance.abn,
                    first_name,
                    last_name,
                    email,
                    note_field="abn_verification_note",
                )

            transaction.on_commit(enqueue_abn_check)

    def create(self, validated_data):
        submitted_for_verification = bool(validated_data.pop("submitted_for_verification", False))
        confirmation_provided = "abn_entity_confirmed" in validated_data
        confirmation_value = bool(validated_data.pop("abn_entity_confirmed", False))
        instance = super().create(validated_data)
        self._apply_abn_side_effects(
            instance,
            previous_abn=None,
            submitted_for_verification=submitted_for_verification,
            confirmation_provided=confirmation_provided,
            confirmation_value=confirmation_value,
        )
        return instance

    def update(self, instance, validated_data):
        submitted_for_verification = bool(validated_data.pop("submitted_for_verification", False))
        confirmation_provided = "abn_entity_confirmed" in validated_data
        confirmation_value = bool(validated_data.pop("abn_entity_confirmed", False))
        previous_abn = instance.abn
        instance = super().update(instance, validated_data)
        self._apply_abn_side_effects(
            instance,
            previous_abn=previous_abn,
            submitted_for_verification=submitted_for_verification,
            confirmation_provided=confirmation_provided,
            confirmation_value=confirmation_value,
        )
        return instance


class PharmacyClaimSerializer(serializers.ModelSerializer):
    pharmacy = serializers.SerializerMethodField()
    organization = serializers.SerializerMethodField()
    requested_by_user = UserProfileSerializer(source='requested_by', read_only=True)
    responded_by_user = UserProfileSerializer(source='responded_by', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    can_respond = serializers.SerializerMethodField()

    class Meta:
        model = PharmacyClaim
        fields = [
            'id',
            'pharmacy',
            'organization',
            'status',
            'status_display',
            'message',
            'response_message',
            'requested_by',
            'requested_by_user',
            'responded_by',
            'responded_by_user',
            'responded_at',
            'can_respond',
            'created_at',
            'updated_at',
        ]
        read_only_fields = [
            'id',
            'pharmacy',
            'organization',
            'requested_by_user',
            'responded_by_user',
            'responded_at',
            'created_at',
            'updated_at',
            'status_display',
            'requested_by',
            'responded_by',
            'can_respond',
        ]

    def get_pharmacy(self, obj):
        pharmacy = obj.pharmacy
        owner = getattr(pharmacy, "owner", None)
        owner_user = getattr(owner, "user", None)
        owner_payload = None
        if owner_user:
            owner_payload = {
                "id": owner.id,
                "user_id": owner_user.id,
                "email": owner_user.email,
                "first_name": owner_user.first_name,
                "last_name": owner_user.last_name,
            }
        return {
            "id": pharmacy.id,
            "name": pharmacy.name,
            "email": pharmacy.email,
            "organization_id": pharmacy.organization_id,
            "owner": owner_payload,
        }

    def get_organization(self, obj):
        org = obj.organization
        return {"id": org.id, "name": org.name}

    def get_can_respond(self, obj):
        request = self.context.get('request')
        if not request or not hasattr(request, 'user'):
            return False
        user = request.user
        if not user or not user.is_authenticated:
            return False
        owner = getattr(obj.pharmacy, "owner", None)
        owner_user = getattr(owner, "user", None)
        return owner_user and owner_user.id == user.id and obj.status == PharmacyClaim.Status.PENDING


class PharmacyClaimCreateSerializer(serializers.Serializer):
    pharmacy_id = serializers.IntegerField(required=False)
    pharmacy_email = serializers.EmailField(required=False)
    message = serializers.CharField(required=False, allow_blank=True)

    def validate(self, attrs):
        if not attrs.get("pharmacy_id") and not attrs.get("pharmacy_email"):
            raise serializers.ValidationError("Provide either pharmacy_id or pharmacy_email.")
        return attrs


class ChainSerializer(RemoveOldFilesMixin, UploadValidationMixin, serializers.ModelSerializer):
    file_fields = ['logo']
    upload_validation_map = {
        "logo": IMAGE_UPLOAD_POLICY,
    }
    # nested readout of pharmacies
    pharmacies = PharmacySerializer(many=True, read_only=True)
    # write-only field to set pharmacies by ID list
    pharmacy_ids = serializers.PrimaryKeyRelatedField(
        many=True,
        write_only=True,
        queryset=Pharmacy.objects.all(),
        source='pharmacies'
    )

    class Meta:
        model = Chain
        fields = [
            'id', 'owner', 'organization', 'name', 'logo',
            'subscription_plan','primary_contact_email',
            'is_active','created_at','updated_at',
            'pharmacies','pharmacy_ids'
        ]
        read_only_fields = ['owner','organization','created_at','updated_at', 'is_active']


class PharmacyAdminSerializer(serializers.ModelSerializer):
    user_details = UserProfileSerializer(source='user', read_only=True)
    pharmacy_detail = PharmacySerializer(source='pharmacy', read_only=True)
    capabilities = serializers.SerializerMethodField()
    can_remove = serializers.SerializerMethodField()

    class Meta:
        model = PharmacyAdmin
        fields = [
            "id",
            "user",
            "user_details",
            "pharmacy",
            "pharmacy_detail",
            "membership",
            "admin_level",
            "staff_role",
            "job_title",
            "is_active",
            "capabilities",
            "can_remove",
            "created_by",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "admin_level",
            "capabilities",
            "can_remove",
            "created_by",
            "created_at",
            "updated_at",
        ]

    def validate(self, attrs):
        user = attrs.get("user", getattr(self.instance, "user", None))
        pharmacy = attrs.get("pharmacy", getattr(self.instance, "pharmacy", None))
        admin_level = attrs.get("admin_level", getattr(self.instance, "admin_level", None))

        if not user or not pharmacy:
            raise serializers.ValidationError("user and pharmacy are required.")

        existing = PharmacyAdmin.objects.filter(
            user=user,
            pharmacy=pharmacy,
        )
        if self.instance:
            existing = existing.exclude(pk=self.instance.pk)
        if existing.exists():
            raise serializers.ValidationError("This user is already an admin for the selected pharmacy.")

        owner_user_id = getattr(getattr(pharmacy, "owner", None), "user_id", None)
        if owner_user_id and owner_user_id == getattr(user, "id", None):
            if admin_level != PharmacyAdmin.AdminLevel.OWNER:
                raise serializers.ValidationError({
                    "admin_level": "Pharmacy owners must remain OWNER admin level."
                })
        return attrs

    def create(self, validated_data):
        request = self.context.get("request")
        if request and request.user.is_authenticated:
            validated_data.setdefault("created_by", request.user)
        return super().create(validated_data)

    def get_capabilities(self, obj) -> list[str]:
        return sorted(list(obj.capabilities))

    def get_can_remove(self, obj) -> bool:
        request = self.context.get("request")
        if not request or not request.user.is_authenticated:
            return False
        return obj.can_be_removed_by(request.user)
