from django.test import SimpleTestCase

from chat import identity as chat_identity
from users import presentation


class UserPresentationOwnershipTests(SimpleTestCase):
    def test_chat_identity_reexports_user_presentation_contract(self):
        for name in (
            "_resolve_user_profile_photo",
            "_split_chat_display_name",
            "_build_absolute_media_url",
            "_chat_member_identity",
        ):
            self.assertIs(getattr(chat_identity, name), getattr(presentation, name))
