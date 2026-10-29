"""Account API: contact messages and account deletion."""
from rest_framework import permissions, generics, status
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from users.models import ContactMessage
from users.serializers import ContactMessageCreateSerializer
from django.conf import settings
from users.task_dispatch import async_task
from rest_framework.views import APIView
from users.tasks import send_async_email
from rest_framework.exceptions import ValidationError
from django.db import transaction
from users.account_deletion import _anonymize_user, _delete_verification_docs_for_user, _revoke_user_sessions, _revoke_user_tokens
from users.recaptcha import verify_recaptcha
from users.delivery import deliver_email_best_effort


class ContactMessageCreateView(generics.CreateAPIView):
    serializer_class = ContactMessageCreateSerializer
    permission_classes = [permissions.AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "contact_form"
    queryset = ContactMessage.objects.all()

    def create(self, request, *args, **kwargs):
        user = request.user if request.user and request.user.is_authenticated else None
        captcha_token = request.data.get('captcha_token')

        if user is None and (not captcha_token or not verify_recaptcha(captcha_token)):
            raise ValidationError({
                'captcha': ['reCAPTCHA validation failed. Please try again.']
            })

        return super().create(request, *args, **kwargs)

    def perform_create(self, serializer):
        user = self.request.user if self.request.user and self.request.user.is_authenticated else None
        contact = serializer.save(user=user)

        support_email = getattr(settings, 'SUPPORT_EMAIL', settings.DEFAULT_FROM_EMAIL)
        context = {
            'name': contact.name,
            'email': contact.email,
            'phone': contact.phone,
            'subject': contact.subject,
            'message': contact.message,
            'source': contact.source,
            'page_url': contact.page_url,
            'app_version': contact.app_version,
            'submitted_at': contact.created_at,
        }

        deliver_email_best_effort(
            send_async_email,
            subject=f"Contact Us: {contact.subject}",
            recipient_list=[support_email],
            template_name="emails/contact_us.html",
            context=context,
            text_template="emails/contact_us.txt",
            event="contact_support",
            user_id=getattr(user, "id", None),
        )


class DeleteAccountView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def delete(self, request):
        user = request.user
        if getattr(user, "deleted_at", None):
            return Response({"success": True}, status=status.HTTP_200_OK)

        original_email = (user.email or "").strip()
        original_name = user.get_full_name() or original_email or "there"

        with transaction.atomic():
            _anonymize_user(user)
            user.device_tokens.all().delete()
            user.ws_tickets.all().delete()
            _revoke_user_sessions(user)
            _revoke_user_tokens(user)
            _delete_verification_docs_for_user(user)

        if original_email:
            deliver_email_best_effort(
                async_task,
                'users.tasks.send_async_email',
                subject="Your ChemistTasker account deletion",
                recipient_list=[original_email],
                template_name="emails/account_deleted.html",
                context={
                    "name": original_name,
                    "support_email": "info@chemisttasker.com",
                },
                text_template="emails/account_deleted.txt",
                event="account_deleted",
                user_id=user.id,
            )

        return Response({"success": True}, status=status.HTTP_200_OK)


class ChooseAccountTypeView(APIView):
    """Optionally convert an admin-only PHARMACY_MANAGER account into a personal worker account.

    The pharmacy-manager account is a valid permanent admin identity. Conversion is one-time and
    pharmacy-scoped: only the selected organisation-email CONTACT membership is converted to a
    workforce role. Other pharmacies administered by the same account remain CONTACT + MANAGER.
    """

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        from memberships.models import Membership
        from organizations.models import PharmacyAdmin
        from onboarding.models import OtherStaffOnboarding
        from users.models import User
        from users.utils import get_frontend_onboarding_url

        if request.user.role == "EXPLORER":
            # New to pharmacy -> Pharmacist / Pharmacy team: a separate, newcomer-only conversion.
            from onboarding.services.upgrade import upgrade_newcomer

            user, staff_role = upgrade_newcomer(request.user.pk, request.data.get("role"), request.data.get("staff_role"))
            return Response(
                {"role": user.role, "staff_role": staff_role, "pharmacy_id": None, "onboarding_url": get_frontend_onboarding_url(user)},
                status=status.HTTP_200_OK,
            )

        role = str(request.data.get("role") or "").strip().upper()
        if role not in User.CHOOSABLE_ACCOUNT_TYPES:
            raise ValidationError({"role": "Choose PHARMACIST or OTHER_STAFF."})

        staff_role = str(request.data.get("staff_role") or "").strip().upper()
        allowed_other_staff_roles = {"INTERN", "TECHNICIAN", "ASSISTANT", "STUDENT"}
        if role == "OTHER_STAFF" and staff_role not in allowed_other_staff_roles:
            raise ValidationError({
                "staff_role": "Choose INTERN, TECHNICIAN, ASSISTANT or STUDENT for an Other Staff profile."
            })
        if role == "PHARMACIST":
            staff_role = "PHARMACIST"

        raw_pharmacy_id = request.data.get("pharmacy_id")
        try:
            requested_pharmacy_id = int(raw_pharmacy_id) if raw_pharmacy_id not in (None, "") else None
        except (TypeError, ValueError):
            raise ValidationError({"pharmacy_id": "Choose a valid administered pharmacy."})

        with transaction.atomic():
            user = User.objects.select_for_update().get(pk=request.user.pk)
            if user.role != "PHARMACY_MANAGER":
                raise ValidationError({"role": "Your account type is already set."})

            candidates = (
                Membership.objects.select_for_update()
                .select_related("admin_assignment")
                .filter(
                    user=user,
                    role="CONTACT",
                    is_active=True,
                    status=Membership.Status.ACCEPTED,
                    pharmacy__organization__isnull=False,
                    admin_assignment__is_active=True,
                    admin_assignment__admin_level=PharmacyAdmin.AdminLevel.MANAGER,
                )
                .order_by("pk")
            )
            if requested_pharmacy_id is not None:
                membership = candidates.filter(pharmacy_id=requested_pharmacy_id).first()
            else:
                matches = list(candidates[:2])
                membership = matches[0] if len(matches) == 1 else None

            if membership is None:
                raise ValidationError({
                    "pharmacy_id": (
                        "Choose the organisation pharmacy whose admin-only CONTACT membership "
                        "should become your personal workforce membership."
                    )
                })

            assignment = membership.admin_assignment
            user.role = role
            user.save(update_fields=["role"])

            membership.role = staff_role
            membership.save(update_fields=["role", "updated_at"])
            assignment.staff_role = staff_role
            assignment.save(update_fields=["staff_role", "updated_at"])

            if role == "OTHER_STAFF":
                profile, _ = OtherStaffOnboarding.objects.get_or_create(user=user)
                if profile.role_type != staff_role:
                    profile.role_type = staff_role
                    profile.save(update_fields=["role_type"])

        return Response(
            {
                "role": user.role,
                "staff_role": staff_role,
                "pharmacy_id": membership.pharmacy_id,
                "onboarding_url": get_frontend_onboarding_url(user),
            },
            status=status.HTTP_200_OK,
        )
