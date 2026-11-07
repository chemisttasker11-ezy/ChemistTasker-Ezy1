**FIX FIRST** at `d3e85b2d`.

1. **P2 — Remove can still skip DELETE during a pending upload-metadata write.** [marketplace.tsx:236](/C:/dev/worktrees/ct-m4-04/frontend_mobile/features/parity/marketplace.tsx:236). Upload succeeds → its draft write pauses → back twice to retained Photos → Remove reads stale storage → queued removal clears upload metadata → retry submits the removed image.
   **Reproduced at head:** one upload, zero DELETEs, zero selected photos, submitted images `[17]`; assertion expecting `[]` fails. Photos mounted exactly once, with no intervening unmount.
   **Fix:** serialize the authoritative read/delete/removal behind pending draft writes; add this deferred-write regression.

The round-3 settled-failure scenario is fixed at `marketplace.tsx:236–238`. The regression at `m4-marketplace-review.test.cjs:133` retains the **same Photos instance**. It misses the pending-write timing above, so Claude B’s queue follow-up is **blocking**.

Lost-DELETE-response recovery remains **P3 backlog**: it leaves a stale preview after server deletion.

Traced native routes, Vite’s Next handoff, Next wizard/workspace, shared API, backend permissions, serialization and receipt/version handling. Prior senior fixes remain intact.

Verification: **39/39 targeted client tests pass**, plus the independently failing race probe; diff check clean. Reviewed Claude B’s PG 35-OK evidence; PostgreSQL, broad gates and devices were not rerun.

## Summary for the orchestrator
FIX FIRST; hold merge.
One reproduced P2: pending upload-metadata write lets retained Photos bypass DELETE.
Claude B’s queue follow-up is blocking; lost-response recovery stays backlog.

## Notes for the next agent
Changed: nothing; read-only review and in-memory probes.
Decided: settled-failure fix is valid but incomplete.
Left: deferred-write regression, serialized removal, independent re-gate.
Trap: Review can unmount while its storage write remains pending.