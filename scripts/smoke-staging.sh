#!/usr/bin/env bash
set -euo pipefail

preview_url="${1:-}"
if [[ -z "$preview_url" ]]; then
  echo "Usage: $0 https://staging-host" >&2
  exit 2
fi
preview_url="${preview_url%/}"

tmp_headers="$(mktemp)"
tmp_body="$(mktemp)"
trap 'rm -f "$tmp_headers" "$tmp_body"' EXIT

curl -fsS --max-time 20 -D "$tmp_headers" -o "$tmp_body" "$preview_url/"
grep -qi '^strict-transport-security:' "$tmp_headers"
grep -qi '^x-frame-options:[[:space:]]*DENY' "$tmp_headers"
grep -qi '^x-content-type-options:[[:space:]]*nosniff' "$tmp_headers"
grep -qi '^referrer-policy:[[:space:]]*strict-origin-when-cross-origin' "$tmp_headers"

curl -fsS --max-time 20 "$preview_url/login" >/dev/null
curl -fsS --max-time 20 "$preview_url/api/users/mobile/app-config/" >/dev/null

status="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 "$preview_url/api/users/me/")"
if [[ "$status" != "401" && "$status" != "403" ]]; then
  echo "Expected anonymous /api/users/me/ to be denied, got HTTP $status" >&2
  exit 1
fi

csrf_json="$(curl -fsS --max-time 20 -c /tmp/chemisttasker-smoke-cookies "$preview_url/api/users/csrf/")"
csrf_token="$(printf '%s' "$csrf_json" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("csrfToken",""))')"
test -n "$csrf_token"

csrf_status="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20   -X POST   -H "Origin: $preview_url"   -H "Content-Type: application/json"   --data '{}'   "$preview_url/api/users/token/refresh/")"
if [[ "$csrf_status" != "403" ]]; then
  echo "Expected browser refresh without CSRF to be rejected with 403, got HTTP $csrf_status" >&2
  exit 1
fi

otp_status="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20   -X POST   -H "Origin: $preview_url"   -H "X-Client-Platform: web"   -H "Content-Type: application/json"   --data '{"email":"nobody@example.invalid","otp":"000000"}'   "$preview_url/api/users/verify-otp/")"
if [[ "$otp_status" != "403" ]]; then
  echo "Expected browser OTP verification without CSRF to be rejected with 403, got HTTP $otp_status" >&2
  exit 1
fi

rm -f /tmp/chemisttasker-smoke-cookies

echo "SMOKE_TESTS=PASS"
