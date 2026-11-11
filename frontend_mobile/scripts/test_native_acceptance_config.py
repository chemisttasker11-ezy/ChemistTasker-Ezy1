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

    def test_ios_keyboard_dismissal_avoids_hide_keyboard(self):
        workflow = WORKFLOW.read_text(encoding="utf-8")
        ios = workflow.split("\n  ios-native:\n", 1)[1]
        self.assertNotRegex(ios, r"(?m)^\s*- hideKeyboard\s*$")
        self.assertRegex(ios, r'- inputText: "NativeSmoke1234"\s*\n\s*- tapOn: "Welcome back"\s*\n\s*- tapOn: "Sign in"')

        invoice = (ROOT / "frontend_mobile/.maestro/invoice-acceptance.yaml").read_text(encoding="utf-8")
        android_dismiss = '    when:\n      platform: Android\n    commands:\n      - hideKeyboard'
        ios_dismiss = '    when:\n      platform: iOS\n    commands:\n      - tapOn: "Items & services"'
        self.assertEqual(2, invoice.count(android_dismiss))
        self.assertEqual(2, invoice.count(ios_dismiss))
        self.assertNotIn("hideKeyboard", invoice.replace(android_dismiss, ""))


    def test_both_native_flows_open_the_real_admin_persona_picker(self):
        """After signing in as a pharmacist, admin is a persona option, not the landing screen."""
        workflow = WORKFLOW.read_text(encoding="utf-8")
        switcher = (ROOT / "frontend_mobile/components/shell/WorkspaceSwitch.tsx").read_text(encoding="utf-8")
        self.assertIn('accessibilityLabel={`${group.sheetTitle}. Current: ${group.label}`}', switcher)
        self.assertIn('accessibilityLabel={option.helper ? `${option.label}, ${option.helper}` : option.label}', switcher)
        # Two embedded Maestro journeys: Android and iOS. Both select the
        # specific pharmacy admin radio from the authenticated worker home.
        self.assertEqual(2, workflow.count('- tapOn: "Switch workspace. Current: Pharmacist"'))
        self.assertEqual(2, workflow.count('- tapOn: "Admin, Native Pharmacy A"'))
        self.assertEqual(2, workflow.count('- tapOn: "Native Pharmacy B"'))
        self.assertNotIn('- tapOn: "Admin"\n', workflow)
        self.assertNotIn('- assertVisible: "Welcome Native,"', workflow)
        self.assertNotIn('visible: "Welcome Native,"', workflow)
        self.assertNotIn('visible: "Admin workspace"', workflow)
        self.assertNotIn('Admin( workspace)?', workflow)
        self.assertNotIn('Pharmacist( workspace)?', workflow)
        self.assertEqual(2, workflow.count('visible: "Shift Centre"'))
        self.assertNotIn('visible: "Shift Center"', workflow)
        for job in (workflow.split("\n  ios-native:\n", 1)[0], workflow.split("\n  ios-native:\n", 1)[1]):
            for selector in (
                '- tapOn: "Switch workspace. Current: Pharmacist"',
                '- tapOn: "Admin, Native Pharmacy A"',
                '- tapOn: "Administering pharmacy. Current: Native Pharmacy A"',
                '- tapOn: "Native Pharmacy B"',
                'visible: "Administering pharmacy. Current: Native Pharmacy B"',
                '- tapOn: "Switch workspace. Current: Admin"',
                '- tapOn: "Pharmacist"',
                'visible: "Shift Centre"',
            ):
                self.assertIn(selector, job)
        self.assertIn("'shifts/index': 'Shift Centre'", (ROOT / 'frontend_mobile/app/admin/_layout.tsx').read_text(encoding='utf-8'))


if __name__ == "__main__":
    unittest.main()
