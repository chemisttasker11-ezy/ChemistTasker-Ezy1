#!/bin/sh
set -e

cd /app

if [ "${WAIT_FOR_REDIS:-1}" = "1" ] && [ -n "${REDIS_URL:-}" ]; then
  python - <<'PY'
import os
import time
import redis

url = os.environ["REDIS_URL"]
deadline = time.time() + int(os.environ.get("REDIS_WAIT_TIMEOUT", "30"))
while True:
    try:
        redis.from_url(url).ping()
        print("[entrypoint] Redis reachable.")
        break
    except Exception as exc:
        if time.time() >= deadline:
            raise
        print(f"[entrypoint] Waiting for Redis: {exc}")
        time.sleep(1)
PY
fi

if [ "${RUN_MIGRATIONS:-0}" = "1" ]; then
  python manage.py check_content_migrations
  python manage.py migrate --noinput
fi

if [ "${COLLECT_STATIC:-0}" = "1" ]; then
  python manage.py collectstatic --noinput
fi

exec "$@"
