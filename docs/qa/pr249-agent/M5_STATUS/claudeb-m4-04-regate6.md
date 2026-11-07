**APPROVE.** The senior P2 (a Photos screen still mounted from before removes a photo, then the retry still submits it) is fixed at d3e85b2d, and the new test reproduces the real back-navigation.

**RED (b4948525)**
| Test | Expected | Result |
|---|---|---|
| R `retained Photos removes a previously uploaded image before retrying submission` (`m4-marketplace-review.test.cjs:133`) | fail for the defect | **FAIL** at `:158` `assert.deepEqual(h.callsOf('delete').map(call => call.id), [17])`: actual `[]`. It is a real assertion, not a crash. Its earlier checks pass: 1 upload, submit sent with images `[17]`. |
| C: the other 6 tests in that file | pass | 6/6 pass |
| Same Photos instance kept mounted? | required | **Yes.** I logged fiber create/delete in a temporary harness copy, then reverted it. `root/Stack:.0/MarketplaceParityScreen:photos`, its child and `PhotosStep` were each created once and never deleted, through push audience ÔåÆ review ÔåÆ pop ÔåÆ pop. |

**GREEN (d3e85b2d)**
- M4 marketplace tests 11/11 (R now passes). Sibling mobile marketplace tests 23/23. Next `m4Review.test.mjs` 14/14.
- `mobile-gate.sh` gave 753/753, tsc exit 0, real **GATE_EXIT=0**. `expo lint` exit 0 with 0 errors and 64 warnings, the same count Codex A reported.
- shared-core: vitest 60 files / 485/485, exit 0; `tsc --noEmit` exit 0. `git diff --check` passes.
- Web and Vite: nothing touched this round (the only change is `frontend_mobile/features/parity/marketplace.tsx`), so I ran no Vite tsc.
- Senior finding fixed at `marketplace.tsx:236-238`: Remove reloads the saved draft (`loadMarketplaceDraft(scope)`) and takes the uploaded list and IDs from it before calling DELETE.
- Test diff 5b309204..d3e85b2d: only additions. The harness's `uploadImage` and `deleteImage` return the same values and errors as before; it adds a server-side image set (`serverImages`) and records submit `images`; when no stack is set it renders exactly as before. **No assertion weakened.**

**Review method.** Rule checked: a photo the user removes is deleted on the server and never published with the listing.
- GUARDED, mobile Photos remove: `marketplace.tsx:236-238` (reads the saved draft).
- GUARDED, mobile Photos add: `marketplace.tsx:234`. It patches only the photo list, and `marketplaceDraft.ts:39-40` merges with the stored upload data, so a stale add keeps it.
- GUARDED, mobile Review submit: `marketplace.tsx:280-287,341`. It merges the saved draft, and Review always mounts fresh because nothing pushes Photos on top of a retained Review (the only push to photos comes from Details, which mounts a new Photos).
- GUARDED, Next wizard: `add-item-wizard.tsx:192-196`. Upload IDs live in a ref inside the same component, so they are always current.
- No other `deleteImage` caller exists in mobile or web.
- Not a blocker: the reload at `:236` doesn't wait behind writes already queued in `patchMarketplaceDraft`. No current flow has an upload write in flight while Photos is on screen.

**Findings:** none blocking. The lost-DELETE-response recovery stays P3 backlog, as Codex B ruled.

## Summary for the orchestrator
APPROVE M4-04 at d3e85b2d (tests b4948525 RED ÔåÆ GREEN).
RED: the new R fails at `m4-marketplace-review.test.cjs:158` (DELETE IDs `[]`, expected `[17]`); the 6 C tests pass; the same Photos fiber stays mounted throughout (instrumented, then reverted).
GREEN: M4 marketplace 11/11, siblings 23/23, Next 14/14, mobile-gate 753/753 tsc 0 GATE_EXIT=0, lint 0 errors / 64 warnings, shared-core 485/485 + tsc 0.
No test weakened. All sibling paths are guarded. Lost-DELETE-response recovery remains P3 backlog.
No PostgreSQL rerun (no backend change), no device check. My worktrees and junctions are removed; ct-m4-04-fix is Codex A's and I left it. Nothing committed.

## Notes for the next agent
Changed: nothing; read-only gate in my own worktrees, now removed.
Decided: the Stack harness keeps the same fiber (key `root/Stack:.0/...:photos`) across push/pop, so it models native back-navigation.
Left: P3 lost-DELETE-response recovery; the reload at `marketplace.tsx:236` is not serialized behind the draft write queue (no current flow hits this).
Trap: `currentNodes()` renders every stacked screen, so a button label shown on several screens at once would match the first screen's button.
