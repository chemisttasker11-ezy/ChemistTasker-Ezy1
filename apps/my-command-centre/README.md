# My Command Centre

A personal, local-first productivity dashboard designed around work, pharmacy tasks, family, finances and long-term goals.

## Start

Requires **Node.js 20+** and npm. Run these commands from this folder:

```bash
npm install
npm run dev
```

Open the local URL printed by Vite. To build a static release:

```bash
npm run build
npm run preview
```

The production files are in `dist/`.

## Views and features

- Overview, six-column drag-and-drop task board, Today, **Calendar (Day / Week / Month / Year)**, Upcoming, Goals, Completed history, Archived tasks, Settings.
- Drag-and-drop within and between columns using mouse, touch hold or keyboard. The card menu is an alternative for mobile.
- Create and edit tasks, assign category/priority, optional due dates and start times, recurrence and **optional checklists** for tasks needing several steps.
- **Simple status tracking:** Not started, Started, Progressing, Finished, Postponed. No manual percentages.
- Choose **Postponed** to pick a **later date**. The task's next due date changes; if recurring, the whole series is moved.
- **Duplicate & edit** from a board card's menu or calendar day/week entry. The copy opens for renaming and keeps its own ID, unchecked checklist and empty history.
- Calendar: add by clicking a date, edit by selecting an event, reschedule by dragging events to dates on desktop (or editing the date on mobile), and remove from calendar without deleting from the task board. Unscheduled tasks stay in their own list.
- Month calendar chips show status-coloured indicators and a legend; Day and Week entries allow direct status updates. Year shows month summaries that open the month view.
- Finishing recurrence is recorded **once per daily, weekly, monthly, quarterly or annual period**. The next period starts Not started and with its checklist reset; Undo restores the previous status, date and steps.
- Changing a repeating task's date reschedules the entire series, not one occurrence. Existing completion history stays in Completed.
- Task and completion records persist in this **browser's localStorage**, including dark mode.
- Settings > Download backup saves JSON; Settings > Import backup restores it after confirmation.
- Initial tasks are sourced from a handwritten notebook. Additional tailored task suggestions are opt-in under Settings.
- Australian date formatting and Australia/Brisbane time zone.

### Important privacy boundary

There is **no server, sign-in, patient record storage or cross-device synchronisation** in this version. A static deployment serves app code only, not your saved tasks. Each browser has its own local data, which may be lost if browser storage is cleared. Do not enter patient-identifiable health data, sensitive secrets, or credentials. Make regular JSON backups.

### Organising vs recurring

Columns describe *where the task lives*. The recurrence dropdown defines *how often it resets*. Moving a card does not silently modify a custom repeat schedule.

## Test

```bash
npm run build
npm test
npx playwright install chromium
npm run test:e2e
```

See `playwright.config.ts` and `src/model.test.ts`.

## Move this PR into a new repository

This project is intentionally isolated at `apps/my-command-centre/` in the ChemistTasker-Ezy1 feature PR. Copy **the contents of this folder**, not the parent ChemistTasker repository, into the root of your new repository:

```bash
mkdir my-command-centre
cp -R apps/my-command-centre/. my-command-centre/
cd my-command-centre
npm install
npm run build
```

The new repository needs no ChemistTasker backend, npm workspaces, shared packages or Django services. Ignore `node_modules`, `.env`, `dist`, traces and local backups.

## Deploy later

**Vercel:** Import the new repository as a Vite project. Build command `npm run build`, output directory `dist`. `vercel.json` includes SPA fallbacks.

**Netlify:** Import the new repository. Use `npm run build` and `dist`; `netlify.toml` includes SPA fallbacks.

**Other static hosting:** Upload `dist/`, route unknown paths to `index.html`, and use HTTPS.

> Publishing the website does not add secure accounts or sync. Add server-side authentication and a private database before you require cross-device use or shared accounts.

## Structure

- `src/model.ts` — typed task domain model, simple status transitions, duplication, pure scheduling, initial notebook tasks, backup migration/validation.
- `src/lib/calendar.ts` — pure date arithmetic and calendar occurrence projection.
- `src/lib/progress.ts` — shared status labels and optional checklist tally.
- `src/views/CalendarView.tsx` — four calendar layouts, navigation and unscheduled tasks.
- `src/components/CalendarEntry.tsx` and `TaskStatusPicker.tsx` — reusable calendar event and postpone/status controls.
- `src/components/` — reusable card, board lane, dialog and empty state.
- `src/views/` — small, independent screens.
- `src/lib/display.ts` — date presentation and UI labels.
- `src/App.tsx` — navigation and UI state orchestration only.
- `src/styles.css` — responsive visual system.
- `tests/` — Playwright user-flow tests.

No files outside the app folder are needed.

**Finished tasks remain visible on the task board** for status review and reopening, and also appear in the Completed history. This avoids hiding the Finished status.
