"""Repro for PR #183 review finding 2: missing/null discipline flags must not become False. FAILS when the defect is real."""
import json
import unittest

from scripts.ahpra_verifier.bridge import parse_cli_output


class MissingDisciplineFlags(unittest.TestCase):
    def test_missing_or_null_flags_are_not_reported_as_found(self):
        base = {"name": "Jane Doe", "profession": "Pharmacist", "registration_status": "Registered",
                "registration_type": "General", "expiry_date": "2099-01-02"}
        for register in (base, {**base, "conditions": None, "undertakings": None, "reprimands": None}):
            with self.subTest(register=register):
                res = parse_cli_output(json.dumps({"result": json.dumps(
                    {"outcome": "found", "register": register, "error": ""})}))
                self.assertNotEqual(res["outcome"], "found", res)


if __name__ == "__main__":
    unittest.main()
