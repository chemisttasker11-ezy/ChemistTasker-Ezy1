# M5 + M4-04 status for the finishing builder (2026-11-07 ~21:10)
Current heads (all on origin): agent/m5-01 b92363bb, agent/m5-03 3b8f0fc7, agent/m5-04 8d5ff38f, agent/m4-04 d3e85b2d.
Integration base: origin/wip/pr249-int 5c28634d (M4-01,02,03,05,06,07,08 merged; all gates green there).
Files here:
- m5-0N-finish-phase1.md + codexa-m5-0N-report.md: what Codex A proved (base red / head green) and what it left open.
- chatgpt-m5-senior-findings.md: senior source-review findings on the M5 heads (verify each, then fix).
- codexb-m4-04-senior4-FIX-FIRST.md: the one open M4-04 blocker (P2 photo removal while a draft write is pending).
- claudeb-m4-04-regate6.md: last Claude B proof for M4-04 (context for the harness and its traps).
Known: agent/m5-04 test_m5_posting_scope.py PATCH case expects 403 but the server correctly returns 404 for shifts the
actor cannot see (queryset scoping): change the test to 404, keep the allowed-actor positive controls.
