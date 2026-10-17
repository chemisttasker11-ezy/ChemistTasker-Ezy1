# Tasks and convergence backlog

- [x] Identify exact PR #181 parent head and create isolated child branch.
- [x] Inspect Docker runbook, Playwright, TesterArmy, and native acceptance workflow definitions.
- [x] Audit primary shift source paths and record 48 candidate journey scenarios.
- [x] Extract existing accepted rules, note source gaps and proposed questions.
- [ ] Run disposable targeted tests against child exact head; save commands, counts, job URLs/traces.
- [ ] Verify generic shift DELETE outcome for every consequential shift state (including source-offer FK and published-roster constraints).
- [ ] Prove/refute SL-23 cancellation webhook finalization and SL-16/24 concurrent acceptance anomalies.
- [ ] Obtain owner decisions D01–D03; update `GRILL.md` and specification before changing payment behaviour.
- [ ] Implement confirmed payment transitions in owning domain with dedicated tests.
- [ ] Obtain owner decisions D04–D11; implement audited cancellation, replacement and notifications without parallel tables.
- [ ] Obtain owner decisions D12–D15; implement confirmed attendance/settlement/history handling.
- [ ] Expand real-stack acceptance with owner → worker → manager → cancellation/replacement multi-persona path.
- [ ] Run targeted Django/PostgreSQL, full isolated Docker, web/visual and native gates on exact head.
- [ ] Converge spec/plan/tasks until no unexplained gap remains, then independently verify artifacts.
- [ ] Rebase/update with later PR #181 changes after explicit source ancestry review.
- [ ] Mark MERGE-READY only after authorisation, all mandatory gates, and resolved P0 decisions.

All unchecked items are **not done**; a static source investigation never marks a runtime check green.
