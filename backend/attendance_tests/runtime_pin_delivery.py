"""Exercise actual HTTP PIN setup against the disposable acceptance backend."""
import json
from pathlib import Path
import requests
from django.conf import settings
from django.contrib.auth import get_user_model
from client_profile.models import Pharmacy
from client_profile.attendance_credentials import activate_kiosk_device

assert settings.SETTINGS_MODULE == "attendance_tests.runtime_settings"
assert settings.DATABASES["default"]["NAME"].startswith("chemisttasker_kiosk_test_")
pharmacy = Pharmacy.objects.get(name="LOCAL TEST Pharmacy")
owner = get_user_model().objects.get(email="owner@kiosk-acceptance.invalid")
device, token = activate_kiosk_device(owner, pharmacy, "PIN Delivery Acceptance")
session = requests.Session()
session.trust_env = False
base = "http://127.0.0.1:8001/api/client-profile/attendance/kiosk/"
response = session.post(base + "worker-pin/status/", headers={"X-Device-Token": token},
    json={"identifier": "chemisttasker@gmail.com"}, timeout=45)
print(json.dumps({"http_status": response.status_code, "response": response.json()}))
response.raise_for_status()
local = Path(settings.BASE_DIR).parent / ".local-run" / "kiosk-pin-http.json"
local.write_text(json.dumps({"token": token, "device_id": device.pk}), encoding="utf-8")
