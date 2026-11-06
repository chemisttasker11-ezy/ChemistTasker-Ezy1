from django.core.management.base import BaseCommand
from talent.receipt_cleanup import cleanup_pitch_receipts


class Command(BaseCommand):
    help = 'Remove expired pitch receipt content, keeping consumed idempotency keys.'

    def handle(self, *args, **options):
        self.stdout.write(f'Cleared {cleanup_pitch_receipts()} expired pitch receipts.')
