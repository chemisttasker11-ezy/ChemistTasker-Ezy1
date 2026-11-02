"""Pharmacy admin levels and capability facts, independent of model ownership."""
from django.db import models


class PharmacyAdminPolicy:
    class AdminLevel(models.TextChoices):
        OWNER = "OWNER", "Owner"
        MANAGER = "MANAGER", "Manager"
        ROSTER_MANAGER = "ROSTER_MANAGER", "Roster Manager"
        COMMUNICATION_MANAGER = "COMMUNICATION_MANAGER", "Communication Manager"

    CAPABILITY_MANAGE_ADMINS = "MANAGE_ADMINS"
    CAPABILITY_MANAGE_STAFF = "MANAGE_STAFF"
    CAPABILITY_MANAGE_ROSTER = "MANAGE_ROSTER"
    CAPABILITY_MANAGE_COMMS = "MANAGE_COMMUNICATIONS"

    CAPABILITY_MATRIX = {
        AdminLevel.OWNER: {
            CAPABILITY_MANAGE_ADMINS,
            CAPABILITY_MANAGE_STAFF,
            CAPABILITY_MANAGE_ROSTER,
            CAPABILITY_MANAGE_COMMS,
        },
        AdminLevel.MANAGER: {
            CAPABILITY_MANAGE_ADMINS,
            CAPABILITY_MANAGE_STAFF,
            CAPABILITY_MANAGE_ROSTER,
            CAPABILITY_MANAGE_COMMS,
        },
        AdminLevel.ROSTER_MANAGER: {
            CAPABILITY_MANAGE_ROSTER,
            CAPABILITY_MANAGE_COMMS,
        },
        AdminLevel.COMMUNICATION_MANAGER: {
            CAPABILITY_MANAGE_COMMS,
        },
    }


# Historical enum/pickle identity remains on the public PharmacyAdmin model.
PharmacyAdminPolicy.AdminLevel.__module__ = 'organizations.models'
PharmacyAdminPolicy.AdminLevel.__qualname__ = 'PharmacyAdmin.AdminLevel'
