from django.apps import apps
from django.test import SimpleTestCase

from client_profile.domains.memberships import serializers as legacy_serializers
from client_profile.domains.memberships import views as legacy_views
from memberships import serializers, views


class MembershipFacadeContractTests(SimpleTestCase):
    def test_memberships_is_installed_as_real_django_app(self):
        self.assertEqual(apps.get_app_config("memberships").name, "memberships")

    def test_facade_preserves_endpoint_and_serializer_objects(self):
        self.assertIs(views.MembershipViewSet, legacy_views.MembershipViewSet)
        self.assertIs(views.MembershipApplicationViewSet, legacy_views.MembershipApplicationViewSet)
        self.assertIs(serializers.MembershipSerializer, legacy_serializers.MembershipSerializer)
        self.assertIs(
            serializers.MembershipApplicationSerializer,
            legacy_serializers.MembershipApplicationSerializer,
        )
