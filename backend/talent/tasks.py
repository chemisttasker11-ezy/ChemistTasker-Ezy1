from celery import shared_task
from talent.receipt_cleanup import cleanup_pitch_receipts


@shared_task(name='talent.tasks.cleanup_expired_pitch_receipts')
def cleanup_expired_pitch_receipts():
    return cleanup_pitch_receipts()
