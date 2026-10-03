from django.test import SimpleTestCase

from core.serializer_mixins import UploadValidationMixin as CoreUploadValidationMixin
from client_profile.domains.common.serializers import UploadValidationMixin as LegacyUploadValidationMixin


class SerializerMixinCompatibilityTests(SimpleTestCase):
    def test_upload_validation_mixin_reexports_core_contract(self):
        self.assertIs(LegacyUploadValidationMixin, CoreUploadValidationMixin)
