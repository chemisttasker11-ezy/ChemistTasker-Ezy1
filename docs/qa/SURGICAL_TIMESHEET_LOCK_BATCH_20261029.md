# Surgical timesheet lock repair — 29 October 2026

## Baseline and business rule

This patch builds on the completed monetary batch, `349257f55a2062e02b70ee990ed2678116896b7a`, on `fix/surgical-backend-consistency-20261029`. [Draft PR #213](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/pull/213) remains based on completed E17 `0e2a4a14344492cddab1ed2998c14340d538ad30`.

**Invariant:** a committed attendance change must not deadlock with a timesheet rebuild or transition waiting for its invalidation. Period writers must still serialize; approval must refuse a stale projection; locked periods and immutable attendance evidence retain their existing protections.

The parent [PostgreSQL concurrency job](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/actions/runs/40811874477/job/123243828530) failed the manager-missing-punch/online-QR-clock-out race. The preceding diagnosis reproduced the same failure on both the monetary parent and monetary head. This patch repairs that inherited attendance defect separately from invoice calculations.

## Reproduced cause and smallest correction

Attendance events and session saves both call `workforce.signals._enqueue`. That helper marks the Timesheet stale within the source transaction and schedules rebuilds after commit. Two updates of the same Timesheet can require PostgreSQL to recheck its period foreign key at commit.

The old builder and transition helper acquired the period with `FOR UPDATE`, then waited for the Timesheet held by attendance. Attendance's commit needed `KEY SHARE` on that period. The two transactions could therefore wait for each other. PostgreSQL may abort either participant; an eager task retry can hide a failed rebuild behind an otherwise successful response. The new regressions reject any captured database error as well as failed business outcomes.

Production changes only two parent lock options:

- `workforce.timesheet_builder._locked_timesheet_and_period_for_build`: period `select_for_update(of=("self",), no_key=True)`.
- `workforce.timesheet_transitions._locked_timesheet_and_period`: the same period lock option.

Both retain the stronger Timesheet `FOR UPDATE`, the period-before-Timesheet order, `of=("self",)`, and every existing business validation. No new service, retry policy, exception suppression, table, migration, endpoint or client change is introduced.

`FOR NO KEY UPDATE` still excludes competing period writers and deletion while permitting the source transaction's `KEY SHARE` check. The builder's only period save changes timezone and update timestamp, not the referenced or unique keys; the transition helper does not update the period. See [PostgreSQL 16 row-lock compatibility](https://www.postgresql.org/docs/16/explicit-locking.html#LOCKING-ROWS), [PostgreSQL's current-transaction FK recheck](https://github.com/postgres/postgres/blob/REL_16_STABLE/src/backend/utils/adt/ri_triggers.c#L1328-L1344), and [Django 5.2 `no_key`](https://docs.djangoproject.com/en/5.2/ref/models/querysets/#select-for-update).

## All five period-lock sites reviewed

| Existing owner | Treatment | Reason / preserved contract |
| --- | --- | --- |
| Builder helper | Parent changes to `NO KEY UPDATE`; child retains `UPDATE` | Reproduced period-to-Timesheet/FK cycle; writers still serialize. |
| Submit/approve/reopen helper | Same parent-only change | Independently reproduced cycle; approval still rejects dirty or stale revisions. |
| `ensure_period_timesheets` | Unchanged `FOR UPDATE` | Normal application creation already uses this period mutex; reading an existing Timesheet does not wait for its uncommitted update. Locked directories remain frozen. |
| `lock_period` | Unchanged `FOR UPDATE`, manifest lock and validation | Existing Timesheet reads are nonlocking; no observed attendance reverse edge. All children must be clean and approved before the existing manifest workflow. |
| `correct_locked_period` | Unchanged period and manifest locks | Manager/reason checks, superseded evidence, manifest reuse and adjustment history remain. |

All normal Timesheet creation found in production goes through `ensure_period_timesheets`. Default privileged admin can create a Timesheet without that mutex, which has a separate potential unique-insert/FK cycle; it is outside this attendance repair. No new admin policy is introduced. This patch does not claim a comprehensive proof of every attendance-versus-period-freeze interleaving: existing freeze reads remain nonlocking. Parent lock compatibility alone is not such a proof.

## Failing-first and targeted verification

Tests used the repository's ordinary Django runner and public CI environment placeholders against a disposable PostgreSQL **16.15** database on loopback, with Django **5.2.17**. No application or staging data was used.

| Check | Result |
| --- | --- |
| Two new actual-API/rebuild races on unchanged parent production | **2 failures**, both actual SQLSTATE `40P01`; no errors or skips; 4.756 seconds after schema setup. |
| New approval race plus builder-mutex and rollback controls on unchanged production | **1 deadlock failure, 2 passed**, no errors or skips; 3.975 seconds. Approval received an OperationalError instead of its existing recalculation validation. |
| Focused PostgreSQL selection after the two-site correction | **24 passed**, no errors or skips; 11.229 seconds. No deadlock trace or task retry appeared. |
| SQLite compatibility | **2 passed**, no errors or skips; 0.124 seconds. Idempotent projection and all-approved period freezing retain their behaviour. |
| Migration drift | `makemigrations --check --dry-run --settings=core.contract_test_settings`: exit 0, `No changes detected`. |
| Independent review / whitespace | Two independent source reviews approved the actual patch; no remaining material correctness or preservation gap. Whitespace clean. |

The five new methods are:

| Method | Required outcome |
| --- | --- |
| `ClockLockOrderPostgresTests.test_manager_after_commit_rebuild_racing_qr_clock_out_finishes_without_fk_deadlock` | Real manager request returns 201 and real QR clock-out returns 200 while the manager's after-commit rebuild contends. |
| `ClockLockOrderPostgresTests.test_separate_timesheet_rebuild_racing_qr_clock_out_finishes_without_fk_deadlock` | Actual rebuild task on a separate connection and real QR clock-out both complete. |
| `WorkforceRosteredCorrectionPostgresContracts.test_double_invalidation_commits_before_waiting_approval_refuses_dirty_timesheet` | Invalidation commits; approval refuses the dirty Timesheet with its existing ValidationError; no approval record or extra revision appears. |
| `WorkforceRosteredCorrectionPostgresContracts.test_builders_for_different_workers_serialize_on_the_same_period` | Builders for different child rows demonstrably block on the common period, then each finish with one coherent revision. |
| `WorkforceRosteredCorrectionPostgresContracts.test_rolled_back_invalidation_does_not_publish_a_rebuild` | Rollback restores the dirty flag and publishes no rebuild; a committed positive control publishes once after commit. |

The API races use real SQL execution, events and `pg_blocking_pids`, rather than scheduler sleeps. They prove the builder holds the period and waits on the Timesheet while two attendance invalidations each update one row. They preserve the original manager event/audit, require exactly one manager clock-in and one mobile-QR clock-out, and check the final 180-minute projection, cleared rebuild flag and absence of missing-punch blockers. Cleanup releases all gates, bounds database/thread waits and closes worker connections.

The approval/rollback tests mock only task publication so a subsequent rebuild cannot hide the dirty state under examination. The API races execute real rebuild tasks. The original intermittent race test is unchanged and passes in the focused selection.

Two existing SQL assertions now identify separate exact quoted period and Timesheet tables, their intended lock modes, and their order. This fixes a previous assertion weakness: `workforce_timesheet` is a substring of `workforce_timesheetperiod`. They do not substitute for the real transaction tests.

### Focused selection

The PostgreSQL run selects:

- The two new API races and the unchanged original manager/QR race in `attendance.test_clock_locking.ClockLockOrderPostgresTests`.
- `workforce.tests.test_rostered_corrections.WorkforceRosteredCorrectionPostgresContracts` and `WorkforceRosteredCorrectionContracts`.
- `client_profile.test_postgres_concurrency.TimesheetTransitionPostgresLockingTests`.
- Eight `TimesheetStateMachineTests` controls: own/revision-checked submit; normal approval; blocker refusal; reopen/comments; deliberate locked-period correction/relock; all-approved freeze; locked directory sync; read-only locked detail.
- `TimesheetProjectionTests.test_projection_is_idempotent_when_sources_unchanged`.

Command shape: `python backend/manage.py test <the above labels> --settings=core.postgres_test_settings --noinput --keepdb --verbosity=2`. The isolated local wrapper only supplies the public CI environment and database connection. These are focused selections, not a full release gate.

Existing workflow discovery includes both new API races through the PostgreSQL concurrency selection's `attendance.test_clock_locking`, and the three workforce cases through Serializer Decomposition's PostgreSQL `workforce.tests` selection. No workflow edit or new skip is added. Existing PostgreSQL-only guards remain; SQLite skips are not claimed as PostgreSQL proof.

Evidence logs: `/tmp/ct-clock-period-red-api.log`, `/tmp/ct-clock-period-red-transition.log`, `/tmp/ct-clock-period-targeted-green.log`, `/tmp/ct-clock-period-sqlite.log`, `/tmp/ct-clock-period-migrations.log`. Final commit identity, hosted workflow/job outcomes and release status are recorded in PR #213 and the living plan after the completed patch is published, without a status-only code commit.

## Remaining scope

The mobile live dependency audit remains a separate release concern. The next invoice follow-up remains the mobile generator's pre-save calculation and submitted contribution; this lock repair changes no invoice or client code. Native/device, invoice-specific browser and live-provider acceptance retain their separate status. No merge, deployment or live provider call is included.
