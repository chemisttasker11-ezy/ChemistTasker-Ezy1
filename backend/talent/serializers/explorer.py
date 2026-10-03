"""Serializers for the talent/explorer posts API."""
from rest_framework import serializers
from onboarding.models import ExplorerOnboarding, OtherStaffOnboarding, PharmacistOnboarding
from talent.models import ExplorerPost, ExplorerPostReaction
import uuid
import json


class ExplorerPostReadSerializer(serializers.ModelSerializer):
    explorer_name = serializers.SerializerMethodField()
    explorer_user_id = serializers.SerializerMethodField()
    explorer_role_type = serializers.SerializerMethodField()
    author_user_id = serializers.IntegerField(source="author_user.id", read_only=True)
    skills = serializers.SerializerMethodField()
    software = serializers.SerializerMethodField()
    travel_states = serializers.SerializerMethodField()
    ahpra_years_since_first_registration = serializers.SerializerMethodField()
    years_experience = serializers.SerializerMethodField()
    rating_average = serializers.FloatField(read_only=True)
    rating_count = serializers.IntegerField(read_only=True)

    is_liked_by_me = serializers.SerializerMethodField()

    class Meta:
        model = ExplorerPost
        fields = [
            "id",
            "explorer_profile",
            "author_user_id",
            "headline",
            "body",
            "role_category",
            "role_title",
            "work_types",
            "post_kind",
            "coverage_radius_km",
            "open_to_travel",
            "travel_states",
            "ahpra_years_since_first_registration",
            "years_experience",
            "availability_mode",
            "availability_summary",
            "availability_days",
            "availability_notice",
            "location_suburb",
            "location_state",
            "location_postcode",
            "skills",
            "software",
            "reference_code",
            "is_anonymous",
            "view_count",
            "like_count",
            "reply_count",
            "rating_average",
            "rating_count",
            "created_at",
            "updated_at",
            "explorer_name",
            # --- ADD THE NEW FIELDS TO THE LIST ---
            "explorer_user_id",
            "explorer_role_type",
            "is_liked_by_me",
        ]
        read_only_fields = fields  # read serializer only

    def get_explorer_name(self, obj):
        user = obj.author_user or getattr(obj.explorer_profile, "user", None)
        return user.get_full_name() if user else ""

    def get_explorer_user_id(self, obj):
        user = obj.author_user or getattr(obj.explorer_profile, "user", None)
        return user.id if user else None

    def get_explorer_role_type(self, obj):
        if obj.explorer_profile:
            return getattr(obj.explorer_profile, "role_type", None)
        return obj.role_title or obj.role_category

    def _get_onboarding_skills(self, obj):
        user = obj.author_user or getattr(obj.explorer_profile, "user", None)
        if not user:
            return []
        try:
            if obj.role_category == "PHARMACIST":
                po = PharmacistOnboarding.objects.filter(user=user).first()
                return list(po.skills or []) if po else []
            if obj.role_category == "OTHER_STAFF":
                so = OtherStaffOnboarding.objects.filter(user=user).first()
                return list(so.skills or []) if so else []
            # Explorers do not expose skills on TalentBoard.
            return []
        except Exception:
            return []

    def get_skills(self, obj):
        # Always prefer onboarding skills for Pharmacist/Other Staff.
        if obj.role_category in ("PHARMACIST", "OTHER_STAFF"):
            return self._get_onboarding_skills(obj)
        # Explorers do not expose skills on TalentBoard.
        if obj.role_category == "EXPLORER":
            return []
        return list(obj.skills or []) if obj.skills else self._get_onboarding_skills(obj)

    def get_software(self, obj):
        return list(obj.software or []) if obj.software else []

    def get_travel_states(self, obj):
        user = obj.author_user or getattr(obj.explorer_profile, "user", None)
        if not user:
            return []
        try:
            if obj.role_category == "PHARMACIST":
                po = PharmacistOnboarding.objects.filter(user=user).first()
                return list(getattr(po, "travel_states", []) or []) if po else []
            if obj.role_category == "OTHER_STAFF":
                so = OtherStaffOnboarding.objects.filter(user=user).first()
                return list(getattr(so, "travel_states", []) or []) if so else []
            if obj.role_category == "EXPLORER":
                eo = ExplorerOnboarding.objects.filter(user=user).first()
                return list(getattr(eo, "travel_states", []) or []) if eo else []
        except Exception:
            return []
        return []

    def get_ahpra_years_since_first_registration(self, obj):
        user = obj.author_user or getattr(obj.explorer_profile, "user", None)
        if not user:
            return None
        if obj.role_category != "PHARMACIST":
            return None
        try:
            po = PharmacistOnboarding.objects.filter(user=user).first()
            return getattr(po, "ahpra_years_since_first_registration", None) if po else None
        except Exception:
            return None

    def get_years_experience(self, obj):
        user = obj.author_user or getattr(obj.explorer_profile, "user", None)
        if not user:
            return None
        if obj.role_category != "OTHER_STAFF":
            return None
        try:
            so = OtherStaffOnboarding.objects.filter(user=user).first()
            return getattr(so, "years_experience", None) if so else None
        except Exception:
            return None

    def get_is_liked_by_me(self, obj):
        req = self.context.get("request")
        if not req or not req.user or not req.user.is_authenticated:
            return False
        return ExplorerPostReaction.objects.filter(post=obj, user=req.user).exists()


class PublicExplorerPostReadSerializer(ExplorerPostReadSerializer):
    """Public cards keep their content but not an anonymous author's identity."""

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if instance.is_anonymous:
            for field in ("explorer_profile", "author_user_id", "explorer_user_id"):
                data[field] = None
            data["explorer_name"] = "Anonymous candidate"
        return data


class ExplorerPostWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = ExplorerPost
        fields = [
            "id",
            "explorer_profile",
            "headline",
            "body",
            "role_category",
            "role_title",
            "work_types",
            "post_kind",
            "coverage_radius_km",
            "open_to_travel",
            "availability_mode",
            "availability_summary",
            "availability_days",
            "availability_notice",
            "location_suburb",
            "location_state",
            "location_postcode",
            "skills",
            "software",
            "reference_code",
            "is_anonymous",
        ]

    def validate(self, attrs):
        """
        Ensure the creator owns the explorer_profile.
        (We re-check in perform_create too, but this gives nice 400s earlier.)
        """
        # Normalize JSON fields coming from multipart/form-data
        work_types = attrs.get("work_types")
        if isinstance(work_types, str):
            try:
                attrs["work_types"] = json.loads(work_types)
            except Exception:
                raise serializers.ValidationError({"work_types": "Invalid JSON list."})
        skills = attrs.get("skills")
        if isinstance(skills, str):
            try:
                attrs["skills"] = json.loads(skills)
            except Exception:
                raise serializers.ValidationError({"skills": "Invalid JSON list."})
        software = attrs.get("software")
        if isinstance(software, str):
            try:
                attrs["software"] = json.loads(software)
            except Exception:
                raise serializers.ValidationError({"software": "Invalid JSON list."})
        availability_days = attrs.get("availability_days")
        if isinstance(availability_days, str):
            try:
                attrs["availability_days"] = json.loads(availability_days)
            except Exception:
                raise serializers.ValidationError({"availability_days": "Invalid JSON list."})

        post_kind = attrs.get("post_kind", getattr(self.instance, "post_kind", None))
        existing_work_types = getattr(self.instance, "work_types", []) if self.instance else []
        work_types = list(attrs.get("work_types") if "work_types" in attrs else (existing_work_types or []))
        if post_kind == "FULL_TIME_APPLICATION":
            if "FULL_TIME" not in work_types:
                work_types.append("FULL_TIME")
            attrs["work_types"] = work_types
            attrs["availability_days"] = []
            attrs["availability_mode"] = "FULL_TIME_NOTICE"
            attrs["availability_summary"] = "Open to anytime"
            attrs["availability_notice"] = None
        elif post_kind == "AVAILABILITY":
            availability_days = list(attrs.get("availability_days") or [])
            attrs["availability_days"] = availability_days
            attrs["availability_mode"] = "CASUAL_CALENDAR" if availability_days else None
            attrs["availability_summary"] = attrs.get("availability_summary") or None
            if not availability_days:
                attrs["availability_notice"] = attrs.get("availability_notice") or None

        request = self.context.get("request")
        profile = attrs.get("explorer_profile")
        if request and request.user.is_authenticated and profile:
            if getattr(profile, "user_id", None) != request.user.id:
                raise serializers.ValidationError("You can only post from your own explorer profile.")
        return attrs

    def create(self, validated_data):
        request = self.context.get("request")
        if request and request.user and request.user.is_authenticated:
            validated_data.setdefault("author_user", request.user)
            if not validated_data.get("explorer_profile") and getattr(request.user, "is_explorer", lambda: False)():
                try:
                    validated_data["explorer_profile"] = ExplorerOnboarding.objects.get(user=request.user)
                except ExplorerOnboarding.DoesNotExist:
                    pass
        if not validated_data.get("reference_code"):
            validated_data["reference_code"] = uuid.uuid4().hex[:8].upper()
        return ExplorerPost.objects.create(**validated_data)

    def update(self, instance, validated_data):
        updatable_fields = [
            "headline",
            "body",
            "role_category",
            "role_title",
            "work_types",
            "post_kind",
            "coverage_radius_km",
            "open_to_travel",
            "availability_mode",
            "availability_summary",
            "availability_days",
            "availability_notice",
            "location_suburb",
            "location_state",
            "location_postcode",
            "skills",
            "software",
            "reference_code",
            "is_anonymous",
            "explorer_profile",
        ]
        changed = []
        for field in updatable_fields:
            if field in validated_data:
                setattr(instance, field, validated_data[field])
                changed.append(field)
        if changed:
            changed.append("updated_at")
            instance.save(update_fields=list(set(changed)))
        return instance
