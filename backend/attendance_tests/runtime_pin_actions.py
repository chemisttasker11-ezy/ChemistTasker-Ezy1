"""HTTP acceptance following runtime_pin_delivery.py; uses only the test database."""
import json
from pathlib import Path
import requests
from django.conf import settings
from client_profile.models import Notification, AttendanceEvent, AttendanceSession

assert settings.SETTINGS_MODULE == "attendance_tests.runtime_settings"
assert settings.DATABASES["default"]["NAME"].startswith("chemisttasker_kiosk_test_")
credentials = json.loads((Path(settings.BASE_DIR).parent / ".local-run" / "kiosk-pin-http.json").read_text())
session = requests.Session()
session.trust_env = False
session.headers["X-Device-Token"] = credentials["token"]
base = "http://127.0.0.1:8001/api/client-profile/attendance/kiosk/"
identifier = "chemisttasker@gmail.com"
pin = "246810"
otp = Notification.objects.filter(title="Kiosk PIN Setup Code").latest("id").payload["otp"]

def post(path, data, expected=200):
    response = session.post(base + path, json=data, timeout=45)
    assert response.status_code == expected, (path, response.status_code, response.text[:300])
    return response.json()

bad = post("worker-pin/setup/", {"identifier": identifier, "verification_code": "000000", "new_pin": pin}, 400)
setup = post("worker-pin/setup/", {"identifier": identifier, "verification_code": otp, "new_pin": pin}, 201)
assert setup["action"] == "CLOCKED_IN", setup
worker_id = setup["worker_id"]
post("pin-clock/", {"identifier": identifier, "pin": "000000"}, 400)
for action in ("START", "END"):
    post("break/", {"worker_id": worker_id, "action": action, "pin": pin})
out = post("pin-clock/", {"identifier": identifier, "pin": pin})
assert out["action"] == "CLOCKED_OUT", out
events = list(AttendanceEvent.objects.filter(session_id=setup["session_id"]).order_by("id").values_list("event_type", flat=True))
assert events == ["CLOCK_IN", "BREAK_START", "BREAK_END", "CLOCK_OUT"], events
assert AttendanceSession.objects.get(pk=setup["session_id"]).ended_at is not None
print(json.dumps({"pin_setup": "PASS", "invalid_otp": "REJECTED", "invalid_pin": "REJECTED", "http_actions": events, "session_closed": True}))
