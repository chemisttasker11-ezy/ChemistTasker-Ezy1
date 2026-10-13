"""Serializers for the talent/explorer posts API."""
from rest_framework import serializers
from onboarding.models import ExplorerOnboarding, OtherStaffOnboarding, PharmacistOnboarding
from talent.models import ExplorerPost, ExplorerPostReaction
import uuid
import json
from onboarding.services.skill_identity import normalize_skills
from drf_spectacular.utils import extend_schema_field
from onboarding.verification.policy import under_18, verification_summary
from onboarding.verification.schema import VerificationSummarySerializer


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
    verification = serializers.SerializerMethodField()

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
            "verification",
        ]
        read_only_fields = fields  # read serializer only

    def get_explorer_name(self, obj):
        user = obj.author_user or getattr(obj.explorer_profile, "user", None)
        if not user:
            return ""
        # Under-18s show their first name only; age comes from the author's current profile, not the post link.
        profile = self._profile(obj)
        return user.first_name if profile is not None and under_18(profile) else user.get_full_name()

    def get_explorer_user_id(self, obj):
        user = obj.author_user or getattr(obj.explorer_profile, "user", None)
        return user.id if user else None

    def get_explorer_role_type(self, obj):
        if obj.explorer_profile:
            return getattr(obj.explorer_profile, "role_type", None)
        return obj.role_title or obj.role_category

    def _onboarding(self, obj):
        """(skill role, saved skills, onboarding row) for the post author, looked up once per author per request."""
        user = obj.author_user or getattr(obj.explorer_profile, "user", None)
        if not user or obj.role_category not in ("PHARMACIST", "OTHER_STAFF"):
            return None, [], None
        cache = self.__dict__.setdefault("_onboarding_cache", {})
        key = (obj.role_category, user.pk)
        if key not in cache and not self.__dict__.get("_onboarding_bulk_loaded"):
            self._bulk_load_onboarding(cache)
        if key not in cache:
            if obj.role_category == "PHARMACIST":
                profile = PharmacistOnboarding.objects.filter(user=user).select_related("user").first()
                cache[key] = ("PHARMACIST", list(getattr(profile, "skills", None) or []), profile)
            else:
                profile = OtherStaffOnboarding.objects.filter(user=user).select_related("user").first()
                cache[key] = (getattr(profile, "role_type", None) or "UNKNOWN", list(getattr(profile, "skills", None) or []), profile)
        return cache[key]

    def _bulk_load_onboarding(self, cache):
        """One query per onboarding model for every author on the page being serialised."""
        self._onboarding_bulk_loaded = True
        posts = getattr(self.parent, "instance", None) if self.parent is not None else None
        if not isinstance(posts, (list, tuple)):
            try:
                posts = list(posts) if posts is not None else []
            except TypeError:
                posts = []
        users = {}
        for post in posts:
            author = getattr(post, "author_user", None) or getattr(getattr(post, "explorer_profile", None), "user", None)
            if author is not None and getattr(post, "role_category", None) in ("PHARMACIST", "OTHER_STAFF"):
                users.setdefault(post.role_category, set()).add(author.pk)
        for row in PharmacistOnboarding.objects.filter(user_id__in=users.get("PHARMACIST", ())).select_related("user"):
            cache[("PHARMACIST", row.user_id)] = ("PHARMACIST", list(row.skills or []), row)
        for row in OtherStaffOnboarding.objects.filter(user_id__in=users.get("OTHER_STAFF", ())).select_related("user"):
            cache[("OTHER_STAFF", row.user_id)] = (row.role_type or "UNKNOWN", list(row.skills or []), row)

    def _get_onboarding_skills(self, obj):
        return self._onboarding(obj)[1]

    def get_skills(self, obj):
        # Always prefer onboarding skills for Pharmacist/Other Staff, limited to the author's current role.
        if obj.role_category in ("PHARMACIST", "OTHER_STAFF"):
            role, skills, _profile = self._onboarding(obj)
            return normalize_skills(skills, allowed_role=role, matchable_only=True)
        # Explorers do not expose skills on TalentBoard.
        if obj.role_category == "EXPLORER":
            return []
        return normalize_skills(list(obj.skills or []))

    def get_software(self, obj):
        if obj.role_category == 'EXPLORER':
            return []
        # Software belongs to the same current role-compatible onboarding claims.
        return normalize_skills(self.get_skills(obj), matchable_only=True, software_only=True)

    def _profile(self, obj):
        """The author's onboarding row (newcomer profile for New to pharmacy posts), loaded once per page."""
        if obj.role_category == "EXPLORER":
            if obj.explorer_profile is not None:
                return obj.explorer_profile
            user = obj.author_user
            return ExplorerOnboarding.objects.filter(user=user).first() if user else None
        return self._onboarding(obj)[2]

    @extend_schema_field(VerificationSummarySerializer(allow_null=True))
    def get_verification(self, obj):
        """Badges for the author: verified flag, evidence states and the overseas label (labels live in shared-core)."""
        profile = self._profile(obj)
        return verification_summary(profile) if profile else None

    def get_travel_states(self, obj):
        profile = self._profile(obj) if obj.role_category in ("PHARMACIST", "OTHER_STAFF", "EXPLORER") else None
        return list(getattr(profile, "travel_states", None) or [])

    def get_ahpra_years_since_first_registration(self, obj):
        profile = self._profile(obj) if obj.role_category == "PHARMACIST" else None
        return getattr(profile, "ahpra_years_since_first_registration", None) if profile else None

    def get_years_experience(self, obj):
        profile = self._profile(obj) if obj.role_category == "OTHER_STAFF" else None
        return getattr(profile, "years_experience", None) if profile else None

    def get_is_liked_by_me(self, obj):
        req = self.context.get("request")
        if not req or not req.user or not req.user.is_authenticated:
            return False
        liked = self.__dict__.get("_liked_post_ids")
        if liked is None:
            # One query for the whole page being serialised (a single post falls back to itself).
            posts = getattr(self.parent, "instance", None) if self.parent is not None else None
            ids = [post.pk for post in posts] if isinstance(posts, (list, tuple)) else [obj.pk]
            liked = self._liked_post_ids = set(
                ExplorerPostReaction.objects.filter(user=req.user, post_id__in=ids).values_list("post_id", flat=True))
        return obj.pk in liked


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
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        role = attrs.get('role_category', getattr(self.instance, 'role_category', None))
        if user and user.is_authenticated and role is None:
            role = user.role
            attrs['role_category'] = role
        if user and user.is_authenticated and role != user.role:
            raise serializers.ValidationError({'role_category': 'Use your current account role for your talent post.'})
        skill_role = role
        if role == 'OTHER_STAFF':
            profile = OtherStaffOnboarding.objects.filter(user=user).first() if user else None
            skill_role = getattr(profile, 'role_type', None) or 'UNKNOWN'
        # Explorer interests stay separate; professional claims respect the current role.
        for field in ("skills", "software"):
            if field in attrs:
                if role == "EXPLORER":
                    attrs[field] = []  # Never expose Explorer interests as professional capabilities.
                else:
                    try:
                        attrs[field] = normalize_skills(attrs[field], strict=True, allowed_role=skill_role,
                                                       matchable_only=True, software_only=field == 'software')
                    except serializers.ValidationError as error:
                        raise serializers.ValidationError({field: error.detail})
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
        ]  # explorer_profile is set by the server at creation and never changed by the client
        changed = []
        for field in updatable_fields:
            if field in validated_data:
                setattr(instance, field, validated_data[field])
                changed.append(field)
        if changed:
            changed.append("updated_at")
            instance.save(update_fields=list(set(changed)))
        return instance
