from datetime import datetime
from core.integrations.abr import _parse_abn_html_fields, abn_lookup  # noqa: F401  (historical public import path)
from memberships.models import Membership
from memberships.tasks import (  # noqa: F401  (deployed task objects)
    email_membership_application_approved,
    email_membership_application_rejected,
    email_membership_application_review_updated,
    email_membership_application_submitted,
)
from organizations.models import Pharmacy
from onboarding.tasks import (  # noqa: F401  (deployed task objects)
    final_evaluation,
    run_all_verifications,
    run_referee_reminder,
    verify_abn_task,
    verify_ahpra_task,
    verify_filefield_task,
)
from shifts.tasks import send_shift_reminders  # noqa: F401  (deployed task object)
from onboarding.verification.reminders import (  # noqa: F401  (historical public import path)
    cancel_all_referee_reminders,
    cancel_referee_reminder,
    schedule_referee_reminder,
)
import logging
import re
from django.contrib.auth import get_user_model


logger = logging.getLogger(__name__)

User = get_user_model()


