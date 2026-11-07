"""Contract checks for the hermetic Android/iOS Maestro acceptance flow.

These check that CI drives the actual login field and uses the Swift compiler
supported by the pinned Expo SDK. They do not replace installed-device tests.
"""

from pathlib import Path
import re
import unittest


ROOT = Path(__file__).resolve().parents[2]
WORKFLOW = ROOT / ".github" / "workflows" / "native_mobile_acceptance.yml"
LOGIN = ROOT / "frontend_mobile" / "app" / "login.tsx"


class NativeAcceptanceConfigurationTests(unittest.TestCase):
    def test_both_native_flows_target_actual_email_field(self):
        login = LOGIN.read_text(encoding="utf-8")
        workflow = WORKFLOW.read_text(encoding="utf-8")
        field = re.search(r'<TextField\s+label="([^"]+)"', login)
        self.assertIsNotNone(field, "Login screen email TextField label is missing")
        email_label = field.group(1)
        # A changed UI label must update both embedded Maestro flows, not just one.
        selectors = re.findall(r'^\s*- tapOn: "([^"]+)"\s*$', workflow, re.MULTILINE)
        self.assertEqual(2, selectors.count(email_label), "Android and iOS must tap the actual email label")
        self.assertNotIn("Work email", selectors)

    def test_ios_runner_uses_supported_swift_toolchain(self):
        workflow = WORKFLOW.read_text(encoding="utf-8")
        self.assertIn("\n  ios-native:\n", workflow)
        ios = workflow.split("\n  ios-native:\n", 1)[1]
        self.assertRegex(ios, r"(?m)^\s+runs-on: macos-26\s*$")
        self.assertIn('XCODE_PATH="/Applications/Xcode_26.6.app"', ios)
        self.assertIn("Swift version 6\\.3", ios)
        self.assertNotIn('XCODE_PATH="/Applications/Xcode_26.2.app"', ios)


if __name__ == "__main__":
    unittest.main()
