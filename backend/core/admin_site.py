from django.contrib import admin
from django_otp.admin import OTPAdminSite


class ChemistTaskerOTPAdminSite(OTPAdminSite):
    site_header = "ChemistTasker Admin"
    site_title = "ChemistTasker Admin"
    index_title = "ChemistTasker Administration"

    def get_urls(self):
        from onboarding.ahpra_test_lookup import lookup_urls
        return lookup_urls(self) + super().get_urls()


otp_admin_site = ChemistTaskerOTPAdminSite(name="otpadmin")
otp_admin_site._registry = admin.site._registry
