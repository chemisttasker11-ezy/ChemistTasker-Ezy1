"""Public serializer imports and field contracts retained through F03 extraction.

The compact snapshot was measured against the original implementations before
extraction. Behavior-specific suites remain the authority for writes and policy.
"""
import ast
import hashlib
import importlib
import json
from pathlib import Path

from django.db import connection
from django.test import SimpleTestCase
from rest_framework import serializers


ROOT = Path(__file__).resolve().parents[1]


def field_contract(field, depth=0):
    result = {key: getattr(field, key) for key in ("required", "read_only", "write_only", "allow_null")}
    result["type"] = type(field).__name__
    result["source"] = field.source
    for key in ("max_length", "min_length", "max_digits", "decimal_places", "allow_blank", "allow_empty", "min_value", "max_value"):
        value = getattr(field, key, None)
        if value is not None:
            result[key] = str(value)
    # Relation choices evaluate querysets: only static ChoiceField choices are a
    # field contract. This SimpleTestCase rejects accidental database evaluation.
    choices = field.choices if isinstance(field, serializers.ChoiceField) else None
    if choices is not None:
        result["choices"] = [[str(key), str(value)] for key, value in choices.items()]
    result["validators"] = [type(value).__name__ for value in field.validators]
    default = field.default
    if default is serializers.empty:
        result["default"] = "empty"
    elif callable(default):
        result["default"] = getattr(default, "__qualname__", type(default).__name__)
    else:
        result["default"] = str(default)
    if depth < 4:
        if isinstance(field, serializers.ListSerializer):
            result["child"] = field_contract(field.child, depth + 1)
        elif isinstance(field, serializers.BaseSerializer):
            result["fields"] = {name: field_contract(value, depth + 1) for name, value in field.fields.items()}
    return result


class SerializerDecompositionContracts(SimpleTestCase):
    def test_original_field_contracts_remain_unchanged(self):
        # DRF derives integer bounds from the active database backend. Both
        # snapshots were measured on the unsplit F01 tree, not accepted from
        # this extraction's failing output. Unsupported vendors fail explicitly.
        filenames = {
            "sqlite": "serializer_field_contracts.json",
            "postgresql": "serializer_field_contracts.postgresql.json",
        }
        self.assertIn(connection.vendor, filenames)
        expected = json.loads((ROOT / "core/contracts" / filenames[connection.vendor]).read_text())
        self.assertEqual(len(expected), 27)
        for qualified, contract in expected.items():
            with self.subTest(serializer=qualified):
                domain, name = qualified.split(".")
                cls = getattr(importlib.import_module(f"{domain}.serializers"), name)
                actual = field_contract(cls())
                digest = hashlib.sha256(json.dumps(actual, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
                self.assertEqual(digest, contract["sha256"], "Review any intentional field-contract change explicitly.")

    def test_public_exports_are_the_defining_classes_not_wrappers(self):
        report = json.loads((ROOT.parent / "docs/architecture/SERIALIZER_SPLIT_REVIEW.json").read_text())
        for qualified, record in report["definitions"].items():
            with self.subTest(definition=qualified):
                domain, name = qualified.split(".")
                public = importlib.import_module(f"{domain}.serializers")
                implementation = importlib.import_module(record["module"])
                self.assertIs(getattr(public, name), getattr(implementation, name))
                self.assertIn(name, public.__all__)

    def test_implementations_do_not_import_back_through_public_facades(self):
        for domain in ("shifts", "pharmacy_hub"):
            for path in (ROOT / domain / "serialization").glob("*.py"):
                tree = ast.parse(path.read_text())
                for node in ast.walk(tree):
                    if isinstance(node, ast.ImportFrom):
                        self.assertNotIn(node.module, ("shifts.serializers", "pharmacy_hub.serializers"), str(path))
                        self.assertFalse(node.level >= 2 and node.module == "serializers", str(path))

    def test_historical_shift_logger_is_retained(self):
        from shifts.serialization.offers import logger
        self.assertEqual(logger.name, "shifts.serializers")
