"""Characterization of calendar events, work notes and the feed
(/calendar-events/, /work-notes/, /calendar-feed/). Fixed dates only: no test depends on today."""
from datetime import date

from django.test import TestCase

from team_calendar.models import CalendarEvent, WorkNote, WorkNoteAssignee, WorkNoteCompletion
from client_profile.characterization_support import (
    BASE, client_for, make_owner_with_pharmacy, make_staff_member, make_user,
)

EVENTS = BASE + "calendar-events/"
NOTES = BASE + "work-notes/"
FEED = BASE + "calendar-feed/"


class CalendarBase(TestCase):
    def setUp(self):
        self.owner, self.pharmacy = make_owner_with_pharmacy()
        self.staff, self.staff_membership = make_staff_member(self.pharmacy)
        self.stranger = make_user("PHARMACIST")

    def event(self, **kw):
        data = dict(pharmacy=self.pharmacy, title="Stocktake", date=date(2026, 3, 10), created_by=self.owner)
        data.update(kw)
        return CalendarEvent.objects.create(**data)

    @staticmethod
    def rows(res):
        body = res.json()
        return body["results"] if isinstance(body, dict) and "results" in body else body


class CalendarAuthTests(CalendarBase):
    def test_all_three_endpoints_require_authentication(self):
        c = client_for()
        for url in (EVENTS, NOTES, FEED):
            self.assertIn(c.get(url).status_code, (401, 403), url)


class CalendarEventTests(CalendarBase):
    PAYLOAD = {"title": "Team meeting", "date": "2026-03-11"}

    def test_owner_creates_manual_event_stamped_with_creator(self):
        res = client_for(self.owner).post(EVENTS, {**self.PAYLOAD, "pharmacy": self.pharmacy.id}, format="json")
        self.assertEqual(res.status_code, 201)
        evt = CalendarEvent.objects.get()
        self.assertEqual((evt.created_by, evt.source), (self.owner, "manual"))
        self.assertFalse(res.json()["is_read_only"])

    def test_client_cannot_choose_source(self):
        client_for(self.owner).post(
            EVENTS, {**self.PAYLOAD, "pharmacy": self.pharmacy.id, "source": "birthday"}, format="json")
        self.assertEqual(CalendarEvent.objects.get().source, "manual")

    def test_ordinary_staff_member_cannot_create(self):
        res = client_for(self.staff).post(EVENTS, {**self.PAYLOAD, "pharmacy": self.pharmacy.id}, format="json")
        self.assertEqual(res.status_code, 403)

    def test_create_needs_pharmacy_or_organization(self):
        res = client_for(self.owner).post(EVENTS, self.PAYLOAD, format="json")
        self.assertEqual(res.status_code, 400)
        self.assertIn("pharmacy", res.json())

    def test_list_scoping(self):
        self.event()
        self.assertEqual(len(self.rows(client_for(self.owner).get(EVENTS))), 1)
        self.assertEqual(len(self.rows(client_for(self.staff).get(EVENTS))), 1)
        self.assertEqual(self.rows(client_for(self.stranger).get(EVENTS)), [])
        self.assertEqual(
            self.rows(client_for(self.stranger).get(EVENTS + f"?pharmacy_id={self.pharmacy.id}")), [])

    def test_birthdays_hidden_from_non_managers_when_filtering_by_pharmacy(self):
        self.event(title="bday", source="birthday")
        self.event(title="manual")
        q = f"?pharmacy_id={self.pharmacy.id}"
        self.assertEqual(sorted(r["title"] for r in self.rows(client_for(self.owner).get(EVENTS + q))), ["bday", "manual"])
        self.assertEqual([r["title"] for r in self.rows(client_for(self.staff).get(EVENTS + q))], ["manual"])

    def test_date_and_source_filters(self):
        self.event(title="mar", date=date(2026, 3, 10))
        self.event(title="apr", date=date(2026, 4, 10))
        got = self.rows(client_for(self.owner).get(EVENTS + "?date_from=2026-04-01&date_to=2026-04-30"))
        self.assertEqual([r["title"] for r in got], ["apr"])

    def test_auto_generated_events_cannot_be_edited_or_deleted(self):
        evt = self.event(source="birthday")
        c = client_for(self.owner)
        self.assertEqual(c.patch(f"{EVENTS}{evt.id}/", {"title": "x"}, format="json").status_code, 403)
        self.assertEqual(c.delete(f"{EVENTS}{evt.id}/").status_code, 403)
        self.assertTrue(CalendarEvent.objects.filter(pk=evt.pk).exists())

    def test_manual_event_update_and_delete_by_manager_only(self):
        evt = self.event()
        self.assertEqual(client_for(self.staff).patch(f"{EVENTS}{evt.id}/", {"title": "x"}, format="json").status_code, 403)
        self.assertEqual(client_for(self.staff).delete(f"{EVENTS}{evt.id}/").status_code, 403)
        self.assertEqual(client_for(self.owner).patch(f"{EVENTS}{evt.id}/", {"title": "new"}, format="json").status_code, 200)
        self.assertEqual(client_for(self.owner).delete(f"{EVENTS}{evt.id}/").status_code, 204)


class WorkNoteTests(CalendarBase):
    PAYLOAD = {"title": "Restock fridge", "date": "2026-03-12"}

    def note(self, **kw):
        data = dict(pharmacy=self.pharmacy, title="n", date=date(2026, 3, 12), created_by=self.owner)
        data.update(kw)
        return WorkNote.objects.create(**data)

    def test_any_active_member_can_create_a_note_but_not_a_stranger(self):
        ok = client_for(self.staff).post(NOTES, {**self.PAYLOAD, "pharmacy": self.pharmacy.id}, format="json")
        self.assertEqual(ok.status_code, 201)
        self.assertEqual(WorkNote.objects.get().created_by, self.staff)
        no = client_for(self.stranger).post(NOTES, {**self.PAYLOAD, "pharmacy": self.pharmacy.id}, format="json")
        self.assertEqual(no.status_code, 403)

    def test_create_requires_pharmacy(self):
        res = client_for(self.owner).post(NOTES, self.PAYLOAD, format="json")
        self.assertEqual(res.status_code, 400)
        self.assertIn("pharmacy", res.json())

    def test_assignees_must_belong_to_the_pharmacy(self):
        other_owner, other_pharmacy = make_owner_with_pharmacy("Other")
        _, foreign = make_staff_member(other_pharmacy)
        res = client_for(self.owner).post(
            NOTES, {**self.PAYLOAD, "pharmacy": self.pharmacy.id, "assignee_membership_ids": [foreign.id]}, format="json")
        self.assertEqual(res.status_code, 400)
        ok = client_for(self.owner).post(
            NOTES, {**self.PAYLOAD, "pharmacy": self.pharmacy.id, "assignee_membership_ids": [self.staff_membership.id]},
            format="json")
        self.assertEqual(ok.status_code, 201)
        self.assertEqual(WorkNoteAssignee.objects.get().membership, self.staff_membership)

    def test_list_scoping_and_assigned_to_me_filter(self):
        mine = self.note(title="mine")
        WorkNoteAssignee.objects.create(work_note=mine, membership=self.staff_membership)
        self.note(title="general", is_general=True)
        self.note(title="not mine")
        self.assertEqual(len(self.rows(client_for(self.staff).get(NOTES))), 3)
        got = self.rows(client_for(self.staff).get(NOTES + "?assigned_to_me=true"))
        self.assertEqual(sorted(r["title"] for r in got), ["general", "mine"])
        self.assertEqual(self.rows(client_for(self.stranger).get(NOTES)), [])

    def test_mark_done_rules(self):
        unassigned = self.note(title="unassigned")
        general = self.note(title="general", is_general=True)
        assigned = self.note(title="assigned")
        WorkNoteAssignee.objects.create(work_note=assigned, membership=self.staff_membership)
        c = client_for(self.staff)
        self.assertEqual(c.post(f"{NOTES}{unassigned.id}/mark_done/").status_code, 403)
        self.assertEqual(c.post(f"{NOTES}{general.id}/mark_done/").status_code, 200)
        self.assertEqual(c.post(f"{NOTES}{assigned.id}/mark_done/").status_code, 200)
        self.assertEqual(WorkNoteCompletion.objects.count(), 2)
        # the pharmacy owner can manage the calendar but has no Membership row, so marking is still refused
        self.assertEqual(client_for(self.owner).post(f"{NOTES}{unassigned.id}/mark_done/").status_code, 403)

    def test_mark_done_needs_active_membership(self):
        n = self.note(is_general=True)
        self.assertEqual(client_for(self.stranger).post(f"{NOTES}{n.id}/mark_done/").status_code, 404)

    def test_mark_done_is_per_occurrence_and_mark_open_reverses_it(self):
        n = self.note(is_general=True)
        c = client_for(self.staff)
        c.post(f"{NOTES}{n.id}/mark_done/", {"occurrence_date": "2026-03-14"}, format="json")
        c.post(f"{NOTES}{n.id}/mark_done/", {"occurrence_date": "2026-03-14"}, format="json")
        self.assertEqual(WorkNoteCompletion.objects.get().occurrence_date, date(2026, 3, 14))
        c.post(f"{NOTES}{n.id}/mark_open/", {"occurrence_date": "2026-03-14"}, format="json")
        self.assertEqual(WorkNoteCompletion.objects.count(), 0)

    def test_bad_occurrence_date_is_400(self):
        n = self.note(is_general=True)
        res = client_for(self.staff).post(f"{NOTES}{n.id}/mark_done/", {"occurrence_date": "13/03/2026"}, format="json")
        self.assertEqual(res.status_code, 400)


class CalendarFeedTests(CalendarBase):
    def test_feed_shape_and_default_scope(self):
        CalendarEvent.objects.create(pharmacy=self.pharmacy, title="e", date=date(2026, 3, 10))
        WorkNote.objects.create(pharmacy=self.pharmacy, title="n", date=date(2026, 3, 10), is_general=True)
        res = client_for(self.owner).get(FEED + "?date_from=2026-03-01&date_to=2026-03-31")
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertEqual(set(body), {"events", "work_notes", "date_from", "date_to", "pharmacy_id", "organization_id"})
        self.assertEqual((len(body["events"]), len(body["work_notes"])), (1, 1))
        self.assertEqual((body["date_from"], body["date_to"]), ("2026-03-01", "2026-03-31"))
        self.assertIs(body["events"][0]["is_occurrence"], False)

    def test_feed_outside_range_is_empty(self):
        CalendarEvent.objects.create(pharmacy=self.pharmacy, title="e", date=date(2026, 3, 10))
        body = client_for(self.owner).get(FEED + "?date_from=2026-05-01&date_to=2026-05-31").json()
        self.assertEqual(body["events"], [])

    def test_inaccessible_pharmacy_is_403_with_error_body(self):
        res = client_for(self.stranger).get(FEED + f"?pharmacy_id={self.pharmacy.id}")
        self.assertEqual(res.status_code, 403)
        self.assertEqual(res.json(), {"error": "Access denied"})

    def test_recurring_event_expands_into_occurrences_with_composite_ids(self):
        evt = CalendarEvent.objects.create(
            pharmacy=self.pharmacy, title="daily", date=date(2026, 3, 10),
            recurrence={"freq": "DAILY", "interval": 1, "until_date": "2026-03-12"})
        body = client_for(self.owner).get(FEED + "?date_from=2026-03-01&date_to=2026-03-31").json()
        ids = [e["id"] for e in body["events"]]
        self.assertEqual(ids, [f"{evt.id}-2026-03-10", f"{evt.id}-2026-03-11", f"{evt.id}-2026-03-12"])
        self.assertTrue(all(e["is_occurrence"] and e["series_id"] == evt.id for e in body["events"]))

    def test_work_note_status_in_feed_reflects_callers_own_completion(self):
        note = WorkNote.objects.create(pharmacy=self.pharmacy, title="n", date=date(2026, 3, 10), is_general=True)
        WorkNoteCompletion.objects.create(
            work_note=note, membership=self.staff_membership, occurrence_date=date(2026, 3, 10), completed_by=self.staff)
        url = FEED + "?date_from=2026-03-01&date_to=2026-03-31"
        self.assertEqual(client_for(self.staff).get(url).json()["work_notes"][0]["status"], "done")
        # the owner has no Membership row, so the stored status (open) is returned untouched
        self.assertEqual(client_for(self.owner).get(url).json()["work_notes"][0]["status"], "open")

    def test_managers_see_who_completed_a_note_ordinary_staff_do_not(self):
        note = WorkNote.objects.create(pharmacy=self.pharmacy, title="n", date=date(2026, 3, 10), is_general=True)
        WorkNoteCompletion.objects.create(
            work_note=note, membership=self.staff_membership, occurrence_date=date(2026, 3, 10), completed_by=self.staff)
        url = FEED + "?date_from=2026-03-01&date_to=2026-03-31"
        self.assertEqual(len(client_for(self.owner).get(url).json()["work_notes"][0]["completed_by"]), 1)
        self.assertNotIn("completed_by", client_for(self.staff).get(url).json()["work_notes"][0])

    def test_malformed_dates_and_ids_are_rejected(self):
        c = client_for(self.owner)
        for query, field, message in (
            ("date_from=garbage", "date_from", "Invalid date format. Use YYYY-MM-DD."),
            ("date_to=2026-02-30", "date_to", "Invalid date format. Use YYYY-MM-DD."),
            ("pharmacy_id=abc", "pharmacy_id", "A valid integer is required."),
            ("organization_id=abc", "organization_id", "A valid integer is required."),
        ):
            with self.subTest(query=query):
                res = c.get(f"{FEED}?{query}")
                self.assertEqual(res.status_code, 400)
                self.assertEqual(res.json(), {field: message})


class CalendarQueryParameterTests(CalendarBase):
    """The event and work-note lists parse the same parameters as the feed."""

    def test_malformed_dates_and_ids_are_rejected_by_both_lists(self):
        c = client_for(self.owner)
        for url in (EVENTS, NOTES):
            for query, field, message in (
                ("date_from=garbage", "date_from", "Invalid date format. Use YYYY-MM-DD."),
                ("date_to=2026-13-01", "date_to", "Invalid date format. Use YYYY-MM-DD."),
                ("pharmacy_id=abc", "pharmacy_id", "A valid integer is required."),
            ):
                with self.subTest(url=url, query=query):
                    res = c.get(f"{url}?{query}")
                    self.assertEqual(res.status_code, 400)
                    self.assertEqual(res.json(), {field: message})
        res = c.get(EVENTS + "?organization_id=abc")
        self.assertEqual((res.status_code, res.json()), (400, {"organization_id": "A valid integer is required."}))

    def test_valid_and_empty_parameters_filter_as_before(self):
        march, april = self.event(date=date(2026, 3, 10)), self.event(date=date(2026, 4, 10))
        c = client_for(self.owner)
        ids = lambda url: [row["id"] for row in self.rows(c.get(url))]  # noqa: E731
        self.assertEqual(ids(f"{EVENTS}?pharmacy_id={self.pharmacy.id}&date_from=2026-04-01"), [april.id])
        self.assertEqual(ids(EVENTS + "?date_from=2026-4-1"), [april.id])   # the ORM's DateField form keeps working
        self.assertEqual(ids(EVENTS + "?date_to=2026-03-31&pharmacy_id="), [march.id])   # an empty id is no filter
