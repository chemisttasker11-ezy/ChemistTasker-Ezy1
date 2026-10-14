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
# Staging must never be indexed by search engines.
grep -qi '^x-robots-tag:[[:space:]]*noindex' "$tmp_headers"
curl -fsS --max-time 20 "$preview_url/robots.txt" | grep -qx 'Disallow: /'

# Vite-owned routes reached through the Next fallback rewrites (kiosk,
# membership) and the Vite bundle itself, served compressed.
for path in /kiosk /membership/apply/smoke-invalid-token /setup/; do
  curl -fsS --max-time 20 -o /dev/null "$preview_url$path"
done
vite_js="$(curl -fsS --max-time 20 "$preview_url/setup/" | grep -Eo '/js/app\.[A-Za-z0-9_-]+\.js' | head -n 1)"
test -n "$vite_js"
curl -fsS --max-time 20 -H 'Accept-Encoding: gzip' -D "$tmp_headers" -o /dev/null "$preview_url$vite_js"
grep -qi '^content-encoding:[[:space:]]*gzip' "$tmp_headers"

curl -fsS --max-time 20 "$preview_url/login" >/dev/null
curl -fsS --max-time 20 "$preview_url/api/v1/users/mobile/app-config/" >/dev/null

# Exercise both the Django feature and Next SSR; a healthy home page alone
# does not detect private-network HTTPS redirect failures in the Hub client.
curl -fsS --max-time 20 -o "$tmp_body" "$preview_url/api/v1/public-hub/community/"
python3 - "$tmp_body" <<'PY'
import json
import sys
with open(sys.argv[1]) as source:
    hubs = json.load(source)
assert {hub['key'] for hub in hubs} == {'public', 'pharmacist', 'intern', 'staff', 'explorer', 'owner'}, 'Public Hub directory is incomplete'
PY
curl -fsS --max-time 20 -o "$tmp_body" "$preview_url/hubs"
grep -Fq 'Find your community.' "$tmp_body"
for hub in public pharmacist intern staff explorer owner; do
  grep -Fq "href=\"/hubs/$hub\"" "$tmp_body"
done

status="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 "$preview_url/api/v1/users/me/")"
if [[ "$status" != "401" && "$status" != "403" ]]; then
  echo "Expected anonymous /api/v1/users/me/ to be denied, got HTTP $status" >&2
  exit 1
fi

csrf_json="$(curl -fsS --max-time 20 -c /tmp/chemisttasker-smoke-cookies "$preview_url/api/v1/users/csrf/")"
csrf_token="$(printf '%s' "$csrf_json" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("csrfToken",""))')"
test -n "$csrf_token"

csrf_status="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20   -X POST   -H "Origin: $preview_url"   -H "Content-Type: application/json"   --data '{}'   "$preview_url/api/v1/users/token/refresh/")"
if [[ "$csrf_status" != "403" ]]; then
  echo "Expected browser refresh without CSRF to be rejected with 403, got HTTP $csrf_status" >&2
  exit 1
fi

otp_status="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20   -X POST   -H "Origin: $preview_url"   -H "X-Client-Platform: web"   -H "Content-Type: application/json"   --data '{"email":"nobody@example.invalid","otp":"000000"}'   "$preview_url/api/v1/users/verify-otp/")"
if [[ "$otp_status" != "403" ]]; then
  echo "Expected browser OTP verification without CSRF to be rejected with 403, got HTTP $otp_status" >&2
  exit 1
fi

rm -f /tmp/chemisttasker-smoke-cookies

echo "SMOKE_TESTS=PASS"
