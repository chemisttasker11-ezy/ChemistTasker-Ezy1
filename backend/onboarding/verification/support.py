"""Shared runtime support of the verification tasks: diagnostic output files and delayed object reads.

Configuration (provider endpoints and keys) comes from django.conf.settings, which owns the environment.
"""
import logging
import os
import time
from pathlib import Path

from django.conf import settings
from django.core.exceptions import ObjectDoesNotExist
from django.utils import timezone

logger = logging.getLogger(__name__)

BASE_DIR = Path(getattr(settings, "BASE_DIR", Path(__file__).resolve().parent.parent.parent))

# ==== OUTPUTS DIRECTORY ====
OUTPUT_DIR = BASE_DIR / "verification_outputs"
os.makedirs(OUTPUT_DIR, exist_ok=True)
logger.info(f"[SETUP] Output files will be saved to {OUTPUT_DIR}")


def fetch_instance_with_retries(model, pk, max_retries=10, sleep_sec=0.4):
    for i in range(max_retries):
        try:
            return model.objects.get(pk=pk)
        except ObjectDoesNotExist:
            logger.warning("[fetch_instance_with_retries] Not found pk=%s, try %s/%s", pk, i + 1, max_retries)
            time.sleep(sleep_sec)
    raise model.DoesNotExist(f"Object with pk={pk} not found after {max_retries} tries")


def save_output_file(task_name, object_pk, extension="json"):
    out_path = OUTPUT_DIR / f"{task_name}_{object_pk}_{timezone.now().strftime('%Y%m%d_%H%M%S')}.{extension}"
    logger.info(f"[save_output_file] Will write output to: {out_path}")
    return str(out_path)
