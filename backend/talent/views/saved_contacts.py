"""Public identity bookmarks. This API never invites, follows, or creates a membership."""
import re

from django.contrib.auth import get_user_model
from django.db import transaction
from django.http import Http404
from rest_framework import permissions
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from organizations.models import Organization
from talent.models import ExplorerPost, SavedProfessionalContact

MAX_CONTACTS = 100
SAFE_REFERENCE = re.compile(r"^[A-Za-z0-9_-]{4,100}$")


def _serialize(contact):
    return {
        "id": contact.id,
        "kind": contact.kind,
        "reference": contact.reference,
        "saved_at": contact.created_at.isoformat(),
    }


class SavedProfessionalContactsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        rows = SavedProfessionalContact.objects.filter(user=request.user).order_by("-created_at", "-id")[:MAX_CONTACTS]
        return Response([_serialize(row) for row in rows])

    def post(self, request):
        kind = request.data.get("kind")
        reference = request.data.get("reference")
        if kind not in (SavedProfessionalContact.Kind.WORKER_LISTING, SavedProfessionalContact.Kind.ORGANIZATION):
            raise ValidationError({"kind": "Only public worker or organisation contacts can be saved."})
        if not isinstance(reference, str) or not SAFE_REFERENCE.fullmatch(reference):
            raise ValidationError({"reference": "Invalid public identity reference."})
        if kind == SavedProfessionalContact.Kind.WORKER_LISTING:
            # Hidden or expired talent posts are never eligible for server bookmarks.
            post = ExplorerPost.objects.filter(reference_code=reference, hidden_at__isnull=True).first()
            if post is None or not post.is_talent_board_visible():
                raise ValidationError({"reference": "This worker listing is not public or has expired."})
        elif not Organization.objects.filter(slug=reference).exists():
            raise ValidationError({"reference": "This organisation is unavailable."})
        with transaction.atomic():
            get_user_model().objects.select_for_update().get(pk=request.user.pk)
            existing = SavedProfessionalContact.objects.filter(
                user=request.user, kind=kind, reference=reference
            ).first()
            if existing:
                return Response(_serialize(existing))
            if SavedProfessionalContact.objects.filter(user=request.user).count() >= MAX_CONTACTS:
                raise ValidationError({"detail": "Delete a saved contact before adding another."})
            contact = SavedProfessionalContact.objects.create(user=request.user, kind=kind, reference=reference)
        return Response(_serialize(contact), status=201)


class SavedProfessionalContactDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def delete(self, request, contact_id: int):
        deleted, _ = SavedProfessionalContact.objects.filter(user=request.user, pk=contact_id).delete()
        if not deleted:
            raise Http404
        return Response(status=204)
