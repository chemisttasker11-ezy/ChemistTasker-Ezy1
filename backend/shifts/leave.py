"""Leave requests on assigned shift slots."""
from rest_framework import permissions, status, viewsets
from client_profile.models import PharmacyAdmin
from rest_framework.response import Response
from rest_framework.exceptions import PermissionDenied
from django.core.exceptions import PermissionDenied as DjangoPermissionDenied
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework.decorators import action
from django.shortcuts import get_object_or_404
from django.db.models import Q
from users.models import OrganizationMembership


class LeaveRequestViewSet(viewsets.ViewSet):
    """Compatibility API for the original Sada roster-leave routes.

    The legacy URL remains available for deployed clients, but all active
    reads/writes now use workforce.WorkforceLeaveRequest as the canonical
    leave record. client_profile.LeaveRequest is retained only as migrated
    historical data.
    """

    permission_classes = [permissions.IsAuthenticated]

    def _queryset(self):
        from workforce.models import WorkforceLeaveRequest

        qs = WorkforceLeaveRequest.objects.filter(
            slot_assignment__isnull=False,
        ).exclude(
            status=WorkforceLeaveRequest.Status.CANCELLED,
        ).select_related(
            "pharmacy",
            "user",
            "membership",
            "slot_assignment__slot",
            "slot_assignment__shift__pharmacy",
        )
        user = self.request.user

        from users.org_roles import OrgCapability, membership_capabilities

        visible = Q(user=user)
        if getattr(user, "is_superuser", False):
            return qs
        if hasattr(user, "owneronboarding"):
            visible |= Q(pharmacy__owner=user.owneronboarding)

        admin_pharmacy_ids = PharmacyAdmin.objects.filter(
            user=user,
            is_active=True,
            admin_level__in=[
                PharmacyAdmin.AdminLevel.OWNER,
                PharmacyAdmin.AdminLevel.MANAGER,
                PharmacyAdmin.AdminLevel.ROSTER_MANAGER,
            ],
        ).values_list("pharmacy_id", flat=True)
        visible |= Q(pharmacy_id__in=admin_pharmacy_ids)

        for membership in OrganizationMembership.objects.filter(user=user).prefetch_related("pharmacies"):
            if OrgCapability.MANAGE_ROSTER not in membership_capabilities(membership):
                continue
            if membership.role == "ORG_ADMIN":
                visible |= Q(pharmacy__organization_id=membership.organization_id)
            elif membership.role in {"CHIEF_ADMIN", "REGION_ADMIN"}:
                visible |= Q(
                    pharmacy__organization_id=membership.organization_id,
                    pharmacy_id__in=membership.pharmacies.values_list("id", flat=True),
                )

        return qs.filter(visible).distinct()

    def _get_object(self, pk):
        return get_object_or_404(self._queryset(), pk=pk)

    def list(self, request):
        from workforce.leave_service import serialize_legacy_leave
        return Response([
            serialize_legacy_leave(row)
            for row in self._queryset().order_by("-created_at", "-id")[:500]
        ])

    def retrieve(self, request, pk=None):
        from workforce.leave_service import serialize_legacy_leave
        return Response(serialize_legacy_leave(self._get_object(pk)))

    def create(self, request):
        from workforce.leave_service import create_leave, serialize_legacy_leave
        try:
            row = create_leave(request.user, request.data)
            return Response(serialize_legacy_leave(row), status=status.HTTP_201_CREATED)
        except (PermissionDenied, DjangoPermissionDenied) as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_403_FORBIDDEN)
        except DjangoValidationError as exc:
            detail = exc.message_dict if hasattr(exc, "message_dict") else {"detail": getattr(exc, "messages", [str(exc)])}
            return Response(detail, status=status.HTTP_400_BAD_REQUEST)

    def update(self, request, pk=None):
        from workforce.leave_service import serialize_legacy_leave, update_pending_leave
        try:
            row = update_pending_leave(request.user, pk, request.data)
            return Response(serialize_legacy_leave(row))
        except (PermissionDenied, DjangoPermissionDenied) as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_403_FORBIDDEN)
        except DjangoValidationError as exc:
            detail = exc.message_dict if hasattr(exc, "message_dict") else {"detail": getattr(exc, "messages", [str(exc)])}
            return Response(detail, status=status.HTTP_400_BAD_REQUEST)

    def partial_update(self, request, pk=None):
        return self.update(request, pk=pk)

    def destroy(self, request, pk=None):
        from workforce.leave_service import decide_leave
        try:
            decide_leave(request.user, pk, "CANCELLED")
            return Response(status=status.HTTP_204_NO_CONTENT)
        except (PermissionDenied, DjangoPermissionDenied) as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_403_FORBIDDEN)
        except DjangoValidationError as exc:
            detail = exc.message_dict if hasattr(exc, "message_dict") else {"detail": getattr(exc, "messages", [str(exc)])}
            return Response(detail, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        from workforce.leave_service import decide_leave
        try:
            row = decide_leave(request.user, pk, "APPROVED", request.data.get("manager_note") or "")
            return Response({"status": row.status})
        except (PermissionDenied, DjangoPermissionDenied) as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_403_FORBIDDEN)
        except DjangoValidationError as exc:
            detail = exc.message_dict if hasattr(exc, "message_dict") else {"detail": getattr(exc, "messages", [str(exc)])}
            return Response(detail, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        from workforce.leave_service import decide_leave
        try:
            row = decide_leave(request.user, pk, "REJECTED", request.data.get("manager_note") or "")
            return Response({"status": row.status})
        except (PermissionDenied, DjangoPermissionDenied) as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_403_FORBIDDEN)
        except DjangoValidationError as exc:
            detail = exc.message_dict if hasattr(exc, "message_dict") else {"detail": getattr(exc, "messages", [str(exc)])}
            return Response(detail, status=status.HTTP_400_BAD_REQUEST)
