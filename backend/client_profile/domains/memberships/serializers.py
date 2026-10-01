from django.contrib.auth import get_user_model

User = get_user_model()


"""Moved verbatim from client_profile/serializers.py (Stage 2 domain split). Behaviour is unchanged; client_profile/serializers.py re-exports these names."""
from rest_framework import serializers
from client_profile.models import Membership, MembershipApplication, MembershipInviteLink, PharmacyAdmin
from users.serializers import UserProfileSerializer
from datetime import date, datetime
from django.utils import timezone
from client_profile.domains.common.serializers import _chat_member_identity, clean_email
from client_profile.domains.orgs.serializers import PharmacySerializer


MAX_ACTIVE_PHARMACY_MEMBERSHIPS = 3


def _count_active_memberships(user, exclude_membership_id=None):
    if not user:
        return 0
    qs = Membership.objects.filter(
        user=user,
        is_active=True,
        status=Membership.Status.ACCEPTED,
    )
    if exclude_membership_id:
        qs = qs.exclude(pk=exclude_membership_id)
    return qs.count()


ROLE_REQUIRED_USER_ROLE = {
    "PHARMACIST": "PHARMACIST",
    "INTERN": "OTHER_STAFF",
    "STUDENT": "OTHER_STAFF",
    "TECHNICIAN": "OTHER_STAFF",
    "ASSISTANT": "OTHER_STAFF",
}


def required_user_role_for_membership(role):
    if not role:
        return None
    return ROLE_REQUIRED_USER_ROLE.get(role)


class MembershipSerializer(serializers.ModelSerializer):
    user_details = serializers.SerializerMethodField()
    invited_by_details = UserProfileSerializer(source='invited_by', read_only=True)
    pharmacy_detail = PharmacySerializer(source='pharmacy', read_only=True)
    is_pharmacy_owner = serializers.SerializerMethodField()
    is_pharmacy_admin = serializers.SerializerMethodField()
    admin_level = serializers.SerializerMethodField()
    admin_level_label = serializers.SerializerMethodField()
    admin_level_description = serializers.SerializerMethodField()
    admin_capabilities = serializers.SerializerMethodField()

    class Meta:
        model = Membership
        fields = [
            'id', 'user', 'user_details', 'pharmacy', 'pharmacy_detail', 'invited_by', 'invited_by_details',
            'invited_name', 'role', 'employment_type', 'is_active', 'created_at', 'updated_at',
            'status', 'responded_at',
            'job_title',
            # All classification fields are included and will be handled automatically
            'pharmacist_award_level',
            'otherstaff_classification_level',
            'intern_half',
            'student_year',
            'staff_category',
            'is_pharmacy_owner',
            'is_pharmacy_admin',
            'admin_level',
            'admin_level_label',
            'admin_level_description',
            'admin_capabilities',
        ]
        read_only_fields = [
            'invited_by', 'invited_by_details', 'created_at', 'updated_at', 'is_pharmacy_owner',
            'is_pharmacy_admin',
            'admin_level',
            'admin_level_label',
            'admin_level_description',
            'admin_capabilities',
            'responded_at',
        ]

    # No 'create' method needed. The default ModelSerializer.create() works perfectly
    # because all the classification fields are listed in Meta.fields. It will
    # create the new Membership object and save all provided fields in one step.

    def get_user_details(self, obj):
        payload = UserProfileSerializer(obj.user, context=self.context).data if obj.user_id else {}
        identity = _chat_member_identity(
            obj.user,
            request=self.context.get("request"),
            membership=obj,
        )
        payload.update(identity)
        return payload

    def validate(self, attrs):
        """
        Validate and keep Membership data consistent:
        - Prevent assigning a role that conflicts with user's onboarding profile.
        - Enforce maximum active memberships per user.
        - Default employment_type for Pharmacy Admin if missing.
        - Clear irrelevant classification fields when role changes.
        """

        user = attrs.get('user', getattr(self.instance, 'user', None))
        role = attrs.get('role', getattr(self.instance, 'role', None))
        employment_type = attrs.get('employment_type', getattr(self.instance, 'employment_type', None))

        if role == 'PHARMACY_ADMIN':
            raise serializers.ValidationError({
                'role': 'Use the pharmacy admin management endpoints to assign admin roles.'
            })

        # --- (1) Enforce active membership limit ---
        if user:
            if self.instance:
                will_be_active = attrs.get('is_active', self.instance.is_active)
                if will_be_active and not self.instance.is_active:
                    current_active = _count_active_memberships(user, exclude_membership_id=self.instance.pk)
                    if current_active >= MAX_ACTIVE_PHARMACY_MEMBERSHIPS:
                        raise serializers.ValidationError({
                            'is_active': f'User already belongs to {MAX_ACTIVE_PHARMACY_MEMBERSHIPS} pharmacies.'
                        })
            else:
                if _count_active_memberships(user) >= MAX_ACTIVE_PHARMACY_MEMBERSHIPS:
                    raise serializers.ValidationError({
                        'user': f'User already belongs to {MAX_ACTIVE_PHARMACY_MEMBERSHIPS} pharmacies.'
                    })

        # --- (2) Enforce role consistency with user onboarding ---
        if user:
            pharmacist_onboard = getattr(user, 'pharmacistonboarding', None)
            otherstaff_onboard = getattr(user, 'otherstaffonboarding', None)
            explorer_onboard = getattr(user, 'exploreronboarding', None)

            # Pharmacist accounts
            if pharmacist_onboard and role not in ['PHARMACIST']:
                raise serializers.ValidationError({
                    'role': 'This user is a Pharmacist and can only be assigned as PHARMACIST.'
                })

            # Other staff (interns, assistants, etc.)
            if otherstaff_onboard:
                onboard_role = otherstaff_onboard.role_type
                if onboard_role == 'INTERN' and role != 'INTERN':
                    raise serializers.ValidationError({
                        'role': 'This user is onboarded as an Intern and cannot be invited as another role.'
                    })
                elif onboard_role == 'TECHNICIAN' and role != 'TECHNICIAN':
                    raise serializers.ValidationError({
                        'role': 'This user is onboarded as a Technician and cannot be invited as another role.'
                    })
                elif onboard_role == 'ASSISTANT' and role != 'ASSISTANT':
                    raise serializers.ValidationError({
                        'role': 'This user is onboarded as an Assistant and cannot be invited as another role.'
                    })

            # Explorer users
            if explorer_onboard:
                raise serializers.ValidationError({
                    'role': 'Explorer users cannot be added to pharmacies.'
                })

        # --- (3) Enforce user-role mapping if defined globally ---
        required_user_role = required_user_role_for_membership(role)
        user_role = getattr(user, 'role', None) if user else None
        if required_user_role and user_role and user_role != required_user_role:
            role_label = dict(Membership.ROLE_CHOICES).get(role, role)
            required_label = dict(User.ROLE_CHOICES).get(required_user_role, required_user_role)
            actual_label = dict(User.ROLE_CHOICES).get(user_role, user_role)
            identifier = getattr(user, 'email', getattr(user, 'username', 'This user'))
            raise serializers.ValidationError({
                'role': (
                    f'{identifier} is registered as {actual_label} and cannot be assigned the {role_label} role. '
                    f'Ask them to complete the {required_label} onboarding first.'
                )
            })

        job_title_value = attrs.get('job_title', getattr(self.instance, 'job_title', '') if self.instance else '')
        job_title_value = (job_title_value or '').strip()
        full_staff_types = {'FULL_TIME', 'PART_TIME'}
        if employment_type in full_staff_types:
            if not job_title_value:
                raise serializers.ValidationError({
                    'job_title': 'Job title is required for full or part-time staff.'
                })
            attrs['job_title'] = job_title_value
        else:
            attrs['job_title'] = ''

        # --- (4) Default employment type for Pharmacy Admin ---
        # --- (5) Role-based cleanup of classification fields ---
        def clear(*fields):
            for f in fields:
                if f in attrs:
                    attrs[f] = None

        if role == 'PHARMACIST':
            clear('otherstaff_classification_level', 'intern_half', 'student_year')
        elif role in ('ASSISTANT', 'TECHNICIAN'):
            clear('pharmacist_award_level', 'intern_half', 'student_year')
        elif role == 'INTERN':
            clear('pharmacist_award_level', 'otherstaff_classification_level', 'student_year')
        elif role == 'STUDENT':
            clear('pharmacist_award_level', 'otherstaff_classification_level', 'intern_half')

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

    def get_is_pharmacy_owner(self, obj):
        owner = getattr(obj.pharmacy, "owner", None)
        owner_user_id = getattr(owner, "user_id", None) if owner else None
        return owner_user_id == obj.user_id

    def get_is_pharmacy_admin(self, obj):
        return self._get_admin_assignment(obj) is not None

    def _get_admin_assignment(self, obj):
        assignment = getattr(obj, "admin_assignment", None)
        if assignment and assignment.is_active:
            return assignment
        return PharmacyAdmin.objects.filter(
            user=obj.user,
            pharmacy=obj.pharmacy,
            is_active=True,
        ).first()

    def get_admin_level(self, obj):
        assignment = self._get_admin_assignment(obj)
        return assignment.admin_level if assignment else None

    def get_admin_level_label(self, obj):
        assignment = self._get_admin_assignment(obj)
        if not assignment:
            return None
        return dict(PharmacyAdmin.AdminLevel.choices).get(assignment.admin_level, assignment.admin_level)

    def get_admin_level_description(self, obj):
        assignment = self._get_admin_assignment(obj)
        if not assignment:
            return None
        descriptions = {
            PharmacyAdmin.AdminLevel.OWNER: "Full control. Cannot be removed.",
            PharmacyAdmin.AdminLevel.MANAGER: "Full control except removing the owner.",
            PharmacyAdmin.AdminLevel.ROSTER_MANAGER: "Manage roster/shifts and broadcast communications.",
            PharmacyAdmin.AdminLevel.COMMUNICATION_MANAGER: "Communications only. Cannot manage staff or admins.",
        }
        return descriptions.get(assignment.admin_level)

    def get_admin_capabilities(self, obj):
        assignment = self._get_admin_assignment(obj)
        if not assignment:
            return []
        return sorted(list(assignment.capabilities))

    def update(self, instance, validated_data):
        """
        This override is only needed to add one piece of custom logic: if the user's role
        is changing, we want to clear out the old, irrelevant classification level.
        """
        # Check if the role is being changed to something different.
        if 'role' in validated_data and instance.role != validated_data['role']:
            # If so, reset all classification fields to None.
            # This prevents keeping old data (e.g., a pharmacist_award_level for a user now assigned as a STUDENT).
            instance.pharmacist_award_level = None
            instance.otherstaff_classification_level = None
            instance.intern_half = None
            instance.student_year = None

        # After our custom logic, we let the default .update() method do the rest.
        # It will efficiently update all fields from validated_data in a single database operation.
        return super().update(instance, validated_data)


class MembershipInviteLinkSerializer(serializers.ModelSerializer):
    class Meta:
        model = MembershipInviteLink
        fields = ['id', 'pharmacy', 'created_by', 'category', 'token', 'expires_at', 'is_active', 'created_at']
        read_only_fields = ['id', 'created_by', 'token', 'created_at']

    def create(self, validated_data):
        validated_data['created_by'] = self.context['request'].user
        return super().create(validated_data)


APPLICATION_IDENTIFIER_FIELDS = ("email", "mobile_number", "date_of_birth", "username")


APPLICATION_REVIEW_FIELDS = (
    "role",
    "first_name",
    "last_name",
    "job_title",
    "pharmacist_award_level",
    "otherstaff_classification_level",
    "intern_half",
    "student_year",
)


def _application_snapshot_value(source, field_name):
    if isinstance(source, dict):
        value = source.get(field_name)
    else:
        value = getattr(source, field_name, None)
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    return value


def _application_snapshot(source):
    fields = (
        "role",
        "first_name",
        "last_name",
        "username",
        "mobile_number",
        "date_of_birth",
        "job_title",
        "pharmacist_award_level",
        "otherstaff_classification_level",
        "intern_half",
        "student_year",
        "email",
    )
    return {field: _application_snapshot_value(source, field) for field in fields}


def _application_payment_profile_status(application):
    """Safe owner-facing readiness summary from the canonical workforce resolver."""
    worker = getattr(application, "submitted_by", None)
    if not worker and getattr(application, "email", None):
        worker = User.objects.filter(email__iexact=application.email).first()

    if not worker:
        return {
            "account_linked": False,
            "onboarding_complete": False,
            "payment_preference": None,
            "status": "ACCOUNT_NOT_LINKED",
            "payroll_ready": False,
            "invoice_ready": False,
            "missing_fields": ["worker_account", "onboarding", "payment_preference"],
        }

    from client_profile.engagement_routing import worker_payment_profile_status

    status = worker_payment_profile_status(worker)
    return {
        "account_linked": True,
        **status,
    }


def _normalise_application_role_fields(attrs, *, role, payroll_enabled, category):
    require_classification = bool(payroll_enabled and category == "FULL_PART_TIME")

    if role == "PHARMACIST":
        attrs["otherstaff_classification_level"] = None
        attrs["intern_half"] = None
        attrs["student_year"] = None
        if require_classification and not attrs.get("pharmacist_award_level"):
            raise serializers.ValidationError({
                "pharmacist_award_level": "Pharmacist Award classification is required while ChemistTasker Payroll is enabled."
            })
    elif role in ("ASSISTANT", "TECHNICIAN"):
        attrs["pharmacist_award_level"] = None
        attrs["intern_half"] = None
        attrs["student_year"] = None
        if require_classification and not attrs.get("otherstaff_classification_level"):
            raise serializers.ValidationError({
                "otherstaff_classification_level": "Classification level is required while ChemistTasker Payroll is enabled."
            })
    elif role == "INTERN":
        attrs["pharmacist_award_level"] = None
        attrs["otherstaff_classification_level"] = None
        attrs["student_year"] = None
        if require_classification and not attrs.get("intern_half"):
            raise serializers.ValidationError({
                "intern_half": "Intern training half is required while ChemistTasker Payroll is enabled."
            })
    elif role == "STUDENT":
        attrs["pharmacist_award_level"] = None
        attrs["otherstaff_classification_level"] = None
        attrs["intern_half"] = None
        if require_classification and not attrs.get("student_year"):
            raise serializers.ValidationError({
                "student_year": "Student year is required while ChemistTasker Payroll is enabled."
            })


class MembershipApplicationSerializer(serializers.ModelSerializer):
    invite_link = serializers.PrimaryKeyRelatedField(
        queryset=MembershipInviteLink.objects.all(),
        write_only=True,
    )
    email = serializers.EmailField(required=True, allow_blank=False)
    pharmacy_name = serializers.CharField(source="pharmacy.name", read_only=True)
    payroll_enabled = serializers.BooleanField(source="pharmacy.use_chemisttasker_payroll", read_only=True)
    payment_profile_status = serializers.SerializerMethodField()

    class Meta:
        model = MembershipApplication
        fields = [
            "id", "invite_link", "pharmacy", "pharmacy_name", "category",
            "role", "first_name", "last_name", "username", "mobile_number", "date_of_birth", "job_title",
            "pharmacist_award_level", "otherstaff_classification_level",
            "intern_half", "student_year", "email",
            "submitted_by", "status", "submitted_at", "decided_at", "decided_by",
            "submitted_snapshot", "review_changes", "reviewed_at", "reviewed_by",
            "approved_membership", "payroll_enabled", "payment_profile_status",
        ]
        read_only_fields = [
            "id", "pharmacy", "pharmacy_name", "category",
            "submitted_by", "status", "submitted_at", "decided_at", "decided_by",
            "submitted_snapshot", "review_changes", "reviewed_at", "reviewed_by",
            "approved_membership", "payroll_enabled", "payment_profile_status",
        ]

    def get_payment_profile_status(self, obj):
        return _application_payment_profile_status(obj)

    def validate(self, attrs):
        request = self.context.get("request")
        authenticated_user = request.user if request and request.user.is_authenticated else None
        invite_link = attrs.get("invite_link")
        role = attrs.get("role")
        email_value = clean_email((attrs.get("email") or "").strip().lower())
        attrs["email"] = email_value
        attrs["mobile_number"] = (attrs.get("mobile_number") or "").strip()
        date_of_birth = attrs.get("date_of_birth")

        if not invite_link:
            raise serializers.ValidationError({"invite_link": "A valid membership invite link is required."})
        if not date_of_birth:
            raise serializers.ValidationError({"date_of_birth": "Date of birth is required."})
        if date_of_birth > timezone.localdate():
            raise serializers.ValidationError({"date_of_birth": "Date of birth cannot be in the future."})
        if date_of_birth < date(1900, 1, 1):
            raise serializers.ValidationError({"date_of_birth": "Enter a valid date of birth."})

        existing_user = User.objects.filter(email__iexact=email_value).first()
        if existing_user and Membership.objects.filter(user=existing_user, pharmacy=invite_link.pharmacy).exists():
            raise serializers.ValidationError({
                "email": "You already have a membership or pending invitation for this pharmacy."
            })

        if MembershipApplication.objects.filter(
            pharmacy=invite_link.pharmacy,
            email__iexact=email_value,
            status="PENDING",
        ).exists():
            raise serializers.ValidationError({
                "email": "An application for this email is already pending with this pharmacy."
            })

        pending_key = f"{invite_link.pharmacy_id}:{email_value}"
        if MembershipApplication.objects.filter(
            pending_identity_key=pending_key,
            status="PENDING",
        ).exists():
            raise serializers.ValidationError({
                "email": "An application for this email is already pending with this pharmacy."
            })

        duplicate_identity = MembershipApplication.objects.filter(
            pharmacy=invite_link.pharmacy,
            status="PENDING",
            mobile_number__iexact=attrs["mobile_number"],
            date_of_birth=date_of_birth,
        )
        if duplicate_identity.exists():
            raise serializers.ValidationError({
                "mobile_number": "An application with these identity details is already pending for this pharmacy."
            })

        if authenticated_user:
            user_role = getattr(authenticated_user, "role", None)
            if user_role not in ("PHARMACIST", "OTHER_STAFF"):
                raise serializers.ValidationError({
                    "email": "Only pharmacist and other staff accounts can submit an authenticated membership application."
                })

            if email_value != (authenticated_user.email or "").strip().lower():
                raise serializers.ValidationError({"email": "Use the email address on your signed-in account."})

            required_user_role = required_user_role_for_membership(role)
            if required_user_role and user_role != required_user_role:
                role_label = dict(Membership.ROLE_CHOICES).get(role, role)
                actual_label = dict(User.ROLE_CHOICES).get(user_role, user_role)
                raise serializers.ValidationError({
                    "role": f"Your account is registered as {actual_label} and cannot apply as {role_label}."
                })

            pharmacist_onboard = getattr(authenticated_user, "pharmacistonboarding", None)
            otherstaff_onboard = getattr(authenticated_user, "otherstaffonboarding", None)
            onboarding_dob = getattr(
                pharmacist_onboard if user_role == "PHARMACIST" else otherstaff_onboard,
                "date_of_birth",
                None,
            )
            if onboarding_dob and onboarding_dob != date_of_birth:
                raise serializers.ValidationError({
                    "date_of_birth": "Date of birth must match your verified onboarding profile."
                })
            if user_role == "OTHER_STAFF" and otherstaff_onboard:
                onboard_role = getattr(otherstaff_onboard, "role_type", None)
                if onboard_role in ("INTERN", "TECHNICIAN", "ASSISTANT", "STUDENT") and role != onboard_role:
                    role_label = dict(Membership.ROLE_CHOICES).get(onboard_role, onboard_role)
                    raise serializers.ValidationError({
                        "role": f"Your account is onboarded as {role_label} and cannot apply as another role."
                    })

            identity_checks = {
                "first_name": authenticated_user.first_name,
                "last_name": authenticated_user.last_name,
                "username": authenticated_user.username,
                "mobile_number": authenticated_user.mobile_number,
            }
            for field_name, current_value in identity_checks.items():
                submitted_value = (attrs.get(field_name) or "").strip()
                current_value = (current_value or "").strip()
                if current_value and submitted_value and submitted_value != current_value:
                    raise serializers.ValidationError({field_name: "Use the value on your signed-in account."})

        username_value = (attrs.get("username") or "").strip()
        if not username_value:
            raise serializers.ValidationError({"username": "Username is required."})
        attrs["username"] = username_value

        job_title_value = (attrs.get("job_title") or "").strip()
        if invite_link.category == "FULL_PART_TIME":
            if not job_title_value:
                raise serializers.ValidationError({"job_title": "Job title is required for pharmacy staff applications."})
        else:
            job_title_value = ""
        attrs["job_title"] = job_title_value

        _normalise_application_role_fields(
            attrs,
            role=role,
            payroll_enabled=invite_link.pharmacy.use_chemisttasker_payroll,
            category=invite_link.category,
        )
        return attrs

    def create(self, validated_data):
        request = self.context.get("request")
        if request and request.user.is_authenticated:
            validated_data["submitted_by"] = request.user
        link = validated_data["invite_link"]
        validated_data["category"] = link.category
        validated_data["pharmacy"] = link.pharmacy
        validated_data["pending_identity_key"] = f"{link.pharmacy_id}:{validated_data['email']}"
        validated_data["submitted_snapshot"] = _application_snapshot(validated_data)
        return super().create(validated_data)


class MembershipApplicationReviewSerializer(serializers.ModelSerializer):
    pharmacy_name = serializers.CharField(source="pharmacy.name", read_only=True)
    payroll_enabled = serializers.BooleanField(source="pharmacy.use_chemisttasker_payroll", read_only=True)
    payment_profile_status = serializers.SerializerMethodField()

    class Meta:
        model = MembershipApplication
        fields = [
            "id", "pharmacy", "pharmacy_name", "category",
            "role", "first_name", "last_name", "username", "mobile_number", "date_of_birth", "job_title",
            "pharmacist_award_level", "otherstaff_classification_level",
            "intern_half", "student_year", "email",
            "submitted_by", "status", "submitted_at", "decided_at", "decided_by",
            "submitted_snapshot", "review_changes", "reviewed_at", "reviewed_by",
            "approved_membership", "payroll_enabled", "payment_profile_status",
        ]
        read_only_fields = [
            "id", "pharmacy", "pharmacy_name", "category",
            "username", "mobile_number", "date_of_birth", "email",
            "submitted_by", "status", "submitted_at", "decided_at", "decided_by",
            "submitted_snapshot", "review_changes", "reviewed_at", "reviewed_by",
            "approved_membership", "payroll_enabled", "payment_profile_status",
        ]

    def get_payment_profile_status(self, obj):
        return _application_payment_profile_status(obj)

    def validate(self, attrs):
        if self.instance.status != "PENDING":
            raise serializers.ValidationError({"detail": "Only pending applications can be edited."})

        for field_name in APPLICATION_IDENTIFIER_FIELDS:
            if field_name in self.initial_data:
                incoming = self.initial_data.get(field_name)
                current = _application_snapshot_value(self.instance, field_name)
                if str(incoming or "") != str(current or ""):
                    raise serializers.ValidationError({
                        field_name: "This identifier is locked after the applicant submits the application."
                    })

        role = attrs.get("role", self.instance.role)
        merged = {
            field: attrs.get(field, getattr(self.instance, field, None))
            for field in APPLICATION_REVIEW_FIELDS
        }
        merged["role"] = role
        merged["job_title"] = (merged.get("job_title") or "").strip()

        if self.instance.category == "FULL_PART_TIME" and not merged["job_title"]:
            raise serializers.ValidationError({"job_title": "Job title is required for pharmacy staff applications."})
        if self.instance.category != "FULL_PART_TIME":
            merged["job_title"] = ""

        worker = self.instance.submitted_by or User.objects.filter(email__iexact=self.instance.email).first()
        if worker:
            required_user_role = required_user_role_for_membership(role)
            if required_user_role and worker.role != required_user_role:
                raise serializers.ValidationError({
                    "role": "The reviewed role conflicts with the applicant's ChemistTasker account role."
                })

        _normalise_application_role_fields(
            merged,
            role=role,
            payroll_enabled=self.instance.pharmacy.use_chemisttasker_payroll,
            category=self.instance.category,
        )
        attrs.update(merged)
        return attrs

    def update(self, instance, validated_data):
        request = self.context.get("request")
        changes = []
        for field in APPLICATION_REVIEW_FIELDS:
            if field not in validated_data:
                continue
            old_value = _application_snapshot_value(instance, field)
            new_value = validated_data[field]
            if isinstance(new_value, (date, datetime)):
                new_value = new_value.isoformat()
            if old_value != new_value:
                changes.append({
                    "field": field,
                    "from": old_value,
                    "to": new_value,
                    "edited_at": timezone.now().isoformat(),
                    "edited_by_user_id": getattr(getattr(request, "user", None), "id", None),
                })

        instance = super().update(instance, validated_data)
        if changes:
            instance.review_changes = [*(instance.review_changes or []), *changes]
            instance.reviewed_at = timezone.now()
            instance.reviewed_by = request.user if request and request.user.is_authenticated else None
            instance.save(update_fields=["review_changes", "reviewed_at", "reviewed_by"])
        return instance
