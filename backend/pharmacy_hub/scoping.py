"""Viewset machinery shared by the hub endpoints: resolving the request's scope and post attachments."""
import json
import mimetypes
from collections.abc import Mapping
from django.http import QueryDict
from rest_framework.exceptions import ValidationError
from pharmacy_hub.models import PharmacyHubAttachment
from core.file_validation import ATTACHMENT_UPLOAD_POLICY, validate_uploaded_file
from pharmacy_hub.access import HubScopeResolver


class HubAttachmentMixin:
    def _attachment_kind(self, uploaded):
        content_type = getattr(uploaded, "content_type", None)
        if not content_type:
            content_type, _ = mimetypes.guess_type(uploaded.name)
        if content_type:
            if content_type == "image/gif":
                return PharmacyHubAttachment.Kind.GIF
            if content_type.startswith("image/"):
                return PharmacyHubAttachment.Kind.IMAGE
        return PharmacyHubAttachment.Kind.FILE

    def _add_attachments(self, post, files):
        for uploaded in files or []:
            if not uploaded:
                continue
            validate_uploaded_file(uploaded, ATTACHMENT_UPLOAD_POLICY, "attachment")
            PharmacyHubAttachment.objects.create(
                post=post,
                file=uploaded,
                kind=self._attachment_kind(uploaded),
            )

    def _remove_attachments(self, post, request):
        raw_ids = request.data.get("remove_attachment_ids", [])
        if isinstance(raw_ids, str):
            raw_ids = [raw_ids]
        ids = []
        for raw in raw_ids:
            try:
                ids.append(int(raw))
            except (TypeError, ValueError):
                continue
        if ids:
            PharmacyHubAttachment.objects.filter(post=post, id__in=ids).delete()


class HubScopedViewSetMixin:
    """Shared scope resolution helpers for hub viewsets."""

    def _normalize_params(self, params):
        if isinstance(params, QueryDict):
            normalized = {}
            for key, values in params.lists():
                norm_key = key[:-2] if key.endswith("[]") else key
                normalized[norm_key] = values if len(values) > 1 else values[0]
            return normalized
        if isinstance(params, Mapping):
            return params
        if isinstance(params, str):
            try:
                parsed = json.loads(params)
            except Exception:
                raise ValidationError({"non_field_errors": ["Invalid JSON body."]})
            if not isinstance(parsed, Mapping):
                raise ValidationError({"non_field_errors": ["Invalid data. Expected an object."]})
            return parsed
        raise ValidationError({"non_field_errors": ["Invalid data. Expected an object."]})

    def _resolve_scope_from_params(self, params):
        params = self._normalize_params(params)
        scope_type = params.get("scope") or params.get("scope_type")
        if not scope_type:
            raise ValidationError(
                {"scope": "Provide a scope (pharmacy, group, organization, or platform)."}
            )
        resolver = HubScopeResolver(self.request.user)
        if scope_type == "pharmacy":
            pharmacy_id = params.get("pharmacy_id") or params.get("scope_id")
            if not pharmacy_id:
                raise ValidationError({"pharmacy_id": "This field is required."})
            return resolver.pharmacy_scope(pharmacy_id)
        if scope_type == "group":
            group_id = params.get("group_id") or params.get("scope_id")
            if not group_id:
                raise ValidationError({"group_id": "This field is required."})
            return resolver.group_scope(group_id)
        if scope_type == "organization":
            organization_id = params.get("organization_id") or params.get("scope_id")
            if not organization_id:
                raise ValidationError({"organization_id": "This field is required."})
            return resolver.organization_scope(organization_id)
        if scope_type == "platform":
            platform_hub = params.get("platform_hub") or params.get("scope_id")
            if not platform_hub:
                raise ValidationError({"platform_hub": "This field is required."})
            return resolver.platform_scope(platform_hub)
        raise ValidationError({"scope": "Invalid scope type."})

    def _apply_scope_filter(self, queryset, scope):
        if scope["scope_type"] == "platform":
            return queryset.filter(platform_hub=scope["platform_hub"])
        if scope["scope_type"] == "group":
            return queryset.filter(community_group=scope["community_group"])
        if scope["scope_type"] == "pharmacy":
            return queryset.filter(
                pharmacy=scope["pharmacy"],
                community_group__isnull=True,
                organization__isnull=True,
            )
        # Organization scope: only org-tagged posts (organization set, pharmacy NULL), exclude group posts
        org = scope.get("organization")
        return queryset.filter(
            organization=org,
            pharmacy__isnull=True,
            community_group__isnull=True,
        )

    def _prepare_serializer_context(self, scope, extra_context=None):
        context = {
            "pharmacy": scope.get("pharmacy"),
            "organization": scope.get("organization"),
            "community_group": scope.get("community_group"),
            "platform_hub": scope.get("platform_hub"),
            "request_membership": scope.get("request_membership"),
            "has_admin_permissions": scope.get("has_admin_permissions", False),
            "has_group_admin_permissions": scope.get(
                "has_group_admin_permissions", False
            ),
        }
        if extra_context:
            context.update(extra_context)
        self.extra_serializer_context = context
