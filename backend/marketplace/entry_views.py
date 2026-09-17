from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .listing_policy import listing_options_for
from .models import MarketplaceListing


def private(response):
    response["Cache-Control"] = "private, no-store"
    return response


class ListingOptions(APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request):
        return private(Response(listing_options_for(request.user)))


class MyListingDashboard(APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request):
        rows = (
            MarketplaceListing.objects.filter(creator=request.user)
            .select_related("category", "pharmacy", "audience", "delivery")
            .prefetch_related("images", "escalation_steps")
            .order_by("-updated_at")
        )
        payload = []
        for row in rows:
            audience = getattr(row, "audience", None)
            delivery = getattr(row, "delivery", None)
            payload.append({
                "id": str(row.id),
                "slug": row.slug,
                "title": row.title,
                "seller_context": row.seller_context,
                "category": {"slug": row.category.slug, "name": row.category.name},
                "pharmacy": ({"id": row.pharmacy_id, "label": row.pharmacy.name} if row.pharmacy_id else None),
                "publication_status": row.publication_status,
                "availability_status": row.availability_status,
                "version": row.version,
                "current_circle": getattr(audience, "current_circle", None),
                "maximum_circle": getattr(audience, "maximum_circle", None),
                "allowed_buyer_roles": getattr(audience, "allowed_buyer_roles", []),
                "delivery": ({"method": delivery.method, "postage_payer": delivery.postage_payer, "postage_organiser": delivery.postage_organiser, "quote_required": delivery.quote_required} if delivery else None),
                "images": [{"id": image.id, "status": image.moderation_status, "position": image.position} for image in row.images.all()],
                "escalation_steps": [{"id": step.id, "target_circle": step.target_circle, "due_at": step.due_at, "status": step.status} for step in row.escalation_steps.all().order_by("due_at")],
                "updated_at": row.updated_at,
            })
        return private(Response(payload))
