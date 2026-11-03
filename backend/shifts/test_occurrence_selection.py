"""Characterize shared selection while keeping each caller's fallback policy."""
from datetime import date, time, timedelta
from types import SimpleNamespace
from unittest import mock

from django.test import SimpleTestCase

from billing.checkout_reservations import occurrence_keys
from shifts.payroll import activation_work_dates


class OfferOccurrenceSelectionTests(SimpleTestCase):
    def setUp(self):
        self.first, self.second = date(2026, 11, 2), date(2026, 11, 9)
        self.slot = SimpleNamespace(pk=11, id=11, date=self.first)
        self.other = SimpleNamespace(pk=12, id=12, date=self.first)
        self.rows = [{'slot': slot, 'date': day}
                     for slot in (self.slot, self.other) for day in (self.first, self.second)]
        self.offer = SimpleNamespace(
            shift_id=7, shift=object(), slot_id=11, offered_slot_date=None,
            engagement_terms_snapshot={},
        )

    def selected(self, *, rows=None, assignments=(), include_pending=True):
        rows = self.rows if rows is None else rows
        with mock.patch('billing.checkout_reservations.expand_shift_slots', return_value=rows), \
                mock.patch('shifts.payroll.expand_shift_slots', return_value=rows):
            return occurrence_keys(self.offer), activation_work_dates(
                self.offer, assignments, include_pending=include_pending,
            )

    def test_slot_offer_selects_all_its_recurring_dates(self):
        keys, dates = self.selected()
        self.assertEqual(keys, {'7:11:2026-11-02', '7:11:2026-11-09'})
        self.assertEqual(dates, (self.first, self.second))

    def test_accepted_subset_and_offered_date_both_narrow_selection(self):
        self.offer.engagement_terms_snapshot = {'occurrences': [
            {'slot_id': '11', 'date': str(self.second)},
            {'slot_id': '12', 'date': str(self.first)},
        ]}
        self.assertEqual(self.selected(), ({'7:11:2026-11-09'}, (self.second,)))
        self.offer.offered_slot_date = self.first
        self.assertEqual(self.selected(), ({'7:whole'}, ()))

    def test_whole_shift_ignores_the_snapshot_first_date_shortcut(self):
        self.offer.slot_id = None
        self.offer.engagement_terms_snapshot = {
            'occurrences': [{'slot_id': '11', 'date': str(self.first)}],
        }
        keys, dates = self.selected()
        self.assertEqual(keys, {f'7:{slot}:{day}' for slot in (11, 12)
                               for day in (self.first, self.second)})
        self.assertEqual(dates, (self.first, self.second))

    def test_no_slot_checkout_fallback_does_not_invent_payroll_dates(self):
        self.assertEqual(self.selected(rows=[]), ({'7:whole'}, ()))

    def test_payroll_retains_existing_assignment_dates_and_pending_switch(self):
        earlier = date(2026, 10, 26)
        assignments = [SimpleNamespace(slot_date=earlier, slot=self.slot),
                       SimpleNamespace(slot_date=None, slot=self.slot)]
        self.assertEqual(self.selected(assignments=assignments)[1],
                         (earlier, self.first, self.second))
        self.assertEqual(self.selected(assignments=assignments, include_pending=False)[1],
                         (earlier, self.first))

    def test_assignment_dates_match_ordinary_overnight_boundaries(self):
        for day, start, end, overnight in (
            (self.first, time(9), time(17), False),
            (self.first, time(22), time(6), True),
            (self.first, time(22), time(0), True),
            (date(2026, 11, 30), time(22), time(6), True),
            (date(2026, 12, 31), time(22), time(6), True),
        ):
            with self.subTest(day=day, start=start, end=end):
                self.slot.start_time, self.slot.end_time = start, end
                assignment = SimpleNamespace(slot_date=day, slot=self.slot)
                dates = activation_work_dates(self.offer, [assignment], include_pending=False)
                expected = (day, day + timedelta(days=1)) if overnight else (day,)
                self.assertEqual(dates, expected)

    def test_selected_overnight_pending_dates_do_not_include_unselected_recurrence(self):
        self.slot.start_time, self.slot.end_time = time(22), time(6)
        self.offer.engagement_terms_snapshot = {'occurrences': [
            {'slot_id': '11', 'date': str(self.second)},
        ]}
        self.assertEqual(self.selected()[1], (self.second, self.second + timedelta(days=1)))
