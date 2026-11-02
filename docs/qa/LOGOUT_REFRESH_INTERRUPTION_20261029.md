# Logout interrupted by concurrent refresh rejection

Fixed parent: draft PR #224, `7838e1c6b7ca330726062105c9b9609142cfdea5`.
This is an independently reproduced browser-session ordering correction. It does not change
the Python dependency work, permissions, token validation or financial/delivery policy.

## Evidence and invariant

On #223's authenticated-web job `123464543782` / run `40878782240`, the owner journey timed out
waiting for the logout response; the delegated-manager journey passed. Its trace records:

- POST logout starts while other authenticated requests remain in flight.
- A concurrent request receives 401; the browser navigates to login.
- Browser tracing records the logout request as cancelled, while the backend log records HTTP 200.

The existing browser helper rejected refresh immediately with a synthetic 401 when logout was
pending. `tokenService` interprets that as signed-out state, and API/route consumers can redirect
before the browser consumes the logout response and its cookie-deletion headers. A backend 200
alone does not prove browser receipt or cookie deletion. No causation from the backend extraction
is claimed; its serializer SQLite and PostgreSQL gates passed on #223.

**Protected rule:** concurrent refresh must not announce signed-out state or permit 401-driven
redirect before the pending logout response finishes. Failed logout must preserve its real error
and remain retryable rather than manufacturing successful sign-out.

## Correction and callers

Only the pending-logout branch of `refreshBrowserSession` changes: it chains onto the existing
logout promise. Successful logout then produces the existing signed-out 401 for refresh callers;
failed logout propagates its real error. No refresh request is sent while logout is pending.
Existing refresh sharing, Web Locks/lease behavior, successful logout announcement and retry remain.

The consumer trace covers shared browser requests, Vite tokenService, API 401 handling and
AuthContext/ProtectedRoute redirection. Their code is unchanged; fixing the shared sequencing
prevents premature auth-state clearing at the common source.

The authenticated test remains unchanged and still requires HTTP 200, cookie removal and
protected-page denial. No timeout increase, retry, assertion removal or provider change.

## Verification and limits

Two focused regression cases failed on the unchanged parent helper: immediate early 401 during
a delayed logout, and a synthetic 401 masking a real 503 logout failure. After correction,
the complete authentication-flow selection passes **29/29**, zero skips/failures/cancellations.
The helper passes standalone TypeScript checking with ES2022/DOM types; whitespace passes.

Docker is unavailable locally. Hosted exact-head authenticated-browser acceptance must prove
that the response/cookie/protected-page assertions now pass; the local tests do not establish that.
All earlier draft heads remain fixed. No merge, deployment or live provider operation.
