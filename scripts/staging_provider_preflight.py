"""Reject live Stripe configuration before staging maintenance changes services or data."""
import json
import re
import sys


def validate_provider(config):
    for owner in ("web", "migration"):
        environment = config["services"][owner]["environment"]
        key = environment.get("STRIPE_SECRET_KEY", "")
        if isinstance(key, str) and re.fullmatch(r"(?:sk|rk)_live_[A-Za-z0-9]{8,}", key):
            raise ValueError("Live staging provider configuration")


if __name__ == "__main__":
    try:
        validate_provider(json.load(sys.stdin))
    except (KeyError, TypeError, ValueError, AttributeError):
        # Compose input contains secrets: never print input or exception details.
        print("Staging provider preflight failed; web and migration must use test-mode Stripe credentials or leave collection disabled.", file=sys.stderr)
        raise SystemExit(1)
