"""
Unit tests for AHPRA Verifier Desktop Bridge.

Runs without network or external processes using fake runners and fake websockets.
"""

from __future__ import annotations

import asyncio
from datetime import datetime
import io
import json
import logging
import os
import subprocess
import tempfile
from pathlib import Path
import threading
import time
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from scripts.ahpra_verifier.bridge import (
    AhpraBridge,
    default_runner,
    default_repair_runner,
    isolated_repair,
    load_config,
    parse_cli_output,
    strip_code_fences,
    usage_limit_wait,
)

# Silence informational log outputs during test execution
logging.getLogger("ahpra_verifier").setLevel(logging.CRITICAL)


class TestCliJsonParsing(unittest.TestCase):
    """Tests parsing of CLI JSON wrappers and inner model responses."""

    def test_found_with_impossible_expiry_is_error(self):
        for bad in ("2099-02-30", "2099-2-3", "30/11/2026"):
            cli_output = json.dumps({"result": json.dumps({
                "outcome": "found",
                "register": {"name": "Jane", "expiry_date": bad, "conditions": False, "undertakings": False, "reprimands": False},
            })})
            res = parse_cli_output(cli_output)
            self.assertEqual(res["outcome"], "error", bad)
            self.assertIsNone(res["register"])
            self.assertIn("expiry date", res["error"])

    def test_parse_plain_json_found(self):
        cli_output = json.dumps({
            "result": json.dumps({
                "outcome": "found",
                "register": {
                    "name": "Jane Practitioner",
                    "profession": "Pharmacist",
                    "registration_status": "Registered",
                    "registration_type": "General",
                    "expiry_date": "2026-11-30",
                    "conditions": False,
                    "undertakings": False,
                    "reprimands": False,
                },
                "error": "",
            })
        })
        res = parse_cli_output(cli_output)
        self.assertEqual(res["outcome"], "found")
        self.assertIsNotNone(res["register"])
        self.assertEqual(res["register"]["name"], "Jane Practitioner")
        self.assertEqual(res["register"]["profession"], "Pharmacist")
        self.assertEqual(res["register"]["registration_status"], "Registered")
        self.assertEqual(res["register"]["registration_type"], "General")
        self.assertEqual(res["register"]["expiry_date"], "2026-11-30")
        self.assertFalse(res["register"]["conditions"])
        self.assertFalse(res["register"]["undertakings"])
        self.assertFalse(res["register"]["reprimands"])
        self.assertEqual(res["error"], "")

    def test_parse_registration_requirements_present(self):
        req_text = "The Practitioner will only practise with supervision by a Board approved supervisor ... Pathway: Supervised practice"
        cli_output = json.dumps({
            "result": json.dumps({
                "outcome": "found",
                "register": {
                    "name": "Jane Doe",
                    "profession": "Pharmacist",
                    "registration_status": "Registered",
                    "registration_type": "Provisional",
                    "expiry_date": "2026-11-30",
                    "conditions": False,
                    "undertakings": False,
                    "reprimands": False,
                    "registration_requirements": req_text,
                    "supervised_practice": True,
                },
                "error": "",
            })
        })
        res = parse_cli_output(cli_output)
        self.assertEqual(res["outcome"], "found")
        self.assertIsNotNone(res["register"])
        self.assertEqual(res["register"]["registration_requirements"], req_text)
        self.assertTrue(res["register"]["supervised_practice"])
        self.assertIsInstance(res["register"]["registration_requirements"], str)
        self.assertIsInstance(res["register"]["supervised_practice"], bool)

    def test_parse_registration_requirements_missing_defaults(self):
        cli_output = json.dumps({
            "result": json.dumps({
                "outcome": "found",
                "register": {
                    "name": "Jane Practitioner",
                    "profession": "Pharmacist",
                    "registration_status": "Registered",
                    "registration_type": "General",
                    "expiry_date": "2026-11-30",
                    "conditions": False,
                    "undertakings": False,
                    "reprimands": False,
                },
                "error": "",
            })
        })
        res = parse_cli_output(cli_output)
        self.assertEqual(res["outcome"], "found")
        self.assertIsNotNone(res["register"])
        self.assertEqual(res["register"]["registration_requirements"], "")
        self.assertFalse(res["register"]["supervised_practice"])
        self.assertIsInstance(res["register"]["registration_requirements"], str)
        self.assertIsInstance(res["register"]["supervised_practice"], bool)

    def test_parse_registration_requirements_max_length_truncation(self):
        long_req = "X" * 1200
        cli_output = json.dumps({
            "result": json.dumps({
                "outcome": "found",
                "register": {
                    "name": "Jane Practitioner",
                    "profession": "Pharmacist",
                    "registration_status": "Registered",
                    "registration_type": "General",
                    "expiry_date": "2026-11-30",
                    "conditions": False,
                    "undertakings": False,
                    "reprimands": False,
                    "registration_requirements": long_req,
                    "supervised_practice": True,
                },
                "error": "",
            })
        })
        res = parse_cli_output(cli_output)
        self.assertEqual(len(res["register"]["registration_requirements"]), 1000)
        self.assertEqual(res["register"]["registration_requirements"], "X" * 1000)
        self.assertTrue(res["register"]["supervised_practice"])

    def test_parse_fenced_json_found(self):
        inner_content = """```json
{
  "outcome": "found",
  "register": {
    "name": "John Smith",
    "profession": "Pharmacist",
    "registration_status": "Registered",
    "registration_type": "Provisional",
    "expiry_date": null,
    "conditions": true,
    "undertakings": false,
    "reprimands": false
  },
  "error": ""
}
```"""
        cli_output = json.dumps({"result": inner_content})
        res = parse_cli_output(cli_output)
        self.assertEqual(res["outcome"], "found")
        self.assertEqual(res["register"]["name"], "John Smith")
        self.assertEqual(res["register"]["registration_type"], "Provisional")
        self.assertIsNone(res["register"]["expiry_date"])
        self.assertTrue(res["register"]["conditions"])

    def test_parse_fenced_without_language_tag(self):
        inner_content = """```
{
  "outcome": "not_found",
  "register": null,
  "error": ""
}
```"""
        cli_output = json.dumps({"result": inner_content})
        res = parse_cli_output(cli_output)
        self.assertEqual(res["outcome"], "not_found")
        self.assertIsNone(res["register"])
        self.assertEqual(res["error"], "")

    def test_parse_top_level_fields_fallback(self):
        # Case where model returned register fields at top-level instead of nested
        cli_output = json.dumps({
            "result": json.dumps({
                "outcome": "found",
                "name": "Alex Taylor",
                "profession": "Pharmacist",
                "registration_status": "Registered",
                "registration_type": "General",
                "expiry_date": "2027-05-15",
                "conditions": False,
                "undertakings": True,
                "reprimands": False,
            })
        })
        res = parse_cli_output(cli_output)
        self.assertEqual(res["outcome"], "found")
        self.assertEqual(res["register"]["name"], "Alex Taylor")
        self.assertTrue(res["register"]["undertakings"])

    def test_parse_outcome_not_found(self):
        cli_output = json.dumps({
            "result": json.dumps({
                "outcome": "not_found",
                "register": None,
                "error": "",
            })
        })
        res = parse_cli_output(cli_output)
        self.assertEqual(res["outcome"], "not_found")
        self.assertIsNone(res["register"])
        self.assertEqual(res["error"], "")

    def test_parse_outcome_blocked(self):
        cli_output = json.dumps({
            "result": json.dumps({
                "outcome": "blocked",
                "register": None,
                "error": "Encountered Cloudflare challenge",
            })
        })
        res = parse_cli_output(cli_output)
        self.assertEqual(res["outcome"], "blocked")
        self.assertIsNone(res["register"])
        self.assertIn("Cloudflare", res["error"])

    def test_parse_outcome_error(self):
        cli_output = json.dumps({
            "result": json.dumps({
                "outcome": "error",
                "register": None,
                "error": "Failed to open browser tab",
            })
        })
        res = parse_cli_output(cli_output)
        self.assertEqual(res["outcome"], "error")
        self.assertIsNone(res["register"])
        self.assertEqual(res["error"], "Failed to open browser tab")

    def test_parse_unparseable_cli_json(self):
        res = parse_cli_output("Invalid JSON wrapper from CLI")
        self.assertEqual(res["outcome"], "error")
        self.assertIsNone(res["register"])
        self.assertIn("Invalid CLI JSON wrapper", res["error"])

    def test_parse_missing_result_field(self):
        res = parse_cli_output(json.dumps({"status": "ok"}))
        self.assertEqual(res["outcome"], "error")
        self.assertIn("missing 'result' field", res["error"])

    def test_parse_unparseable_inner_json(self):
        cli_output = json.dumps({"result": "I am not valid JSON"})
        res = parse_cli_output(cli_output)
        self.assertEqual(res["outcome"], "error")
        self.assertIn("Failed to parse inner model JSON", res["error"])

    def test_parse_invalid_outcome_value(self):
        cli_output = json.dumps({"result": json.dumps({"outcome": "random_status"})})
        res = parse_cli_output(cli_output)
        self.assertEqual(res["outcome"], "error")
        self.assertIn("Invalid or missing outcome", res["error"])

    def test_parse_permission_required_error(self):
        cli_output = json.dumps({
            "result": json.dumps({
                "outcome": "error",
                "register": None,
                "error": "permission_required: Claude in Chrome requires permission for ahpra.gov.au",
            })
        })
        res = parse_cli_output(cli_output)
        self.assertEqual(res["outcome"], "error")
        self.assertIsNone(res["register"])
        self.assertTrue(res["error"].startswith("permission_required:"))
        self.assertIn("ahpra.gov.au", res["error"])

    def test_parse_raw_cli_output_requires_permission(self):
        cli_output = json.dumps({
            "result": "Claude in Chrome requires permission to access https://www.ahpra.gov.au"
        })
        res = parse_cli_output(cli_output)
        self.assertEqual(res["outcome"], "error")
        self.assertIsNone(res["register"])
        self.assertTrue(res["error"].startswith("permission_required:"))

    def test_parse_blocked_remapped_when_requires_permission(self):
        # When model returned 'blocked' but reason was Claude in Chrome extension permission refusal
        cli_output = json.dumps({
            "result": json.dumps({
                "outcome": "blocked",
                "register": None,
                "error": "Claude in Chrome requires permission",
            })
        })
        res = parse_cli_output(cli_output)
        self.assertEqual(res["outcome"], "error")
        self.assertIsNone(res["register"])
        self.assertTrue(res["error"].startswith("permission_required:"))

    def test_parse_plain_text_requires_permission(self):
        raw = "Error: Claude in Chrome requires permission to access ahpra.gov.au"
        res = parse_cli_output(raw)
        self.assertEqual(res["outcome"], "error")
        self.assertIsNone(res["register"])
        self.assertTrue(res["error"].startswith("permission_required:"))

    def test_parse_real_block_stays_blocked(self):
        cli_output = json.dumps({
            "result": json.dumps({
                "outcome": "blocked",
                "register": None,
                "error": "Cloudflare captcha detected on ahpra.gov.au",
            })
        })
        res = parse_cli_output(cli_output)
        self.assertEqual(res["outcome"], "blocked")
        self.assertIsNone(res["register"])
        self.assertFalse(res["error"].startswith("permission_required:"))
        self.assertIn("Cloudflare", res["error"])


class FakeWebSocket:
    """Fake websocket client connection for message handling tests."""

    def __init__(self):
        self.sent_messages: list[str] = []
        self.closed: bool = False

    async def send(self, msg: str):
        self.sent_messages.append(msg)

    def get_sent_json(self) -> list[dict]:
        return [json.loads(m) for m in self.sent_messages]


class TestMinGapLogic(unittest.IsolatedAsyncioTestCase):
    """Tests enforcement of minimum gap between consecutive lookups."""

    async def test_min_gap_enforced(self):
        call_times = []

        def fake_runner(reg: str) -> str:
            call_times.append(time.monotonic())
            return json.dumps({
                "result": json.dumps({
                    "outcome": "found",
                    "register": {
                        "name": f"Practitioner {reg}",
                        "profession": "Pharmacist",
                        "registration_status": "Registered",
                        "registration_type": "General",
                        "expiry_date": "2026-12-31",
                        "conditions": False,
                        "undertakings": False,
                        "reprimands": False,
                    },
                })
            })

        min_gap = 0.08  # 80ms
        bridge = AhpraBridge(
            url="ws://localhost:9999",
            token="test-token",
            min_gap_seconds=min_gap,
            runner=fake_runner,
        )
        fake_ws = FakeWebSocket()
        bridge.ws = fake_ws

        # Process first check
        await bridge._process_single_check({"check_id": 1, "registration_number": "PHA001"})
        # Process second check immediately
        await bridge._process_single_check({"check_id": 2, "registration_number": "PHA002"})

        self.assertEqual(len(call_times), 2)
        gap = call_times[1] - call_times[0]
        self.assertGreaterEqual(gap, min_gap * 0.95)

        sent = fake_ws.get_sent_json()
        self.assertEqual(len(sent), 2)
        self.assertEqual(sent[0]["check_id"], 1)
        self.assertEqual(sent[1]["check_id"], 2)


class TestBlockedPauseLogic(unittest.IsolatedAsyncioTestCase):
    """Tests the 30-minute pause logic triggered by a 'blocked' outcome."""

    async def test_blocked_pauses_lookups(self):
        runner_invocations = []

        def fake_runner(reg: str) -> str:
            runner_invocations.append((reg, time.monotonic()))
            if reg == "BLOCKED_REG":
                return json.dumps({
                    "result": json.dumps({
                        "outcome": "blocked",
                        "error": "Cloudflare captcha detected",
                    })
                })
            return json.dumps({
                "result": json.dumps({
                    "outcome": "found",
                    "register": {
                        "name": "Normal User",
                        "profession": "Pharmacist",
                        "registration_status": "Registered",
                        "registration_type": "General",
                        "expiry_date": "2026-10-10",
                        "conditions": False,
                        "undertakings": False,
                        "reprimands": False,
                    },
                })
            })

        # Use 0.1s pause for unit test
        blocked_pause = 0.1
        bridge = AhpraBridge(
            url="ws://localhost:9999",
            token="test-token",
            min_gap_seconds=0.01,
            blocked_pause_seconds=blocked_pause,
            runner=fake_runner,
        )
        fake_ws = FakeWebSocket()
        bridge.ws = fake_ws
        bridge.running = True

        worker_task = asyncio.create_task(bridge._worker_loop())

        try:
            # Queue blocked check
            await bridge.check_queue.put({"check_id": 10, "registration_number": "BLOCKED_REG"})
            # Queue next check
            await bridge.check_queue.put({"check_id": 11, "registration_number": "NORMAL_REG"})

            # Wait for both checks to be processed
            await bridge.check_queue.join()

            self.assertEqual(len(runner_invocations), 2)
            reg1, t1 = runner_invocations[0]
            reg2, t2 = runner_invocations[1]
            self.assertEqual(reg1, "BLOCKED_REG")
            self.assertEqual(reg2, "NORMAL_REG")

            # Check 2 must have waited at least blocked_pause after Check 1
            self.assertGreaterEqual(t2 - t1, blocked_pause * 0.95)

            # Both results should have been sent to server
            sent = fake_ws.get_sent_json()
            self.assertEqual(len(sent), 2)
            self.assertEqual(sent[0]["check_id"], 10)
            self.assertEqual(sent[0]["outcome"], "blocked")
            self.assertEqual(sent[1]["check_id"], 11)
            self.assertEqual(sent[1]["outcome"], "found")
        finally:
            bridge.running = False
            worker_task.cancel()
            try:
                await worker_task
            except asyncio.CancelledError:
                pass

    async def test_permission_error_pauses_lookups(self):
        runner_invocations = []

        def fake_runner(reg: str) -> str:
            runner_invocations.append((reg, time.monotonic()))
            if reg == "PERM_REG":
                return json.dumps({
                    "result": json.dumps({
                        "outcome": "error",
                        "error": "permission_required: Claude in Chrome requires permission for ahpra.gov.au",
                    })
                })
            return json.dumps({
                "result": json.dumps({
                    "outcome": "found",
                    "register": {
                        "name": "Normal User",
                        "profession": "Pharmacist",
                        "registration_status": "Registered",
                        "registration_type": "General",
                        "expiry_date": "2026-10-10",
                        "conditions": False,
                        "undertakings": False,
                        "reprimands": False,
                    },
                })
            })

        blocked_pause = 0.1
        bridge = AhpraBridge(
            url="ws://localhost:9999",
            token="test-token",
            min_gap_seconds=0.01,
            blocked_pause_seconds=blocked_pause,
            runner=fake_runner,
        )
        fake_ws = FakeWebSocket()
        bridge.ws = fake_ws
        bridge.running = True

        worker_task = asyncio.create_task(bridge._worker_loop())

        try:
            with self.assertLogs("ahpra_verifier", level=logging.ERROR) as cm:
                await bridge.check_queue.put({"check_id": 20, "registration_number": "PERM_REG"})
                await bridge.check_queue.put({"check_id": 21, "registration_number": "NORMAL_REG"})
                await bridge.check_queue.join()

            self.assertEqual(len(runner_invocations), 2)
            reg1, t1 = runner_invocations[0]
            reg2, t2 = runner_invocations[1]
            self.assertEqual(reg1, "PERM_REG")
            self.assertEqual(reg2, "NORMAL_REG")

            # Subsequent check must pause for blocked_pause seconds
            self.assertGreaterEqual(t2 - t1, blocked_pause * 0.95)

            # Both results should have been sent to server
            sent = fake_ws.get_sent_json()
            self.assertEqual(len(sent), 2)
            self.assertEqual(sent[0]["check_id"], 20)
            self.assertEqual(sent[0]["outcome"], "error")
            self.assertTrue(sent[0]["error"].startswith("permission_required:"))
            self.assertEqual(sent[1]["check_id"], 21)
            self.assertEqual(sent[1]["outcome"], "found")

            # Clear ERROR log line telling operator to approve ahpra.gov.au in Claude in Chrome
            error_logs = [line for line in cm.output if "ERROR" in line]
            self.assertTrue(any("approve ahpra.gov.au in Claude in Chrome" in line for line in error_logs))
        finally:
            bridge.running = False
            worker_task.cancel()
            try:
                await worker_task
            except asyncio.CancelledError:
                pass

    async def test_raw_requires_permission_pauses_lookups(self):
        runner_invocations = []

        def fake_runner(reg: str) -> str:
            runner_invocations.append((reg, time.monotonic()))
            if reg == "PERM_REG_RAW":
                return "Claude in Chrome requires permission to access https://www.ahpra.gov.au"
            return json.dumps({
                "result": json.dumps({
                    "outcome": "found",
                    "register": {
                        "name": "Normal User",
                        "profession": "Pharmacist",
                        "registration_status": "Registered",
                        "registration_type": "General",
                        "expiry_date": "2026-10-10",
                        "conditions": False,
                        "undertakings": False,
                        "reprimands": False,
                    },
                })
            })

        blocked_pause = 0.1
        bridge = AhpraBridge(
            url="ws://localhost:9999",
            token="test-token",
            min_gap_seconds=0.01,
            blocked_pause_seconds=blocked_pause,
            runner=fake_runner,
        )
        fake_ws = FakeWebSocket()
        bridge.ws = fake_ws
        bridge.running = True

        worker_task = asyncio.create_task(bridge._worker_loop())

        try:
            with self.assertLogs("ahpra_verifier", level=logging.ERROR) as cm:
                await bridge.check_queue.put({"check_id": 30, "registration_number": "PERM_REG_RAW"})
                await bridge.check_queue.put({"check_id": 31, "registration_number": "NORMAL_REG"})
                await bridge.check_queue.join()

            self.assertEqual(len(runner_invocations), 2)
            reg1, t1 = runner_invocations[0]
            reg2, t2 = runner_invocations[1]
            self.assertEqual(reg1, "PERM_REG_RAW")
            self.assertEqual(reg2, "NORMAL_REG")

            self.assertGreaterEqual(t2 - t1, blocked_pause * 0.95)

            sent = fake_ws.get_sent_json()
            self.assertEqual(len(sent), 2)
            self.assertEqual(sent[0]["check_id"], 30)
            self.assertEqual(sent[0]["outcome"], "error")
            self.assertTrue(sent[0]["error"].startswith("permission_required:"))
            self.assertEqual(sent[1]["check_id"], 31)
            self.assertEqual(sent[1]["outcome"], "found")

            error_logs = [line for line in cm.output if "ERROR" in line]
            self.assertTrue(any("approve ahpra.gov.au in Claude in Chrome" in line for line in error_logs))
        finally:
            bridge.running = False
            worker_task.cancel()
            try:
                await worker_task
            except asyncio.CancelledError:
                pass


FOUND_OUTPUT = json.dumps({
    "result": json.dumps({
        "outcome": "found",
        "register": {
            "name": "Normal User",
            "profession": "Pharmacist",
            "registration_status": "Registered",
            "registration_type": "General",
            "expiry_date": "2026-10-10",
            "conditions": False,
            "undertakings": False,
            "reprimands": False,
        },
    })
})


class TestUsageLimitRetry(unittest.IsolatedAsyncioTestCase):
    """A Claude usage limit pauses and retries the same check; it is never sent as a result."""

    async def _run_with_first_output(self, first_output: str) -> tuple[list[float], list[dict]]:
        outputs = [first_output, FOUND_OUTPUT]
        call_times = []

        def fake_runner(reg: str) -> str:
            call_times.append(time.monotonic())
            return outputs.pop(0)

        bridge = AhpraBridge(
            url="ws://localhost:9999",
            token="test-token",
            min_gap_seconds=0.0,
            blocked_pause_seconds=0.1,
            runner=fake_runner,
        )
        fake_ws = FakeWebSocket()
        bridge.ws = fake_ws
        await bridge._process_single_check({"check_id": 40, "registration_number": "PHA0001429"})
        return call_times, fake_ws.get_sent_json()

    async def test_limit_note_retries_and_sends_only_found(self):
        limited = json.dumps({
            "result": json.dumps({
                "outcome": "error",
                "error": "rate limit error (HTTP 429, five_hour window, resets at 2020-01-01T02:20:00+00:00)",
            })
        })
        call_times, sent = await self._run_with_first_output(limited)
        self.assertEqual(len(call_times), 2)
        self.assertGreaterEqual(call_times[1] - call_times[0], 0.1 * 0.95)
        self.assertEqual(len(sent), 1)
        self.assertEqual(sent[0]["check_id"], 40)
        self.assertEqual(sent[0]["outcome"], "found")

    async def test_non_json_limit_text_retries(self):
        call_times, sent = await self._run_with_first_output("5-hour limit reached ∙ resets 2pm")
        self.assertEqual(len(call_times), 2)
        self.assertEqual([s["outcome"] for s in sent], ["found"])

    async def test_cli_wrapper_limit_result_retries(self):
        limited = json.dumps({"is_error": True, "result": "Claude AI usage limit reached|1000000000"})
        call_times, sent = await self._run_with_first_output(limited)
        self.assertEqual(len(call_times), 2)
        self.assertEqual([s["outcome"] for s in sent], ["found"])

    def test_wait_uses_reset_time_capped(self):
        future = int(time.time()) + 600
        self.assertAlmostEqual(usage_limit_wait(f"Claude AI usage limit reached|{future}", 1800), 600, delta=5)
        far = datetime.fromtimestamp(time.time() + 86400).astimezone().isoformat()
        self.assertEqual(usage_limit_wait(f"resets at {far}", 1800), 5 * 3600)
        self.assertEqual(usage_limit_wait("Usage limit reached", 1800), 1800)
        self.assertIsNone(usage_limit_wait("Page did not load for PHA0001429", 1800))


class TestMessageHandling(unittest.IsolatedAsyncioTestCase):
    """Tests message handling for ping/pong, hello, and checks with a fake websocket."""

    async def test_ping_replies_with_pong(self):
        bridge = AhpraBridge(url="ws://localhost:9999", token="test-token")
        fake_ws = FakeWebSocket()
        bridge.ws = fake_ws

        await bridge.handle_message(json.dumps({"type": "ping"}))

        sent = fake_ws.get_sent_json()
        self.assertEqual(len(sent), 1)
        self.assertEqual(sent[0], {"type": "pong"})

    async def test_check_lifecycle_and_result_payload(self):
        def fake_runner(reg: str) -> str:
            return json.dumps({
                "result": json.dumps({
                    "outcome": "found",
                    "register": {
                        "name": "Dr. Sarah Connor",
                        "profession": "Pharmacist",
                        "registration_status": "Registered",
                        "registration_type": "General",
                        "expiry_date": "2027-11-30",
                        "conditions": False,
                        "undertakings": False,
                        "reprimands": False,
                    },
                    "error": "",
                })
            })

        bridge = AhpraBridge(
            url="ws://localhost:9999",
            token="test-token",
            min_gap_seconds=0.01,
            runner=fake_runner,
        )
        fake_ws = FakeWebSocket()
        bridge.ws = fake_ws
        bridge.running = True
        worker_task = asyncio.create_task(bridge._worker_loop())

        try:
            # Simulate receiving check message from server
            msg = json.dumps({
                "type": "check",
                "check_id": 101,
                "registration_number": "PHA0009876543",
            })
            await bridge.handle_message(msg)

            await bridge.check_queue.join()

            sent = fake_ws.get_sent_json()
            self.assertEqual(len(sent), 1)
            res = sent[0]
            self.assertEqual(res["type"], "result")
            self.assertEqual(res["check_id"], 101)
            self.assertEqual(res["outcome"], "found")
            self.assertEqual(res["register"]["name"], "Dr. Sarah Connor")
            self.assertEqual(res["error"], "")

            # Verify checked_at is valid ISO-8601 UTC
            checked_at = res["checked_at"]
            self.assertTrue(checked_at.endswith("Z"))
            parsed_dt = datetime.strptime(checked_at, "%Y-%m-%dT%H:%M:%SZ")
            self.assertIsNotNone(parsed_dt)
        finally:
            bridge.running = False
            worker_task.cancel()
            try:
                await worker_task
            except asyncio.CancelledError:
                pass

    async def test_check_not_found_result_payload(self):
        def fake_runner(reg: str) -> str:
            return json.dumps({
                "result": json.dumps({
                    "outcome": "not_found",
                    "register": None,
                    "error": "",
                })
            })

        bridge = AhpraBridge(
            url="ws://localhost:9999",
            token="test-token",
            min_gap_seconds=0.01,
            runner=fake_runner,
        )
        fake_ws = FakeWebSocket()
        bridge.ws = fake_ws
        bridge.running = True
        worker_task = asyncio.create_task(bridge._worker_loop())

        try:
            await bridge.handle_message(json.dumps({
                "type": "check",
                "check_id": 102,
                "registration_number": "PHA0000000000",
            }))
            await bridge.check_queue.join()

            sent = fake_ws.get_sent_json()
            self.assertEqual(len(sent), 1)
            res = sent[0]
            self.assertEqual(res["type"], "result")
            self.assertEqual(res["check_id"], 102)
            self.assertEqual(res["outcome"], "not_found")
            self.assertIsNone(res["register"])
            self.assertEqual(res["error"], "")
        finally:
            bridge.running = False
            worker_task.cancel()
            try:
                await worker_task
            except asyncio.CancelledError:
                pass

    async def test_duplicate_check_delivered_thrice_runs_once(self):
        runner_calls = []
        runner_started = asyncio.Event()

        async def fake_runner(reg: str) -> str:
            runner_calls.append(reg)
            runner_started.set()
            await asyncio.sleep(0.01)
            return json.dumps({
                "result": json.dumps({
                    "outcome": "found",
                    "register": {
                        "name": "Jane Practitioner",
                        "profession": "Pharmacist",
                        "registration_status": "Registered",
                        "registration_type": "General",
                        "expiry_date": "2027-11-30",
                        "conditions": False,
                        "undertakings": False,
                        "reprimands": False,
                    },
                    "error": "",
                })
            })

        bridge = AhpraBridge(
            url="ws://localhost:9999",
            token="test-token",
            min_gap_seconds=0.0,
            runner=fake_runner,
        )
        fake_ws = FakeWebSocket()
        bridge.ws = fake_ws
        bridge.running = True
        worker_task = asyncio.create_task(bridge._worker_loop())

        try:
            msg = json.dumps({
                "type": "check",
                "check_id": 103,
                "registration_number": "PHA0001234567",
            })
            await bridge.handle_message(msg)
            await bridge.handle_message(msg)
            await runner_started.wait()
            await bridge.handle_message(msg)

            await bridge.check_queue.join()

            self.assertEqual(len(runner_calls), 1)
            sent = fake_ws.get_sent_json()
            self.assertEqual(len(sent), 1)
            self.assertEqual(sent[0]["type"], "result")
            self.assertEqual(sent[0]["check_id"], 103)
            self.assertEqual(sent[0]["outcome"], "found")
            self.assertEqual(len(bridge.active_check_ids), 0)
        finally:
            bridge.running = False
            worker_task.cancel()
            try:
                await worker_task
            except asyncio.CancelledError:
                pass

    async def test_send_message_queues_when_disconnected(self):
        bridge = AhpraBridge(url="ws://localhost:9999", token="test-token")
        bridge.ws = None

        result_payload = {
            "type": "result",
            "check_id": 55,
            "outcome": "found",
            "register": None,
            "error": "",
        }
        await bridge.send_message(result_payload)
        self.assertEqual(len(bridge._pending_results), 1)
        self.assertEqual(bridge._pending_results[0]["check_id"], 55)

        # Connect and flush
        fake_ws = FakeWebSocket()
        bridge.ws = fake_ws
        await bridge._flush_pending_results()
        self.assertEqual(len(bridge._pending_results), 0)
        sent = fake_ws.get_sent_json()
        self.assertEqual(len(sent), 1)
        self.assertEqual(sent[0]["check_id"], 55)


class TestRepairHandling(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.message = {"type": "repair", "check_id": 123,
                        "registration_number": "PHA0001234567",
                        "errors": ["extension parse failed", "bridge parse failed"]}

    async def test_hello_identifies_bridge(self):
        bridge = AhpraBridge(url="ws://localhost", token="test-token", agent="desktop")

        class Connection(FakeWebSocket):
            async def __aenter__(self):
                return self

            async def __aexit__(self, *args):
                return False

            async def __aiter__(self):
                bridge.running = False
                if False:
                    yield ""

        ws = Connection()
        fake_websockets = SimpleNamespace(
            connect=lambda *args, **kwargs: ws,
            exceptions=SimpleNamespace(WebSocketException=OSError),
        )
        with patch("scripts.ahpra_verifier.bridge.websockets", fake_websockets):
            await bridge.run()
        self.assertEqual(ws.get_sent_json()[0], {
            "type": "hello", "token": "test-token", "agent": "desktop", "kind": "bridge",
        })

    def repair_repo(self):
        folder = tempfile.TemporaryDirectory(prefix="ahpra-test-")
        self.addCleanup(folder.cleanup)
        base = folder.name
        for args in [("init", "-b", "repair-base"), ("config", "user.name", "Test"),
                     ("config", "user.email", "test@example.test"),
                     ("commit", "--allow-empty", "-m", "base")]:
            self.git(base, *args)
        return base

    def git(self, cwd, *args):
        return subprocess.run(["git", *args], cwd=cwd, check=True, capture_output=True,
                              text=True).stdout.strip()

    async def test_repair_is_single_flight_and_does_not_block_messages(self):
        base = self.repair_repo()
        started, release = threading.Event(), threading.Event()
        calls = []

        def runner(reg, errors, worktree):
            calls.append((reg, errors, worktree))
            self.assertNotEqual(worktree, base)
            self.assertTrue(Path(worktree).is_dir())
            self.assertTrue(self.git(worktree, "branch", "--show-current").startswith("ahpra-repair/"))
            started.set()
            release.wait(5)
            Path(worktree, "discard.txt").write_text("uncommitted")
            return "No site change."

        bridge = AhpraBridge(url="ws://localhost", token="test", repair_runner=runner)
        bridge.ws = FakeWebSocket()
        with patch.dict(os.environ, {"AHPRA_REPAIR_WORKTREE": base}):
            try:
                await bridge.handle_message(json.dumps(self.message))
                self.assertTrue(await asyncio.to_thread(started.wait, 3))
                await bridge.handle_message(json.dumps({**self.message, "check_id": 124}))
                await bridge.handle_message('{"type":"ping"}')
                await bridge.handle_message(json.dumps({"type": "check", "check_id": 125,
                                                       "registration_number": "PHA0001234567"}))
                self.assertEqual(bridge.check_queue.qsize(), 1)
                self.assertEqual(bridge.ws.get_sent_json(), [{"type": "pong"}])
            finally:
                release.set()
                await bridge._repair_task
        self.assertEqual(len(calls), 1)
        self.assertEqual(calls[0][:2], (self.message["registration_number"], self.message["errors"]))
        self.assertFalse(Path(calls[0][2]).exists())
        self.assertEqual(self.git(base, "branch", "--list", "ahpra-repair/*"), "")
        self.assertEqual(bridge.ws.get_sent_json()[1:], [{
            "type": "repair_report", "check_id": 123, "summary": "No site change.", "branch": "",
        }])

    async def test_missing_worktree_reports_not_configured(self):
        bridge = AhpraBridge(url="ws://localhost", token="test", repair_runner=lambda *args: self.fail())
        bridge.ws = FakeWebSocket()
        with patch.dict(os.environ, {}, clear=True):
            await bridge._run_repair(self.message)
        report, = bridge.ws.get_sent_json()
        self.assertIn("not configured", report["summary"])
        self.assertEqual(report["branch"], "")

    async def test_commits_survive_cleanup_including_timeout_and_failure(self):
        for failure in [None, subprocess.TimeoutExpired("claude", 1800), RuntimeError("private")]:
            with self.subTest(failure=type(failure).__name__):
                base = self.repair_repo()
                paths = []

                def runner(reg, errors, worktree):
                    paths.append(worktree)
                    self.git(worktree, "commit", "--allow-empty", "-m", "repair")
                    if failure:
                        raise failure
                    return "Fixed selectors."

                bridge = AhpraBridge(url="ws://localhost", token="test", repair_runner=runner)
                with patch.dict(os.environ, {"AHPRA_REPAIR_WORKTREE": base}):
                    await bridge._run_repair(self.message)
                bridge.ws = FakeWebSocket()
                await bridge._flush_pending_results()
                report, = bridge.ws.get_sent_json()
                self.assertTrue(report["branch"].startswith("ahpra-repair/"))
                self.assertFalse(Path(paths[0]).exists())
                self.assertEqual(self.git(base, "log", "-1", "--format=%s", report["branch"]), "repair")
                self.assertEqual(self.git(base, "branch", "--show-current"), "repair-base")
                self.assertEqual(len(self.git(base, "worktree", "list", "--porcelain").split("worktree ")) - 1, 1)
                self.assertNotIn("private", report["summary"])

    async def test_failed_uncommitted_run_is_discarded_and_next_run_is_fresh(self):
        base = self.repair_repo()
        Path(base, "base-only.txt").write_text("existing base checkout changes")
        paths = []

        def runner(reg, errors, worktree):
            paths.append(worktree)
            self.assertFalse(Path(worktree, "discard.txt").exists())
            self.assertFalse(Path(worktree, "base-only.txt").exists())
            Path(worktree, "discard.txt").write_text("partial")
            raise RuntimeError("private")

        for _ in range(2):
            summary, branch = await asyncio.to_thread(isolated_repair, "PHA123", [], base, runner)
            self.assertIn("failed", summary)
            self.assertEqual(branch, "")
            self.assertFalse(Path(paths[-1]).exists())
        self.assertNotEqual(*paths)
        self.assertEqual(Path(base, "base-only.txt").read_text(), "existing base checkout changes")
        self.assertEqual(self.git(base, "branch", "--list", "ahpra-repair/*"), "")

    async def test_repair_base_branch_is_rejected(self):
        base = self.repair_repo()
        self.git(base, "switch", "-c", "ahpra-repair/old")
        with self.assertRaises(ValueError):
            isolated_repair("PHA123", [], base, lambda *args: self.fail())

    async def test_summary_is_bounded(self):
        bridge = AhpraBridge(url="ws://localhost", token="test", repair_runner=lambda *args: "x" * 5000)
        bridge.ws = FakeWebSocket()
        with patch.dict(os.environ, {"AHPRA_REPAIR_WORKTREE": self.repair_repo()}):
            await bridge._run_repair(self.message)
        self.assertEqual(len(bridge.ws.get_sent_json()[0]["summary"]), 4000)

    async def test_logs_and_runner_exception_omit_registration_number(self):
        reg = "PHA0001234567"

        def runner(number):
            raise RuntimeError("Lookup failed for " + number)

        bridge = AhpraBridge(url="ws://localhost", token="test", runner=runner)
        bridge.ws = FakeWebSocket()
        with self.assertLogs("ahpra_verifier", level=logging.INFO) as logs:
            await bridge._process_single_check({"check_id": 123, "registration_number": reg})
            await bridge.handle_message(json.dumps({"type": "check", "registration_number": reg}))
        self.assertNotIn(reg, "\n".join(logs.output))
        self.assertIn("check id=123", "\n".join(logs.output))
        self.assertNotIn(reg, bridge.ws.get_sent_json()[0]["error"])


class TestRepairRunner(unittest.TestCase):
    def test_cli_configuration(self):
        with patch.dict(os.environ, {"AHPRA_CLAUDE_CMD": "custom-claude.cmd",
                                    "AHPRA_REPAIR_TIMEOUT_SECONDS": "75",
                                    "AHPRA_REPAIR_CLAUDE_CONFIG_DIR": "repair-config",
                                    "AHPRA_VERIFIER_TOKEN": "private-token", "API_KEY": "private-key",
                                    "OTHER_SECRET": "private-secret", "DB_PASSWORD": "private-password",
                                    "CLAUDE_CONFIG_DIR": "inherited-config", "UNRELATED": "not-allowed"}), \
                patch("scripts.ahpra_verifier.bridge.shutil.which", return_value="resolved-claude.cmd"), \
                patch("scripts.ahpra_verifier.bridge.subprocess.Popen") as popen:
            proc = popen.return_value
            proc.returncode = 0
            proc.communicate.return_value = ("Summary", "")
            self.assertEqual(default_repair_runner("PHA0001234567", ["selector failed"], "repair-tree"), "Summary")
        command = popen.call_args.args[0]
        options = popen.call_args.kwargs
        self.assertEqual(command[0], "resolved-claude.cmd")
        self.assertIn("--chrome", command)
        self.assertEqual(command[command.index("--model") + 1], "opus")
        self.assertEqual(command[command.index("--permission-mode") + 1], "default")
        allowed = command[command.index("--allowedTools") + 1].split(",")
        self.assertEqual(allowed[:5], ["Read(./**)", "Edit(./**)", "Write(./**)", "Grep(./**)", "Glob(./**)"])
        self.assertNotIn("Bash", allowed)
        self.assertEqual(allowed[5:-1], [
            "Bash(node scripts/ahpra_extension/tests/*)",
            "Bash(python -m unittest scripts.ahpra_verifier.*)",
            "Bash(git status:*)", "Bash(git diff:*)", "Bash(git add:*)", "Bash(git commit:*)",
            "Bash(git switch -c ahpra-repair/*)", "Bash(git log:*)",
        ])
        self.assertEqual(allowed[-1], "mcp__claude-in-chrome__*")
        self.assertEqual(command[command.index("--disallowedTools") + 1:], [
            "Bash(git push:*)", "Bash(git merge:*)", "Bash(git checkout main*)",
            "Bash(git reset:*)", "Bash(git rebase:*)", "Bash(git remote:*)",
        ])
        self.assertEqual(options["cwd"], "repair-tree")
        self.assertEqual(proc.communicate.call_args.kwargs["timeout"], 75)
        self.assertEqual(options["env"]["ENABLE_TOOL_SEARCH"], "false")
        self.assertEqual(options["env"]["CLAUDE_CONFIG_DIR"], "repair-config")
        prompt = proc.communicate.call_args.kwargs["input"]
        self.assertIn("PHA0001234567", prompt)
        self.assertIn('["selector failed"]', prompt)
        self.assertIn("A human must review the repair branch before any merge", prompt)
        self.assertTrue(set(options["env"]).issubset({
            "PATH", "Path", "SystemRoot", "SYSTEMROOT", "TEMP", "TMP", "USERPROFILE", "APPDATA",
            "LOCALAPPDATA", "HOMEDRIVE", "HOMEPATH", "CLAUDE_CONFIG_DIR", "ENABLE_TOOL_SEARCH",
        }))
        self.assertFalse(any(any(word in key.upper() for word in ("TOKEN", "SECRET", "KEY", "PASSWORD"))
                             for key in options["env"]))
        self.assertNotIn("UNRELATED", options["env"])

    def test_nonzero_exit_does_not_echo_output(self):
        with patch("scripts.ahpra_verifier.bridge.subprocess.Popen") as popen:
            popen.return_value.returncode = 7
            popen.return_value.communicate.return_value = ("Practitioner name", "Private diagnostics")
            self.assertEqual(default_repair_runner("PHA123", [], "repair-tree"),
                             "Repair CLI exited with code 7.")

    def test_timeout_kills_process_tree_for_both_runners_on_windows(self):
        for runner, args in [(default_runner, ("PHA123", "Lookup {registration_number}", 12)),
                             (default_repair_runner, ("PHA123", [], "repair-tree"))]:
            with self.subTest(runner=runner.__name__), \
                    patch("scripts.ahpra_verifier.bridge.subprocess.Popen") as popen, \
                    patch("scripts.ahpra_verifier.bridge.subprocess.run") as run, \
                    patch("scripts.ahpra_verifier.bridge.os.name", "nt"), \
                    patch("scripts.ahpra_verifier.bridge.shutil.which", return_value="claude.cmd"):
                proc = popen.return_value
                proc.pid = 4321
                timeout = subprocess.TimeoutExpired("claude", 12)
                proc.communicate.side_effect = [timeout, ("", "")]
                with self.assertRaises(subprocess.TimeoutExpired) as raised:
                    runner(*args)
                self.assertIs(raised.exception, timeout)
                run.assert_called_once_with(
                    ["taskkill", "/T", "/F", "/PID", "4321"],
                    capture_output=True, timeout=10, check=True,
                )
                proc.communicate.assert_called_with(timeout=10)
                proc.kill.assert_not_called()

    def test_default_runner_returns_stdout(self):
        with patch("scripts.ahpra_verifier.bridge.subprocess.Popen") as popen:
            popen.return_value.returncode = 0
            popen.return_value.communicate.return_value = ("Lookup result", "")
            self.assertEqual(default_runner("PHA123", "Lookup {registration_number}", 12),
                             "Lookup result")
            popen.return_value.communicate.assert_called_once_with(input="Lookup PHA123", timeout=12)


class TestConfigValidation(unittest.TestCase):
    """Tests environment variable loading and validation."""

    def test_missing_url_exits(self):
        with patch("sys.stderr", new_callable=io.StringIO):
            with patch.dict(os.environ, {}, clear=True):
                with self.assertRaises(SystemExit):
                    load_config()

    def test_missing_token_exits(self):
        with patch("sys.stderr", new_callable=io.StringIO):
            with patch.dict(os.environ, {"AHPRA_VERIFIER_URL": "wss://test.com/ws"}, clear=True):
                with self.assertRaises(SystemExit):
                    load_config()

    def test_valid_env_config(self):
        env = {
            "AHPRA_VERIFIER_URL": "wss://api.example/ws/ahpra-verifier/",
            "AHPRA_VERIFIER_TOKEN": "secret-token-123",
            "AHPRA_VERIFIER_AGENT": "desktop-agent-01",
            "AHPRA_MIN_GAP_SECONDS": "45",
            "AHPRA_BLOCKED_PAUSE_SECONDS": "900",
            "AHPRA_LOOKUP_TIMEOUT": "120",
        }
        with patch.dict(os.environ, env, clear=True):
            cfg = load_config()
            self.assertEqual(cfg["url"], "wss://api.example/ws/ahpra-verifier/")
            self.assertEqual(cfg["token"], "secret-token-123")
            self.assertEqual(cfg["agent"], "desktop-agent-01")
            self.assertEqual(cfg["min_gap_seconds"], 45.0)
            self.assertEqual(cfg["blocked_pause_seconds"], 900.0)
            self.assertEqual(cfg["lookup_timeout"], 120.0)


class TestPromptTemplate(unittest.TestCase):
    """Tests substitution of registration number into lookup prompt."""

    def test_prompt_substitution(self):
        template = "Lookup {registration_number} and {REGISTRATION_NUMBER}"
        substituted = template.replace("{registration_number}", "PHA123").replace("{REGISTRATION_NUMBER}", "PHA123")
        self.assertEqual(substituted, "Lookup PHA123 and PHA123")


if __name__ == "__main__":
    unittest.main()
