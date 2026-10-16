"""Manager-only planning and audited staff execution endpoints.

Calendar owns published work. The planner owns drafts and read-only metadata
for each linked WorkNote. All mutations enforce pharmacy scope on the server.
"""
import uuid

from django.db import IntegrityError, transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework import mixins, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError, NotFound
from rest_framework.response import Response
from rest_framework.views import APIView

from memberships.models import Membership
from organizations.access import managed_pharmacies, user_can_manage_pharmacy
from organizations.models import Pharmacy
from users.models import OrganizationMembership
from users.org_roles import ORG_WIDE_ADMIN_ROLES
from team_calendar.models import WorkNoteAssignee, WorkNoteCompletion
from team_calendar.operations_catalog import catalog, CATEGORIES
from team_calendar.operations_models import (
    OperationTemplate, OperationPlan, OperationTask, OperationStep, OperationKpiRecord,
    OperationVerification, OperationAudit,
)
from team_calendar.operations_rules import apply_template, preflight, publish_plan
from team_calendar.operations_serializers import (
    OperationTemplateSerializer, OperationPlanSerializer, OperationTaskSerializer,
)


def _manager_ids(user):
    return managed_pharmacies(user).values_list("id", flat=True)


def _manager_required(user, pharmacy):
    if not user_can_manage_pharmacy(user, pharmacy):
        raise PermissionDenied("You cannot manage plans for this pharmacy.")


def _org_admin(user, org_id):
    return bool(org_id and OrganizationMembership.objects.filter(
        user=user, organization_id=org_id, role__in=ORG_WIDE_ADMIN_ROLES,
    ).exists())


def _audit(task, user, action, details=None):
    OperationAudit.objects.create(plan=task.plan, task=task, actor=user,
                                  action=action, details=details or {})


class OperationContextView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        pharmacies = managed_pharmacies(request.user).select_related("organization")
        return Response({"pharmacies": [
            {"id": p.id, "name": p.name, "organization_id": p.organization_id}
            for p in pharmacies
        ], "categories": [{"id": key, "label": label} for key, label in CATEGORIES]})


class OperationCatalogView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        if not managed_pharmacies(request.user).exists():
            raise PermissionDenied("Only pharmacy operations managers can browse templates.")
        return Response({"templates": catalog()})


class OperationTemplateViewSet(viewsets.ModelViewSet):
    serializer_class = OperationTemplateSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        managed = list(_manager_ids(self.request.user))
        org_ids = list(OrganizationMembership.objects.filter(
            user=self.request.user, role__in=ORG_WIDE_ADMIN_ROLES
        ).values_list("organization_id", flat=True))
        qs = OperationTemplate.objects.filter(
            Q(pharmacy_id__in=managed) | Q(organization_id__in=org_ids)
        )
        pharmacy_id = self.request.query_params.get("pharmacy_id")
        if pharmacy_id:
            try:
                pharmacy_id = int(pharmacy_id)
            except (TypeError, ValueError):
                raise ValidationError({"pharmacy_id": "Invalid ID."})
            if pharmacy_id not in managed:
                raise PermissionDenied("Cannot access this pharmacy.")
            org_id = Pharmacy.objects.filter(id=pharmacy_id).values_list("organization_id", flat=True).first()
            qs = qs.filter(Q(pharmacy_id=pharmacy_id) | Q(organization_id=org_id, organization_id__in=org_ids))
        return qs.distinct()

    def _authorize(self, obj):
        if obj.pharmacy_id:
            _manager_required(self.request.user, obj.pharmacy)
        elif not _org_admin(self.request.user, obj.organization_id):
            raise PermissionDenied("Only organization-wide administrators can manage organization templates.")

    def perform_create(self, serializer):
        provisional = OperationTemplate(
            pharmacy=serializer.validated_data.get("pharmacy"),
            organization=serializer.validated_data.get("organization"),
        )
        self._authorize(provisional)
        serializer.save(created_by=self.request.user)

    def perform_update(self, serializer):
        self._authorize(serializer.instance)
        requested_pharmacy = serializer.validated_data.get("pharmacy", serializer.instance.pharmacy)
        requested_org = serializer.validated_data.get("organization", serializer.instance.organization)
        self._authorize(OperationTemplate(pharmacy=requested_pharmacy, organization=requested_org))
        serializer.save()

    def perform_destroy(self, instance):
        self._authorize(instance)
        instance.delete()


class OperationPlanViewSet(viewsets.ModelViewSet):
    serializer_class = OperationPlanSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        qs = OperationPlan.objects.filter(pharmacy_id__in=_manager_ids(self.request.user))
        ph_id = self.request.query_params.get("pharmacy_id")
        if ph_id:
            try:
                ph_id = int(ph_id)
            except (TypeError, ValueError):
                raise ValidationError({"pharmacy_id": "Invalid ID."})
            if not managed_pharmacies(self.request.user).filter(id=ph_id).exists():
                raise PermissionDenied("Cannot access this pharmacy.")
            qs = qs.filter(pharmacy_id=ph_id)
        return qs.prefetch_related("items__calendar_note__assignees", "items__calendar_note__completions")

    def perform_create(self, serializer):
        pharmacy = serializer.validated_data["pharmacy"]
        _manager_required(self.request.user, pharmacy)
        serializer.save(created_by=self.request.user)

    def perform_update(self, serializer):
        if serializer.instance.status != "DRAFT":
            raise ValidationError("Published plans are immutable; manage execution from the calendar.")
        plan = serializer.save()
        plan.revision += 1
        plan.save(update_fields=["revision", "updated_at"])

    def perform_destroy(self, instance):
        if instance.status != "DRAFT":
            raise ValidationError("Published plans cannot be deleted.")
        instance.delete()

    @action(detail=True, methods=["post"])
    def apply_template(self, request, pk=None):
        plan = self.get_object()
        if plan.status != "DRAFT":
            raise ValidationError("Only drafts accept templates.")
        try:
            template = OperationTemplate.objects.get(pk=int(request.data.get("template_id")))
        except (OperationTemplate.DoesNotExist, ValueError, TypeError):
            raise ValidationError({"template_id": "Unknown template."})
        if not template.active:
            raise ValidationError("Template is inactive.")
        with transaction.atomic():
            created = apply_template(plan, template, request.user)
        return Response({"created": len(created), "plan": self.get_serializer(plan).data})

    @action(detail=True, methods=["get"])
    def preview(self, request, pk=None):
        plan = self.get_object()
        if plan.status != "DRAFT":
            raise ValidationError("Preview is for draft plans.")
        review, _ = preflight(plan)
        return Response(review)

    @action(detail=True, methods=["post"])
    def publish(self, request, pk=None):
        plan = self.get_object()
        try:
            revision = int(request.data.get("revision"))
        except (ValueError, TypeError):
            raise ValidationError({"revision": "Provide the reviewed draft revision."})
        if revision != plan.revision:
            raise ValidationError({"revision": "Plan changed; reload before publishing."})
        updated, preview = publish_plan(plan.id, request.user, revision=revision)
        return Response({"plan": self.get_serializer(updated).data, "preflight": preview})


class OperationTaskViewSet(viewsets.ModelViewSet):
    serializer_class = OperationTaskSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        assigned = Q(
            plan__status="PUBLISHED",
            calendar_note__assignees__membership__user=user,
            calendar_note__assignees__membership__is_active=True,
        )
        return OperationTask.objects.filter(
            Q(plan__pharmacy_id__in=_manager_ids(user)) | assigned
        ).select_related("plan", "calendar_note").distinct()

    @transaction.atomic
    def perform_create(self, serializer):
        plan = serializer.validated_data["plan"]
        _manager_required(self.request.user, plan.pharmacy)
        if plan.status != "DRAFT":
            raise ValidationError("Cannot add tasks to a published plan.")
        if plan.items.count() >= 400:
            raise ValidationError("This plan is full.")
        task = serializer.save()
        plan.revision += 1
        plan.save(update_fields=["revision", "updated_at"])
        _audit(task, self.request.user, "ITEM_CREATED")

    @transaction.atomic
    def perform_update(self, serializer):
        task = serializer.instance
        _manager_required(self.request.user, task.plan.pharmacy)
        if task.plan.status != "DRAFT":
            raise ValidationError("Published calendar tasks cannot be edited in the draft planner.")
        task = serializer.save()
        plan = task.plan
        plan.revision += 1
        plan.save(update_fields=["revision", "updated_at"])
        _audit(task, self.request.user, "ITEM_UPDATED")

    @transaction.atomic
    def perform_destroy(self, instance):
        _manager_required(self.request.user, instance.plan.pharmacy)
        if instance.plan.status != "DRAFT":
            raise ValidationError("Published calendar tasks cannot be deleted here.")
        plan = instance.plan
        _audit(instance, self.request.user, "ITEM_REMOVED")
        instance.delete()
        plan.revision += 1
        plan.save(update_fields=["revision", "updated_at"])

    def _worker_membership(self, request, task):
        if not task.calendar_note_id:
            raise ValidationError("This item is not published in the calendar.")
        membership = Membership.objects.filter(
            pharmacy_id=task.plan.pharmacy_id, user=request.user, is_active=True,
            status=Membership.Status.ACCEPTED,
        ).first()
        if not membership or not WorkNoteAssignee.objects.filter(
            work_note_id=task.calendar_note_id, membership=membership,
        ).exists():
            raise PermissionDenied("Only an assigned active worker may record this task.")
        return membership

    @action(detail=True, methods=["post"])
    @transaction.atomic
    def step(self, request, pk=None):
        task = self.get_object()
        member = self._worker_membership(request, task)
        step_id = request.data.get("step_id")
        if not isinstance(step_id, str) or step_id not in {
            item["id"] for item in task.checklist if isinstance(item, dict)
        }:
            raise ValidationError({"step_id": "Unknown checklist step."})
        done = request.data.get("done")
        if type(done) is not bool:
            raise ValidationError({"done": "Expected true or false."})
        evidence = request.data.get("evidence_note", "")
        if not isinstance(evidence, str) or len(evidence) > 2000:
            raise ValidationError({"evidence_note": "Maximum 2000 characters."})
        if task.calendar_note.completions.filter(membership=member, occurrence_date=task.date).exists():
            raise ValidationError("Reopen the calendar task before modifying a submitted checklist.")
        if done:
            OperationStep.objects.update_or_create(
                task=task, membership=member, step_id=step_id,
                defaults={"completed_by": request.user, "evidence_note": evidence},
            )
        else:
            OperationStep.objects.filter(task=task, membership=member, step_id=step_id).delete()
            OperationVerification.objects.filter(task=task).delete()
        _audit(task, request.user, "CHECKLIST_STEP", {"step_id": step_id, "done": done})
        return Response({"completed_step_ids": list(
            OperationStep.objects.filter(task=task, membership=member).values_list("step_id", flat=True)
        )})

    @action(detail=True, methods=["post"])
    @transaction.atomic
    def record_kpi(self, request, pk=None):
        task = self.get_object()
        member = self._worker_membership(request, task)
        if task.target_value is None:
            raise ValidationError("This task is not configured for numeric progress.")
        try:
            value = int(request.data.get("value"))
        except (ValueError, TypeError):
            raise ValidationError({"value": "Enter a positive whole number."})
        if type(request.data.get("value")) is bool or not 1 <= value <= 10000:
            raise ValidationError({"value": "Enter a value between 1 and 10000."})
        key = request.data.get("key")
        try:
            key = str(uuid.UUID(str(key)))
        except (ValueError, TypeError, AttributeError):
            raise ValidationError({"key": "A unique UUID is required for idempotency."})
        note = request.data.get("note", "")
        if not isinstance(note, str) or len(note) > 255:
            raise ValidationError({"note": "Use a short comment without patient identifiers."})
        record, created = OperationKpiRecord.objects.get_or_create(
            task=task, key=key,
            defaults={"membership": member, "value": value, "note": note, "recorded_by": request.user},
        )
        if not created and (record.recorded_by_id != request.user.id or record.value != value):
            raise ValidationError({"key": "Idempotency key already used for another entry."})
        if created:
            _audit(task, request.user, "KPI_RECORDED", {"value": value, "kind": task.target_kind})
        return Response({"created": created, "progress": self.get_serializer(task).data["progress"]},
                        status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)

    @action(detail=True, methods=["post"])
    @transaction.atomic
    def verify(self, request, pk=None):
        task = self.get_object()
        _manager_required(request.user, task.plan.pharmacy)
        if not task.calendar_note_id or not task.requires_verification:
            raise ValidationError("This calendar task does not need supervisor verification.")
        assigned = task.calendar_note.assignees.count()
        completed = task.calendar_note.completions.filter(occurrence_date=task.date)
        threshold = assigned if task.audience == "EVERY_ON_DUTY" else 1
        if assigned < 1 or completed.values("membership_id").distinct().count() < threshold:
            raise ValidationError("Assigned workers must submit the task before verification.")
        if completed.filter(completed_by=request.user).exists():
            raise PermissionDenied("The person who completed this task cannot independently verify it.")
        if task.target_kind == "clinical" and not Membership.objects.filter(
            pharmacy_id=task.plan.pharmacy_id, user=request.user, is_active=True, role="PHARMACIST"
        ).exists():
            raise PermissionDenied("Clinical verification requires an active pharmacist membership.")
        note = request.data.get("note", "")
        if not isinstance(note, str) or len(note) > 2000:
            raise ValidationError({"note": "Maximum 2000 characters."})
        verification, created = OperationVerification.objects.get_or_create(
            task=task, defaults={"verified_by": request.user, "note": note},
        )
        if created:
            _audit(task, request.user, "VERIFIED")
        return Response({"verified": True, "by": verification.verified_by_id})

    @action(detail=True, methods=["get"])
    def my_steps(self, request, pk=None):
        task = self.get_object()
        member = self._worker_membership(request, task)
        return Response({"completed_step_ids": list(
            OperationStep.objects.filter(task=task, membership=member).values_list("step_id", flat=True)
        )})
