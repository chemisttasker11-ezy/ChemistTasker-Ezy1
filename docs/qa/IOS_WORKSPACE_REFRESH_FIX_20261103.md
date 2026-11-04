# iOS workspace restoration and profile refresh

The final PR242 native iOS run (41576743836, head f84e3ee7) compiled and passed
bootstrap/consent, login and Admin Pharmacy B restart persistence. The next
Pharmacist workspace tap targeted the correct enabled control. The expected
worker dashboard never appeared; the failure screenshot remained on a fully
rendered Admin dashboard. Final PDF-share acceptance was skipped after this.

The last full native pass was 3048ded7 (run 41559907948). Mobile/runtime and
native workflow bytes were identical between that pass and f84e3ee7. The
earlier embedded-bundle/bootstrap and delayed-consent fixes remain intact.

## Reproduced application defect

AdminWorkspaceProvider reran its async restoration for any fresh user object
and new WorkspaceContext callback identities. During an explicit return to the
role workspace, that restoration could write ADMIN over ROLE:PHARMACIST and
show the Admin loading screen again. A normal profile refresh is sufficient;
no assignment, authority or user change is required.

The regression executes the actual provider and mobile persona storage code
with the existing TypeScript VM test pattern. It failed before the fix:
The first Admin assignment replaced the explicit ROLE:PHARMACIST selection. With the fix it
passes; authority revocation and different-user hydration are also exercised.

Completed hydration is now remembered by user identity, role and normalized
admin assignments. Cosmetic/auth profile refreshes preserve it. A changed
identity or delegated authority still performs normal validation/restoration.
The marker is recorded only after successful, still-active completion.
Authority revalidation respects an explicit ROLE choice, and returning to an
already-hydrated scope clears the cancelled refresh loading state. A new
hydration invalidates the completed key while preserving its identity guard,
so cancellation after a partial write cannot leave pharmacy context stale. The test
callbacks are memoized per user to match the real WorkspaceProvider.

This is a validated race consistent with the native timing evidence. A new
native Mac run must confirm the original journey, both restart assertions,
and actual revision-2 PDF system sharing. The Maestro taps, assertions,
timeouts and share checks are unchanged; no successful acceptance is claimed
until that run completes. This mobile fix does not require a server restart.


Claude B reviewed twice, approved the fix and identified one additional
partial-refresh consistency edge case. Its focused regression failed before
the final correction (selected pharmacy 502 versus active pharmacy 501), then
passed after invalidating the completed key when new hydration starts. A final
read-only review and the exact-head CI/native run provide release evidence.

Final Claude B rereview found no actionable findings. The final source passed
136 mobile script/parity tests, TypeScript, Expo lint and offline iOS Hermes
export. An unchanged, cosmetic pharmacy-name cancellation window was noted
as outside this fix; it does not grant authority. Native acceptance remains
pending and its original assertions are preserved.
