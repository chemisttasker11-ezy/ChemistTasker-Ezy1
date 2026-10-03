from django.test import SimpleTestCase

from client_profile.models import (
    LeaveRequest,
    Shift,
    ShiftCounterOffer,
    ShiftCounterOfferSlot,
    ShiftDescriptionTemplate,
    ShiftInterest,
    ShiftOffer,
    ShiftProfileAccessAudit,
    ShiftRejection,
    ShiftSaved,
    ShiftSlot,
    ShiftSlotAssignment,
    WorkerShiftRequest,
)
from core.client_profile_api_urls import router


class ShiftDomainExtractionContractTests(SimpleTestCase):
    """Contracts that must survive moving shift ownership out of client_profile."""

    expected_tables = {
        Shift: "client_profile_shift",
        ShiftDescriptionTemplate: "client_profile_shiftdescriptiontemplate",
        ShiftSlot: "client_profile_shiftslot",
        ShiftInterest: "client_profile_shiftinterest",
        ShiftSlotAssignment: "client_profile_shiftslotassignment",
        ShiftProfileAccessAudit: "client_profile_shiftprofileaccessaudit",
        ShiftRejection: "client_profile_shiftrejection",
        ShiftCounterOffer: "client_profile_shiftcounteroffer",
        ShiftOffer: "client_profile_shiftoffer",
        ShiftCounterOfferSlot: "client_profile_shiftcounterofferslot",
        ShiftSaved: "client_profile_shiftsaved",
        LeaveRequest: "client_profile_leaverequest",
        WorkerShiftRequest: "client_profile_workershiftrequest",
    }

    expected_router_contracts = {
        "community-shifts": "community-shifts",
        "public-shifts": "public-shifts",
        "shift-description-templates": "shift-description-template",
        "shifts/active": "active-shifts",
        "shifts/confirmed": "confirmed-shifts",
        "shifts/history": "history-shifts",
        "shifts": "shift",
        "shift-interests": "shift-interests",
        "shift-rejections": "shift-rejections",
        "shift-saved": "shift-saved",
        "shift-offers": "shift-offers",
        "my-confirmed-shifts": "my-confirmed-shifts",
        "my-history-shifts": "my-history-shifts",
        "leave-requests": "leaverequest",
        "worker-shift-requests": "worker-shift-requests",
    }

    def test_physical_shift_tables_are_stable(self):
        for model, expected_table in self.expected_tables.items():
            self.assertEqual(model._meta.db_table, expected_table)

    def test_implicit_shift_m2m_tables_are_stable(self):
        self.assertEqual(
            Shift._meta.get_field("revealed_users").remote_field.through._meta.db_table,
            "client_profile_shift_revealed_users",
        )
        self.assertEqual(
            Shift._meta.get_field("interested_users").remote_field.through._meta.db_table,
            "client_profile_shift_interested_users",
        )

    def test_public_shift_router_contract_is_stable(self):
        actual = {
            prefix: basename
            for prefix, _viewset, basename in router.registry
            if prefix in self.expected_router_contracts
        }
        self.assertEqual(actual, self.expected_router_contracts)
