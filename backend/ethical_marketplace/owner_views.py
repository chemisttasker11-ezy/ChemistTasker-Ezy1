from datetime import datetime

from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from client_profile.models import Pharmacy
from .models import EthicalImportBatch, EthicalProductIdentifier, EthicalStagingRow, EthicalStockLot, EthicalStockMovement
from .policy import evaluate_ethical_access
from .serializers import EthicalListingSerializer


def private(response):
    response["Cache-Control"] = "private, no-store"
    response["X-Robots-Tag"] = "noindex, nofollow, noarchive"
    return response


def admitted_pharmacy(user, pharmacy_id, action):
    pharmacy = get_object_or_404(Pharmacy.objects.select_related("owner", "owner__user"), pk=pharmacy_id, verified=True)
    decision = evaluate_ethical_access(user, pharmacy, action)
    if not decision.admitted:
        blocker = decision.blockers[0] if decision.blockers else {"code": "ETHICAL_ACCESS_DENIED", "message": "Ethical access denied."}
        raise PermissionDenied({"code": blocker.get("code"), "detail": blocker.get("message")})
    return pharmacy, decision


class MyListings(APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request):
        pharmacy, decision = admitted_pharmacy(request.user, request.query_params.get("pharmacy"), "PREPARE_LISTING")
        rows = pharmacy.ethical_listings.select_related("product", "scope_chain").prefetch_related("product__identifiers", "lot_allocations", "lot_allocations__lot", "escalation_steps").order_by("-updated_at")
        serialized = EthicalListingSerializer(rows, many=True).data
        payload = []
        for row, data in zip(rows, serialized):
            data["can_owner_authorise"] = bool(decision.is_owner)
            data["escalation_steps"] = [{"id": step.id, "target_circle": step.target_circle, "due_at": step.due_at, "status": step.status, "reason": step.reason} for step in row.escalation_steps.all().order_by("due_at")]
            payload.append(data)
        return private(Response({"results": payload, "pharmacy": pharmacy.id, "is_owner": decision.is_owner}))


def parse_date(value):
    raw = str(value or "").strip()
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y"):
        try:
            return datetime.strptime(raw, fmt).date()
        except ValueError:
            pass
    raise ValueError("Unsupported expiry date")


class ImportCommit(APIView):
    permission_classes = (IsAuthenticated,)

    def post(self, request, pk):
        batch = get_object_or_404(EthicalImportBatch.objects.select_related("pharmacy"), pk=pk)
        pharmacy, _ = admitted_pharmacy(request.user, batch.pharmacy_id, "MANAGE_OWN_STOCK")
        if batch.status in {"COMMITTED", "PARTIAL", "REJECTED"}:
            return private(Response({"id": batch.id, "status": batch.status, "accepted_count": batch.accepted_count, "rejected_count": batch.rejected_count}))
        if batch.status != "STAGED":
            raise ValidationError({"status": "Only a staged import can be committed."})

        accepted = rejected = 0
        now = timezone.now()
        with transaction.atomic():
            locked = EthicalImportBatch.objects.select_for_update().get(pk=batch.pk)
            for staging in EthicalStagingRow.objects.select_for_update().filter(batch=locked).order_by("row_number"):
                payload = staging.safe_payload if isinstance(staging.safe_payload, dict) else {}
                try:
                    barcode = str(payload.get("barcode") or "").strip()
                    if not barcode:
                        raise ValueError("Barcode is required")
                    identifier = EthicalProductIdentifier.objects.select_related("product").filter(value=barcode, product__status="APPROVED").first()
                    if not identifier:
                        raise ValueError("Barcode is not mapped to an approved ethical product")
                    batch_number = str(payload.get("batch_number") or "").strip()
                    if not batch_number:
                        raise ValueError("Batch number is required")
                    expiry = parse_date(payload.get("expiry_date"))
                    quantity = int(str(payload.get("quantity") or "0").strip())
                    if quantity < 0:
                        raise ValueError("Quantity cannot be negative")
                    lot = EthicalStockLot.objects.select_for_update().filter(pharmacy=pharmacy, product=identifier.product, batch_number=batch_number, expiry_date=expiry).first()
                    source_reference = str(payload.get("source_reference") or locked.source_name or f"import-{locked.pk}")[:160]
                    if lot:
                        if quantity < lot.reserved_quantity:
                            raise ValueError("Imported balance is below active reservations")
                        delta = quantity - lot.on_hand_quantity
                        lot.on_hand_quantity = quantity
                        lot.source_reference = source_reference
                        lot.last_reconciled_at = now
                        lot.version += 1
                        lot.save(update_fields=("on_hand_quantity", "source_reference", "last_reconciled_at", "version", "updated_at"))
                    else:
                        lot = EthicalStockLot.objects.create(pharmacy=pharmacy, product=identifier.product, batch_number=batch_number, expiry_date=expiry, intact_pack_unit="pack", on_hand_quantity=quantity, reserved_quantity=0, storage_checks={"import_attested": True}, source_reference=source_reference, last_reconciled_at=now)
                        delta = quantity
                    EthicalStockMovement.objects.create(lot=lot, movement_type="IMPORT_RECONCILIATION", quantity_delta=delta, resulting_on_hand=lot.on_hand_quantity, actor=request.user, reference_type="import", reference_id=str(locked.pk))
                    staging.status, staging.reason = "ACCEPTED", ""
                    accepted += 1
                except (ValueError, TypeError) as exc:
                    staging.status, staging.reason = "REJECTED", str(exc)[:255]
                    rejected += 1
                staging.save(update_fields=("status", "reason"))
            locked.accepted_count = accepted
            locked.rejected_count = rejected
            locked.status = "COMMITTED" if accepted and not rejected else "PARTIAL" if accepted else "REJECTED"
            locked.save(update_fields=("accepted_count", "rejected_count", "status", "updated_at"))
        return private(Response({"id": batch.id, "status": locked.status, "accepted_count": accepted, "rejected_count": rejected}))
