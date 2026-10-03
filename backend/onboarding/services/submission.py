"""Submitting an onboarding for review: reading the submit flag of a tab save and recording the first submission
(which e-mails the admins once)."""
from rest_framework.fields import BooleanField


def submit_requested(initial_data) -> bool:
    """Whether a tab save asks for submission. Multipart forms send strings, so the flag is read with DRF's boolean
    vocabulary ("false", "0", "no", ... are False); unknown values keep their truthiness."""
    raw = initial_data.get('submitted_for_verification')
    if raw in (None, ''):
        return False
    if raw in BooleanField.TRUE_VALUES:
        return True
    if raw in BooleanField.FALSE_VALUES:
        return False
    return bool(raw)


def record_first_submission(instance, *, tab: str, submit: bool) -> None:
    """The first submission from the basic tab marks the onboarding as submitted and e-mails the admins once."""
    first_submit = submit and (tab == 'basic') and not bool(getattr(instance, 'submitted_for_verification', False))
    if first_submit:
        # Persist first submission so we don't email again
        instance.submitted_for_verification = True
        instance.save(update_fields=['submitted_for_verification'])

        # Local import avoids circular dependencies
        from onboarding.emails import notify_superuser_on_onboarding
        try:
            notify_superuser_on_onboarding(instance)
        except Exception:
            # Never block user flow on email issues
            pass
