# ChemistTasker production-readiness audit — control PR

**Base:** `main` at `b77e9fd296bc2710350ef6f3cd402ce2529ffc06` (24 October 2026, Brisbane). **Status:** DRAFT / NOT MERGE READY.

This PR is the single, auditable **control plane** for the senior full-stack audit and release remediation. It is **not** a blanket sign-off, an instruction to merge 23 fixes together, or proof that 99% of business behaviour works. Do not merge or deploy solely to make staging run.

## What is in this PR
- [Findings and reproducible acceptance matrix](FINDINGS.md) — B01–B23, each identified by owning backend domain, severity, source and red-first test.
- [Implementation plan and 99% evidence definition](PLAN.md) — staged security, financial, reliability and cross-platform gates.
- [Live progress tracker](PROGRESS.md) — actual status and evidence links; NEVER mark a test PASS because it is proposed.
- [Exact-head QA ledger](EVIDENCE.md) — old baseline evidence separately from new PR-head evidence.
- [Source inventory ledger](SOURCE_LEDGER.tsv) — tracked source files with per-file blob SHA, inspection status, reviewer/evidence, revalidated by `scripts/audit_launch_coverage.py`.
- [Coverage-check workflow](../../../.github/workflows/production_audit_coverage.yml) — rejects falsified statuses or stale/untracked file inventory; reports progress but does not falsely enforce launch readiness while the audit is open.

## Ground rules
1. The user's `docs/qa/SENIOR_PACKAGE_TESTING.md` and archived 24KB `Senior-package-testing-handbook.md` are mandatory. A green build or skipped job never counts as behavioral coverage.
2. All corrections must be surgical in the owning domain, with **failing-before/fixed-after tests** and no unrelated API/role drift. Preserve the established AHPRA duplicate-grandfathering policy.
3. Preserve work on draft PR #181 (planner) and #182 (shift lifecycle); do not cherry-pick entire unfinished stacks. Coordinate shared code paths by exact patch review.
4. No direct main push, merge, deployment, destructive migration, test credential publication, payment, or real production data operation in this audit PR.
5. Exact-SHA status is required. Never carry a green status from `b77e9fd2` to a different PR head without re-running affected checks.
6. Semantic inspection and execution are **different** from file enumeration. The source inventory at the baseline is 2,149 source files; after adding this audit script the denominator will be 2,150.
7. A reviewer must confirm each source row's content SHA when declaring `REVIEWED` or `VERIFIED`; changed files invalidate that review.

## Release verdict
**NO-GO** for unrestricted paid or multi-pharmacy production until applicable P0 security/payment findings have a regression test and confirmed correction, as well as the final exact-head acceptance gates in PLAN.md. Controlled internal demonstration may use test accounts with disabled high-risk functions and an explicit supervised pilot sign-off.

The plan and tracker are living documents. Only explicit entries supported by links, commands, counts and source SHA represent completed work.
