from django.test import SimpleTestCase

from attendance import views as attendance_views
from invoicing import services as invoicing_services
from memberships import models as membership_models
from organizations import models as organization_models
from shifts import models as shift_models
from team_calendar import tasks as calendar_tasks


class OperationalModelImportOwnershipTests(SimpleTestCase):
    def test_attendance_uses_promoted_model_owners(self):
        self.assertIs(attendance_views.Membership, membership_models.Membership)
        self.assertIs(attendance_views.Pharmacy, organization_models.Pharmacy)
        self.assertIs(attendance_views.Shift, shift_models.Shift)

    def test_invoicing_uses_promoted_model_owners(self):
        self.assertIs(invoicing_services.Pharmacy, organization_models.Pharmacy)
        self.assertIs(invoicing_services.ShiftSlotAssignment, shift_models.ShiftSlotAssignment)

    def test_calendar_tasks_use_promoted_model_owners(self):
        self.assertIs(calendar_tasks.Membership, membership_models.Membership)
        self.assertIs(calendar_tasks.Pharmacy, organization_models.Pharmacy)
        self.assertIs(calendar_tasks.ShiftSlotAssignment, shift_models.ShiftSlotAssignment)
