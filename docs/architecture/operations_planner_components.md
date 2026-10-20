# Operations planner ownership

Planner tasks are calendar WorkNotes with `is_planner_task=True`; there is no separate plan, draft or publication.
- team_calendar/views.py `WorkNoteViewSet`: create, edit and delete (managers only, `updated_at` stale-edit check -> 409); per-person `mark_done`/`mark_open` (assignees only, no token).
- team_calendar/serializers.py `WorkNoteSerializer`: planner validation; on edit only added assignees are re-checked (everyone when clinical is turned on). Date, recurrence and assignees lock after any completion.
- team_calendar/operations_rules.py: assignee eligibility (clinical = verified, unexpired, rostered pharmacist), roster fill and the atomic, idempotent `copy_tasks`.
- team_calendar/operations_views.py: planner context, optional `SavedTask` defaults library, roster fill and copy endpoints.
- team_calendar/operations_models.py: `SavedTask` and `OperationAudit` (copy receipts, delete snapshots).
- organizations/access.py `planner_pharmacies`: the one manager scope for planner reads and writes.
- shared-core/src/domains/calendar/operations.ts: typed cross-client adapter; web and Expo screens call only this.

Completion lives only in `WorkNoteCompletion`. No external patient information may be put into task titles or descriptions.
