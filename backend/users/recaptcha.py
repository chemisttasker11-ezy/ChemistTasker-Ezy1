"""Google reCAPTCHA verification for anonymous forms.

Logs go to the historical "users.views" channel that operators filter on."""
import logging
import requests


def verify_recaptcha(token):
    from django.conf import settings
    secret_key = settings.RECAPTCHA_SECRET_KEY
    url = 'https://www.google.com/recaptcha/api/siteverify'
    data = {'secret': secret_key, 'response': token}

    try:
        response = requests.post(url, data=data, timeout=5)
        response.raise_for_status()
    except requests.RequestException as exc:
        logging.getLogger("users.views").warning(
            "reCAPTCHA verification failed (error_type=%s)",
            type(exc).__name__,
        )
        return False

    try:
        result = response.json()
    except ValueError:
        logging.getLogger("users.views").warning("reCAPTCHA response was not valid JSON")
        return False
    return result.get('success', False)
