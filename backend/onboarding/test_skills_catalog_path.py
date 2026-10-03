from pathlib import Path
from unittest.mock import patch

from django.conf import settings
from django.test import SimpleTestCase

from onboarding.services import skills as catalog


class OnboardingSkillsCatalogPathTests(SimpleTestCase):
    def tearDown(self):
        catalog._SKILLS_CATALOG_CACHE = None

    def test_skills_catalog_is_resolved_from_project_root_not_module_depth(self):
        catalog._SKILLS_CATALOG_CACHE = None
        expected = Path(settings.BASE_DIR).parent / "shared-core" / "skills_catalog.json"

        opened = {}

        def fake_open(path, *args, **kwargs):
            opened["path"] = Path(path)
            raise FileNotFoundError

        with patch("builtins.open", side_effect=fake_open):
            self.assertEqual(catalog._load_skills_catalog(), {})

        self.assertEqual(opened["path"], expected)
