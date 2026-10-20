"""Planner contracts through the real API; informal-note characterization stays unchanged."""
from concurrent.futures import ThreadPoolExecutor
from datetime import date, time, datetime, timedelta, timezone as dt_timezone
from threading import Barrier
from unittest.mock import patch
import uuid

from django.db import close_old_connections
from django.test import TestCase, TransactionTestCase, skipUnlessDBFeature
from django.utils import timezone

from client_profile.characterization_support import client_for, make_owner_with_pharmacy, make_staff_member, make_user
from memberships.models import Membership
from onboarding.models import PharmacistOnboarding
from organizations.access import managed_pharmacies, user_can_manage_pharmacy
from organizations.models import Organization, PharmacyAdmin
from shifts.models import Shift, ShiftSlot, ShiftSlotAssignment
from users.models import OrganizationMembership
from workforce.models import RosterPeriod
from team_calendar.models import WorkNote, WorkNoteAssignee, WorkNoteCompletion
from team_calendar.operations_models import SavedTask, OperationAudit
from team_calendar.operations_rules import copy_tasks
from team_calendar import tasks

BASE = '/api/v1/'
NOTES = BASE + 'work-notes/'
COPY = BASE + 'planner-copy/'
SAVED = BASE + 'saved-tasks/'
CONTEXT = BASE + 'operation-context/'
ROSTER = BASE + 'planner-roster-fill/'
DAY = date(2026, 10, 19)


class PlannerFixtures:
    def setUp(self):
        self.owner, self.pharmacy = make_owner_with_pharmacy()
        self.worker, self.membership = make_staff_member(self.pharmacy)
        self.other, self.other_membership = make_staff_member(self.pharmacy)
        self.foreign_owner, self.foreign_pharmacy = make_owner_with_pharmacy('Foreign pharmacy')
        self.stranger, self.foreign_membership = make_staff_member(self.foreign_pharmacy)
        self.client = client_for(self.owner)

    def payload(self, **changes):
        return {'pharmacy': self.pharmacy.pk, 'date': DAY.isoformat(), 'title': 'Open dispensary',
                'is_planner_task': True, **changes}

    def create(self, **changes):
        res = self.client.post(NOTES, self.payload(**changes), format='json')
        self.assertEqual(res.status_code, 201, res.content)
        return res.json()

    def copy(self, **changes):
        return self.client.post(COPY, {
            'pharmacy': self.pharmacy.pk, 'source_from': DAY.isoformat(), 'source_to': DAY.isoformat(),
            'day_offset': 1, 'request_key': str(uuid.uuid4()), **changes,
        }, format='json')

    def edit(self, note, **changes):
        return self.client.patch(NOTES + str(note['id']) + '/', {
            'updated_at': note['updated_at'], **changes,
        }, format='json')

    def complete(self, note, user=None, **changes):
        return client_for(user or self.worker).post(NOTES + str(note['id']) + '/mark_done/', {
            'updated_at': note['updated_at'], 'occurrence_date': DAY.isoformat(), **changes,
        }, format='json')

    def rows(self, response):
        self.assertEqual(response.status_code, 200, response.content)
        data = response.json()
        return data.get('results', []) if isinstance(data, dict) else data

    def roster(self, user=None, day=DAY, start=time(9), end=time(17), published=True):
        period = RosterPeriod.objects.create(
            pharmacy=self.pharmacy, week_start=day - timedelta(days=day.weekday()),
            created_by=self.owner, status='DRAFT',
        )
        shift = Shift.objects.create(pharmacy=self.pharmacy, created_by=self.owner,
                                     role_needed='ASSISTANT', employment_type='LOCUM')
        slot = ShiftSlot.objects.create(shift=shift, roster_period=period, date=day, start_time=start, end_time=end)
        ShiftSlotAssignment.objects.create(shift=shift, slot=slot, slot_date=day,
                                           user=user or self.worker, is_rostered=True)
        if published:
            period.status = 'PUBLISHED'
            period.published_at = timezone.now()
            period.save(update_fields=['status', 'published_at'])
        return period


class PlannerContracts(PlannerFixtures, TestCase):
    def test_direct_add_starts_unassigned_live_and_notifications_off(self):
        note = self.create()
        self.assertTrue(note['is_planner_task'])
        self.assertFalse(note['notify_on_shift_start'])
        self.assertEqual(note['assignees'], [])
        self.assertEqual(len(self.rows(self.client.get(NOTES))), 1)
        self.assertEqual(self.rows(client_for(self.worker).get(NOTES)), [])
        self.assertEqual(client_for(self.worker).get(CONTEXT).json(), {'pharmacies': []})

    def test_staff_cannot_create_edit_delete_or_convert_planner_tasks(self):
        staff = client_for(self.worker)
        self.assertEqual(staff.post(NOTES, self.payload(), format='json').status_code, 403)
        note = self.create(assignee_membership_ids=[self.membership.pk])
        url = NOTES + str(note['id']) + '/'
        for body in [{'title': 'x'}, {'is_planner_task': False}, {'pharmacy': self.foreign_pharmacy.pk}]:
            self.assertEqual(staff.patch(url, {**body, 'updated_at': note['updated_at']}, format='json').status_code, 403)
        self.assertEqual(staff.delete(url, {'updated_at': note['updated_at']}, format='json').status_code, 403)
        informal = staff.post(NOTES, self.payload(is_planner_task=False), format='json').json()
        self.assertEqual(staff.patch(NOTES + str(informal['id']) + '/', {
            'is_planner_task': True,
        }, format='json').status_code, 400)
        self.assertEqual(self.edit(note, is_planner_task=False).status_code, 400)
        self.assertEqual(self.edit(note, pharmacy=self.foreign_pharmacy.pk).status_code, 400)
        self.assertEqual(self.edit(note, is_general=True).status_code, 400)

    def test_staff_visibility_assigned_only_in_list_and_cross_year_feed(self):
        note = self.create(date='2026-12-31', assignee_membership_ids=[self.membership.pk],
                           recurrence={'freq': 'DAILY', 'until_date': '2027-01-03'})
        self.create(date='2027-01-01')
        query = f'?pharmacy_id={self.pharmacy.pk}&date_from=2026-12-28&date_to=2027-01-03'
        feed = client_for(self.worker).get(BASE + 'calendar-feed/' + query)
        rows = feed.json()['work_notes']
        self.assertEqual([r['date'] for r in rows], ['2026-12-31', '2027-01-01', '2027-01-02', '2027-01-03'])
        self.assertEqual(rows[-1]['series_id'], note['id'])
        self.assertEqual(rows[-1]['series_date'], '2026-12-31')
        self.assertEqual(rows[-1]['updated_at'], note['updated_at'])
        self.assertEqual(client_for(self.other).get(BASE + 'calendar-feed/' + query).json()['work_notes'], [])
        self.assertEqual(self.rows(client_for(self.stranger).get(NOTES)), [])
        self.assertEqual(client_for(self.stranger).get(NOTES + str(note['id']) + '/').status_code, 404)
        self.membership.status = Membership.Status.PENDING
        self.membership.save(update_fields=['status'])
        self.assertEqual(self.rows(client_for(self.worker).get(NOTES)), [])

    def test_org_regional_and_roster_admins_use_identical_list_and_write_scope(self):
        org = Organization.objects.create(name='Group')
        self.pharmacy.organization = org
        self.pharmacy.save(update_fields=['organization'])
        self.foreign_pharmacy.organization = org
        self.foreign_pharmacy.save(update_fields=['organization'])
        regional = make_user('ORG_ADMIN')
        scope = OrganizationMembership.objects.create(user=regional, organization=org, role='REGION_ADMIN')
        scope.pharmacies.add(self.pharmacy)
        admin = make_user('ORG_ADMIN')
        OrganizationMembership.objects.create(user=admin, organization=org, role='ORG_ADMIN')
        roster_admin = make_user()
        PharmacyAdmin.objects.create(user=roster_admin, pharmacy=self.pharmacy, admin_level='ROSTER_MANAGER')
        comms_admin = make_user()
        PharmacyAdmin.objects.create(user=comms_admin, pharmacy=self.pharmacy, admin_level='COMMUNICATION_MANAGER')
        for user, ids in [(regional, {self.pharmacy.pk}), (admin, {self.pharmacy.pk, self.foreign_pharmacy.pk}),
                          (roster_admin, {self.pharmacy.pk}), (comms_admin, set())]:
            with self.subTest(user=user.pk):
                client = client_for(user)
                self.assertEqual(set(managed_pharmacies(user).values_list('pk', flat=True)), ids)
                self.assertEqual({p['id'] for p in client.get(CONTEXT).json()['pharmacies']}, ids)
                for pharmacy in [self.pharmacy, self.foreign_pharmacy]:
                    allowed = pharmacy.pk in ids
                    self.assertEqual(user_can_manage_pharmacy(user, pharmacy), allowed)
                    res = client.post(NOTES, self.payload(pharmacy=pharmacy.pk), format='json')
                    self.assertEqual(res.status_code, 201 if allowed else 403, res.content)
                    if allowed:
                        self.assertIn(res.json()['id'], [r['id'] for r in self.rows(client.get(NOTES))])
                        token = res.json()['updated_at']
                        self.assertEqual(client.patch(NOTES + str(res.json()['id']) + '/', {
                            'title': 'Managed', 'updated_at': token,
                        }, format='json').status_code, 200)

    def test_invalid_members_and_times_rejected_without_writes(self):
        for ids in [[self.foreign_membership.pk], [self.membership.pk, self.membership.pk]]:
            self.assertEqual(self.client.post(NOTES, self.payload(assignee_membership_ids=ids), format='json').status_code, 400)
        self.membership.is_active = False
        self.membership.save(update_fields=['is_active'])
        self.assertEqual(self.client.post(NOTES, self.payload(assignee_membership_ids=[self.membership.pk]), format='json').status_code, 400)
        for status in [Membership.Status.PENDING, Membership.Status.REJECTED]:
            self.other_membership.status = status
            self.other_membership.save(update_fields=['status'])
            self.assertEqual(self.client.post(NOTES, self.payload(assignee_membership_ids=[self.other_membership.pk]), format='json').status_code, 400)
        self.assertEqual(self.client.post(NOTES, self.payload(start_time='23:00', end_time='01:00'), format='json').status_code, 400)
        self.assertFalse(WorkNote.objects.exists())

    def test_roster_fill_is_explicit_optional_and_accepts_empty_roster(self):
        payload = {'pharmacy': self.pharmacy.pk, 'date': DAY.isoformat()}
        self.assertEqual(self.client.post(ROSTER, payload, format='json').json()['assignee_membership_ids'], [])
        period = self.roster(published=False)
        self.assertEqual(self.client.post(ROSTER, payload, format='json').json()['assignee_membership_ids'], [])
        period.status = 'PUBLISHED'
        period.published_at = timezone.now()
        period.save(update_fields=['status', 'published_at'])
        self.assertEqual(self.client.post(ROSTER, payload, format='json').json()['assignee_membership_ids'], [self.membership.pk])
        self.assertEqual(self.client.post(ROSTER, {**payload, 'role': 'PHARMACIST'}, format='json').json()['assignee_membership_ids'], [])
        self.assertEqual(client_for(self.worker).post(ROSTER, payload, format='json').status_code, 403)
        self.assertEqual(self.create()['assignees'], [])

    def test_clinical_requires_registration_expiry_and_on_duty_including_overnight(self):
        pharmacist = make_user('PHARMACIST')
        member = Membership.objects.create(user=pharmacist, pharmacy=self.pharmacy,
                                           role='PHARMACIST', status=Membership.Status.ACCEPTED)
        data = self.payload(is_clinical=True, assignee_membership_ids=[member.pk])
        self.assertEqual(self.client.post(NOTES, data, format='json').status_code, 400)
        profile = PharmacistOnboarding.objects.create(user=pharmacist, ahpra_verified=True,
                                                       ahpra_expiry_date=date(2099, 1, 1))
        self.assertEqual(self.client.post(NOTES, data, format='json').status_code, 400)
        self.roster(user=pharmacist, day=DAY - timedelta(days=1), start=time(22), end=time(6))
        res = self.client.post(NOTES, {**data, 'start_time': '03:00', 'end_time': '04:00'}, format='json')
        self.assertEqual(res.status_code, 201, res.content)
        self.assertEqual(self.client.post(NOTES, {**data, 'start_time': '14:00', 'end_time': '15:00'}, format='json').status_code, 400)
        copied = self.copy(task_id=res.json()['id']).json()
        self.assertEqual(copied['dropped_assignees'][0]['membership_id'], member.pk)
        profile.ahpra_expiry_date = DAY - timedelta(days=1)
        profile.save(update_fields=['ahpra_expiry_date'])
        self.assertEqual(self.client.post(NOTES, {**data, 'start_time': '03:00', 'end_time': '04:00'}, format='json').status_code, 400)
        self.create(is_clinical=True)

    def test_copy_duplicate_day_week_and_retries_have_fresh_state(self):
        note = self.create(assignee_membership_ids=[self.membership.pk], notify_on_shift_start=True)
        WorkNoteAssignee.objects.filter(work_note_id=note['id']).update(notified_at=timezone.now())
        self.assertEqual(self.complete(note).status_code, 200)
        key = str(uuid.uuid4())
        first = self.copy(task_id=note['id'], day_offset=0, request_key=key)
        self.assertEqual(first.status_code, 200, first.content)
        replica = WorkNote.objects.get(pk=first.json()['task_ids'][0])
        self.assertEqual(replica.date, DAY)
        self.assertEqual(replica.status, 'open')
        self.assertFalse(replica.completions.exists())
        self.assertIsNone(replica.assignees.get().notified_at)
        self.assertEqual(replica.assignees.get().membership_id, self.membership.pk)
        self.assertIsNone(replica.recurrence)
        WorkNote.objects.filter(pk=note['id']).update(title='Changed after copy')
        self.assertEqual(self.copy(task_id=note['id'], day_offset=0, request_key=key).json(), first.json())
        self.assertEqual(self.copy(task_id=note['id'], day_offset=1, request_key=key).status_code, 400)
        self.assertEqual(self.copy().json()['created'], 2)
        week = self.copy(source_to='2026-10-25', day_offset=7).json()
        self.assertEqual(week['created'], 4)
        self.assertEqual(set(WorkNote.objects.filter(pk__in=week['task_ids']).values_list('date', flat=True)),
                         {DAY + timedelta(days=7), DAY + timedelta(days=8)})

    def test_repeating_duplicate_is_single_and_range_copy_skips_series(self):
        series = self.create(recurrence={'freq': 'WEEKLY', 'byweekday': [0], 'until_date': '2026-11-30'})
        single = self.create()
        copied = self.copy(task_id=series['id'], day_offset=0).json()
        self.assertEqual(copied['created'], 1)
        self.assertIsNone(WorkNote.objects.get(pk=copied['task_ids'][0]).recurrence)
        copied = self.copy(source_from='2026-10-26', source_to='2026-10-26', task_id=series['id'], day_offset=0).json()
        self.assertEqual(WorkNote.objects.get(pk=copied['task_ids'][0]).date, date(2026, 10, 26))
        result = self.copy().json()
        self.assertEqual((result['created'], result['skipped_series']), (2, 1))
        week = self.copy(source_from='2026-11-02', source_to='2026-11-08', day_offset=7).json()
        self.assertEqual((week['created'], week['skipped_series']), (0, 1))
        self.assertEqual(self.copy(task_id=single['id'], source_from='2026-10-20', source_to='2026-10-20').status_code, 400)

    def test_copy_scope_and_dropped_assignees(self):
        note = self.create(assignee_membership_ids=[self.membership.pk, self.other_membership.pk])
        self.membership.is_active = False
        self.membership.save(update_fields=['is_active'])
        result = self.copy().json()
        self.assertEqual(result['dropped_assignees'], [{'task_id': note['id'], 'membership_id': self.membership.pk,
                                                       'name': self.worker.get_full_name()}])
        self.assertEqual(list(WorkNote.objects.get(pk=result['task_ids'][0]).assignees.values_list('membership_id', flat=True)),
                         [self.other_membership.pk])
        self.assertEqual(self.copy(pharmacy=self.foreign_pharmacy.pk, task_id=note['id']).status_code, 403)
        self.assertEqual(client_for(self.worker).post(COPY, {
            'pharmacy': self.pharmacy.pk, 'source_from': DAY.isoformat(), 'source_to': DAY.isoformat(),
            'day_offset': 1, 'request_key': 'staff-copy',
        }, format='json').status_code, 403)
        self.assertEqual(self.copy(task_id=999999).status_code, 400)

    def test_copy_cap_accepts_400_and_rejects_401_atomically(self):
        WorkNote.objects.bulk_create([WorkNote(pharmacy=self.pharmacy, date=DAY, title=str(i), is_planner_task=True)
                                      for i in range(400)])
        self.assertEqual(self.copy().json()['created'], 400)
        self.create()
        count, audits = WorkNote.objects.count(), OperationAudit.objects.count()
        self.assertEqual(self.copy().status_code, 400)
        self.assertEqual((WorkNote.objects.count(), OperationAudit.objects.count()), (count, audits))

    def test_copy_rolls_back_partial_work_and_receipt(self):
        self.create()
        self.create()
        count = WorkNote.objects.count()
        original = WorkNote.save
        calls = []

        def failing_save(note, *args, **kwargs):
            calls.append(note)
            if len(calls) == 2:
                raise RuntimeError('injected failure')
            return original(note, *args, **kwargs)

        with patch.object(WorkNote, 'save', failing_save):
            with self.assertRaisesRegex(RuntimeError, 'injected failure'):
                self.copy(request_key='rollback')
        self.assertEqual(WorkNote.objects.count(), count)
        self.assertFalse(OperationAudit.objects.filter(request_key='rollback').exists())
        self.assertEqual(self.copy(request_key='rollback').json()['created'], 2)

    def test_stale_tokens_completion_locks_and_wording_keeps_progress(self):
        note = self.create(assignee_membership_ids=[self.membership.pk, self.other_membership.pk])
        changed = self.edit(note, title='Reworded')
        self.assertEqual(changed.status_code, 200)
        self.assertEqual(self.edit(note, title='Stale').status_code, 409)
        self.assertEqual(self.complete(note).status_code, 409)
        done = self.complete(changed.json())
        self.assertEqual(done.status_code, 200, done.content)
        note = done.json()
        for change in [{'date': '2026-10-20'}, {'assignee_membership_ids': []}, {'recurrence': {'freq': 'DAILY'}}]:
            self.assertEqual(self.edit(note, **change).status_code, 400)
        wording = self.edit(note, body='New instructions')
        self.assertEqual(wording.status_code, 200)
        self.assertEqual(WorkNoteCompletion.objects.count(), 1)
        self.assertEqual(self.complete(wording.json(), user=self.other).status_code, 200)
        feed = self.client.get(BASE + 'calendar-feed/', {'pharmacy_id': self.pharmacy.pk,
                                                       'date_from': DAY.isoformat(), 'date_to': DAY.isoformat()})
        self.assertEqual(feed.json()['work_notes'][0]['completed_count'], 2)

    def test_own_completion_only_valid_occurrences_and_delete_snapshot_survives(self):
        note = self.create(assignee_membership_ids=[self.membership.pk],
                           recurrence={'freq': 'WEEKLY', 'byweekday': [0], 'until_date': '2026-11-30'})
        self.assertEqual(self.complete(note, user=self.other).status_code, 404)
        self.assertEqual(self.complete(note, occurrence_date='2026-10-20').status_code, 400)
        self.assertEqual(self.complete(note, occurrence_date=42).status_code, 400)
        done = self.complete(note).json()
        self.assertEqual(self.client.delete(NOTES + str(note['id']) + '/', {'updated_at': note['updated_at']}, format='json').status_code, 409)
        self.assertEqual(self.client.delete(NOTES + str(note['id']) + '/', {'updated_at': done['updated_at']}, format='json').status_code, 204)
        audit = OperationAudit.objects.get(action='DELETED')
        self.assertIsNone(audit.work_note_id)
        self.assertEqual(audit.details['task']['id'], note['id'])
        self.assertEqual(audit.details['completions'][0]['membership_id'], self.membership.pk)
        self.assertFalse(WorkNoteCompletion.objects.exists())

    def test_editing_series_retains_original_anchor_weekday_rule_and_individual_reopen(self):
        note = self.create(assignee_membership_ids=[self.membership.pk],
                           recurrence={'freq': 'WEEKLY', 'byweekday': [0, 2], 'until_date': '2026-11-30'})
        done = self.complete(note, occurrence_date='2026-10-21').json()
        edited = self.edit(done, title='New wording').json()
        self.assertEqual(edited['date'], DAY.isoformat())
        self.assertEqual(edited['recurrence']['byweekday'], [0, 2])
        reopened = client_for(self.worker).post(NOTES + str(note['id']) + '/mark_open/', {
            'updated_at': edited['updated_at'], 'occurrence_date': '2026-10-21',
        }, format='json')
        self.assertEqual(reopened.status_code, 200)
        self.assertFalse(WorkNoteCompletion.objects.exists())

    def test_saved_tasks_have_only_defaults_and_placed_tasks_are_independent(self):
        saved = self.client.post(SAVED, {'pharmacy': self.pharmacy.pk, 'title': 'Reusable', 'details': 'Instructions',
                                         'start_time': '09:00', 'end_time': '10:00', 'is_clinical': False}, format='json')
        self.assertEqual(saved.status_code, 201, saved.content)
        self.assertEqual(set(saved.json()), {'id', 'pharmacy', 'title', 'details', 'start_time', 'end_time', 'is_clinical'})
        note = self.create(title=saved.json()['title'], body=saved.json()['details'])
        url = SAVED + str(saved.json()['id']) + '/'
        self.assertEqual(self.client.patch(url, {'title': 'Changed default'}, format='json').status_code, 200)
        self.assertEqual(self.client.patch(url, {'pharmacy': self.foreign_pharmacy.pk}, format='json').status_code, 400)
        self.assertEqual(client_for(self.worker).delete(url).status_code, 404)
        self.assertEqual(self.rows(client_for(self.worker).get(SAVED)), [])
        self.assertEqual(client_for(self.stranger).get(url).status_code, 404)
        self.assertEqual(self.client.delete(url).status_code, 204)
        placed = WorkNote.objects.get(pk=note['id'])
        self.assertEqual((placed.title, placed.body), ('Reusable', 'Instructions'))
        self.assertFalse(SavedTask.objects.exists())

    def test_removed_endpoints_are_gone_and_new_endpoints_require_auth(self):
        for endpoint in ['operation-catalog/', 'operation-plans/', 'operation-items/', 'operation-templates/']:
            self.assertEqual(self.client.get(BASE + endpoint).status_code, 404)
        for endpoint in [NOTES, SAVED, CONTEXT, COPY, ROSTER]:
            self.assertIn(client_for().get(endpoint).status_code, [401, 403])

    def test_recurring_notifications_ignore_old_notified_at_and_deduplicate_per_day(self):
        self.roster(day=DAY + timedelta(days=1))
        self.pharmacy.timezone = 'UTC'
        self.pharmacy.save(update_fields=['timezone'])
        note = self.create(assignee_membership_ids=[self.membership.pk], notify_on_shift_start=True,
                           recurrence={'freq': 'DAILY', 'until_date': '2026-10-21'})
        WorkNoteAssignee.objects.filter(work_note_id=note['id']).update(notified_at=timezone.now())
        now = datetime(2026, 10, 20, 9, tzinfo=dt_timezone.utc)
        for task in [tasks.send_shift_start_work_note_notifications, tasks.send_9am_work_note_fallback]:
            with patch.object(tasks.timezone, 'now', return_value=now), \
                 patch.object(tasks, '_users_already_notified', side_effect=[set(), {self.worker.pk}]), \
                 patch.object(tasks, '_send_work_note_notifications', return_value=1) as send:
                self.assertEqual(task(), 1)
                self.assertEqual(task(), 0)
                self.assertEqual(send.call_args.kwargs['target_date'], date(2026, 10, 20))
                self.assertEqual(send.call_count, 1)


class PlannerConcurrencyContracts(PlannerFixtures, TransactionTestCase):
    @skipUnlessDBFeature('has_select_for_update')
    def test_concurrent_first_requests_replay_one_receipt(self):
        self.create()
        barrier = Barrier(2)

        def run():
            close_old_connections()
            try:
                barrier.wait(timeout=10)
                return copy_tasks(pharmacy_id=self.pharmacy.pk, actor=self.owner, source_from=DAY,
                                  source_to=DAY, day_offset=1, request_key='concurrent')
            finally:
                close_old_connections()

        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(lambda _: run(), range(2)))
        self.assertEqual(results[0], results[1])
        self.assertEqual(WorkNote.objects.count(), 2)
        self.assertEqual(OperationAudit.objects.filter(request_key='concurrent').count(), 1)

    @skipUnlessDBFeature('has_select_for_update')
    def test_concurrent_edits_cannot_both_accept_same_timestamp(self):
        note = self.create()
        barrier = Barrier(2)

        def run(title):
            close_old_connections()
            try:
                barrier.wait(timeout=10)
                return client_for(self.owner).patch(NOTES + str(note['id']) + '/', {
                    'title': title, 'updated_at': note['updated_at'],
                }, format='json').status_code
            finally:
                close_old_connections()

        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(run, ['One', 'Two']))
        self.assertEqual(sorted(results), [200, 409])
