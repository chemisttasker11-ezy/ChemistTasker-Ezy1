from django.conf import settings
from django.shortcuts import redirect
from django_otp import devices_for_user
from two_factor.views.core import LoginView, OTPRequiredMixin
from two_factor.views.profile import ProfileView
from users.two_factor import API_DEVICE_NAMES


class AdminAwareLoginView(LoginView):
    def get_devices(self):
        return [device for device in super().get_devices() if device.name not in API_DEVICE_NAMES]

    def get_other_devices(self, main_device):
        return [
            device for device in super().get_other_devices(main_device)
            if device.name not in API_DEVICE_NAMES
        ]

    def done(self, form_list, **kwargs):
        redirect_to = self.get_success_url()
        response = super().done(form_list, **kwargs)

        next_url = self.request.GET.get("next") or ""
        admin_url = f"/{settings.ADMIN_URL.strip('/')}/"
        has_confirmed_device = any(device.confirmed for device in devices_for_user(self.get_user()))

        if self.get_user().is_staff and next_url.startswith(admin_url) and not has_confirmed_device:
            self.request.session["next"] = redirect_to
            return redirect("two_factor:setup")

        if OTPRequiredMixin.is_otp_view(next_url):
            self.request.session["next"] = self.get_success_url()
            return redirect("two_factor:setup")

        return response


class AdminTwoFactorProfileView(ProfileView):
    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        device = self.request.user.staticdevice_set.exclude(name__in=API_DEVICE_NAMES).first()
        context["backup_tokens"] = device.token_set.count() if device else 0
        return context
