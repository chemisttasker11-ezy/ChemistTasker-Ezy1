"""Runtime upgrades may change field classes, not silently change numeric IDs."""
import importlib
import json
from pathlib import Path

import django
from django.test import SimpleTestCase
from rest_framework.renderers import JSONRenderer
from rest_framework.settings import api_settings


class RuntimeContractTests(SimpleTestCase):
    def test_supported_django_lts_series(self):
        self.assertEqual(django.VERSION[:2], (5, 2))

    def test_all_baselined_resource_ids_remain_read_only_numeric_json(self):
        self.assertFalse(api_settings.COERCE_BIGINT_TO_STRING)
        fixtures = json.loads((Path(__file__).parent / "contracts/serializer_field_contracts.json").read_text())
        count = 0
        for qualified in fixtures:
            domain, name = qualified.split(".")
            serializer = getattr(importlib.import_module(f"{domain}.serializers"), name)()
            field = serializer.fields.get("id")
            if field is None:
                continue
            count += 1
            with self.subTest(serializer=qualified):
                self.assertTrue(field.read_only)
                for value in (1, 2147483648, 9007199254740991):
                    rendered = json.loads(JSONRenderer().render({"id": field.to_representation(value)}))
                    self.assertIs(type(rendered["id"]), int)
                    self.assertEqual(rendered["id"], value)
        self.assertGreater(count, 20)
