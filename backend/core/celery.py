import os

from celery import Celery

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "core.settings")
app = Celery("core")
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()


@app.on_after_configure.connect
def setup_marketplace_periodic_tasks(sender, **kwargs):
    sender.add_periodic_task(60.0, sender.signature("marketplace.tasks.process_goods_escalations"), name="marketplace-escalations-every-minute")
    sender.add_periodic_task(60.0, sender.signature("ethical_marketplace.tasks.process_ethical_escalations"), name="ethical-marketplace-escalations-every-minute")


@app.task(name="core.celery_smoke")
def celery_smoke() -> str:
    return "ok"
