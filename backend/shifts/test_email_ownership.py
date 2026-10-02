from django.test import SimpleTestCase

from client_profile.domains.shifts import emails as legacy_emails
from shifts import emails


class ShiftEmailOwnershipTests(SimpleTestCase):
    def test_legacy_email_module_reexports_shifts_implementation(self):
        self.assertIs(legacy_emails.build_shift_email_context, emails.build_shift_email_context)
        self.assertIs(legacy_emails.build_offer_shift_details, emails.build_offer_shift_details)
        self.assertIs(legacy_emails.build_roster_email_link, emails.build_roster_email_link)
