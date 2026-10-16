# Senior code review and handover

## Isolation

Standalone Vite + React + TypeScript application. All work resides within `apps/my-command-centre/` in the parent PR. There are no imports from the ChemistTasker backend, frontend_web, shared-core or mobile source. Do not merge this demo folder into the main ChemistTasker runtime; extract the folder into its own repository.

## Design/architecture

- The state model and all recurring period calculations live in `src/model.ts`.
- `src/App.tsx` owns temporary UI state, task mutation actions and local persistence.
- View-specific components are in `src/views/`; cross-view components in `src/components/`.
- No API keys, cookies, hard-coded account IDs, secrets, database credentials, or patient data.
- Reusable styles are centralized. Native browser HTML input semantics and keyboard-friendly drag handles are used where possible.
- The static site is intentionally local-first without a backend. Do not advertise cross-device sync until implemented and tested.

## Acceptance checklist

1. `npm install`, `npm run build`, `npm test`, and `npm run test:e2e` in a network-enabled development environment.
2. Drag task within the same column, between populated columns, and into empty columns.
3. Verify mouse, keyboard and Android touch-hold drag; verify the alternative card Move menu.
4. Create/edit/complete/undo, and archive/restore task; refresh browser and confirm saved state.
5. Mark one daily and monthly recurring task complete, verify completion log and next period; undo and verify original due date.
6. Export JSON, reset, restore JSON; reject malformed JSON and unknown task schema.
7. Review light/dark appearance and 390px and desktop responsive layouts.

## Known limitations

- Pure localStorage: no login, remote sync, push reminders or server-backed backups.
- Background browser storage eviction may erase data; export backups often.
- HTML layout preview is a visual review companion, not the authoritative React app.
- Running npm-dependent unit, production build and Playwright suite requires installing packages. This environment cannot access the npm registry; local smoke tests may be used instead, and any unrun checks must be explicitly reported.


## Follow-up: calendar and simple progress tracking (PR #180)

- Added a **Day / Week / Month / Year** calendar with Brisbane-local date presentation, recurrence projections, month-end handling and a list of unscheduled tasks. Calendar is a separate view backed by pure functions in `src/lib/calendar.ts`; it does not alter the existing board's drag-and-drop logic.
- Task progress is a *five-state workflow*: Not started, Started, Progressing, Finished, Postponed. Percentages are not manually editable. A checklist and its small completion fraction only appear when the task has steps.
- Postponed status requires selecting a later date. Calendar date changes are allowed from the editor, by drag-and-drop on desktop, or by the Postpone control. Unscheduling removes the calendar entry but **never deletes the task**.
- Recurring Finished status records a completion for the current recurrence period and resets the next occurrence to Not started. Previously saved v1 localStorage and JSON backups lacking the new status field migrate automatically.
- Duplicating creates a new task identity and resets status, checklist ticks and completion history. The copy opens for editing before saving.
- Tests added for status transitions, date validity and postpone guards, duplication, recurring completion and undo, day/week/month/year recurrence projection and calendar E2E interaction. These must be run in a network-connected environment before production deployment.

### Limitations

- Calendar drag/drop is native HTML5 on desktop. On touch/mobile use the task editor date field or the Postpone control.
- Rescheduling a recurring task moves its **entire series**, not an individual occurrence. The completion history remains in Completed, while the projection follows the new recurrence anchor.
- The Year view provides 12-month summaries; open a month to inspect/change individual tasks.
- Storage remains per-browser localStorage, not an authenticated, cross-device calendar. No Google/Outlook Calendar connection is implied.
- Package registry DNS is unavailable in this execution environment; no claim of passing `npm run build`, Vitest, or React Playwright E2E until these are run on a machine with dependencies installed.
