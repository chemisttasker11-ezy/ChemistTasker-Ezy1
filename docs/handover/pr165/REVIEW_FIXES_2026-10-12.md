# Current reviewer-fix handover

Read [the reviewer cross-check](REVIEW_CROSSCHECK_2026-10-12.md) and [the reusable test ledger](TEST_LEDGER_2026-10-12.md) before doing more work. These supersede the earlier pending lists in the archived handovers. The user explicitly requested the current and previous handover copies accompany the code; synthetic users, credentials, launchers, SDKs and raw artifacts remain ignored.

## Branch and authority

The user requested a successor PR from `review/pr165-consolidated-20261012` containing all accumulated local PR165 work. PR165 itself is not to be updated or merged. No launch-branch commits are included. `13ec2c1` is not an ancestor; no launch-branch collision occurred locally. Origin main was rechecked at `0a010859377d595cf6f4672f0b3f9ea3ab201192`, already incorporated by `4fcdf69`.

- `53dc83f`: packaging, private PATCH, staff scope, payroll routing, shared posting/controllers, native fields/review and CI/harness corrections.
- `54dbc58`: current-role booked biography/CV, request-scoped feed permission cache, clean candidate reveal acceptance and reviewer cross-check.
- The current worktree also factors review-card projection and the locum Super Guarantee default into shared-core; both web and Expo preview call the same shared mapper. The native Pharmacy GST separator is repaired. See the ledger's verification refresh for targeted checks against these latest edits.

No merge, deployment, live database migration or real outbound messaging occurred. The successor PR should remain draft until the outstanding acceptance checks below are completed. Publishing a review branch is not approval to release it.

## Completed fixes and structure

The functional review defects are corrected: dedicated bookings stay private without embedding; concrete staff subtype resolves centrally; Expo carries/render skills and software; empty presets and widening mode survive navigation; success completion runs once; recurrence and custom date rates are preserved. Pharmacy context is expanded-only under Pharmacy services. Current account role selects onboarding even with historical rows; private booked bio/CV now use the same lookup.

Canonical skills data is packaged into backend images. One fail-closed registry loader owns normalization. Shared UI has its own package boundary; Next no longer relies on sibling-host dependency resolution. Vite starts from freshly built compiled core, resolving the missing export. Shared shifts draft construction/validation serves both web and native, with focused host controllers. Backend models remain in their owning domains; no ownership allowlist expansion was used.

Published-rate policy remains in the backend shifts domain; internal staff redaction and email rendering reuse it. Shared client projections consume the explicit visibility flag. Staff agreement snapshots use existing engagement/pricing services. Custom posted rates still override pharmacy guides. The feed permission cache reuses decisions within one request/pharmacy; it does not introduce another policy or a global permission cache.

The claims-versus-verification, Other Staff eligibility, instant-staffing scope, private-booking and agreed-rate policies are listed verbatim in the cross-check. Do not change them while fixing acceptance tooling. In particular, unverified individual skill evidence must not become a new application gate.

## Current verification

The exact application checkpoint `54dbc58` has 948 backend tests run (43 skipped), 198 shared-core tests passed, 160 browser cases passed (3 skipped), all 24 appearance baselines unchanged, all host typechecks passed and architecture/package/wiring checks passed. Additional backend suites and 16 attendance/roster commands passed. Next route tests pass after replacing obsolete inline-grouping expectations with the current shared component contract. Mobile lint and dependency checks pass; initial direct invocation lacked the required npm environment and is recorded separately.

Fresh synthetic Student candidates saved dispensing/software claims via the normal onboarding API and reloaded them. Real owner browser review/reveal passed; the unrevealed counteroffer stayed anonymous and reveal returned no email/CV. Historical/invalid data remains a separate negative regression. Old seeded users are not a policy oracle.

Production backend/Next images built and booted. Actual authenticated Next/Vite/Django tests passed owner cookie/CSRF/logout and delegated pharmacy isolation. Final API identity/schema/replay are identical to 4fcdf69. Final PostgreSQL migration rehearsal and 74 tests passed. Android export, debug APK build, emulator installation, owner login/dashboard, shift-center navigation and the candidate counter-offer review dialog passed. The dialog showed a synthetic Student's role, claimed dispensing skill, software, verification badges and proposed terms. Full native onboarding, talent, posting and roster journeys have not passed yet; the current posting-preview edits also postdate the APK build and need a rebuilt APK.

See the ledger for precise tested checkpoints, commands, logs, earlier baseline comparison and reuse instructions. Do not rerun the complete package solely because a previous handover says it is pending.

## Work still required

1. Native Android journeys: onboarding, talent, post-shift preview and roster acceptance remain. The candidate counter-offer review is now visually verified. Rebuild/reinstall the APK before accepting the latest shared posting-preview change. The isolated copied app initially generated a wrong router entry because dependencies are junctioned; an ignored `index.js` wrapper corrects the manifest path. Earlier emulator System UI ANR and dev-server timeout/404 are environment/harness evidence, not acceptance successes. Keep any harness adjustments outside source.
2. iOS native acceptance needs a Mac/iOS runner; none is available here.
3. Kiosk Rust suite: Windows attempted `cargo test --locked --offline`; missing Perl, then Git's incomplete Perl modules prevented vendored OpenSSL configuration. No kiosk application files changed. Run the existing Linux CI job, or use a complete native Windows Perl/build toolchain; do not rerun unrelated passing web tests for this.
4. Hosted successor-PR CI, including Linux/platform-specific runtime audit and wiring checkout evidence, then staging multi-persona acceptance. Local image boot is not staging approval. Do not describe every CI job as passed while these remain unresolved.

The separate launch branch is excluded. The user has no intention to merge PR165; its historical handovers are reference records only.
