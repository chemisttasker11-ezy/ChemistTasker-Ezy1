from datetime import date, time, timedelta

from django.test import TestCase

from client_profile.characterization_support import make_owner_with_pharmacy, make_user
from dashboards.views import _dashboard_upcoming_stats, _future_shift_filter, _worker_upcoming_activity
from shifts.models import Shift, ShiftInterest, ShiftSlot, ShiftSlotAssignment


class DashboardOvernightSlotTests(TestCase):
    """A slot ending at or before its start ends the next day, so it stays upcoming until then."""

    def test_overnight_slot_counts_until_it_ends_the_next_morning(self):
        owner, pharmacy = make_owner_with_pharmacy("Overnight Dashboard Pharmacy")
        worker = make_user("PHARMACIST")
        work_date = date(2026, 1, 5)
        shifts = {}
        for label, start, end in (("overnight", time(22), time(2)), ("day", time(9), time(17))):
            shift = Shift.objects.create(pharmacy=pharmacy, created_by=owner, role_needed="PHARMACIST",
                                         employment_type="LOCUM", visibility="PLATFORM")
            slot = ShiftSlot.objects.create(shift=shift, date=work_date, start_time=start, end_time=end)
            ShiftSlotAssignment.objects.create(shift=shift, slot=slot, slot_date=work_date, user=worker)
            ShiftInterest.objects.create(shift=shift, slot=slot, user=worker)
            shifts[label] = shift
        next_day = work_date + timedelta(days=1)
        for today, clock, expected in ((work_date, time(5), {"overnight", "day"}), (work_date, time(21), {"overnight"}),
                                       (next_day, time(1), {"overnight"}), (next_day, time(2, 1), set())):
            with self.subTest(today=today, clock=clock):
                upcoming = Shift.objects.filter(_future_shift_filter(today, clock)).distinct()
                self.assertEqual({label for label, shift in shifts.items() if shift in upcoming}, expected)
                activity = _worker_upcoming_activity(worker, today, clock)
                for kind in ("assignments", "interests"):
                    labels = {label for label, shift in shifts.items()
                              if activity[kind].filter(shift=shift).exists()}
                    self.assertEqual(labels, expected, kind)
        stats = _dashboard_upcoming_stats(Shift.objects.filter(pharmacy=pharmacy), work_date, time(21))
        self.assertEqual(stats["today"], 1)
