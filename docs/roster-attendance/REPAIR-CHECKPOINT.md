# Roster/attendance repair checkpoint — 2026-09-15

## Result

The faulty attendance event-as-session model has been replaced with a bounded
foundation in `client_profile/models.py`:

- `AttendanceSession` now represents one worked interval. Its assignment is
  optional and remains separate from original actual start/end timestamps.
- A conditional database uniqueness constraint permits only one open session
  per user across all pharmacies. A check constraint rejects an end before the
  start.
- `AttendanceEvent` holds linked clock/break evidence. Normal instance and
  queryset update/delete paths reject mutation. Corrections are separate,
  append-only records and protect their original event.
- `ProvisionalAttendance` is one-to-one with a worked session and constrains its
  decision timestamp to its pending/approved/rejected state. The session records
  the membership used to establish local or cross-site eligibility.
- The rotating pharmacy QR no longer has the incompatible single-use flag; its
  exact expiry boundary and the existing hashed personal-code helper remain.

No eligibility service, transition service, kiosk authentication, API, roster
publication workflow, or UI was added in this checkpoint.

## Migration quarantine and preserved source

The old `0044` raw SQL is no longer active. The active module contains one
forward/reverse `RunPython` guard that always raises an actionable error before
any schema statement. The migration module remains present so this checkout does
not silently make `client_profile` an unmigrated syncdb app. Its dependency list
is intentionally unresolved rather than guessed.

Byte-identical pre-repair copies are preserved at:

- `archive/2026-09-15-pre-repair-models.py` — SHA-256
  `03EE935EA1F25E26CDC01B1A7DCD9B26B2B1C2DBABE10BE295B8D643A32384FF`
- `archive/2026-09-15-pre-repair-0044_roster_v2_and_attendance_v1.py` — SHA-256
  `209828F71E7F5F70B20C47BC1C5E9FE8534E9FEE922A7497A13F9D5D627C0439`

The complete prefix of `models.py` before the `Roster V2 Models` boundary was
compared with the archived source and is byte-for-byte identical.

## Isolated validation

Run from `backend`:

```powershell
..\.venv\Scripts\python.exe -m unittest attendance_tests.test_model_foundation -v
```

Result: 8 tests passed. The suite imports only its opt-in settings, uses SQLite
`:memory:`, disables unavailable legacy migration modules, and creates/drops only
the four attendance foundation tables with `schema_editor`. It does not import
`core.settings`, run `migrate`, or connect to the configured database.

Coverage includes the QR expiry boundary, code hashing/leading zeroes, migration
quarantine, cross-pharmacy duplicate open sessions, invalid session timelines,
instance/queryset event immutability, provisional one-to-one/decision state, and
append-only corrections preserving original event time.

## Deployment dependency

This is a model and test foundation, not a deployable schema change. Recover the
authoritative `users`, `client_profile`, and `billing` migration sources and
verify their branches, replacements, and real leaf dependencies against each
target before authoring a state-aware replacement migration. Rehearse that
migration on disposable clean-bootstrap and existing-schema databases. Do not
run the quarantined marker or treat these SQLite model tests as a production
migration baseline.
