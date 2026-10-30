#!/usr/bin/env python3
"""Read-only test-account price check. Does not create sessions, charges or events."""
import json
import os
from pathlib import Path
import sys
from datetime import datetime, timezone
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
from billing.checkout_prices import FULFILLMENT_PRICES


def main():
    key = os.environ.get('STRIPE_SECRET_KEY', '')
    if not key.startswith(('sk_test_', 'rk_test_')) or len(key) < 40:
        print('BLOCKED: configured Stripe test-account credentials are unavailable', file=sys.stderr)
        return 2
    import stripe
    stripe.api_key = key
    rows = []
    try:
        for identity, amount in FULFILLMENT_PRICES.items():
            price = stripe.Price.retrieve(identity)
            valid = (price.get('livemode') is False and price.get('active') is True
                     and price.get('currency') == 'aud' and price.get('unit_amount') == amount
                     and price.get('type') == 'one_time' and price.get('billing_scheme') == 'per_unit'
                     and not price.get('transform_quantity'))
            rows.append({'id': identity, 'expected_cents': amount, 'actual_cents': price.get('unit_amount'),
                         'currency': price.get('currency'), 'active': price.get('active'), 'pass': valid})
    except stripe.error.StripeError as exc:
        # Never print credentials, HTTP headers or the provider's full exception.
        print(f'STRIPE_PRICE_VERIFICATION=FAILED ({type(exc).__name__})', file=sys.stderr)
        return 1
    result = {'recorded_at': datetime.now(timezone.utc).isoformat(), 'tested_sha': os.environ.get('TESTED_SHA'),
              'test_account': True, 'read_only': True, 'prices': rows,
              'webhook_lifecycle_verified': False, 'pass': all(row['pass'] for row in rows)}
    print(json.dumps(result, indent=2))
    return 0 if result['pass'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
