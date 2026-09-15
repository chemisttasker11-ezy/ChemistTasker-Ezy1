from celery import shared_task


@shared_task
def publish_scheduled_content():
    from .editorial import publish_due
    return publish_due()
