"""Reports on public talent posts and job board shifts, and the Talent board / Job board moderation areas."""
from datetime import date, time, timedelta
from decimal import Decimal

from django.test import TestCase

from client_profile.characterization_support import BASE, client_for, make_owner_with_pharmacy, make_user
from public_hub.models import BoardReport, ContentAssignment
from shifts.models import Shift, ShiftSlot
from talent.models import ExplorerPost


class BoardReportTests(TestCase):
    def setUp(self):
        self.reporter = make_user("PHARMACIST", is_otp_verified=True)
        self.author = make_user("PHARMACIST", is_otp_verified=True)
        self.post = ExplorerPost.objects.create(author_user=self.author, headline="Locum available", body="Weekends")
        self.moderator = make_user("PHARMACIST", is_otp_verified=True)
        ContentAssignment.objects.create(user=self.moderator, area="board:talent", role="publisher")

    def report(self, kind, pk, reason="Spam"):
        return client_for(self.reporter).post(f"{BASE}public-hub/boards/{kind}/{pk}/report/", {"reason": reason}, format="json")

    def test_reports_reach_only_moderators_of_that_board_and_hiding_takes_the_post_down(self):
        self.assertEqual(self.report("talent", self.post.pk).status_code, 201)
        self.assertEqual(self.report("talent", self.post.pk).status_code, 200)  # one report per person
        self.assertEqual(self.report("talent", self.post.pk, reason=" ").status_code, 400)

        queue = client_for(self.moderator).get(f"{BASE}content/moderation/").data
        [row] = [row for row in queue if row["type"] == "talent"]
        self.assertEqual((row["area"], row["reason"]), ("board:talent", "Spam"))
        self.assertIn("Locum available", row["body"])
        self.assertEqual(client_for(make_user("PHARMACIST", is_otp_verified=True)).post(
            f"{BASE}content/moderation/talent/{row['id']}/", {"action": "hide"}, format="json").status_code, 403)

        response = client_for(self.moderator).post(f"{BASE}content/moderation/talent/{row['id']}/", {"action": "hide"}, format="json")
        self.assertEqual(response.status_code, 200)
        self.post.refresh_from_db()
        self.assertIsNotNone(self.post.hidden_at)
        self.assertFalse(self.post.is_talent_board_visible())
        self.assertTrue(BoardReport.objects.get().resolved)

    def test_hidden_shift_leaves_the_public_job_board(self):
        owner, pharmacy = make_owner_with_pharmacy()
        shift = Shift.objects.create(pharmacy=pharmacy, created_by=owner, role_needed="PHARMACIST", employment_type="LOCUM", visibility="PLATFORM")
        ShiftSlot.objects.create(shift=shift, date=date.today() + timedelta(days=3), start_time=time(9), end_time=time(17), rate=Decimal("60.00"))
        board = lambda: [item["id"] for item in (lambda data: data["results"] if isinstance(data, dict) else data)(
            client_for(self.reporter).get(f"{BASE}public-job-board/").data)]
        self.assertIn(shift.pk, board())
        self.assertEqual(self.report("jobs", shift.pk).status_code, 201)
        moderator = make_user("PHARMACIST", is_otp_verified=True)
        ContentAssignment.objects.create(user=moderator, area="board:jobs", role="publisher")
        [row] = client_for(moderator).get(f"{BASE}content/moderation/").data
        client_for(moderator).post(f"{BASE}content/moderation/jobs/{row['id']}/", {"action": "hide"}, format="json")
        self.assertNotIn(shift.pk, board())
