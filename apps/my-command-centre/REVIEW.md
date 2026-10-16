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
