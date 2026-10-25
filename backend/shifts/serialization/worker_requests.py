"""shifts: cohesive worker requests serializers."""
from rest_framework import serializers
from onboarding.models import OtherStaffOnboarding
from shifts.models import Shift, WorkerShiftRequest


class WorkerShiftRequestSerializer(serializers.ModelSerializer):
    requested_by = serializers.HiddenField(default=serializers.CurrentUserDefault())
    pharmacy_name = serializers.CharField(source="pharmacy.name", read_only=True)
    requester_name = serializers.CharField(source="requested_by.get_full_name", read_only=True)

    class Meta:
        model = WorkerShiftRequest
        fields = [
            "id",
            "pharmacy",
            "pharmacy_name",
            "requested_by",
            "requester_name",
            "shift",
            "role",
            "slot_date",
            "start_time",
            "end_time",
            "note",
            "status",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["status", "created_at", "updated_at"]

    @staticmethod
    def _normalize_shift_role(value):
        raw = str(value or "").strip().upper().replace("-", "_").replace(" ", "_")
        if raw in {"PHARMACY_ASSISTANT", "ASSISTANT"}:
            return "ASSISTANT"
        if raw in {"DISPENSARY_TECHNICIAN", "PHARMACY_TECHNICIAN", "TECHNICIAN"}:
            return "TECHNICIAN"
        if raw in {"INTERN_PHARMACIST", "INTERN"}:
            return "INTERN"
        if raw in {"PHARMACY_STUDENT", "STUDENT"}:
            return "STUDENT"
        if raw in {"PHARMACIST", "EXPLORER", "OTHER_STAFF"}:
            return raw
        return raw

    @staticmethod
    def _otherstaff_onboarding_role(user):
        onboarding = OtherStaffOnboarding.objects.filter(user=user).first()
        return WorkerShiftRequestSerializer._normalize_shift_role(getattr(onboarding, "role_type", None))

    def _resolve_role(self, attrs):
        role = self._normalize_shift_role(attrs.get("role"))
        assignment = attrs.get("shift") or getattr(self.instance, "shift", None)
        requester = attrs.get("requested_by") or getattr(self.instance, "requested_by", None)
        request = self.context.get("request")
        if not requester and request:
            requester = request.user

        if role == "OTHER_STAFF":
            if assignment and getattr(assignment, "shift", None):
                assignment_role = self._normalize_shift_role(assignment.shift.role_needed)
                if assignment_role in dict(Shift.ROLE_CHOICES):
                    return assignment_role
            onboarding_role = self._otherstaff_onboarding_role(requester)
            if onboarding_role in dict(Shift.ROLE_CHOICES):
                return onboarding_role
            raise serializers.ValidationError({
                "role": "Other staff cover requests must use a specific shift role."
            })

        if role not in dict(Shift.ROLE_CHOICES):
            raise serializers.ValidationError({"role": "Invalid shift role."})

        return role

    def validate(self, attrs):
        attrs = super().validate(attrs)
        assignment = attrs["shift"] if "shift" in attrs else getattr(self.instance, "shift", None)
        if assignment is not None:
            requester = self.context["request"].user
            pharmacy = attrs.get("pharmacy") or getattr(self.instance, "pharmacy", None)
            # Managers approve on the request's pharmacy, so it must be the assignment's own pharmacy.
            if assignment.user_id != requester.pk or assignment.shift.pharmacy_id != getattr(pharmacy, "pk", None):
                raise serializers.ValidationError({"shift": "Select one of your own assignments at this pharmacy."})
        if "role" in attrs:
            attrs["role"] = self._resolve_role(attrs)
        return attrs

    def create(self, validated_data):
        user = self.context["request"].user

        # Explicitly link requester
        validated_data["requested_by"] = user
        validated_data["status"] = "PENDING"

        return super().create(validated_data)
