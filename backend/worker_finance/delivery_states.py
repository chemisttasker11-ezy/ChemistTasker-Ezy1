"""Publication is distinct from confirmed email-provider acceptance."""

PUBLISHED_DELIVERY_STATUSES = (
    "sent", "legacy_queued", "legacy_sending", "legacy_uncertain", "legacy_failed",
)
RETRYABLE_DELIVERY_STATUSES = ("failed", "legacy_failed")
LEGACY_READY_STATUSES = ("preparing", "queue_uncertain", "legacy_queued")


def public_delivery_status(status):
    return {
        "queue_uncertain": "uncertain",
        "legacy_sending": "sending",
        "legacy_uncertain": "uncertain",
        "legacy_failed": "failed",
    }.get(status, status)
