from django.test import SimpleTestCase, override_settings

from billing.checkout_urls import (
    extra_seat_return_urls,
    mobile_bridge_url,
    subscription_return_urls,
)


@override_settings(FRONTEND_BASE_URL="https://app.example.test/")
class BillingCheckoutReturnUrlTests(SimpleTestCase):
    def test_mobile_bridge_encodes_path_and_omits_none_values(self):
        self.assertEqual(
            mobile_bridge_url("owner/shifts/9", payment="success", ignored=None),
            "https://app.example.test/mobile-checkout-return?path=owner%2Fshifts%2F9&payment=success",
        )

    def test_subscription_urls_preserve_owner_web_and_mobile_routes(self):
        account = {"scope": "owner"}
        self.assertEqual(
            subscription_return_urls(account, platform="web"),
            (
                "https://app.example.test/dashboard/owner/overview?view=billing&checkout=success",
                "https://app.example.test/dashboard/owner/overview?view=billing&checkout=cancel",
            ),
        )
        self.assertEqual(
            subscription_return_urls(account, platform="mobile"),
            (
                "https://app.example.test/mobile-checkout-return?path=owner%2Fsubscription-seats&checkout=success",
                "https://app.example.test/mobile-checkout-return?path=owner%2Fsubscription-seats&checkout=cancel",
            ),
        )

    def test_subscription_urls_preserve_organization_web_and_mobile_routes(self):
        account = {"scope": "organization"}
        self.assertEqual(
            subscription_return_urls(account, platform="web"),
            (
                "https://app.example.test/dashboard/organization/overview?checkout=success&billing=1",
                "https://app.example.test/dashboard/organization/overview?checkout=cancel&billing=1",
            ),
        )
        self.assertEqual(
            subscription_return_urls(account, platform="mobile"),
            (
                "https://app.example.test/mobile-checkout-return?path=organization%2Fprofile&checkout=success&billing=1",
                "https://app.example.test/mobile-checkout-return?path=organization%2Fprofile&checkout=cancel&billing=1",
            ),
        )

    def test_extra_seat_urls_preserve_owner_web_and_mobile_routes(self):
        account = {"scope": "owner"}
        self.assertEqual(
            extra_seat_return_urls(account, platform="web"),
            (
                "https://app.example.test/dashboard/owner/overview?view=billing&checkout=seat_success&mode=seats",
                "https://app.example.test/dashboard/owner/overview?view=billing&checkout=seat_cancel&mode=seats",
            ),
        )
        self.assertEqual(
            extra_seat_return_urls(account, platform="mobile"),
            (
                "https://app.example.test/mobile-checkout-return?path=owner%2Fsubscription-seats&checkout=seat_success",
                "https://app.example.test/mobile-checkout-return?path=owner%2Fsubscription-seats&checkout=seat_cancel",
            ),
        )

    def test_extra_seat_urls_preserve_organization_web_and_mobile_routes(self):
        account = {"scope": "organization"}
        self.assertEqual(
            extra_seat_return_urls(account, platform="web"),
            (
                "https://app.example.test/dashboard/organization/overview?checkout=seat_success&billing=1",
                "https://app.example.test/dashboard/organization/overview?checkout=seat_cancel&billing=1",
            ),
        )
        self.assertEqual(
            extra_seat_return_urls(account, platform="mobile"),
            (
                "https://app.example.test/mobile-checkout-return?path=organization%2Fprofile&checkout=seat_success&billing=1",
                "https://app.example.test/mobile-checkout-return?path=organization%2Fprofile&checkout=seat_cancel&billing=1",
            ),
        )
