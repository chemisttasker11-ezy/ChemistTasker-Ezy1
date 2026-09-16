import io
import uuid

from django.conf import settings
from django.db import transaction
from django.http import FileResponse, Http404
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.text import slugify
from PIL import Image, UnidentifiedImageError
from rest_framework import status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from client_profile.models import Pharmacy
from .models import (ListingEscalationStep, MarketplaceAuditEvent, MarketplaceCategory, MarketplaceExchange,
                     MarketplaceCatalogueProduct, MarketplaceExchangeParticipant, MarketplaceImage, MarketplaceInternalTransfer, MarketplaceListing, MarketplaceMessage,
                     MarketplaceReport, MarketplaceSavedListing)
from .policy import evaluate_marketplace_access, owns_pharmacy
from .serializers import ExchangeSerializer, ListingWriteSerializer, MessageSerializer, PublicCategorySerializer, PublicListingSerializer
from .services import accept_exchange, assert_listing_manager, buyer_can_contact, request_receipt


def public_listings():
    if not settings.MARKETPLACE_READ_ENABLED:
        return MarketplaceListing.objects.none()
    return MarketplaceListing.objects.filter(publication_status="PUBLISHED").exclude(availability_status__in=("WITHDRAWN", "EXPIRED")).select_related("category", "creator", "audience", "delivery").prefetch_related("images")


class Categories(APIView):
    permission_classes = (AllowAny,)
    def get(self, request):
        rows = MarketplaceCategory.objects.filter(is_active=True, is_medicine=False).order_by("name") if settings.MARKETPLACE_READ_ENABLED else MarketplaceCategory.objects.none()
        return Response(PublicCategorySerializer(rows, many=True).data)


class Listings(APIView):
    permission_classes = (AllowAny,)
    def get(self, request):
        rows = public_listings()
        if category := request.query_params.get("category"):
            rows = rows.filter(category__slug=category)
        if mode := request.query_params.get("mode"):
            rows = rows.filter(mode=mode)
        if search := request.query_params.get("search"):
            rows = rows.filter(title__icontains=search[:100])
        page = self.paginate_queryset(rows.order_by("-published_at", "-id"), request)
        return page

    def paginate_queryset(self, rows, request):
        from rest_framework.pagination import PageNumberPagination
        paginator = PageNumberPagination()
        paginator.page_size = 24
        page = paginator.paginate_queryset(rows, request)
        return paginator.get_paginated_response(PublicListingSerializer(page, many=True, context={"request": request}).data)

    permission_classes_by_method = {"POST": (IsAuthenticated,)}
    def get_permissions(self):
        return [permission() for permission in self.permission_classes_by_method.get(self.request.method, self.permission_classes)]

    def post(self, request):
        if not settings.MARKETPLACE_ALL_WRITES_ENABLED or not settings.MARKETPLACE_NEW_LISTINGS_ENABLED:
            return Response({"code": "NEW_LISTINGS_DISABLED", "detail": "New listings are not enabled."}, status=503)
        decision = evaluate_marketplace_access(request.user)
        if decision.blockers:
            raise PermissionDenied({"code": decision.blockers[0]["code"], "detail": decision.blockers[0]["message"]})
        data = request.data.copy()
        pharmacy = None
        if data.get("seller_context") == "PHARMACY":
            pharmacy = get_object_or_404(Pharmacy, pk=data.get("pharmacy"))
            if not owns_pharmacy(request.user, pharmacy):
                raise PermissionDenied("Verified current ownership is required.")
        data["slug"] = slugify(data.get("title", "listing"))[:160] or "listing"
        serializer = ListingWriteSerializer(data=data)
        serializer.is_valid(raise_exception=True)
        listing = serializer.save(creator=request.user, pharmacy=pharmacy)
        MarketplaceAuditEvent.objects.create(actor=request.user, acting_pharmacy=pharmacy, action="LISTING_CREATED", target_type="listing", target_id=str(listing.id))
        return Response(ListingWriteSerializer(listing).data, status=201)


class ListingDetail(APIView):
    permission_classes = (AllowAny,)
    def get(self, request, pk):
        listing = get_object_or_404(public_listings(), pk=pk)
        return Response(PublicListingSerializer(listing, context={"request": request}).data)

    def patch(self, request, pk):
        if not request.user.is_authenticated:
            return Response({"detail": "Authentication credentials were not provided."}, status=401)
        listing = get_object_or_404(MarketplaceListing.objects.select_related("pharmacy", "category", "audience", "delivery"), pk=pk)
        assert_listing_manager(request.user, listing)
        if listing.publication_status not in ("DRAFT", "REJECTED"):
            raise ValidationError({"publication_status": "Published content must be changed through a reviewed revision."})
        if request.data.get("expected_version") != listing.version:
            return Response({"code": "STALE_VERSION"}, status=409)
        serializer = ListingWriteSerializer(listing, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class MyAccess(APIView):
    permission_classes = (IsAuthenticated,)
    def get(self, request):
        response = Response(evaluate_marketplace_access(request.user).payload())
        response["Cache-Control"] = "private, no-store"
        return response


class ListingEligibility(APIView):
    permission_classes = (IsAuthenticated,)
    def get(self, request, pk):
        listing = get_object_or_404(MarketplaceListing.objects.select_related("audience", "pharmacy", "pharmacy__owner"), pk=pk)
        pharmacy = Pharmacy.objects.filter(pk=request.query_params.get("pharmacy")).first()
        allowed, blocker = buyer_can_contact(request.user, listing, pharmacy)
        return Response({"can_enquire": allowed, "can_manage": listing.creator_id == request.user.id, "blocker": blocker})


class MyListings(APIView):
    permission_classes = (IsAuthenticated,)
    def get(self, request):
        rows = MarketplaceListing.objects.filter(creator=request.user).select_related("category", "audience", "delivery")
        return Response(ListingWriteSerializer(rows, many=True).data)


class ListingAction(APIView):
    permission_classes = (IsAuthenticated,)
    def post(self, request, pk, action):
        listing = get_object_or_404(MarketplaceListing.objects.select_related("pharmacy", "category", "audience", "delivery"), pk=pk)
        assert_listing_manager(request.user, listing)
        expected = request.data.get("expected_version")
        if expected != listing.version:
            return Response({"code": "STALE_VERSION"}, status=409)
        if action == "submit" and listing.publication_status in ("DRAFT", "REJECTED"):
            listing.full_clean()
            listing.publication_status = "PENDING_REVIEW" if listing.category.requires_review else "PUBLISHED"
            if listing.publication_status == "PUBLISHED":
                listing.published_at = timezone.now()
        elif action == "withdraw" and listing.publication_status in ("PUBLISHED", "PENDING_REVIEW"):
            listing.publication_status = "WITHDRAWN"
            listing.availability_status = "WITHDRAWN"
        else:
            return Response({"code": "INVALID_TRANSITION"}, status=409)
        listing.version += 1
        listing.save()
        MarketplaceAuditEvent.objects.create(actor=request.user, acting_pharmacy=listing.pharmacy, action=f"LISTING_{action.upper()}", target_type="listing", target_id=str(listing.id))
        return Response({"publication_status": listing.publication_status, "availability_status": listing.availability_status, "version": listing.version})


class ListingAudience(APIView):
    permission_classes = (IsAuthenticated,)
    def post(self, request, pk):
        listing = get_object_or_404(MarketplaceListing.objects.select_related("pharmacy", "audience"), pk=pk)
        assert_listing_manager(request.user, listing)
        if request.data.get("expected_version") != listing.version:
            return Response({"code": "STALE_VERSION"}, status=409)
        circle = request.data.get("current_circle")
        valid = dict(listing.audience.Circle.choices)
        if circle not in valid:
            raise ValidationError({"current_circle": "Invalid circle."})
        order = {"OWNED_CHAIN": 1, "ORGANISATION": 2, "PLATFORM": 3}
        maximum = request.data.get("maximum_circle", circle)
        if maximum not in valid or order[circle] > order[maximum]:
            raise ValidationError({"maximum_circle": "The current circle cannot exceed the confirmed maximum."})
        if listing.seller_context != "PHARMACY":
            raise ValidationError({"current_circle": "Pharmacy circles apply only to pharmacy-owned listings."})
        listing.audience.current_circle = circle
        listing.audience.maximum_circle = maximum
        if listing.pharmacy:
            listing.audience.source_owner_id = listing.pharmacy.owner_id
            listing.audience.source_organization_id = listing.pharmacy.organization_id
        listing.audience.save()
        listing.version += 1
        listing.save(update_fields=("version", "updated_at"))
        for step in request.data.get("schedule", []):
            if step.get("target_circle") not in valid or order[step["target_circle"]] > order[maximum]:
                raise ValidationError({"schedule": "A scheduled circle exceeds the confirmed maximum."})
            ListingEscalationStep.objects.create(listing=listing, target_circle=step["target_circle"], due_at=step["due_at"], schedule_version=listing.version)
        return Response({"current_circle": circle, "maximum_circle": listing.audience.maximum_circle, "version": listing.version})


class ListingImages(APIView):
    permission_classes = (IsAuthenticated,)
    parser_classes = (MultiPartParser, FormParser)
    def post(self, request, pk):
        listing = get_object_or_404(MarketplaceListing.objects.select_related("pharmacy"), pk=pk)
        assert_listing_manager(request.user, listing)
        if listing.images.count() >= 6:
            raise ValidationError({"image": "A listing can have at most six images."})
        upload = request.FILES.get("image")
        if not upload or upload.size > 4 * 1024 * 1024:
            return Response({"code": "IMAGE_TOO_LARGE_OR_MISSING"}, status=413)
        try:
            source = Image.open(upload)
            source.verify()
            upload.seek(0)
            source = Image.open(upload)
            source.thumbnail((2400, 2400))
            if source.width * source.height > 20_000_000:
                raise ValueError
            safe = source.convert("RGB")
            buffer = io.BytesIO()
            safe.save(buffer, "JPEG", quality=88, optimize=True)
        except (UnidentifiedImageError, OSError, ValueError):
            raise ValidationError({"image": "Upload a valid, safe raster image."})
        from django.core.files.base import ContentFile
        row = MarketplaceImage.objects.create(listing=listing, uploader=request.user, original=upload, position=listing.images.count(), width=safe.width, height=safe.height)
        row.derivative.save(f"{uuid.uuid4().hex}.jpg", ContentFile(buffer.getvalue()), save=True)
        return Response({"id": row.pk, "moderation_status": row.moderation_status}, status=201)


class ImageDetail(APIView):
    permission_classes = (AllowAny,)
    def get(self, request, pk):
        image = get_object_or_404(MarketplaceImage.objects.select_related("listing"), pk=pk)
        public = image.moderation_status == "APPROVED" and image.listing.publication_status == "PUBLISHED"
        owner = request.user.is_authenticated and image.listing.creator_id == request.user.id
        if not public and not owner:
            raise Http404
        if not image.derivative:
            raise Http404
        response = FileResponse(image.derivative.open("rb"), content_type="image/jpeg")
        response["Cache-Control"] = "public, max-age=300" if public else "private, no-store"
        return response
    def delete(self, request, pk):
        image = get_object_or_404(MarketplaceImage.objects.select_related("listing", "listing__pharmacy"), pk=pk)
        assert_listing_manager(request.user, image.listing)
        image.delete()
        return Response(status=204)


class Enquiries(APIView):
    permission_classes = (IsAuthenticated,)
    throttle_scope = "marketplace_enquiry"
    def post(self, request, pk):
        if not settings.MARKETPLACE_CONTACT_ENABLED:
            return Response({"code": "CONTACT_DISABLED"}, status=503)
        listing = get_object_or_404(MarketplaceListing.objects.select_related("audience", "pharmacy", "pharmacy__owner"), pk=pk, publication_status="PUBLISHED", availability_status="AVAILABLE")
        buying = Pharmacy.objects.filter(pk=request.data.get("buying_pharmacy")).first()
        allowed, blocker = buyer_can_contact(request.user, listing, buying)
        if not allowed:
            raise PermissionDenied(blocker)
        request_id = request.data.get("client_request_id")
        if not request_id:
            raise ValidationError({"client_request_id": "Required."})
        existing, payload_hash = request_receipt(request.user, "ENQUIRY_CREATE", request_id, request.data)
        if existing:
            return Response(existing.outcome)
        exchange = MarketplaceExchange.objects.create(listing=listing, buyer=request.user, buying_pharmacy=buying, proposed_terms=request.data.get("terms", {}))
        MarketplaceExchangeParticipant.objects.bulk_create([
            MarketplaceExchangeParticipant(exchange=exchange, user=request.user, party_context="BUYER", permissions=["READ", "MESSAGE", "PROPOSE"]),
            MarketplaceExchangeParticipant(exchange=exchange, user=listing.creator, party_context="SELLER", permissions=["READ", "MESSAGE", "ACCEPT"]),
        ])
        if message := str(request.data.get("message", "")).strip():
            MarketplaceMessage.objects.create(exchange=exchange, author=request.user, body=message[:4000])
        from .models import MarketplaceRequestReceipt
        outcome = {"id": str(exchange.id), "state": exchange.state, "version": exchange.version}
        MarketplaceRequestReceipt.objects.create(actor=request.user, action="ENQUIRY_CREATE", client_request_id=request_id, payload_hash=payload_hash, outcome=outcome)
        return Response(outcome, status=201)


def participant_exchange(user, pk):
    exchange = get_object_or_404(MarketplaceExchange.objects.select_related("listing", "listing__creator", "listing__pharmacy").prefetch_related("messages"), pk=pk)
    if user.id not in (exchange.buyer_id, exchange.listing.creator_id):
        raise Http404
    return exchange


class Exchanges(APIView):
    permission_classes = (IsAuthenticated,)
    def get(self, request):
        from django.db.models import Q
        rows = MarketplaceExchange.objects.filter(Q(buyer=request.user) | Q(listing__creator=request.user)).select_related("listing")
        return Response(ExchangeSerializer(rows, many=True, context={"request": request}).data)


class ExchangeDetail(APIView):
    permission_classes = (IsAuthenticated,)
    def get(self, request, pk):
        return Response(ExchangeSerializer(participant_exchange(request.user, pk), context={"request": request}).data)


class ExchangeMessages(APIView):
    permission_classes = (IsAuthenticated,)
    throttle_scope = "marketplace_message"
    def get(self, request, pk):
        return Response(MessageSerializer(participant_exchange(request.user, pk).messages.all(), many=True).data)
    def post(self, request, pk):
        exchange = participant_exchange(request.user, pk)
        serializer = MessageSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        message = serializer.save(exchange=exchange, author=request.user)
        return Response(MessageSerializer(message).data, status=201)


class ExchangeAction(APIView):
    permission_classes = (IsAuthenticated,)
    def post(self, request, pk, action):
        exchange = participant_exchange(request.user, pk)
        expected = request.data.get("expected_version")
        if action == "accept":
            if not settings.MARKETPLACE_NEW_COMMITMENTS_ENABLED:
                return Response({"code": "NEW_COMMITMENTS_DISABLED"}, status=503)
            if not request.data.get("client_request_id"):
                raise ValidationError({"client_request_id": "Required."})
            try:
                result = accept_exchange(pk, request.user, expected, request.data.get("client_request_id"), request.data)
            except ValidationError as exc:
                return Response(exc.detail, status=409)
            return Response(result)
        if expected != exchange.version:
            return Response({"code": "STALE_VERSION"}, status=409)
        transitions = {"decline": "DECLINED", "cancel": "CANCELLED", "propose-terms": "TERMS_PROPOSED"}
        if action in transitions:
            exchange.state = transitions[action]
            if action == "propose-terms":
                exchange.proposed_terms = request.data.get("terms", {})
        elif action == "confirm-completion":
            if request.user.id == exchange.buyer_id:
                exchange.buyer_confirmed = True
            else:
                exchange.seller_confirmed = True
            if exchange.buyer_confirmed and exchange.seller_confirmed:
                exchange.state = "COMPLETED"
                exchange.listing.availability_status = "COMPLETED"
                exchange.listing.save(update_fields=("availability_status", "updated_at"))
        else:
            raise Http404
        exchange.version += 1
        exchange.save()
        return Response({"state": exchange.state, "version": exchange.version})


class Saved(APIView):
    permission_classes = (IsAuthenticated,)
    def post(self, request, pk):
        MarketplaceSavedListing.objects.get_or_create(user=request.user, listing=get_object_or_404(public_listings(), pk=pk))
        return Response(status=204)
    def delete(self, request, pk):
        MarketplaceSavedListing.objects.filter(user=request.user, listing_id=pk).delete()
        return Response(status=204)


class Reports(APIView):
    permission_classes = (AllowAny,)
    throttle_scope = "marketplace_report"
    def post(self, request):
        row = MarketplaceReport.objects.create(reporter=request.user if request.user.is_authenticated else None, listing=get_object_or_404(public_listings(), pk=request.data.get("listing")), reason=str(request.data.get("reason", ""))[:2000])
        return Response({"reference": row.public_reference}, status=201)


class InternalTransfers(APIView):
    permission_classes = (IsAuthenticated,)
    def post(self, request, pk):
        if not settings.MARKETPLACE_NEW_COMMITMENTS_ENABLED:
            return Response({"code": "NEW_COMMITMENTS_DISABLED"}, status=503)
        listing = get_object_or_404(MarketplaceListing.objects.select_related("pharmacy", "pharmacy__owner"), pk=pk)
        assert_listing_manager(request.user, listing)
        destination = get_object_or_404(Pharmacy, pk=request.data.get("destination_pharmacy"))
        if not listing.pharmacy or destination.id == listing.pharmacy_id or not owns_pharmacy(request.user, destination):
            raise PermissionDenied("A distinct eligible pharmacy owned by the same owner is required.")
        row = MarketplaceInternalTransfer.objects.create(listing=listing, source_pharmacy=listing.pharmacy, destination_pharmacy=destination, accountable_owner=request.user, transport_terms=request.data.get("transport_terms", {}))
        return Response({"id": row.id, "state": row.state, "version": row.version}, status=201)


class InternalTransferAction(APIView):
    permission_classes = (IsAuthenticated,)
    def post(self, request, pk, action):
        row = get_object_or_404(MarketplaceInternalTransfer.objects.select_related("source_pharmacy", "destination_pharmacy"), pk=pk, accountable_owner=request.user)
        states = {"authorise": ("PROPOSED", "AUTHORISED"), "dispatch": ("AUTHORISED", "IN_TRANSIT"), "receive": ("IN_TRANSIT", "RECEIVED"), "cancel": ("PROPOSED", "CANCELLED")}
        previous, target = states.get(action, (None, None))
        if row.state != previous or request.data.get("expected_version") != row.version:
            return Response({"code": "INVALID_OR_STALE_TRANSITION"}, status=409)
        row.state, row.version = target, row.version + 1
        row.save(update_fields=("state", "version", "updated_at"))
        return Response({"state": row.state, "version": row.version})


class CatalogueLookup(APIView):
    permission_classes = (IsAuthenticated,)
    def get(self, request):
        if not settings.MARKETPLACE_CATALOGUE_LOOKUP_ENABLED:
            return Response({"results": []})
        decision = evaluate_marketplace_access(request.user)
        if decision.blockers:
            raise PermissionDenied(decision.blockers[0])
        barcode = request.query_params.get("barcode", "")[:100]
        product = MarketplaceCatalogueProduct.objects.filter(status="APPROVED", is_medicine=False, identifiers__value=barcode).select_related("category").first()
        if not product:
            return Response({"results": []})
        return Response({"results": [{"id": product.id, "name": product.name, "brand": product.brand, "description": product.description, "category": {"slug": product.category.slug, "name": product.category.name}}]})
