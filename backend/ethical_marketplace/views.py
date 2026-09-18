import csv
import hashlib
import io
import json
import zipfile

from django.conf import settings
from django.db import transaction
from django.http import FileResponse, Http404
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from client_profile.models import Pharmacy, PharmacyAdmin
from marketplace.policy import owns_pharmacy
from .models import (EthicalAuditEvent, EthicalEscalationStep, EthicalImportBatch, EthicalListing,
                     EthicalListingLot, EthicalMessage, EthicalPharmacyApproval, EthicalPharmacyGrant,
                     EthicalProduct, EthicalRequestReceipt, EthicalReservation, EthicalStagingRow, EthicalStockLot,
                     EthicalStockMovement, EthicalTransfer, EthicalTransferDocument, EthicalTransferLine)
from .policy import CAPABILITIES, application_blockers, candidate_listings_for, evaluate_ethical_access, listing_visible_to
from .serializers import (ApprovalSerializer, EthicalListingSerializer, GrantSerializer, MessageSerializer,
                          ProductSerializer, StockLotSerializer, TransferSerializer)


def private(response):
    response["Cache-Control"] = "private, no-store"
    response["X-Robots-Tag"] = "noindex, nofollow, noarchive"
    return response

def _validate_transfer_document(upload):
    """Allow common business-document formats after checking their actual file signature."""
    original_position = upload.tell()
    try:
        header = upload.read(16)
        upload.seek(0)

        is_pdf = header.startswith(b"%PDF-")
        is_jpeg = header.startswith(b"\xff\xd8\xff")
        is_png = header.startswith(b"\x89PNG\r\n\x1a\n")
        is_webp = header.startswith(b"RIFF") and header[8:12] == b"WEBP"
        is_docx = False
        if header.startswith(b"PK\x03\x04"):
            try:
                with zipfile.ZipFile(upload) as archive:
                    names = set(archive.namelist())
                    is_docx = "[Content_Types].xml" in names and any(name.startswith("word/") for name in names)
            except (zipfile.BadZipFile, OSError):
                is_docx = False

        if not any((is_pdf, is_jpeg, is_png, is_webp, is_docx)):
            raise ValidationError({"file": "Upload a PDF, DOCX, JPEG, PNG, or WebP document."})
    finally:
        upload.seek(original_position)



def pharmacy_or_404(pk):
    return get_object_or_404(Pharmacy.objects.select_related("owner", "owner__user"), pk=pk, verified=True)


def require(user, pharmacy, action, product=None, mode=None):
    decision = evaluate_ethical_access(user, pharmacy, action, product=product, mode=mode)
    if not decision.admitted:
        raise PermissionDenied({"code": decision.blockers[0]["code"], "detail": decision.blockers[0]["message"]})
    return decision


class MyAccess(APIView):
    permission_classes = (IsAuthenticated,)
    def get(self, request):
        rows = []
        candidate_ids = set(Pharmacy.objects.filter(owner__user=request.user).values_list("id", flat=True))
        candidate_ids.update(PharmacyAdmin.objects.filter(user=request.user, is_active=True).values_list("pharmacy_id", flat=True))
        for pharmacy in Pharmacy.objects.filter(id__in=candidate_ids, verified=True):
            decision = evaluate_ethical_access(request.user, pharmacy)
            rows.append({"pharmacy": {"id": pharmacy.id, "label": pharmacy.name, "suburb": pharmacy.suburb or "", "state": pharmacy.state or ""}, **decision.payload()})
        return private(Response({"contexts": rows, "application_enabled": settings.ETHICAL_ACCESS_APPLICATIONS_ENABLED, "private_read_enabled": settings.ETHICAL_PRIVATE_READ_ENABLED}))


class PharmacyApproval(APIView):
    permission_classes = (IsAuthenticated,)
    parser_classes = (MultiPartParser, FormParser, JSONParser)
    def get(self, request, pharmacy_id):
        pharmacy = pharmacy_or_404(pharmacy_id)
        blockers = application_blockers(request.user, pharmacy)
        if blockers:
            raise PermissionDenied(blockers[0])
        approval = EthicalPharmacyApproval.objects.filter(pharmacy=pharmacy).first()
        creating = approval is None
        return private(Response(ApprovalSerializer(approval).data if approval else {"pharmacy": pharmacy.id, "status": "NOT_SUBMITTED"}))
    def post(self, request, pharmacy_id):
        if not settings.ETHICAL_ACCESS_APPLICATIONS_ENABLED:
            return Response({"code": "APPLICATIONS_DISABLED"}, status=503)
        pharmacy = pharmacy_or_404(pharmacy_id)
        blockers = application_blockers(request.user, pharmacy)
        if blockers:
            raise PermissionDenied(blockers[0])
        owner_user = pharmacy.owner.user
        approval = EthicalPharmacyApproval.objects.filter(pharmacy=pharmacy).first()
        serializer = ApprovalSerializer(approval, data=request.data, partial=bool(approval))
        serializer.is_valid(raise_exception=True)
        approval = serializer.save(
            pharmacy=pharmacy,
            applicant=request.user,
            accountable_owner=owner_user,
            owner_confirmed_at=timezone.now() if owns_pharmacy(request.user, pharmacy) else getattr(approval, "owner_confirmed_at", None),
            status="PENDING_REVIEW",
        )
        EthicalAuditEvent.objects.create(actor=request.user, pharmacy=pharmacy, action="APPROVAL_SUBMITTED", target_type="approval", target_id=str(approval.id))
        return private(Response(ApprovalSerializer(approval).data, status=201 if creating else 200))


class PharmacyGrants(APIView):
    permission_classes = (IsAuthenticated,)
    def get(self, request, pharmacy_id):
        pharmacy = pharmacy_or_404(pharmacy_id)
        if not owns_pharmacy(request.user, pharmacy):
            raise Http404
        admins = PharmacyAdmin.objects.filter(pharmacy=pharmacy, is_active=True).select_related("user")
        return private(Response({
            "grants": GrantSerializer(pharmacy.ethical_grants.all(), many=True).data,
            "eligible_admins": [{"assignment_id": row.id, "user_id": row.user_id, "label": row.user.get_full_name() or row.user.email, "staff_role": row.staff_role} for row in admins],
        }))
    def post(self, request, pharmacy_id):
        pharmacy = pharmacy_or_404(pharmacy_id)
        if not owns_pharmacy(request.user, pharmacy):
            raise PermissionDenied("Only the current pharmacy owner can issue ethical grants.")
        actions = set(request.data.get("allowed_actions", []))
        if not actions or not actions.issubset(CAPABILITIES):
            raise ValidationError({"allowed_actions": "Select only supported ethical actions."})
        admin = get_object_or_404(PharmacyAdmin, pk=request.data.get("pharmacy_admin"), pharmacy=pharmacy, user_id=request.data.get("user"), is_active=True)
        serializer = GrantSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        grant = serializer.save(pharmacy=pharmacy, grantor_owner=request.user, pharmacy_admin=admin)
        EthicalAuditEvent.objects.create(actor=request.user, pharmacy=pharmacy, action="GRANT_CREATED", target_type="grant", target_id=str(grant.id), safe_changes={"actions": sorted(actions)})
        return private(Response(GrantSerializer(grant).data, status=201))


class GrantRevoke(APIView):
    permission_classes = (IsAuthenticated,)
    def post(self, request, pharmacy_id, pk):
        pharmacy = pharmacy_or_404(pharmacy_id)
        if not owns_pharmacy(request.user, pharmacy):
            raise PermissionDenied("Only the current pharmacy owner can revoke grants.")
        grant = get_object_or_404(EthicalPharmacyGrant, pk=pk, pharmacy=pharmacy, revoked_at__isnull=True)
        grant.revoked_at = timezone.now()
        grant.revocation_reason = str(request.data.get("reason", ""))[:255]
        grant.save(update_fields=("revoked_at", "revocation_reason", "updated_at"))
        return private(Response({"status": "REVOKED"}))


def admitted_pharmacy(request, action="VIEW_CHAIN_ETHICAL"):
    pharmacy = pharmacy_or_404(request.query_params.get("pharmacy") or request.data.get("pharmacy"))
    require(request.user, pharmacy, action)
    return pharmacy


class Catalogue(APIView):
    permission_classes = (IsAuthenticated,)
    def get(self, request):
        admitted_pharmacy(request)
        if not settings.ETHICAL_PRIVATE_READ_ENABLED:
            return Response({"code": "ETHICAL_PRIVATE_READ_DISABLED"}, status=503)
        rows = EthicalProduct.objects.filter(status="APPROVED").prefetch_related("identifiers").order_by("name")
        if search := request.query_params.get("search"):
            rows = rows.filter(name__icontains=search[:100])
        return private(Response({"results": ProductSerializer(rows[:100], many=True).data}))


class CatalogueLookup(APIView):
    permission_classes = (IsAuthenticated,)
    def get(self, request):
        admitted_pharmacy(request)
        code = request.query_params.get("barcode", "")[:100]
        product = EthicalProduct.objects.filter(status="APPROVED", identifiers__value=code).prefetch_related("identifiers").first()
        return private(Response(ProductSerializer(product).data if product else {}))


class Imports(APIView):
    permission_classes = (IsAuthenticated,)
    parser_classes = (MultiPartParser, FormParser)
    def post(self, request):
        pharmacy = admitted_pharmacy(request, "MANAGE_OWN_STOCK")
        if not settings.ETHICAL_INVENTORY_ENABLED:
            return Response({"code": "ETHICAL_INVENTORY_DISABLED"}, status=503)
        upload = request.FILES.get("file")
        if not upload or upload.size > 5 * 1024 * 1024 or not request.data.get("source_rights_attested"):
            raise ValidationError({"file": "A bounded CSV and source-rights attestation are required."})
        batch = EthicalImportBatch.objects.create(pharmacy=pharmacy, created_by=request.user, source_name=str(request.data.get("source_name", ""))[:160], source_rights_attested=True, file=upload)
        try:
            content = upload.read().decode("utf-8-sig")
            rows = list(csv.DictReader(io.StringIO(content)))
        except (UnicodeDecodeError, csv.Error):
            batch.status = "REJECTED"
            batch.save(update_fields=("status", "updated_at"))
            raise ValidationError({"file": "Upload a valid UTF-8 CSV."})
        allowed = {"barcode", "batch_number", "expiry_date", "quantity", "source_reference"}
        for index, row in enumerate(rows[:5000], 2):
            safe = {key: value for key, value in row.items() if key in allowed}
            EthicalStagingRow.objects.create(batch=batch, row_number=index, safe_payload=safe, status="PENDING" if safe else "REJECTED", reason="" if safe else "No permitted columns")
        batch.row_count = min(len(rows), 5000)
        batch.status = "STAGED"
        batch.save(update_fields=("row_count", "status", "updated_at"))
        return private(Response({"id": batch.id, "status": batch.status, "row_count": batch.row_count}, status=201))


class ImportDetail(APIView):
    permission_classes = (IsAuthenticated,)
    def get(self, request, pk):
        batch = get_object_or_404(EthicalImportBatch, pk=pk)
        require(request.user, batch.pharmacy, "MANAGE_OWN_STOCK")
        return private(Response({"id": batch.id, "status": batch.status, "row_count": batch.row_count, "accepted_count": batch.accepted_count, "rejected_count": batch.rejected_count}))


class Lots(APIView):
    permission_classes = (IsAuthenticated,)
    def get(self, request):
        pharmacy = admitted_pharmacy(request, "MANAGE_OWN_STOCK")
        rows = EthicalStockLot.objects.filter(pharmacy=pharmacy).select_related("product").prefetch_related("product__identifiers")
        return private(Response(StockLotSerializer(rows, many=True).data))
    def post(self, request):
        pharmacy = admitted_pharmacy(request, "MANAGE_OWN_STOCK")
        if not settings.ETHICAL_INVENTORY_ENABLED:
            return Response({"code": "ETHICAL_INVENTORY_DISABLED"}, status=503)
        serializer = StockLotSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        lot = serializer.save(pharmacy=pharmacy)
        EthicalStockMovement.objects.create(lot=lot, movement_type="RECONCILIATION", quantity_delta=lot.on_hand_quantity, resulting_on_hand=lot.on_hand_quantity, actor=request.user, reference_type="lot", reference_id=str(lot.id))
        return private(Response(StockLotSerializer(lot).data, status=201))


class LotDetail(APIView):
    permission_classes = (IsAuthenticated,)
    def patch(self, request, pk):
        lot = get_object_or_404(EthicalStockLot.objects.select_related("pharmacy", "product"), pk=pk)
        require(request.user, lot.pharmacy, "MANAGE_OWN_STOCK", product=lot.product)
        if request.data.get("expected_version") != lot.version:
            return Response({"code": "STALE_VERSION"}, status=409)
        protected = {"on_hand_quantity", "reserved_quantity", "pharmacy", "product"}
        if protected.intersection(request.data):
            raise ValidationError("Stock balances and ownership change only through reconciliation actions.")
        serializer = StockLotSerializer(lot, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        lot = serializer.save(version=lot.version + 1)
        return private(Response(StockLotSerializer(lot).data))


class LotReconcile(APIView):
    permission_classes = (IsAuthenticated,)
    def post(self, request, pk):
        with transaction.atomic():
            lot = get_object_or_404(EthicalStockLot.objects.select_for_update().select_related("pharmacy", "product"), pk=pk)
            require(request.user, lot.pharmacy, "MANAGE_OWN_STOCK", product=lot.product)
            if request.data.get("expected_version") != lot.version:
                return Response({"code": "STALE_VERSION"}, status=409)
            quantity = int(request.data.get("on_hand_quantity", -1))
            if quantity < lot.reserved_quantity:
                return Response({"code": "QUANTITY_BELOW_ACTIVE_RESERVATIONS"}, status=409)
            delta = quantity - lot.on_hand_quantity
            lot.on_hand_quantity = quantity
            lot.last_reconciled_at = timezone.now()
            lot.version += 1
            lot.save(update_fields=("on_hand_quantity", "last_reconciled_at", "version", "updated_at"))
            EthicalStockMovement.objects.create(lot=lot, movement_type="RECONCILIATION", quantity_delta=delta, resulting_on_hand=quantity, actor=request.user, reference_type="reconciliation", reference_id=str(lot.version))
            return private(Response(StockLotSerializer(lot).data))


class Listings(APIView):
    permission_classes = (IsAuthenticated,)
    def get(self, request):
        if not settings.ETHICAL_PRIVATE_READ_ENABLED:
            return Response({"code": "ETHICAL_PRIVATE_READ_DISABLED"}, status=503)
        pharmacy = admitted_pharmacy(request)
        # Candidate set is never serialized before the per-object policy check.
        rows = candidate_listings_for(request.user).filter(status__in=("PUBLISHED", "RESERVED")).select_related("pharmacy", "product", "scope_chain").prefetch_related("product__identifiers", "lot_allocations", "lot_allocations__lot")
        visible = [row for row in rows if listing_visible_to(request.user, row)]
        return private(Response({"results": EthicalListingSerializer(visible, many=True).data, "context_pharmacy": pharmacy.id}))
    def post(self, request):
        pharmacy = admitted_pharmacy(request, "PREPARE_LISTING")
        product = get_object_or_404(EthicalProduct, pk=request.data.get("product"), status="APPROVED")
        require(request.user, pharmacy, "PREPARE_LISTING", product=product, mode=request.data.get("mode"))
        serializer = EthicalListingSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        if product.schedule.upper() == "S8" and request.data.get("maximum_circle") == "PLATFORM_OWNERS":
            raise PermissionDenied({"code": "S8_AUDIENCE_CEILING", "detail": "S8 listings cannot reach the platform circle."})
        listing = serializer.save(pharmacy=pharmacy, accountable_owner=pharmacy.owner.user, prepared_by=request.user, scope_owner_id=pharmacy.owner_id, scope_organization_id=pharmacy.organization_id)
        allocations = request.data.get("lots", [])
        if not allocations:
            raise ValidationError({"lots": "Select at least one reconciled lot."})
        for item in allocations:
            lot = get_object_or_404(EthicalStockLot, pk=item.get("lot"), pharmacy=pharmacy, product=product, status="AVAILABLE")
            quantity = int(item.get("quantity", 0))
            if quantity < 1 or quantity > lot.available_quantity:
                raise ValidationError({"lots": "Selected quantity exceeds reconciled availability."})
            EthicalListingLot.objects.create(listing=listing, lot=lot, quantity=quantity)
        return private(Response(EthicalListingSerializer(listing).data, status=201))


class ListingDetail(APIView):
    permission_classes = (IsAuthenticated,)
    def get(self, request, pk):
        listing = get_object_or_404(EthicalListing.objects.select_related("pharmacy", "product", "scope_chain").prefetch_related("product__identifiers", "lot_allocations", "lot_allocations__lot"), pk=pk)
        if not listing_visible_to(request.user, listing):
            raise Http404
        return private(Response(EthicalListingSerializer(listing).data))
    def patch(self, request, pk):
        listing = get_object_or_404(EthicalListing.objects.select_related("pharmacy", "product"), pk=pk)
        require(request.user, listing.pharmacy, "PREPARE_LISTING", product=listing.product, mode=listing.mode)
        if request.data.get("expected_version") != listing.version or listing.status != "DRAFT":
            return Response({"code": "STALE_OR_IMMUTABLE_LISTING"}, status=409)
        serializer = EthicalListingSerializer(listing, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save(version=listing.version + 1)
        return private(Response(serializer.data))


class ListingAction(APIView):
    permission_classes = (IsAuthenticated,)
    def post(self, request, pk, action):
        with transaction.atomic():
            listing = get_object_or_404(EthicalListing.objects.select_for_update().select_related("pharmacy", "product"), pk=pk)
            if not owns_pharmacy(request.user, listing.pharmacy):
                raise PermissionDenied("The accountable owner must authorise publication and widening.")
            require(request.user, listing.pharmacy, "APPROVE_TRANSFER", product=listing.product, mode=listing.mode)
            if request.data.get("expected_version") != listing.version:
                return Response({"code": "STALE_VERSION"}, status=409)
            if action == "publish" and listing.status == "DRAFT":
                if listing.product.schedule.upper() == "S8" and (not settings.ETHICAL_S8_ENABLED or listing.maximum_circle == "PLATFORM_OWNERS"):
                    raise PermissionDenied({"code": "S8_OPERATION_DISABLED_OR_TOO_BROAD"})
                listing.status, listing.published_at = "PUBLISHED", timezone.now()
            elif action == "withdraw" and listing.status in ("PUBLISHED", "RESERVED"):
                listing.status = "WITHDRAWN"
            elif action == "escalation" and listing.status == "PUBLISHED":
                target = request.data.get("target_circle")
                order = {"CHAIN_PHARMACIES": 1, "ORGANISATION_OWNERS": 2, "PLATFORM_OWNERS": 3}
                if target not in order or order[target] > order[listing.maximum_circle] or order[target] < order[listing.current_circle]:
                    raise ValidationError({"target_circle": "Escalation must widen within the owner-confirmed maximum."})
                if listing.product.schedule.upper() == "S8" and target == "PLATFORM_OWNERS":
                    raise PermissionDenied({"code": "S8_AUDIENCE_CEILING"})
                listing.current_circle = target
                for step in request.data.get("schedule", []):
                    scheduled_target = step.get("target_circle")
                    if scheduled_target not in order or order[scheduled_target] > order[listing.maximum_circle] or (listing.product.schedule.upper() == "S8" and scheduled_target == "PLATFORM_OWNERS"):
                        raise ValidationError({"schedule": "A scheduled circle exceeds the policy ceiling."})
                    EthicalEscalationStep.objects.create(listing=listing, target_circle=scheduled_target, due_at=step["due_at"], schedule_version=listing.version + 1)
            else:
                return Response({"code": "INVALID_TRANSITION"}, status=409)
            listing.version += 1
            listing.save()
            EthicalAuditEvent.objects.create(actor=request.user, pharmacy=listing.pharmacy, action=f"LISTING_{action.upper()}", target_type="listing", target_id=str(listing.id), safe_changes={"circle": listing.current_circle, "status": listing.status})
            return private(Response({"status": listing.status, "current_circle": listing.current_circle, "version": listing.version}))


class ListingRequests(APIView):
    permission_classes = (IsAuthenticated,)
    throttle_scope = "ethical_transfer"
    def post(self, request, pk):
        if not settings.ETHICAL_NEW_TRANSFERS_ENABLED:
            return Response({"code": "ETHICAL_NEW_TRANSFERS_DISABLED"}, status=503)
        listing = get_object_or_404(EthicalListing.objects.select_related("pharmacy", "product", "scope_chain"), pk=pk, status="PUBLISHED")
        if not listing_visible_to(request.user, listing):
            raise Http404
        destination = pharmacy_or_404(request.data.get("destination_pharmacy"))
        require(request.user, destination, "REQUEST_TRANSFER", product=listing.product, mode=listing.mode)
        if destination.id == listing.pharmacy_id:
            raise PermissionDenied("Source and destination premises must differ.")
        if listing.product.schedule.upper() == "S8" and (not listing.pharmacy.organization_id or listing.pharmacy.organization_id != destination.organization_id):
            raise PermissionDenied({"code": "S8_ORGANISATION_CEILING"})
        request_id = request.data.get("client_request_id")
        if not request_id:
            raise ValidationError({"client_request_id": "Required."})
        payload_hash = hashlib.sha256(json.dumps(request.data, sort_keys=True, default=str).encode()).hexdigest()
        receipt = EthicalRequestReceipt.objects.filter(actor=request.user, action="TRANSFER_REQUEST", client_request_id=request_id).first()
        if receipt:
            if receipt.payload_hash != payload_hash:
                return Response({"code": "REQUEST_ID_REUSED_WITH_DIFFERENT_PAYLOAD"}, status=409)
            return private(Response(receipt.outcome))
        quantities = {str(row["lot"]): int(row["quantity"]) for row in request.data.get("lines", [])}
        with transaction.atomic():
            transfer = EthicalTransfer.objects.create(listing=listing, source_pharmacy=listing.pharmacy, destination_pharmacy=destination, requested_by=request.user, mode=listing.mode, terms=request.data.get("terms", {}))
            for allocation in listing.lot_allocations.select_related("lot"):
                wanted = quantities.get(str(allocation.lot_id), 0)
                if not wanted:
                    continue
                lot = EthicalStockLot.objects.select_for_update().get(pk=allocation.lot_id)
                if wanted > allocation.quantity or wanted > lot.available_quantity:
                    raise ValidationError({"lines": "Requested quantity is no longer available."})
                line = EthicalTransferLine.objects.create(transfer=transfer, lot=lot, quantity=wanted, unit_amount=listing.amount)
                EthicalReservation.objects.create(transfer_line=line, lot=lot, quantity=wanted)
                lot.reserved_quantity += wanted
                lot.version += 1
                lot.save(update_fields=("reserved_quantity", "version", "updated_at"))
            if not transfer.lines.exists():
                raise ValidationError({"lines": "At least one positive lot quantity is required."})
            listing.status = "RESERVED"
            listing.save(update_fields=("status", "updated_at"))
            outcome = TransferSerializer(transfer).data
            EthicalRequestReceipt.objects.create(actor=request.user, action="TRANSFER_REQUEST", client_request_id=request_id, payload_hash=payload_hash, outcome=outcome)
        return private(Response(outcome, status=201))


def transfer_for(user, pk, action=None):
    transfer = get_object_or_404(EthicalTransfer.objects.select_related("listing", "listing__product", "source_pharmacy", "destination_pharmacy").prefetch_related("lines", "messages"), pk=pk)
    if action == "DISPATCH":
        pharmacies = (transfer.source_pharmacy,)
    elif action == "RECEIVE":
        pharmacies = (transfer.destination_pharmacy,)
    elif action == "REQUEST_TRANSFER":
        pharmacies = (transfer.destination_pharmacy,)
    else:
        pharmacies = (transfer.source_pharmacy, transfer.destination_pharmacy)
    allowed = False
    for pharmacy in pharmacies:
        if evaluate_ethical_access(user, pharmacy, action or "VIEW_CHAIN_ETHICAL", product=transfer.listing.product, mode=transfer.mode).admitted:
            allowed = True
    if not allowed:
        raise Http404
    return transfer


class Transfers(APIView):
    permission_classes = (IsAuthenticated,)
    def get(self, request, pk=None):
        if pk:
            return private(Response(TransferSerializer(transfer_for(request.user, pk)).data))
        pharmacy = admitted_pharmacy(request)
        rows = EthicalTransfer.objects.filter(models_transfer_party(pharmacy)).select_related("listing", "source_pharmacy", "destination_pharmacy").prefetch_related("lines")
        return private(Response(TransferSerializer(rows, many=True).data))


def models_transfer_party(pharmacy):
    from django.db.models import Q
    return Q(source_pharmacy=pharmacy) | Q(destination_pharmacy=pharmacy)


class TransferAction(APIView):
    permission_classes = (IsAuthenticated,)
    def post(self, request, pk, action):
        action_caps = {"agree": "APPROVE_TRANSFER", "authorise": "APPROVE_TRANSFER", "dispatch": "DISPATCH", "receive": "RECEIVE", "cancel": "APPROVE_TRANSFER"}
        if action not in action_caps:
            raise Http404
        with transaction.atomic():
            transfer = EthicalTransfer.objects.select_for_update().select_related("listing", "listing__product", "source_pharmacy", "destination_pharmacy").get(pk=pk)
            targets = (transfer.destination_pharmacy,) if action == "receive" else (transfer.source_pharmacy,) if action in ("agree", "authorise", "dispatch") else (transfer.source_pharmacy, transfer.destination_pharmacy)
            if action == "cancel":
                admitted = evaluate_ethical_access(request.user, transfer.source_pharmacy, "APPROVE_TRANSFER", product=transfer.listing.product, mode=transfer.mode).admitted or evaluate_ethical_access(request.user, transfer.destination_pharmacy, "REQUEST_TRANSFER", product=transfer.listing.product, mode=transfer.mode).admitted
            else:
                admitted = any(evaluate_ethical_access(request.user, pharmacy, action_caps[action], product=transfer.listing.product, mode=transfer.mode).admitted for pharmacy in targets)
            if not admitted:
                raise Http404
            request_id = request.data.get("client_request_id")
            if not request_id:
                raise ValidationError({"client_request_id": "Required."})
            receipt_action = f"TRANSFER_{action.upper()}"
            payload_hash = hashlib.sha256(json.dumps(request.data, sort_keys=True, default=str).encode()).hexdigest()
            receipt = EthicalRequestReceipt.objects.filter(actor=request.user, action=receipt_action, client_request_id=request_id).first()
            if receipt:
                if receipt.payload_hash != payload_hash:
                    return Response({"code": "REQUEST_ID_REUSED_WITH_DIFFERENT_PAYLOAD"}, status=409)
                return private(Response(receipt.outcome))
            if request.data.get("expected_version") != transfer.version:
                return Response({"code": "STALE_VERSION"}, status=409)
            transitions = {
                "agree": (("REQUESTED", "REVIEWED"), "AGREED"),
                "authorise": (("AGREED",), "AUTHORISED_FOR_DISPATCH"),
                "dispatch": (("AUTHORISED_FOR_DISPATCH",), "DISPATCHED"),
                "receive": (("DISPATCHED",), "RECEIVED"),
                "cancel": (("REQUESTED", "REVIEWED", "AGREED", "AUTHORISED_FOR_DISPATCH"), "CANCELLED"),
            }
            allowed_states, target = transitions[action]
            if transfer.state not in allowed_states:
                return Response({"code": "INVALID_TRANSITION"}, status=409)
            if action == "dispatch":
                for line in transfer.lines.select_related("lot"):
                    lot = EthicalStockLot.objects.select_for_update().get(pk=line.lot_id)
                    if lot.reserved_quantity < line.quantity or lot.on_hand_quantity < line.quantity:
                        raise ValidationError({"stock": "Reserved stock is no longer consistent."})
                    lot.reserved_quantity -= line.quantity
                    lot.on_hand_quantity -= line.quantity
                    lot.version += 1
                    lot.save(update_fields=("reserved_quantity", "on_hand_quantity", "version", "updated_at"))
                    EthicalStockMovement.objects.create(lot=lot, movement_type="DISPATCH", quantity_delta=-line.quantity, resulting_on_hand=lot.on_hand_quantity, actor=request.user, reference_type="transfer", reference_id=str(transfer.id))
                    line.reservation.active = False
                    line.reservation.released_at = timezone.now()
                    line.reservation.save(update_fields=("active", "released_at", "updated_at"))
                transfer.dispatched_at = timezone.now()
            if action == "receive":
                transfer.received_at = timezone.now()
                transfer.destination_approved_by = request.user
            if action in ("agree", "authorise"):
                transfer.source_approved_by = request.user
            if action == "cancel":
                for line in transfer.lines.select_related("lot"):
                    if hasattr(line, "reservation") and line.reservation.active:
                        lot = EthicalStockLot.objects.select_for_update().get(pk=line.lot_id)
                        lot.reserved_quantity -= line.quantity
                        lot.version += 1
                        lot.save(update_fields=("reserved_quantity", "version", "updated_at"))
                        line.reservation.active = False
                        line.reservation.released_at = timezone.now()
                        line.reservation.save(update_fields=("active", "released_at", "updated_at"))
            transfer.state = target
            transfer.version += 1
            transfer.save()
            outcome = {"state": transfer.state, "version": transfer.version}
            EthicalRequestReceipt.objects.create(actor=request.user, action=receipt_action, client_request_id=request_id, payload_hash=payload_hash, outcome=outcome)
            EthicalAuditEvent.objects.create(actor=request.user, pharmacy=targets[0], action=receipt_action, target_type="transfer", target_id=str(transfer.id), safe_changes=outcome)
            return private(Response(outcome))


class TransferMessages(APIView):
    permission_classes = (IsAuthenticated,)
    throttle_scope = "ethical_message"
    def get(self, request, pk):
        return private(Response(MessageSerializer(transfer_for(request.user, pk).messages.all(), many=True).data))
    def post(self, request, pk):
        transfer = transfer_for(request.user, pk)
        serializer = MessageSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        row = serializer.save(transfer=transfer, author=request.user)
        return private(Response(MessageSerializer(row).data, status=201))


class TransferDocument(APIView):
    permission_classes = (IsAuthenticated,)
    parser_classes = (MultiPartParser, FormParser)
    def get(self, request, pk, document_id):
        transfer = transfer_for(request.user, pk)
        document = get_object_or_404(EthicalTransferDocument, pk=document_id, transfer=transfer)
        response = FileResponse(document.file.open("rb"), as_attachment=True, filename=f"ethical-transfer-{transfer.id}-document")
        response["Cache-Control"] = "private, no-store"
        response["X-Robots-Tag"] = "noindex, nofollow, noarchive"
        return response
    def post(self, request, pk, document_id=None):
        transfer = transfer_for(request.user, pk)
        upload = request.FILES.get("file")
        if not upload or upload.size > 5 * 1024 * 1024:
            return Response({"code": "DOCUMENT_TOO_LARGE_OR_MISSING"}, status=413)
        _validate_transfer_document(upload)
        row = EthicalTransferDocument.objects.create(transfer=transfer, document_type=str(request.data.get("document_type", "SUPPORTING"))[:80], file=upload, uploaded_by=request.user)
        return private(Response({"id": row.id, "document_type": row.document_type}, status=201))
