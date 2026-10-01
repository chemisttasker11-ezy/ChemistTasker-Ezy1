"""Moved verbatim from client_profile/views.py (Stage 2 domain split). Behaviour is unchanged; client_profile/views.py re-exports these names."""
from rest_framework import permissions, status, viewsets
from client_profile.models import Pharmacy, PharmacyAdmin, Rating, ShiftSlotAssignment
from rest_framework.response import Response
from rest_framework.decorators import action
from client_profile.admin_helpers import is_admin_of
from django.db.models import Avg, Count, Q
from django.utils import timezone
from users.models import OrganizationMembership
from client_profile.domains.ratings.serializers import (
    MyRatingSerializer,
    PendingRatingsSerializer,
    RatingReadSerializer,
    RatingSummarySerializer,
    RatingWriteSerializer,
)


# -----------------------------------------------------------------------------
# Rating 
# -----------------------------------------------------------------------------
class RatingViewSet(viewsets.GenericViewSet):
    """
    Relationship-level ratings (NOT per shift/slot):
      - OWNER_TO_WORKER: owner/org-admin/pharmacy-admin → worker (pharmacist/other staff)
      - WORKER_TO_PHARMACY: worker → pharmacy
    Each relationship can have exactly ONE editable rating.
    """
    permission_classes = [permissions.IsAuthenticated]
    queryset = Rating.objects.all()

    def get_serializer_class(self):
        return RatingReadSerializer if self.action in ["list", "retrieve"] else RatingWriteSerializer

    # ---------- helpers ----------
    def _user_controls_pharmacy(self, user, pharmacy: Pharmacy) -> bool:
        """Check if a user owns/controls a given pharmacy."""
        # 1) Direct owner
        if getattr(pharmacy, "owner", None) and pharmacy.owner.user_id == user.id:
            return True
        # 2) Org-admin of pharmacy's organization
        if OrganizationMembership.objects.filter(
            user=user, role="ORG_ADMIN", organization_id=pharmacy.organization_id
        ).exists():
            return True
        # 3) Pharmacy admin of THIS pharmacy
        if is_admin_of(user, pharmacy.id if pharmacy else None):
            return True
        return False

    def _has_completed_relationship_owner_to_worker(self, rater, worker_user) -> bool:
        """
        True if the rater controls at least one pharmacy (as Owner, Org Admin, or Pharmacy Admin)
        where the given worker has at least one assignment (any time). No date filtering here.
        """
        # Pharmacies directly owned by rater
        owned_pharmacies = Pharmacy.objects.filter(owner__user=rater).values_list("id", flat=True)

        # Pharmacies where rater is a pharmacy admin
        pharmacy_admin_ids = PharmacyAdmin.objects.filter(
            user=rater, is_active=True
        ).values_list("pharmacy_id", flat=True)

        # Pharmacies under organizations where rater is ORG_ADMIN
        org_ids = OrganizationMembership.objects.filter(
            user=rater, role="ORG_ADMIN"
        ).values_list("organization_id", flat=True)
        org_pharmacy_ids = Pharmacy.objects.filter(
            organization_id__in=list(org_ids)
        ).values_list("id", flat=True)

        controlled_pharmacy_ids = set(owned_pharmacies) | set(pharmacy_admin_ids) | set(org_pharmacy_ids)
        if not controlled_pharmacy_ids:
            return False

        return ShiftSlotAssignment.objects.filter(
            user=worker_user,
            shift__pharmacy_id__in=list(controlled_pharmacy_ids),
        ).exists()

    def _has_completed_relationship_worker_to_pharmacy(self, worker, pharmacy: Pharmacy) -> bool:
        """
        True if the worker has at least one assignment at the pharmacy (any time). No date filtering here.
        """
        return ShiftSlotAssignment.objects.filter(
            user=worker,
            shift__pharmacy=pharmacy,
        ).exists()


    # ---------- create (upsert) ----------
    def create(self, request, *args, **kwargs):
        """
        Create or update a rating:
        - OWNER_TO_WORKER: Owner → Worker
        - WORKER_TO_PHARMACY: Worker → Pharmacy
        """
        ser = RatingWriteSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        data = ser.validated_data
        user = request.user

        direction = data["direction"]
        stars = data["stars"]
        comment = data.get("comment", "")

        if direction == Rating.Direction.OWNER_TO_WORKER:
            worker = data["ratee_user"]
            # eligibility: rater controls at least one pharmacy where this worker completed >=1 assignment
            if not self._has_completed_relationship_owner_to_worker(user, worker):
                return Response(
                    {"detail": "You can only rate team members who completed an assignment at your pharmacy."},
                    status=status.HTTP_403_FORBIDDEN,
                )
            obj, created = Rating.objects.get_or_create(
                rater_user=user,
                ratee_user=worker,
                direction=direction,
                defaults={"stars": stars, "comment": comment},
            )
            if not created:
                obj.stars = stars
                obj.comment = comment
                obj.save(update_fields=["stars", "comment", "updated_at"])
            return Response(RatingReadSerializer(obj).data, status=201 if created else 200)

        elif direction == Rating.Direction.WORKER_TO_PHARMACY:
            pharm = data["ratee_pharmacy"]
            # eligibility: worker completed >=1 assignment at this pharmacy
            if not self._has_completed_relationship_worker_to_pharmacy(user, pharm):
                return Response(
                    {"detail": "You can only rate pharmacies where you completed an assignment."},
                    status=status.HTTP_403_FORBIDDEN,
                )
            obj, created = Rating.objects.get_or_create(
                rater_user=user,
                ratee_pharmacy=pharm,
                direction=direction,
                defaults={"stars": stars, "comment": comment},
            )
            if not created:
                obj.stars = stars
                obj.comment = comment
                obj.save(update_fields=["stars", "comment", "updated_at"])
            return Response(RatingReadSerializer(obj).data, status=201 if created else 200)

        return Response({"detail": "Invalid direction."}, status=400)

    # ---------- list ----------
    def list(self, request, *args, **kwargs):
        """
        Filter:
          - ?target_type=worker&target_id=<user_id>
          - ?target_type=pharmacy&target_id=<pharmacy_id>
        """
        ttype = request.query_params.get("target_type")
        tid = request.query_params.get("target_id")

        qs = Rating.objects.all()
        if ttype == "worker" and tid:
            qs = qs.filter(direction=Rating.Direction.OWNER_TO_WORKER, ratee_user_id=tid)
        elif ttype == "pharmacy" and tid:
            qs = qs.filter(direction=Rating.Direction.WORKER_TO_PHARMACY, ratee_pharmacy_id=tid)
        else:
            return Response({"detail": "Provide target_type=worker|pharmacy and target_id."}, status=400)

        page = self.paginate_queryset(qs.order_by("-updated_at"))
        if page is not None:
            return self.get_paginated_response(RatingReadSerializer(page, many=True).data)
        return Response(RatingReadSerializer(qs, many=True).data)

    # ---------- summary ----------
    @action(detail=False, methods=["get"], url_path="summary")
    def summary(self, request):
        """
        Returns aggregate rating for a target:
          - ?target_type=worker&target_id=<user_id>
          - ?target_type=pharmacy&target_id=<pharmacy_id>
        """
        ttype = request.query_params.get("target_type")
        tid = request.query_params.get("target_id")
        if not ttype or not tid:
            return Response({"detail": "Provide target_type and target_id."}, status=400)

        if ttype == "worker":
            qs = Rating.objects.filter(direction=Rating.Direction.OWNER_TO_WORKER, ratee_user_id=tid)
        elif ttype == "pharmacy":
            qs = Rating.objects.filter(direction=Rating.Direction.WORKER_TO_PHARMACY, ratee_pharmacy_id=tid)
        else:
            return Response({"detail": "Invalid target_type."}, status=400)

        agg = qs.aggregate(average=Avg("stars"), count=Count("id"))
        data = {
            "average": float(agg["average"] or 0.0),
            "count": int(agg["count"] or 0),
        }
        return Response(RatingSummarySerializer(data).data)

    # ---------- my rating ----------
    @action(detail=False, methods=["get"], url_path="mine")
    def mine(self, request):
        """
        Returns the current user's rating (if any) on the given target:
          - ?target_type=worker&target_id=<user_id>
          - ?target_type=pharmacy&target_id=<pharmacy_id>
        """
        user = request.user
        ttype = request.query_params.get("target_type")
        tid = request.query_params.get("target_id")
        if not ttype or not tid:
            return Response({"detail": "Provide target_type and target_id."}, status=400)

        if ttype == "worker":
            obj = Rating.objects.filter(
                direction=Rating.Direction.OWNER_TO_WORKER,
                rater_user=user,
                ratee_user_id=tid,
            ).first()
            direction = Rating.Direction.OWNER_TO_WORKER
        elif ttype == "pharmacy":
            obj = Rating.objects.filter(
                direction=Rating.Direction.WORKER_TO_PHARMACY,
                rater_user=user,
                ratee_pharmacy_id=tid,
            ).first()
            direction = Rating.Direction.WORKER_TO_PHARMACY
        else:
            return Response({"detail": "Invalid target_type."}, status=400)

        payload = {
            "id": obj.id if obj else None,
            "direction": direction,
            "stars": obj.stars if obj else None,
            "comment": obj.comment if obj else "",
        }
        return Response(MyRatingSerializer(payload).data)

    # ---------- pending ----------
    @action(detail=False, methods=["get"], url_path="pending")
    def pending(self, request):
        """
        Lists relationships where the current user is eligible to rate but hasn't yet.
        - workers_to_rate: as an owner/org-admin/pharmacy-admin
        - pharmacies_to_rate: as a worker
        """
        user = request.user
        today = timezone.localdate()

        # Pharmacies the user controls
        pharm_control = Pharmacy.objects.filter(
            Q(owner__user=user)
            | Q(organization__organization_memberships__user=user, organization__organization_memberships__role="ORG_ADMIN")
            | Q(admin_assignments__user=user, admin_assignments__is_active=True)
        ).distinct()

        # Workers eligible to rate
        worker_ids = ShiftSlotAssignment.objects.filter(
            shift__pharmacy__in=pharm_control,
            slot_date__lt=today,
        ).values_list("user_id", flat=True).distinct()

        already_rated_worker_ids = Rating.objects.filter(
            direction=Rating.Direction.OWNER_TO_WORKER,
            rater_user=user,
        ).values_list("ratee_user_id", flat=True)
        workers_to_rate_ids = set(worker_ids) - set(already_rated_worker_ids)

        # Pharmacies eligible to rate by this worker
        pharm_ids = ShiftSlotAssignment.objects.filter(
            user=user,
            slot_date__lt=today,
        ).values_list("shift__pharmacy_id", flat=True).distinct()

        already_rated_pharm_ids = Rating.objects.filter(
            direction=Rating.Direction.WORKER_TO_PHARMACY,
            rater_user=user,
        ).values_list("ratee_pharmacy_id", flat=True)
        pharmacies_to_rate_ids = set(pharm_ids) - set(already_rated_pharm_ids)

        return Response(PendingRatingsSerializer({
            "workers_to_rate": list(workers_to_rate_ids),
            "pharmacies_to_rate": list(pharmacies_to_rate_ids),
        }).data)

    @action(detail=True, methods=["post"], url_path="report")
    def report(self, request, pk=None):
        """
        Report a rating received by the current worker or a pharmacy they control.
        One open report per reporter/rating is kept so repeated submissions update
        the reason instead of generating duplicate moderation work.
        """
        from client_profile.models import RatingReport

        rating = self.get_object()
        can_report = rating.ratee_user_id == request.user.id
        if not can_report and rating.ratee_pharmacy_id:
            can_report = self._user_controls_pharmacy(request.user, rating.ratee_pharmacy)

        if not can_report:
            return Response(
                {"detail": "You can only report ratings received by you or a pharmacy you control."},
                status=status.HTTP_403_FORBIDDEN,
            )

        reason = str(request.data.get("reason", "")).strip()
        if len(reason) < 10:
            return Response(
                {"detail": "Please provide at least 10 characters explaining the issue."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if len(reason) > 2000:
            return Response(
                {"detail": "Reason must be 2000 characters or fewer."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        report = RatingReport.objects.filter(
            rating=rating,
            reporter=request.user,
            status=RatingReport.Status.OPEN,
        ).first()
        created = report is None
        if report is None:
            report = RatingReport.objects.create(
                rating=rating,
                reporter=request.user,
                reason=reason,
            )
        else:
            report.reason = reason
            report.save(update_fields=["reason", "updated_at"])

        return Response(
            {
                "id": report.id,
                "reference": f"RAT-{report.id:06d}",
                "status": report.status,
                "created": created,
            },
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )
