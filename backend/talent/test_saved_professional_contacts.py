"""QR bookmarks: user isolation, public visibility, idempotence and refusal controls."""
from django.test import TestCase
from client_profile.characterization_support import BASE, client_for, make_user
from talent.models import ExplorerPost, SavedProfessionalContact
from organizations.models import Organization

URL = BASE + "saved-professional-contacts/"

class SavedProfessionalContactsTests(TestCase):
    def setUp(self):
        self.user = make_user("PHARMACIST")
        self.other = make_user("PHARMACIST")
        self.worker = make_user("OTHER_STAFF")
        self.public = ExplorerPost.objects.create(author_user=self.worker, headline="Available", reference_code="PUBWORKER12")
        self.hidden = ExplorerPost.objects.create(author_user=self.worker, headline="Hidden", reference_code="PUBHIDDEN12", hidden_at=__import__('django.utils.timezone',fromlist=['now']).now())
        self.organisation = Organization.objects.create(name="Test organisation", slug="test-organisation")

    def test_auth_required_and_get_only_own_rows(self):
        self.assertIn(client_for().get(URL).status_code,(401,403))
        self.assertIn(client_for().post(URL,{"kind":"WORKER_LISTING","reference":"PUBWORKER12"},format="json").status_code,(401,403))
        result = client_for(self.user).post(URL, {"kind":"WORKER_LISTING","reference":"PUBWORKER12"}, format="json")
        self.assertEqual(result.status_code,201)
        self.assertEqual(client_for(self.user).get(URL).json()[0]["reference"],"PUBWORKER12")
        self.assertEqual(client_for(self.other).get(URL).json(),[])
        self.assertEqual(set(result.json()),{"id","kind","reference","saved_at"})

    def test_hidden_unknown_or_bearer_invite_cannot_enter_cloud_bookmarks(self):
        client=client_for(self.user)
        for kind, ref in [
            ("WORKER_LISTING","PUBHIDDEN12"),
            ("WORKER_LISTING","UNKNOWN100"),
            ("ORGANIZATION","does-not-exist"),
            ("pharmacy-invitation","abcdefghi"),
            ("WORKER_LISTING","https://example.com"),
        ]:
            self.assertEqual(client.post(URL,{"kind":kind,"reference":ref},format="json").status_code,400)
        self.assertEqual(SavedProfessionalContact.objects.count(),0)

    def test_duplicate_idempotent_and_cross_account_delete_is_refused(self):
        first=client_for(self.user).post(URL,{"kind":"ORGANIZATION","reference":"test-organisation"},format="json")
        second=client_for(self.user).post(URL,{"kind":"ORGANIZATION","reference":"test-organisation"},format="json")
        self.assertEqual(first.status_code,201)
        self.assertEqual(second.status_code,200)
        self.assertEqual(first.json()["id"],second.json()["id"])
        target=URL+str(first.json()["id"])+"/"
        self.assertEqual(client_for(self.other).delete(target).status_code,404)
        self.assertEqual(SavedProfessionalContact.objects.count(),1)
        self.assertEqual(client_for(self.user).delete(target).status_code,204)
        self.assertEqual(SavedProfessionalContact.objects.count(),0)

    def test_does_not_create_membership_or_staff_access(self):
        from memberships.models import Membership
        baseline=Membership.objects.count()
        response=client_for(self.user).post(URL,{"kind":"WORKER_LISTING","reference":"PUBWORKER12"},format="json")
        self.assertEqual(response.status_code,201)
        self.assertEqual(Membership.objects.count(),baseline)
