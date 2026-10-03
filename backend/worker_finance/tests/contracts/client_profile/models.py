"""Fields consumed from the existing canonical models; kept deliberately explicit."""
from datetime import date
from django.conf import settings
from django.db import models


class Pharmacy(models.Model):
    name = models.CharField(max_length=255)


class ShiftSlotAssignment(models.Model):
    slot_date = models.DateField(default=date.today)


class PharmacistOnboarding(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)


class OtherStaffOnboarding(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
