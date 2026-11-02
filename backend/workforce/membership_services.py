"""Workforce-owned writes and reads used by membership application adapters."""
from workforce import employment_engagement_service
from workforce.models import EmploymentEngagement


def create_engagement(membership, data, *, effective_from, effective_to, actor):
    payload = employment_engagement_service.build_employment_engagement_payload(
        data, membership, effective_from=effective_from, effective_to=effective_to,
    )
    engagement = EmploymentEngagement(
        membership=membership, effective_from=effective_from, effective_to=effective_to,
        created_by=actor, updated_by=actor, **payload,
    )
    engagement.full_clean()
    engagement.save()
    return engagement


def latest_engagement(membership_id):
    return (EmploymentEngagement.objects.filter(membership_id=membership_id)
            .order_by('-effective_from', '-id').first())
