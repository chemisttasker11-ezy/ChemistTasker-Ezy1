"""Shared runtime support of the verification tasks.

Configuration (provider endpoints and keys) comes from django.conf.settings, which owns the environment. Importing
this module has no side effects: it neither reads environment files nor creates directories.
"""
import logging
import time

from django.core.exceptions import ObjectDoesNotExist

logger = logging.getLogger(__name__)


def fetch_instance_with_retries(model, pk, max_retries=10, sleep_sec=0.4):
    for i in range(max_retries):
        try:
            return model.objects.get(pk=pk)
        except ObjectDoesNotExist:
            logger.warning("[fetch_instance_with_retries] Not found pk=%s, try %s/%s", pk, i + 1, max_retries)
            time.sleep(sleep_sec)
    raise model.DoesNotExist(f"Object with pk={pk} not found after {max_retries} tries")
