from django.conf import settings
from django.db import models


class ShiftSubmissionReceipt(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    operation = models.CharField(max_length=64)
    key = models.CharField(max_length=255)
    fingerprint = models.CharField(max_length=64, default="")
    shift = models.ForeignKey("client_profile.Shift", null=True, on_delete=models.SET_NULL)
    offer = models.ForeignKey("client_profile.ShiftCounterOffer", null=True, on_delete=models.SET_NULL)
    original_shift_id = models.BigIntegerField(null=True)
    response_body = models.JSONField(null=True)
    response_status = models.PositiveSmallIntegerField(null=True)
    response_headers = models.JSONField(default=dict)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["user", "operation", "key"], name="shift_submission_user_operation_key")]
