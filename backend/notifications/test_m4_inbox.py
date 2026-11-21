"""M4-03: real notifications and push-preference authority, independent of client races."""
from django.test import TestCase
from client_profile.characterization_support import client_for, make_user
from notifications.models import Notification, NotificationPushPreference

BASE = '/api/v1/notifications/'
PREFS = '/api/v1/notification-push-preferences/'


class M4NotificationInboxContracts(TestCase):
    def setUp(self):
        self.people = {role: make_user(role) for role in (
            'OWNER', 'PHARMACIST', 'OTHER_STAFF', 'EXPLORER', 'ORG_ADMIN',
        )}
        self.other = make_user('EXPLORER')
        self.notes = {}
        for role, user in self.people.items():
            self.notes[role] = [
                Notification.objects.create(
                    user=user, type=Notification.Type.MESSAGE,
                    title=f'{role} item {index}', body='Own inbox',
                    payload={'notice': index},
                ) for index in range(25)
            ]
        Notification.objects.create(user=self.other, title='Foreign notification')

    def test_all_roles_get_only_their_own_twenty_row_first_page(self):
        for role, user in self.people.items():
            with self.subTest(role=role):
                first = client_for(user).get(BASE)
                self.assertEqual(first.status_code, 200, first.data)
                self.assertEqual((first.data['count'], len(first.data['results'])), (25, 20))
                self.assertTrue(first.data['next'])
                self.assertTrue(all(row['title'].startswith(role) for row in first.data['results']))
                self.assertEqual(set(first.data['results'][0]), {
                    'id', 'type', 'title', 'body', 'payload', 'action_url', 'created_at', 'read_at',
                })
                second = client_for(user).get(BASE + '?page=2')
                self.assertEqual(second.status_code, 200, second.data)
                self.assertEqual(len(second.data['results']), 5)
                self.assertEqual(second.data['next'], None)
                ids = {row['id'] for row in first.data['results'] + second.data['results']}
                self.assertEqual(ids, {note.pk for note in self.notes[role]})
        self.assertEqual(client_for().get(BASE).status_code, 401)

    def test_detail_ownership_and_selected_receipt_never_mark_other_user(self):
        first = self.people['PHARMACIST']
        foreign = self.notes['EXPLORER'][0]
        own = self.notes['PHARMACIST'][0]
        client = client_for(first)
        self.assertEqual(client.get(BASE + str(foreign.pk) + '/').status_code, 404)
        response = client.post(BASE + 'mark-read/', {'ids': [foreign.pk, own.pk]}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['marked'], 1)
        foreign.refresh_from_db()
        own.refresh_from_db()
        self.assertIsNone(foreign.read_at)
        self.assertIsNotNone(own.read_at)
        repeat = client.post(BASE + 'mark-read/', {'ids': [own.pk]}, format='json')
        self.assertEqual(repeat.status_code, 200, repeat.data)
        self.assertEqual(repeat.data['marked'], 0)
        self.assertEqual(client.post(
            BASE + 'mark-read/', {'ids': 'bad'}, format='json').status_code, 400)

    def test_empty_ids_means_all_own_unread_and_never_other_user(self):
        user = self.people['OTHER_STAFF']
        other = self.notes['OWNER'][0]
        response = client_for(user).post(BASE + 'mark-read/', {'ids': []}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['marked'], 25)
        self.assertEqual(response.data['unread'], 0)
        other.refresh_from_db()
        self.assertIsNone(other.read_at)
        self.assertEqual(client_for().post(
            BASE + 'mark-read/', {'ids': [other.pk]}, format='json').status_code, 401)

    def test_push_preferences_are_user_scoped_and_not_device_permissions(self):
        worker = self.people['PHARMACIST']
        explorer = self.people['EXPLORER']
        response = client_for(worker).get(PREFS)
        self.assertEqual(response.status_code, 200, response.data)
        self.assertTrue(response.data['push_messages'])
        update = client_for(worker).patch(PREFS, {
            'push_messages': False, 'quiet_hours_enabled': True,
            'quiet_start': '22:00', 'quiet_end': '07:00',
            'time_zone': 'Australia/Perth',
        }, format='json')
        self.assertEqual(update.status_code, 200, update.data)
        self.assertFalse(update.data['push_messages'])
        self.assertEqual(update.data['time_zone'], 'Australia/Perth')
        other = client_for(explorer).get(PREFS)
        self.assertEqual(other.status_code, 200, other.data)
        self.assertTrue(other.data['push_messages'])
        self.assertEqual(other.data['time_zone'], 'Australia/Brisbane')
        self.assertFalse(NotificationPushPreference.objects.filter(user=explorer).exists())
        invalid = client_for(worker).patch(PREFS, {
            'time_zone': 'Some/Unsupported',
        }, format='json')
        self.assertEqual(invalid.status_code, 400, invalid.data)
        invalid = client_for(worker).patch(PREFS, {
            'quiet_hours_enabled': True, 'quiet_start': '08:00', 'quiet_end': '08:00',
        }, format='json')
        self.assertEqual(invalid.status_code, 400, invalid.data)
        worker_record = NotificationPushPreference.objects.get(user=worker)
        self.assertEqual(worker_record.time_zone, 'Australia/Perth')
        self.assertEqual(client_for().get(PREFS).status_code, 401)
