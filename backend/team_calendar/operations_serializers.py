"""Typed, bounded input and output for pharmacy operation workflows."""
from django.db.models import Sum
from rest_framework import serializers
from organizations.access import managed_pharmacies

from team_calendar.operations_models import (
    OperationTemplate, OperationPlan, OperationTask, OperationStep,
    OperationKpiRecord, OperationVerification,
)
from team_calendar.operations_rules import (
    VALID_AUDIENCES, ROLES, PERIODS, TARGET_KINDS,
    validate_checklist, check_window, check_item,
)


class OperationTemplateSerializer(serializers.ModelSerializer):
    class Meta:
        model = OperationTemplate
        fields = [
            "id", "pharmacy", "organization", "name", "category", "area", "description",
            "recurrence", "audience", "role_codes", "checklist", "requires_verification",
            "target_value", "target_unit", "target_kind", "training_url", "active",
            "created_by", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_by", "created_at", "updated_at"]

    def validate(self, attrs):
        pharmacy = attrs.get("pharmacy", getattr(self.instance, "pharmacy", None))
        organization = attrs.get("organization", getattr(self.instance, "organization", None))
        if bool(pharmacy) == bool(organization):
            raise serializers.ValidationError("Choose either a pharmacy or an organization template scope.")
        roles = attrs.get("role_codes", getattr(self.instance, "role_codes", []))
        if not isinstance(roles, list) or any(code not in ROLES for code in roles):
            raise serializers.ValidationError({"role_codes": "Unknown pharmacy role."})
        steps = attrs.get("checklist", getattr(self.instance, "checklist", []))
        validate_checklist(steps)
        audience = attrs.get("audience", getattr(self.instance, "audience", "ROLE_ON_DUTY"))
        if audience not in VALID_AUDIENCES:
            raise serializers.ValidationError({"audience": "Unknown audience."})
        if audience == "NAMED":
            raise serializers.ValidationError({"audience": "Templates use role or roster targeting; select people in a plan."})
        target_kind = attrs.get("target_kind", getattr(self.instance, "target_kind", "operational"))
        if target_kind not in TARGET_KINDS:
            raise serializers.ValidationError({"target_kind": "Unknown KPI category."})
        if target_kind == "clinical" and roles != ["PHARMACIST"]:
            raise serializers.ValidationError({"role_codes": "Clinical services require pharmacist-only targeting."})
        recurrence = attrs.get("recurrence", getattr(self.instance, "recurrence", {}))
        if not isinstance(recurrence, dict):
            raise serializers.ValidationError({"recurrence": "Expected a recurrence object."})
        return attrs


class OperationTaskSerializer(serializers.ModelSerializer):
    progress = serializers.SerializerMethodField()
    can_manage = serializers.SerializerMethodField()
    calendar_note_id = serializers.IntegerField(read_only=True)

    class Meta:
        model = OperationTask
        fields = [
            "id", "plan", "template", "calendar_note_id", "date", "title", "description",
            "area", "start_time", "end_time", "audience", "membership_ids",
            "role_codes", "checklist", "requires_verification", "target_value",
            "target_unit", "target_kind", "training_url", "progress", "can_manage", "created_at",
        ]
        read_only_fields = ["id", "calendar_note_id", "created_at", "progress", "can_manage"]

    def validate(self, attrs):
        plan = attrs.get("plan", getattr(self.instance, "plan", None))
        if plan is None:
            raise serializers.ValidationError({"plan": "Plan required."})
        if self.instance and "plan" in attrs and attrs["plan"].id != self.instance.plan_id:
            raise serializers.ValidationError({"plan": "Cannot move an item to another plan."})
        if plan.status != "DRAFT":
            raise serializers.ValidationError("Published calendar work is locked; use execution actions.")
        template = attrs.get("template", getattr(self.instance, "template", None))
        if template:
            if template.pharmacy_id != plan.pharmacy_id and not (
                template.organization_id and template.organization_id == plan.pharmacy.organization_id
            ):
                raise serializers.ValidationError({"template": "Template belongs to another pharmacy."})
        sample = OperationTask(plan=plan)
        for f in ("date", "title", "description", "area", "start_time", "end_time", "audience",
                  "membership_ids", "role_codes", "checklist", "target_value", "target_unit",
                  "target_kind", "requires_verification", "training_url"):
            setattr(sample, f, attrs.get(f, getattr(self.instance, f) if self.instance else
                                        OperationTask._meta.get_field(f).get_default()))
        check_item(sample)
        return attrs

    def get_can_manage(self, obj):
        request = self.context.get("request")
        if not request or not request.user.is_authenticated:
            return False
        if not hasattr(self, "_manager_pharmacy_ids"):
            self._manager_pharmacy_ids = set(managed_pharmacies(request.user).values_list("id", flat=True))
        return obj.plan.pharmacy_id in self._manager_pharmacy_ids

    def get_progress(self, obj):
        if not obj.calendar_note_id:
            return {"status": "DRAFT", "assigned": 0, "completed": 0, "kpi_actual": 0, "verified": False}
        note = obj.calendar_note
        assigned = note.assignees.count()
        finished = note.completions.filter(occurrence_date=obj.date).values("membership_id").distinct().count()
        required = assigned if obj.audience in {"NAMED", "EVERY_ON_DUTY"} else 1
        verified = OperationVerification.objects.filter(task=obj).exists()
        done = assigned > 0 and finished >= required
        if done and obj.requires_verification and not verified:
            status = "AWAITING_VERIFICATION"
        elif done:
            status = "FINISHED"
        elif note.status == "in_progress" or obj.step_completions.exists() or obj.kpi_records.exists():
            status = "PROGRESSING"
        else:
            status = "NOT_STARTED"
        return {
            "status": status, "assigned": assigned, "completed": finished,
            "verified": verified, "kpi_actual": obj.kpi_records.aggregate(total=Sum("value"))["total"] or 0,
        }


class OperationPlanSerializer(serializers.ModelSerializer):
    items = OperationTaskSerializer(many=True, read_only=True)

    class Meta:
        model = OperationPlan
        fields = [
            "id", "pharmacy", "name", "period", "starts_on", "ends_on", "notes",
            "status", "revision", "created_by", "published_by", "published_at",
            "items", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "status", "revision", "created_by", "published_by",
                            "published_at", "items", "created_at", "updated_at"]

    def validate(self, attrs):
        period = attrs.get("period", getattr(self.instance, "period", "daily"))
        if period not in PERIODS:
            raise serializers.ValidationError({"period": "Unknown plan period."})
        start = attrs.get("starts_on", getattr(self.instance, "starts_on", None))
        end = attrs.get("ends_on", getattr(self.instance, "ends_on", None))
        if start and end:
            check_window(start, end)
        if self.instance and attrs.get("pharmacy", self.instance.pharmacy) != self.instance.pharmacy:
            raise serializers.ValidationError({"pharmacy": "Cannot transfer a plan between pharmacies."})
        if self.instance and self.instance.items.exclude(date__gte=start, date__lte=end).exists():
            raise serializers.ValidationError({"starts_on": "Existing tasks would fall outside the new range."})
        return attrs
