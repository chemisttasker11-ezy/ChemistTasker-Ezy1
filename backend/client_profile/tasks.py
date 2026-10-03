"""Compatibility facade for the deployed `client_profile.tasks.*` Celery task names.

Workers, the beat schedule, CELERY_TASK_ROUTES and queued messages address these tasks by their historical names.
The implementations live in their owning apps and register themselves under those names:

* onboarding.tasks: verify_filefield_task, verify_abn_task, verify_ahpra_task, run_all_verifications,
  final_evaluation, run_referee_reminder
* shifts.tasks: send_shift_reminders
* memberships.tasks: email_membership_application_submitted, _review_updated, _approved, _rejected

This module registers nothing. It re-exports the task objects and keeps the historical import paths of the synchronous
ABR lookup (core.integrations.abr) and referee reminder functions (onboarding.verification.reminders). New code imports
from the owners. core/test_task_contracts.py pins the task names, signatures, queues and routes.
"""
from core.integrations.abr import _parse_abn_html_fields, abn_lookup  # noqa: F401
from memberships.tasks import (  # noqa: F401
    email_membership_application_approved,
    email_membership_application_rejected,
    email_membership_application_review_updated,
    email_membership_application_submitted,
)
from onboarding.tasks import (  # noqa: F401
    final_evaluation,
    run_all_verifications,
    run_referee_reminder,
    verify_abn_task,
    verify_ahpra_task,
    verify_filefield_task,
)
from onboarding.verification.reminders import (  # noqa: F401
    cancel_all_referee_reminders,
    cancel_referee_reminder,
    schedule_referee_reminder,
)
from shifts.tasks import send_shift_reminders  # noqa: F401

