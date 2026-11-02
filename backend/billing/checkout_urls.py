"""Pure checkout-return URL construction for billing flows."""

from urllib.parse import urlencode

from django.conf import settings


def frontend_base_url():
    return getattr(settings, 'FRONTEND_BASE_URL', 'http://localhost:5173').rstrip('/')


def mobile_bridge_url(path, **params):
    base = frontend_base_url()
    query = urlencode({
        'path': path,
        **{key: value for key, value in params.items() if value is not None},
    })
    return f"{base}/mobile-checkout-return?{query}"


def subscription_return_urls(account, platform='web'):
    if platform == 'mobile':
        if account['scope'] == 'organization':
            return (
                mobile_bridge_url('organization/profile', checkout='success', billing='1'),
                mobile_bridge_url('organization/profile', checkout='cancel', billing='1'),
            )
        return (
            mobile_bridge_url('owner/subscription-seats', checkout='success'),
            mobile_bridge_url('owner/subscription-seats', checkout='cancel'),
        )

    base = frontend_base_url()
    if account['scope'] == 'organization':
        success = f"{base}/dashboard/organization/overview?checkout=success&billing=1"
        cancel = f"{base}/dashboard/organization/overview?checkout=cancel&billing=1"
    else:
        success = f"{base}/dashboard/owner/overview?view=billing&checkout=success"
        cancel = f"{base}/dashboard/owner/overview?view=billing&checkout=cancel"
    return success, cancel


def extra_seat_return_urls(account, platform='web'):
    if platform == 'mobile':
        if account['scope'] == 'organization':
            return (
                mobile_bridge_url('organization/profile', checkout='seat_success', billing='1'),
                mobile_bridge_url('organization/profile', checkout='seat_cancel', billing='1'),
            )
        return (
            mobile_bridge_url('owner/subscription-seats', checkout='seat_success'),
            mobile_bridge_url('owner/subscription-seats', checkout='seat_cancel'),
        )

    base = frontend_base_url()
    if account['scope'] == 'organization':
        success = f"{base}/dashboard/organization/overview?checkout=seat_success&billing=1"
        cancel = f"{base}/dashboard/organization/overview?checkout=seat_cancel&billing=1"
    else:
        success = f"{base}/dashboard/owner/overview?view=billing&checkout=seat_success&mode=seats"
        cancel = f"{base}/dashboard/owner/overview?view=billing&checkout=seat_cancel&mode=seats"
    return success, cancel
