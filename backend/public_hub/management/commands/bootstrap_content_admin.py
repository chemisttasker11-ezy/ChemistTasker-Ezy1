from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.core.validators import validate_email
from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone
from public_hub.content_views import send_invitation
from public_hub.models import ContentInvitation
from public_hub.permissions import is_content_admin


class Command(BaseCommand):
    help = 'Queue secure activation for a content administrator; never grants Django staff/superuser.'

    def add_arguments(self, parser):
        parser.add_argument('email')
        parser.add_argument('--send-now', action='store_true', help='Send through configured email delivery without waiting for a worker.')
        parser.add_argument('--resend', action='store_true', help='Replace a pending activation token and queue a fresh email.')

    @transaction.atomic
    def handle(self, *args, **options):
        email = options['email'].strip().lower()
        try:
            validate_email(email)
        except ValidationError:
            raise CommandError('Provide a valid email address.')
        user = get_user_model().objects.filter(email__iexact=email).first()
        if user and is_content_admin(user):
            self.stdout.write('Content administrator already active. No changes made.')
            return
        pending = ContentInvitation.objects.select_for_update().filter(email__iexact=email, bootstrap_administrator=True, accepted_at=None, revoked_at=None, expires_at__gt=timezone.now()).first()
        if pending and not options['resend']:
            self.stdout.write('An activation invitation is already pending.')
            return
        invitation = pending or ContentInvitation(email=email, assignments={}, bootstrap_administrator=True)
        send_invitation(invitation, immediate=options['send_now'])
        message = 'Invitation accepted by the email server.' if options['send_now'] else 'Administrator activation queued.'
        transaction.on_commit(lambda: self.stdout.write(message))
