"""Temporary, opt-in admin lookup; the model-name sentinel never targets a profile."""
import hmac
import re
import time
from types import SimpleNamespace
from uuid import uuid4

from django import forms
from django.conf import settings
from django.core.cache import caches
from django.db import transaction
from django.http import Http404, HttpResponseNotFound
from django.shortcuts import redirect
from django.template.response import TemplateResponse
from django.urls import path, reverse
from django.views.decorators.http import require_http_methods

from onboarding.models import AhpraCheck
from onboarding.verification.ahpra_numbers import full_registration_number
from onboarding.verification.desktop import enqueue_check

TEST_MODEL = 'AhpraTestLookup'
KEY_HOURLY_LIMIT = 30


class LookupForm(forms.Form):
    registration_number = forms.CharField(max_length=32, help_text='PHA followed by 10 digits')
    first_name = forms.CharField(required=False, max_length=150)
    last_name = forms.CharField(required=False, max_length=150)
    role = forms.ChoiceField(choices=[('pharmacist', 'Pharmacist'), ('intern', 'Intern')])

    def clean_registration_number(self):
        raw = re.sub(r'[\s\-]+', '', self.cleaned_data['registration_number']).upper()
        number = full_registration_number(raw)
        if not raw.startswith('PHA') or not number:
            raise forms.ValidationError('Enter PHA followed by 10 digits.')
        return number


def _within_hourly_limit():
    key = f'ahpra-test-lookup:{int(time.time() // 3600)}'
    try:
        cache = caches['ahpra']
        cache.add(key, 0, 3600)
        return cache.incr(key) <= KEY_HOURLY_LIMIT
    except Exception:
        return False  # No counter, no lookup.


def lookup_page(request, url, template, context, limited=False):
    checks = AhpraCheck.objects.filter(model_name=TEST_MODEL)
    form = LookupForm(request.POST if request.method == 'POST' else None)
    if request.method == 'POST':
        if request.POST.get('action') == 'delete':
            checks.delete()
            return redirect(url)
        if form.is_valid():
            if limited and not _within_hourly_limit():
                form.add_error(None, 'Too many test lookups this hour. Please try again later.')
            else:
                data = form.cleaned_data.copy()
                number = data.pop('registration_number')
                # A fresh synthetic identity permits repeated lookups without profile ownership checks.
                identity = SimpleNamespace(_meta=SimpleNamespace(object_name=TEST_MODEL), pk=uuid4().int >> 65)
                with transaction.atomic():
                    enqueue_check(identity, number, 'onboarding', register_data={'_test_input': data})
                return redirect(url)
    recent = list(checks.order_by('-created_at', '-pk')[:20])
    for check in recent:
        check.lookup_outcome = check.register_data.get('_test_outcome', check.outcome)
        check.decision = check.outcome if check.lookup_outcome == 'found' else ''
    return TemplateResponse(request, template, {
        **context, 'title': 'AHPRA test lookup', 'form': form,
        'checks': recent, 'pending': checks.filter(status__in=['pending', 'sent']).exists(),
    })


@require_http_methods(['GET', 'POST'])
def key_lookup_view(request, key):
    expected = settings.AHPRA_TEST_LOOKUP_KEY
    if not (settings.AHPRA_TEST_LOOKUP_ENABLED and len(expected) >= 32
            and hmac.compare_digest(key.encode(), expected.encode())):
        response = HttpResponseNotFound()
        response._has_been_logged = True  # Django would log the path, which may hold the real key.
        return response
    return lookup_page(request, request.path, 'onboarding/ahpra_test_lookup_public.html', {}, limited=True)


def lookup_urls(admin_site):
    def enabled_view(request):
        if not settings.AHPRA_TEST_LOOKUP_ENABLED:
            raise Http404
        return admin_site.admin_view(view)(request)

    @require_http_methods(['GET', 'POST'])
    def view(request):
        request.current_app = admin_site.name
        return lookup_page(request, reverse(f'{admin_site.name}:ahpra_test_lookup'),
                           'admin/ahpra_test_lookup.html', admin_site.each_context(request))

    return [path('ahpra-test-lookup/', enabled_view, name='ahpra_test_lookup')]
