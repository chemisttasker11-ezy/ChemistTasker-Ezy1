"""Worker shift requests (swap and cover) API."""
from rest_framework import permissions, status, viewsets
from organizations.models import Pharmacy, PharmacyAdmin
from shifts.models import Shift, ShiftSlot, WorkerShiftRequest
from rest_framework.response import Response
from rest_framework.exceptions import PermissionDenied, ValidationError
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework.decorators import action
from organizations.access import CAPABILITY_MANAGE_ROSTER, has_admin_capability
from django.utils import timezone
from shifts.emails import build_roster_email_link
from core.task_queue import async_task
from datetime import date
from shifts.access import _normalized_role_code, _otherstaff_onboarding_role
from users.models import OrganizationMembership
from shifts.serializers import WorkerShiftRequestSerializer


class WorkerShiftRequestViewSet(viewsets.ModelViewSet):
    """
    Shift Cover Requests:
    - Workers submit a cover request for an assigned or empty time slot.
    - Owners / Org Admins / Pharmacy Admins receive the request email.
    - Approve/Reject sends a role-aware link to the worker (their dashboard).
    """
    queryset = WorkerShiftRequest.objects.all().select_related("pharmacy", "requested_by")
    serializer_class = WorkerShiftRequestSerializer
    permission_classes = [permissions.IsAuthenticated]

    # ---------------------------
    # VISIBILITY / LISTING
    # ---------------------------
    def get_queryset(self):
        user = self.request.user

        # Workers: only their own requests
        if getattr(user, "role", None) in ["PHARMACIST", "OTHER_STAFF", "EXPLORER"]:
            return self.queryset.filter(requested_by=user)

        # Owners / Org Admins / Pharmacy Admins: all requests for pharmacies they control
        # (mirror your other viewsets)
        controlled = Pharmacy.objects.none()

        # Owner’s own pharmacies
        if hasattr(user, "owneronboarding"):
            controlled |= Pharmacy.objects.filter(owner=user.owneronboarding)

        # Org-admin pharmacies (direct or claimed)
        org_ids = list(
            OrganizationMembership.objects.filter(user=user, role='ORG_ADMIN').values_list('organization_id', flat=True)
        )
        if org_ids:
            controlled |= Pharmacy.objects.filter(organization_id__in=org_ids)

        # Pharmacy Admin pharmacies
        admin_pharms = Pharmacy.objects.filter(
            admin_assignments__user=user,
            admin_assignments__is_active=True
        )
        controlled |= admin_pharms

        qs = self.queryset.filter(pharmacy__in=controlled).distinct()

        # Filter by pharmacy if provided
        pharmacy_id = self.request.query_params.get('pharmacy')
        if pharmacy_id:
            qs = qs.filter(pharmacy_id=pharmacy_id)

        # Date filters to mirror roster range
        start_date_str = self.request.query_params.get('start_date')
        end_date_str = self.request.query_params.get('end_date')
        if start_date_str:
            try:
                start_date = date.fromisoformat(start_date_str)
                qs = qs.filter(slot_date__gte=start_date)
            except ValueError:
                pass
        if end_date_str:
            try:
                end_date = date.fromisoformat(end_date_str)
                qs = qs.filter(slot_date__lte=end_date)
            except ValueError:
                pass

        return qs

    # ---------------------------
    # CREATE (Worker submits)
    # ---------------------------
    def perform_create(self, serializer):
        """
        Send emails exactly like your LeaveRequest pattern, but:
        - personalize each email with the recipient's name (owner_name)
        - build the shift_link using that recipient (role-aware)
        """
        req = serializer.save(requested_by=self.request.user)
        pharmacy = req.pharmacy

        # Collect recipients (same schema you use elsewhere)
        recipients = []

        # Pharmacy Admins of this pharmacy
        pharmacy_admins = PharmacyAdmin.objects.filter(
            pharmacy=pharmacy,
            is_active=True
        ).select_related('user')

        # Org Admins if the pharmacy is attached to an organization
        org_admins = []
        if pharmacy.organization_id:
            org_admins = OrganizationMembership.objects.filter(
                role='ORG_ADMIN',
                organization_id=pharmacy.organization_id
            ).select_related('user')

        # Owner user
        owner_user = getattr(pharmacy.owner, "user", None) if hasattr(pharmacy, "owner") and pharmacy.owner else None

        # Build unique recipient user list
        for admin_mem in pharmacy_admins:
            if admin_mem.user and admin_mem.user.email:
                recipients.append(admin_mem.user)

        for admin in org_admins:
            if admin.user and admin.user.email:
                recipients.append(admin.user)

        if owner_user and owner_user.email:
            recipients.append(owner_user)

        # Deduplicate by email
        seen = set()
        unique_recipients = []
        for u in recipients:
            if u.email not in seen:
                seen.add(u.email)
                unique_recipients.append(u)

        # Send ONE email per recipient so the greeting and link are correct
        worker_name = req.requested_by.get_full_name() or req.requested_by.email
        for recipient in unique_recipients:
            ctx = {
                # template expects 'owner_name' in the greeting; we pass the actual recipient's name
                "owner_name": recipient.get_full_name() or recipient.email,
                # request details
                "requested_by": worker_name,                 # templates use this
                "worker_name": worker_name,                  # keep both keys for safety
                "worker_email": req.requested_by.email,
                "note": req.note or "",
                "shift_date": req.slot_date,
                "pharmacy_name": pharmacy.name,
                "shift_link": build_roster_email_link(recipient, pharmacy),
            }

            notification_payload = {
                "title": f"Shift cover request: {pharmacy.name}",
                "body": f"{worker_name} requested cover for {req.slot_date}.",
                "action_url": ctx["shift_link"],
                "payload": {"worker_shift_request_id": req.id},
            }
            if getattr(recipient, "id", None):
                notification_payload["user_ids"] = [recipient.id]

            async_task(
                'users.tasks.send_async_email',
                subject=f"Shift cover request from {worker_name} for {pharmacy.name}",
                recipient_list=[recipient.email],
                template_name="emails/swap_requested.html",
                context=ctx,
                text_template="emails/swap_requested.txt",
                notification=notification_payload,
            )

    def _assert_requester_can_modify(self, request_obj):
        user = self.request.user
        if request_obj.requested_by != user:
            raise PermissionDenied("You can only manage your own cover requests.")
        if request_obj.status != "PENDING":
            raise ValidationError("Only pending cover requests can be updated or cancelled.")

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        self._assert_requester_can_modify(instance)
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        return Response(serializer.data)

    def partial_update(self, request, *args, **kwargs):
        kwargs['partial'] = True
        return self.update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        self._assert_requester_can_modify(instance)
        self.perform_destroy(instance)
        return Response(status=status.HTTP_204_NO_CONTENT)

    def _resolve_shift_role_for_request(self, req):
        role = _normalized_role_code(req.role)
        if role == "OTHER_STAFF":
            if req.shift_id and getattr(req.shift, "shift", None):
                assignment_role = _normalized_role_code(req.shift.shift.role_needed)
                if assignment_role in dict(Shift.ROLE_CHOICES):
                    return assignment_role

            requester_role = _otherstaff_onboarding_role(req.requested_by)
            if requester_role in dict(Shift.ROLE_CHOICES):
                return requester_role

            raise ValidationError({
                "role": "Other staff cover requests must resolve to a specific shift role before approval."
            })

        if role not in dict(Shift.ROLE_CHOICES):
            raise ValidationError({"role": "Invalid shift role."})

        return role

    # ---------------------------
    # APPROVE (Admin action)
    # ---------------------------
    @action(detail=True, methods=["post"], url_path="approve")
    def approve(self, request, pk=None):
        req = self.get_object()

        # Permission: same people who got the request may decide
        self._assert_decider_permissions(req)

        if req.status != "PENDING":
            return Response({"detail": f"Already {req.status.lower()}."}, status=status.HTTP_400_BAD_REQUEST)

        pharmacy = req.pharmacy
        role_needed = self._resolve_shift_role_for_request(req)
        
        # Check if this request is linked to an existing ShiftSlotAssignment
        if req.shift:
            from workforce.roster.worker_actions import release_worker_from_assignment
            try:
                release_worker_from_assignment(
                    req,
                    manager=request.user,
                    escalate_to_visibility="LOCUM_CASUAL",
                )
            except DjangoValidationError as e:
                # the rule's own messages, not the Python repr of the error (str(e) is "['...']")
                return Response({"detail": "; ".join(e.messages)}, status=status.HTTP_400_BAD_REQUEST)

            # Preserve backward-compatible status
            req.status = "AUTO_PUBLISHED"
            req.save(update_fields=["status"])
        else:
            # Request was for an unassigned shift; create open community shift
            shift_data = {
                "pharmacy": pharmacy,
                "role_needed": role_needed,
                "employment_type": "LOCUM",
                "visibility": "LOCUM_CASUAL",
                "single_user_only": True,
                "created_by": request.user,
                "description": f"This shift was created from a cover request by {req.requested_by.get_full_name()} for {req.slot_date}. Note: {req.note or 'No note provided.'}",
            }
            if role_needed == "PHARMACIST":
                shift_data["rate_type"] = "FLEXIBLE"

            new_shift = Shift.objects.create(**shift_data)

            ShiftSlot.objects.create(
                shift=new_shift,
                date=req.slot_date,
                start_time=req.start_time,
                end_time=req.end_time,
                is_recurring=False,
            )

            # Update the request status to show it was auto-published
            req.status = "AUTO_PUBLISHED"
            req.resolved_at = timezone.now()
            req.resolved_by = request.user
            req.save(update_fields=["status", "resolved_at", "resolved_by"])
        
        approval_status_message = "approved and a new community shift has been published"

        # Email the worker with their own, role-correct dashboard/roster link
        # This notification is sent for both auto-published and manually approved requests.
        ctx = {
            "worker_name": req.requested_by.get_full_name() or req.requested_by.email,
            "pharmacy_name": req.pharmacy.name,
            "shift_date": req.slot_date,
            "shift_link": build_roster_email_link(req.requested_by, req.pharmacy),
        }
        if req.requested_by.email:
            notification_payload = {
                "title": f"Shift cover approved: {ctx['pharmacy_name']}",
                "body": f"Your cover request for {ctx['shift_date']} was {approval_status_message}.",
                "action_url": ctx["shift_link"],
                "payload": {"worker_shift_request_id": req.id},
            }
            if getattr(req.requested_by, "id", None):
                notification_payload["user_ids"] = [req.requested_by.id]
            async_task(
                'users.tasks.send_async_email',
                subject=f"Your shift cover request for {ctx['pharmacy_name']} was approved",
                recipient_list=[req.requested_by.email],
                template_name="emails/swap_approved.html",
                context=ctx,
                text_template="emails/swap_approved.txt",
                notification=notification_payload,
            )
        return Response({'status': req.status.lower()})

    # ---------------------------
    # REJECT (Admin action)
    # ---------------------------
    @action(detail=True, methods=["post"], url_path="reject")
    def reject(self, request, pk=None):
        req = self.get_object()

        # Permission: same people who got the request may decide
        self._assert_decider_permissions(req)

        if req.status != "PENDING":
            return Response({"detail": f"Already {req.status.lower()}."}, status=status.HTTP_400_BAD_REQUEST)

        req.status = "REJECTED"
        req.resolved_at = timezone.now()
        req.resolved_by = request.user
        req.save(update_fields=["status", "resolved_at", "resolved_by"])

        # NEW: If the request was linked to an assignment, it is now implicitly restored.
        # The frontend will no longer show it as a pending request.

        # Email the worker with their own, role-correct link
        ctx = {
            "worker_name": req.requested_by.get_full_name() or req.requested_by.email,
            "pharmacy_name": req.pharmacy.name,
            "shift_date": req.slot_date,
            "shift_link": build_roster_email_link(req.requested_by, req.pharmacy),
        }
        if req.requested_by.email:
            notification_payload = {
                "title": f"Shift cover rejected: {ctx['pharmacy_name']}",
                "body": f"Your cover request for {ctx['shift_date']} was rejected.",
                "action_url": ctx["shift_link"],
                "payload": {"worker_shift_request_id": req.id},
            }
            if getattr(req.requested_by, "id", None):
                notification_payload["user_ids"] = [req.requested_by.id]
            async_task(
                'users.tasks.send_async_email',
                subject=f"Your shift cover request for {ctx['pharmacy_name']} was rejected",
                recipient_list=[req.requested_by.email],
                template_name="emails/swap_rejected.html",
                context=ctx,
                text_template="emails/swap_rejected.txt",
                notification=notification_payload,
            )
        return Response({'status': 'rejected'})

    # ---------------------------
    # PERMISSIONS (shared)
    # ---------------------------
    def _assert_decider_permissions(self, req):
        """
        Only: Owner of pharmacy, Org Admin of that org, or Pharmacy Admin of this pharmacy.
        Matches your leave request approval permissions.
        """
        user = self.request.user
        pharmacy = req.pharmacy

        is_owner = hasattr(pharmacy, "owner") and pharmacy.owner and getattr(pharmacy.owner, "user", None) == user

        is_claimed_admin = (
            pharmacy.organization_id
            and OrganizationMembership.objects.filter(
                user=user,
                role='ORG_ADMIN',
                organization_id=pharmacy.organization_id
            ).exists()
        )

        can_manage_roster = has_admin_capability(user, pharmacy, CAPABILITY_MANAGE_ROSTER)

        if not (is_owner or is_claimed_admin or can_manage_roster):
            raise PermissionDenied("Not authorized to approve/reject this shift cover request.")
