from django.test import SimpleTestCase

from chat import identity
from client_profile.domains.common import serializers as common_serializers


class ChatIdentityCompatibilityTests(SimpleTestCase):
    def test_common_serializer_helpers_reexport_chat_identity_contract(self):
        for name in (
            "_resolve_user_profile_photo",
            "_split_chat_display_name",
            "_build_absolute_media_url",
            "_chat_member_identity",
        ):
            self.assertIs(getattr(common_serializers, name), getattr(identity, name))
