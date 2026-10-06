"""One HTTP validation/publication contract, shared by transitional route mounts."""
from collections.abc import Mapping

from django.core.exceptions import PermissionDenied as DjangoPermissionDenied, ValidationError as DjangoValidationError
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema
from rest_framework import permissions, serializers, status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from organizations.models import Pharmacy
from workforce.models import RosterPeriod
from workforce.permissions import require_manage_pharmacy
from workforce.roster.publication_contract import RosterCommandConflict
from workforce.roster.revisions import publish_period_command, validate_period_command


class PositiveCommandInteger(serializers.IntegerField):
    def __init__(self, **kwargs):
        super().__init__(min_value=1, max_value=9223372036854775807, **kwargs)

    def to_internal_value(self, data):
        if isinstance(data, bool) or not isinstance(data, (int, str)):
            self.fail("invalid")
        return super().to_internal_value(data)


class ValidateRosterCommandSerializer(serializers.Serializer):
    period_id = PositiveCommandInteger()
    expected_revision = PositiveCommandInteger()

    def to_internal_value(self, data):
        if not isinstance(data, Mapping):
            raise ValidationError("A command object is required.")
        unknown = sorted(set(data) - set(self.fields))
        if unknown:
            raise ValidationError({name: "Unsupported command field." for name in unknown})
        return super().to_internal_value(data)


class PublishRosterCommandSerializer(ValidateRosterCommandSerializer):
    operation_id = serializers.UUIDField()
    acknowledged_warning_keys = serializers.ListField(
        child=serializers.CharField(max_length=128, allow_blank=False), required=True,
    )


def _command_input(request, serializer_class):
    # Old initialization attempts may still reach this adapter during migration.
    # Preserve authorization before rejection and never create a period here.
    data = request.data
    if isinstance(data, Mapping) and not data.get("period_id") and data.get("pharmacy_id"):
        pharmacy_id = PositiveCommandInteger().run_validation(data["pharmacy_id"])
        pharmacy = get_object_or_404(Pharmacy, pk=pharmacy_id)
        try:
            require_manage_pharmacy(request.user, pharmacy)
        except DjangoPermissionDenied:
            raise PermissionDenied("You are not authorized to manage this pharmacy's roster.")
    serializer = serializer_class(data=data)
    serializer.is_valid(raise_exception=True)
    return serializer.validated_data


def _domain_failure(exc):
    if isinstance(exc, RosterCommandConflict):
        return Response(exc.payload, status=status.HTTP_409_CONFLICT)
    return Response({"error": "; ".join(exc.messages)}, status=status.HTTP_409_CONFLICT)


class RosterValidateRevisionView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(request=ValidateRosterCommandSerializer, responses={200: dict})
    def post(self, request):
        command = _command_input(request, ValidateRosterCommandSerializer)
        period = get_object_or_404(RosterPeriod.objects.select_related("pharmacy"), pk=command["period_id"])
        try:
            return Response(validate_period_command(
                user=request.user, period=period, expected_revision=command["expected_revision"],
            ))
        except DjangoPermissionDenied:
            raise PermissionDenied("You are not authorized to validate this pharmacy's roster.")
        except DjangoValidationError as exc:
            return _domain_failure(exc)


class RosterPublishRevisionView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(request=PublishRosterCommandSerializer, responses={200: dict})
    def post(self, request):
        command = _command_input(request, PublishRosterCommandSerializer)
        period = get_object_or_404(RosterPeriod.objects.select_related("pharmacy"), pk=command.pop("period_id"))
        try:
            return Response(publish_period_command(user=request.user, period=period, **command))
        except DjangoPermissionDenied:
            raise PermissionDenied("You are not authorized to publish this pharmacy's roster.")
        except DjangoValidationError as exc:
            return _domain_failure(exc)
