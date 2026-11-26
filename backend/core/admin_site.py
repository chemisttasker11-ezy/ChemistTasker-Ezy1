from django.contrib import admin
from django_otp.admin import OTPAdminAuthenticationForm, OTPAdminSite

from users.two_factor import API_DEVICE_NAMES


class AdminOTPAuthenticationForm(OTPAdminAuthenticationForm):
    def _chosen_device(self, user):
        device = super()._chosen_device(user)
        if device and device.name not in API_DEVICE_NAMES:
            return device
        return None


class ChemistTaskerOTPAdminSite(OTPAdminSite):
    site_header = "ChemistTasker Admin"
    site_title = "ChemistTasker Admin"
    index_title = "ChemistTasker Administration"
    login_form = AdminOTPAuthenticationForm

    def get_urls(self):
        from onboarding.ahpra_test_lookup import lookup_urls
        return lookup_urls(self) + super().get_urls()


otp_admin_site = ChemistTaskerOTPAdminSite(name="otpadmin")
otp_admin_site._registry = admin.site._registry
