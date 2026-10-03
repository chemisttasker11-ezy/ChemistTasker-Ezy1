from django.test import SimpleTestCase

from client_profile import models as legacy_models
from client_profile.models import shifts as legacy_shift_module
from shifts import models as shift_models


class ShiftModelCodeOwnershipTests(SimpleTestCase):
    model_names = (
        "Shift",
        "ShiftDescriptionTemplate",
        "ShiftSlot",
        "ShiftInterest",
        "ShiftSlotAssignment",
        "ShiftProfileAccessAudit",
        "ShiftRejection",
        "ShiftCounterOffer",
        "ShiftOffer",
        "ShiftCounterOfferSlot",
        "ShiftSaved",
        "LeaveRequest",
        "WorkerShiftRequest",
    )

    def test_shift_model_source_is_owned_by_shifts_module(self):
        for name in self.model_names:
            model = getattr(shift_models, name)
            self.assertEqual(model.__module__, "shifts.models")
            self.assertEqual(model._meta.app_label, "client_profile")
            self.assertIs(getattr(legacy_models, name), model)
            self.assertIs(getattr(legacy_shift_module, name), model)

    def test_no_app_label_migration_has_happened_in_code_ownership_phase(self):
        self.assertEqual(shift_models.Shift._meta.label, "client_profile.Shift")
        self.assertEqual(
            shift_models.ShiftSlotAssignment._meta.label,
            "client_profile.ShiftSlotAssignment",
        )
