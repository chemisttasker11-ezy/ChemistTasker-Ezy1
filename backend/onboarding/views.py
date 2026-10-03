"""Onboarding API: per-role onboarding profiles, referee responses and verification triggers."""
from rest_framework import generics, permissions
from onboarding.models import (
    ExplorerOnboarding,
    OtherStaffOnboarding,
    OwnerOnboarding,
    PharmacistOnboarding,
    RefereeResponse,
)
from users.permissions import IsExplorer, IsOtherstaff, IsOTPVerified, IsOwner, IsPharmacist
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from users.navigation import get_frontend_dashboard_url
from core.task_queue import async_task
from django.core.signing import BadSignature, TimestampSigner
from django.contrib.contenttypes.models import ContentType
from django.apps import apps
from onboarding.verification.reminders import cancel_referee_reminder
from django.db import IntegrityError, transaction
from datetime import timedelta
from onboarding.serializers import (
    ExplorerOnboardingV2Serializer,
    OtherStaffOnboardingV2Serializer,
    OwnerOnboardingV2Serializer,
    PharmacistOnboardingV2Serializer,
    RefereeResponseSerializer,
)


class RefereeSubmitResponseView(generics.CreateAPIView):
    """
    POST /references/submit/<token>/
    Body: RefereeResponseSerializer fields
    Effect:
      - Saves a RefereeResponse (1 per (profile, ref_idx) enforced)
      - Maps would_rehire -> referee{N}_confirmed / referee{N}_rejected
      - Sends decline email to candidate ONLY on first transition to rejected
      - Cancels single-ref reminder if rejected or confirmed
    """
    serializer_class = RefereeResponseSerializer
    permission_classes = [permissions.AllowAny]

    def perform_create(self, serializer):
        # 1) Unsign token -> (model_name, pk, referee_index)
        token = self.kwargs.get('token')
        signer = TimestampSigner()
        try:
            data = signer.unsign(token, max_age=timedelta(days=14))
            model_name, pk, referee_index = data.split(':')
            pk = int(pk)
            referee_index = int(referee_index)
            if referee_index not in (1, 2):
                raise ValueError
        except (BadSignature, ValueError):
            raise PermissionDenied("This reference link is invalid or has expired.")

        # 2) Locate onboarding record dynamically
        OnboardingModel = apps.get_model('client_profile', model_name)
        ct = ContentType.objects.get_for_model(OnboardingModel)

        # 3) Prevent duplicate submissions per candidate+referee
        if RefereeResponse.objects.filter(
            content_type=ct, object_id=pk, referee_index=referee_index
        ).exists():
            # DRF ValidationError -> clean 400 JSON, not a 500
            raise ValidationError({"detail": "A reference has already been submitted for this candidate."})

        with transaction.atomic():
            onboarding = OnboardingModel.objects.select_for_update().get(pk=pk)

            try:
                response = serializer.save(
                    content_type=ct,
                    object_id=pk,
                    referee_index=referee_index,
                )
            except IntegrityError:
                # unique_together (content_type, object_id, referee_index)
                raise ValidationError({"detail": "A reference has already been submitted for this candidate."})

            would = (response.would_rehire or '').strip().lower()
            confirmed_field = f'referee{referee_index}_confirmed'
            rejected_field  = f'referee{referee_index}_rejected'

            was_confirmed = bool(getattr(onboarding, confirmed_field))
            was_rejected  = bool(getattr(onboarding, rejected_field))

            if would == 'no':
                changed_to_rejected = not was_rejected
                setattr(onboarding, confirmed_field, False)
                setattr(onboarding, rejected_field, True)
                onboarding.save(update_fields=[confirmed_field, rejected_field])

                try:
                    cancel_referee_reminder(model_name, onboarding.pk, referee_index)
                except Exception:
                    pass

                if changed_to_rejected:
                    # send AFTER COMMIT
                    context_payload = {
                        "candidate_first_name": onboarding.user.first_name or onboarding.user.username,
                        "referee_index": referee_index,
                        "dashboard_url": get_frontend_dashboard_url(onboarding.user),
                    }
                    notification_payload = {
                        "title": "Referee declined",
                        "body": f"Referee {referee_index} declined your application.",
                        "payload": {
                            "referee_index": referee_index,
                            "onboarding_id": onboarding.pk,
                        },
                        "action_url": context_payload["dashboard_url"],
                    }
                    email_kwargs = {
                        "subject": "One of your referees declined",
                        "recipient_list": [onboarding.user.email],
                        "template_name": "emails/referee_declined_candidate.html",
                        "text_template": "emails/referee_declined_candidate.txt",
                        "context": context_payload,
                        "notification": notification_payload,
                    }
                    transaction.on_commit(lambda kwargs=email_kwargs: async_task(
                        'users.tasks.send_async_email',
                        **kwargs,
                    ))
            else:
                changed_to_confirmed = not was_confirmed
                setattr(onboarding, confirmed_field, True)
                setattr(onboarding, rejected_field, False)
                onboarding.save(update_fields=[confirmed_field, rejected_field])

                try:
                    cancel_referee_reminder(model_name, onboarding.pk, referee_index)
                except Exception:
                    pass


class RefereeRejectView(APIView):
    """
    POST /onboarding/referee-reject/<token>/
    Effect:
      - Sets referee{idx}_confirmed=False, referee{idx}_rejected=True (idempotent)
      - Emails the candidate ONLY on first transition to rejected
      - Cancels single-ref reminder for this referee
    """
    permission_classes = [permissions.AllowAny]

    def post(self, request, token, *args, **kwargs):
        signer = TimestampSigner()
        try:
            data = signer.unsign(token, max_age=timedelta(days=14))
            model_name, pk, ref_idx = data.split(':')
            pk = int(pk)
            idx = int(ref_idx)
            if idx not in (1, 2):
                raise ValueError
        except (BadSignature, ValueError):
            raise PermissionDenied("This referee link is invalid or has expired.")

        try:
            Model = apps.get_model('client_profile', model_name)
        except LookupError:
            return Response({'detail': 'Onboarding profile not found.'}, status=404)

        try:
            instance = Model.objects.get(pk=pk)
        except Model.DoesNotExist:
            return Response({'detail': 'Onboarding profile not found.'}, status=404)

        # Do an atomic, conditional update so we only send email on the first transition.
        confirmed_field = f"referee{idx}_confirmed"
        rejected_field  = f"referee{idx}_rejected"

        with transaction.atomic():
            # Reload with a lock to avoid race / double sends
            row = Model.objects.select_for_update().get(pk=instance.pk)
            was_rejected = bool(getattr(row, rejected_field))

            # If already rejected, do nothing (idempotent)
            if was_rejected:
                # Still cancel reminder just in case a schedule remains
                try:
                    cancel_referee_reminder(model_name, row.pk, idx)
                except Exception:
                    pass
                return Response({'success': True, 'message': 'Already declined.'}, status=200)

            # First time -> flip flags
            setattr(row, confirmed_field, False)
            setattr(row, rejected_field, True)
            row.save(update_fields=[confirmed_field, rejected_field])

            # Cancel this referee's reminder (if any)
            try:
                cancel_referee_reminder(model_name, row.pk, idx)
            except Exception:
                pass

            # Notify candidate exactly once (first transition only), after the DB commit
            context_payload = {
                "candidate_first_name": row.user.first_name or row.user.username,
                "referee_index": idx,
                "dashboard_url": get_frontend_dashboard_url(row.user),
            }
            notification_payload = {
                "title": "Referee declined",
                "body": f"Referee {idx} declined your application.",
                "payload": {"referee_index": idx, "onboarding_id": row.pk},
                "action_url": context_payload["dashboard_url"],
            }
            email_kwargs = {
                "subject": "One of your referees declined",
                "recipient_list": [row.user.email],
                "template_name": "emails/referee_declined_candidate.html",
                "text_template": "emails/referee_declined_candidate.txt",
                "context": context_payload,
                "notification": notification_payload,
            }
            transaction.on_commit(lambda kwargs=email_kwargs: async_task(
                'users.tasks.send_async_email',
                **kwargs,
            ))

        return Response({'success': True, 'message': 'Referee rejected.'}, status=200)


# === New Onboarding ===
class OwnerOnboardingV2MeView(generics.RetrieveUpdateAPIView):
    permission_classes = [permissions.IsAuthenticated, IsOwner, IsOTPVerified]
    serializer_class = OwnerOnboardingV2Serializer
    parser_classes = (MultiPartParser, FormParser, JSONParser)

    def get_object(self):
        obj, _ = OwnerOnboarding.objects.get_or_create(
            user=self.request.user,
            defaults={
                "phone_number": "",
                "role": "MANAGER",
                "chain_pharmacy": False,
                "number_of_pharmacies": 1,
            },
        )
        return obj


class PharmacistOnboardingV2MeView(generics.RetrieveUpdateAPIView):
    permission_classes = [permissions.IsAuthenticated, IsPharmacist, IsOTPVerified]
    serializer_class = PharmacistOnboardingV2Serializer
    parser_classes = (MultiPartParser, FormParser, JSONParser)

    def get_object(self):
        obj, _ = PharmacistOnboarding.objects.get_or_create(user=self.request.user)
        return obj


class OtherStaffOnboardingV2MeView(generics.RetrieveUpdateAPIView):
    """
    V2 tabbed flow for OtherStaff.
    Mirrors PharmacistOnboardingV2MeView but for OTHER_STAFF role.
    """
    permission_classes = [permissions.IsAuthenticated, IsOtherstaff, IsOTPVerified]
    serializer_class = OtherStaffOnboardingV2Serializer
    parser_classes = (MultiPartParser, FormParser, JSONParser)

    def get_object(self):
        obj, _ = OtherStaffOnboarding.objects.get_or_create(user=self.request.user)
        return obj


class ExplorerOnboardingV2MeView(generics.RetrieveUpdateAPIView):
    permission_classes = [permissions.IsAuthenticated, IsExplorer, IsOTPVerified]
    serializer_class = ExplorerOnboardingV2Serializer
    parser_classes = (MultiPartParser, FormParser, JSONParser)

    def get_object(self):
        obj, _ = ExplorerOnboarding.objects.get_or_create(user=self.request.user)
        return obj
