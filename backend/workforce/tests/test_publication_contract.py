"""Actual HTTP contracts for one revision-aware roster publication authority."""
from datetime import date, timedelta
from queue import Queue
from threading import Barrier, Thread
from unittest import mock, skipUnless
from uuid import uuid4

from django.db import close_old_connections, connection
from django.test import TestCase, TransactionTestCase
from rest_framework.test import APIClient

from client_profile.characterization_support import make_owner_with_pharmacy
from workforce.models import RosterOperation, RosterPeriod, RosterPublicationAudit, RosterRevisionState
from workforce.roster.revisions import bump_roster_revision, get_revision_state, warning_key


BASES = (
    '/api/client-profile/workforce/roster/',
    '/api/client-profile/attendance/roster/',
)


class PublicationFixture:
    def setUp(self):
        self.owner, self.pharmacy = make_owner_with_pharmacy('Publication Contract')
        self.other_owner, self.other_pharmacy = make_owner_with_pharmacy('Other Publication Contract')
        self.period = RosterPeriod.objects.create(
            pharmacy=self.pharmacy, week_start=date(2026, 10, 5), created_by=self.owner,
        )
        self.client = APIClient()
        self.client.force_authenticate(self.owner)

    def payload(self, period=None, operation_id=None):
        period = period or self.period
        return {
            'period_id': period.pk,
            'expected_revision': get_revision_state(period).draft_revision,
            'operation_id': operation_id or str(uuid4()),
            'acknowledged_warning_keys': [],
        }


class PublicationHttpContracts(PublicationFixture, TestCase):
    def test_both_http_adapters_require_the_reviewed_revision_and_operation_id(self):
        for base in BASES:
            with self.subTest(base=base):
                response = self.client.post(base + 'publish/', {
                    'period_id': self.period.pk, 'force_warnings': True,
                }, format='json')
                self.assertEqual(response.status_code, 400, response.data)
        self.period.refresh_from_db()
        self.assertEqual(self.period.status, RosterPeriod.Status.DRAFT)
        self.assertFalse(RosterPublicationAudit.objects.exists())
        self.assertFalse(RosterOperation.objects.exists())

    def test_cross_adapter_retry_returns_one_result_and_one_publication_audit(self):
        body = self.payload()
        with mock.patch('workforce.roster.publication._notify_roster_publication') as notify:
            with self.captureOnCommitCallbacks(execute=True):
                first = self.client.post(BASES[0] + 'publish/', body, format='json')
                retry = self.client.post(BASES[1] + 'publish/', body, format='json')
            self.assertEqual(first.status_code, 200, first.data)
            self.assertEqual(retry.status_code, 200, retry.data)
            self.assertEqual(first.data, retry.data)
            self.assertEqual(notify.call_count, 1)
        self.assertEqual(RosterOperation.objects.count(), 1)
        self.assertEqual(RosterPublicationAudit.objects.count(), 1)

    def test_stale_revision_rejected_without_publication_or_reserved_operation(self):
        body = self.payload()
        bump_roster_revision(self.period.pk)
        for base in BASES:
            response = self.client.post(base + 'publish/', body, format='json')
            self.assertEqual(response.status_code, 409, response.data)
        self.assertFalse(RosterOperation.objects.exists())
        self.assertFalse(RosterPublicationAudit.objects.exists())

    def test_missing_or_malformed_command_fields_are_stable_400s(self):
        valid = self.payload()
        variants = [
            {**valid, 'expected_revision': True},
            {**valid, 'expected_revision': 1.5},
            {**valid, 'expected_revision': -1},
            {**valid, 'operation_id': 'not-a-uuid'},
            {**valid, 'acknowledged_warning_keys': 'all'},
            {**valid, 'acknowledged_warning_keys': [{}]},
            {**valid, 'force_warnings': True},
            {key: value for key, value in valid.items() if key != 'operation_id'},
        ]
        for base in BASES:
            for body in variants:
                with self.subTest(base=base, body=body):
                    response = self.client.post(base + 'publish/', body, format='json')
                    self.assertEqual(response.status_code, 400, response.data)
        self.assertFalse(RosterPublicationAudit.objects.exists())

    def test_wrong_pharmacy_owner_cannot_validate_or_publish(self):
        self.client.force_authenticate(self.other_owner)
        valid = self.payload()
        for base in BASES:
            for action in ('validate', 'publish'):
                body = valid if action == 'publish' else {key: valid[key] for key in ('period_id', 'expected_revision')}
                response = self.client.post(base + action + '/', body, format='json')
                self.assertEqual(response.status_code, 403, response.data)
        self.assertFalse(RosterPublicationAudit.objects.exists())

    def test_actual_warning_keys_must_be_reviewed_not_a_force_boolean(self):
        warning = {'type': 'AVAILABILITY_CONFLICT', 'assignment_id': 71, 'message': 'Review changed availability.'}
        validation = {'is_valid': True, 'errors': [], 'warnings': [warning], 'total_assignments': 0, 'total_workers': 0}
        with mock.patch('workforce.roster.revisions.validate_roster_period', return_value=validation), \
                mock.patch('workforce.roster.publication.validate_roster_period', return_value=validation):
            body = self.payload()
            review = self.client.post(BASES[1] + 'validate/', {
                'period_id': body['period_id'], 'expected_revision': body['expected_revision'],
            }, format='json')
            self.assertEqual(review.status_code, 200, review.data)
            self.assertEqual(review.data['draft_revision'], body['expected_revision'])
            self.assertEqual(review.data['warnings'][0]['warning_key'], warning_key(warning))
            refused = self.client.post(BASES[1] + 'publish/', body, format='json')
            self.assertEqual(refused.status_code, 409, refused.data)
            self.assertFalse(RosterOperation.objects.exists())
            body['acknowledged_warning_keys'] = [warning_key(warning)]
            published = self.client.post(BASES[1] + 'publish/', body, format='json')
            self.assertEqual(published.status_code, 200, published.data)
            self.assertEqual(RosterPublicationAudit.objects.count(), 1)

    def test_reused_operation_id_with_another_period_or_payload_is_rejected(self):
        first = self.payload()
        self.assertEqual(self.client.post(BASES[0] + 'publish/', first, format='json').status_code, 200)
        other_period = RosterPeriod.objects.create(
            pharmacy=self.pharmacy, week_start=self.period.week_start + timedelta(days=7), created_by=self.owner,
        )
        different_period = self.payload(other_period, first['operation_id'])
        response = self.client.post(BASES[1] + 'publish/', different_period, format='json')
        self.assertEqual(response.status_code, 409, response.data)
        response = self.client.post(BASES[1] + 'publish/', {**first, 'acknowledged_warning_keys': ['different']}, format='json')
        self.assertEqual(response.status_code, 409, response.data)
        self.assertEqual(RosterOperation.objects.count(), 1)
        self.assertEqual(RosterPublicationAudit.objects.count(), 1)

    def test_period_get_reports_revision_without_creating_revision_rows(self):
        response = self.client.get(BASES[1] + 'period/', {
            'pharmacy_id': self.pharmacy.pk, 'week_start': str(self.period.week_start),
        })
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['draft_revision'], 1)
        self.assertEqual(response.data['published_revision'], 0)
        self.assertFalse(RosterRevisionState.objects.exists())

    def test_withdrawing_publication_invalidates_a_previously_reviewed_revision(self):
        from workforce.roster.publication import unpublish_roster_period
        command = self.payload()
        published = self.client.post(BASES[0] + 'publish/', command, format='json')
        self.assertEqual(published.status_code, 200, published.data)
        unpublish_roster_period(self.period, self.owner)
        self.period.refresh_from_db()
        self.assertEqual(self.period.status, RosterPeriod.Status.DRAFT)
        revision = get_revision_state(self.period).draft_revision
        self.assertGreater(revision, command['expected_revision'])
        unpublish_roster_period(self.period, self.owner)
        self.assertEqual(get_revision_state(self.period).draft_revision, revision)
        stale = {**command, 'operation_id': str(uuid4())}
        refused = self.client.post(BASES[1] + 'publish/', stale, format='json')
        self.assertEqual(refused.status_code, 409, refused.data)
        self.assertEqual(RosterPublicationAudit.objects.count(), 1)

    def test_invalid_commands_and_actual_blockers_create_no_durable_operation(self):
        validation = {'is_valid': False, 'errors': [{'type': 'OVERLAP', 'message': 'Overlap'}],
                      'warnings': [], 'total_assignments': 0, 'total_workers': 0}
        with mock.patch('workforce.roster.publication.validate_roster_period', return_value=validation):
            response = self.client.post(BASES[0] + 'publish/', self.payload(), format='json')
        self.assertEqual(response.status_code, 409, response.data)
        self.assertEqual(response.data['code'], 'ROSTER_BLOCKING_ERRORS')
        self.assertFalse(RosterOperation.objects.exists())
        self.period.refresh_from_db()
        self.assertEqual(self.period.status, RosterPeriod.Status.DRAFT)

    def test_warning_key_changes_when_the_reviewed_warning_facts_change(self):
        old = {'type': 'AVAILABILITY_CONFLICT', 'assignment_id': 7, 'message': 'Unavailable after 12:00'}
        new = {**old, 'message': 'Unavailable after 10:00'}
        self.assertNotEqual(warning_key(old), warning_key(new))
        self.assertEqual(warning_key(old), warning_key(dict(reversed(list(old.items())))))


@skipUnless(connection.vendor == 'postgresql', 'Actual PostgreSQL uniqueness/row-lock concurrency is required.')
class PublicationConcurrencyContracts(PublicationFixture, TransactionTestCase):
    def concurrent(self, commands):
        gate = Barrier(2)
        results = Queue()
        def run(body):
            close_old_connections()
            try:
                from users.models import User
                client = APIClient()
                client.force_authenticate(User.objects.get(pk=self.owner.pk))
                gate.wait(timeout=10)
                response = client.post(BASES[0] + 'publish/', body, format='json')
                results.put((response.status_code, response.data))
            except Exception as exc:
                results.put(('exception', type(exc).__name__))
            finally:
                close_old_connections()
        threads = [Thread(target=run, args=(body,), daemon=True) for body in commands]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join(timeout=25)
            self.assertFalse(thread.is_alive(), 'Publication concurrency did not finish.')
        return [results.get_nowait(), results.get_nowait()]

    def test_same_operation_and_period_publish_once_under_concurrency(self):
        body = self.payload()
        outcomes = self.concurrent([body, dict(body)])
        self.assertEqual(sorted(status for status, _ in outcomes), [200, 200], outcomes)
        self.assertEqual(outcomes[0][1], outcomes[1][1])
        self.assertEqual(RosterOperation.objects.count(), 1)
        self.assertEqual(RosterPublicationAudit.objects.count(), 1)

    def test_global_operation_collision_is_a_conflict_not_a_500_or_second_publication(self):
        other = RosterPeriod.objects.create(
            pharmacy=self.pharmacy, week_start=self.period.week_start + timedelta(days=7), created_by=self.owner,
        )
        first = self.payload()
        second = self.payload(other, first['operation_id'])
        outcomes = self.concurrent([first, second])
        self.assertEqual(sorted(status for status, _ in outcomes), [200, 409], outcomes)
        self.assertEqual(RosterOperation.objects.count(), 1)
        self.assertEqual(RosterPublicationAudit.objects.count(), 1)
