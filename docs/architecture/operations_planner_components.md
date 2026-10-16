# Operations planner frontend ownership

The owner workspace is split into domain-focused modules:
- PharmacyOperationsPage.tsx: tenant selection, read-only performance summaries, template library, training
- OperationsPlanBuilder.tsx: date copy, drag, draft orchestration and publication preview
- OperationsTaskEditor.tsx: controlled draft task fields with no API dependencies
- operationsDraftModel.ts: draft types, staff labels and audience choices
- OperationTaskDialog.tsx: user execution and supervisor verification
- shared-core/src/domains/calendar/operations.ts: typed cross-client adapter

The calendar owns all published WorkNotes. Staff completion never writes to a draft or a second completion ledger. No external patient information may be put into task descriptions or evidence.
