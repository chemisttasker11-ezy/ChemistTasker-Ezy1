from django.test import SimpleTestCase

from client_profile import models as legacy_models
from client_profile.models import orgs as legacy_org_module
from organizations import models as organization_models


class OrganizationModelCodeOwnershipTests(SimpleTestCase):
    model_names = (
        "Organization",
        "Pharmacy",
        "PharmacyClaim",
        "PharmacyAdmin",
        "Chain",
    )

    def test_organization_model_source_is_owned_by_organizations_module(self):
        for name in self.model_names:
            model = getattr(organization_models, name)
            self.assertEqual(model.__module__, "organizations.models")
            self.assertEqual(model._meta.app_label, "client_profile")
            self.assertIs(getattr(legacy_models, name), model)
            self.assertIs(getattr(legacy_org_module, name), model)

    def test_django_labels_remain_client_profile_in_code_ownership_phase(self):
        self.assertEqual(organization_models.Organization._meta.label, "client_profile.Organization")
        self.assertEqual(organization_models.Pharmacy._meta.label, "client_profile.Pharmacy")
        self.assertEqual(organization_models.PharmacyAdmin._meta.label, "client_profile.PharmacyAdmin")
