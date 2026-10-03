"""Submitting an onboarding for review: reading the submit flag of a tab save and recording the first submission
(which e-mails the admins once)."""


def submit_requested(initial_data) -> bool:
    """CURRENT BEHAVIOUR kept from the serializers: the raw request value's truthiness."""
    return bool(initial_data.get('submitted_for_verification'))


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
