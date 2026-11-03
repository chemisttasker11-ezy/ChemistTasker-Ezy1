#!/usr/bin/env bash
set -euo pipefail

[[ $# == 3 && "$1" =~ ^[0-9a-fA-F-]{36}$ && -f "$2" ]] || {
  echo 'Usage: run-ios-link-consent.sh SIMULATOR_UDID FLOW_FILE LOG_PREFIX' >&2; exit 2;
}
simulator="$1"; flow="$2"; log_prefix="$3"
for attempt in 1 2; do
  status=0
  log="${log_prefix}-${attempt}.log"
  maestro --device "$simulator" test "$flow" > "$log" 2>&1 || status=$?
  cat "$log"
  if ((status == 0)); then exit 0; fi
  if ((status == 130 || status == 143 || attempt == 2)) ||
      ! grep -Eq 'IOSDriverTimeoutException|iOS driver not ready in time' "$log"; then
    exit "$status"
  fi
  # Consent precedes account/invoice actions; never retry the full acceptance journey.
  echo 'Maestro driver did not start; rebooting the selected simulator once.' >&2
  xcrun simctl shutdown "$simulator" || true
  xcrun simctl boot "$simulator"
  xcrun simctl bootstatus "$simulator" -b
done
