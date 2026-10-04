"""Account API: contact messages and account deletion."""
from rest_framework import permissions, generics, status
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from users.models import ContactMessage
from users.serializers import ContactMessageCreateSerializer
from django.conf import settings
from core.task_queue import async_task
from rest_framework.views import APIView
from users.tasks import send_async_email
from rest_framework.exceptions import ValidationError
from django.db import transaction
from users.account_deletion import _anonymize_user, _delete_verification_docs_for_user, _revoke_user_sessions, _revoke_user_tokens
from users.recaptcha import verify_recaptcha


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

        send_async_email(
            subject=f"Contact Us: {contact.subject}",
            recipient_list=[support_email],
            template_name="emails/contact_us.html",
            context=context,
            text_template="emails/contact_us.txt",
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
            async_task(
                'users.tasks.send_async_email',
                subject="Your ChemistTasker account deletion",
                recipient_list=[original_email],
                template_name="emails/account_deleted.html",
                context={
                    "name": original_name,
                    "support_email": "info@chemisttasker.com",
                },
                text_template="emails/account_deleted.txt",
            )

        return Response({"success": True}, status=status.HTTP_200_OK)
