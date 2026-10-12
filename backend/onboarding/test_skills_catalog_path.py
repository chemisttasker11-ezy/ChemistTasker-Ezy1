from pathlib import Path
from unittest.mock import patch
import os

from django.conf import settings
from django.test import SimpleTestCase
from django.core.exceptions import ImproperlyConfigured
from onboarding.services.skill_identity import registry

from onboarding.services import skills as catalog


class OnboardingSkillsCatalogPathTests(SimpleTestCase):
    def tearDown(self):
        registry.cache_clear()

    def test_skills_catalog_is_resolved_from_project_root_not_module_depth(self):
        registry.cache_clear()
        expected = Path(settings.BASE_DIR).parent / "shared-core" / "skills_registry.json"

        opened = {}

        def fake_open(path, *args, **kwargs):
            opened["path"] = Path(path)
            raise FileNotFoundError

        with patch.dict(os.environ, {'SKILLS_REGISTRY_PATH': str(expected)}), patch("pathlib.Path.open", side_effect=lambda *args, **kwargs: fake_open(expected)):
            with self.assertRaises(ImproperlyConfigured):
                catalog._load_skills_catalog()

        self.assertEqual(opened["path"], expected)

    def test_packaged_registry_override_is_the_same_catalog_used_by_validation(self):
        from tempfile import TemporaryDirectory
        import json
        source = json.loads((Path(settings.BASE_DIR).parent / 'shared-core/skills_registry.json').read_text(encoding='utf-8'))
        with TemporaryDirectory() as directory:
            target = Path(directory) / 'packaged.json'
            target.write_text(json.dumps(source), encoding='utf-8')
            registry.cache_clear()
            with patch.dict(os.environ, {'SKILLS_REGISTRY_PATH':str(target)}):
                self.assertEqual(catalog._load_skills_catalog(), source)

    def test_malformed_packaged_registry_fails_closed(self):
        from tempfile import TemporaryDirectory
        with TemporaryDirectory() as directory:
            target = Path(directory) / 'malformed.json'
            for content in ['{', '{}', '{"skills": []}']:
                target.write_text(content, encoding='utf-8')
                registry.cache_clear()
                with patch.dict(os.environ, {'SKILLS_REGISTRY_PATH':str(target)}):
                    with self.assertRaises(ImproperlyConfigured):
                        catalog._load_skills_catalog()
