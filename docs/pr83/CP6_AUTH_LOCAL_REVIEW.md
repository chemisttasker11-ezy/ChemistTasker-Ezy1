# PR83 CP6 authentication local review (2026-09-27)

CP6 was reviewed in the local `main` working tree before its dedicated commit and push.

## Accepted implementation

- Expo web now resolves a configured loopback API URL to the browser page's loopback hostname. A page on `localhost:8081` therefore calls `localhost:8000`, rather than mixing `localhost` with `127.0.0.1` and losing its SameSite CSRF/refresh cookies.
- Android and iOS keep the exact configured API hostname, so emulator, device and LAN routing are unchanged.
- The resolver is shared by the Expo Axios client, shared-core configuration, API constants and authentication lifecycle. This removes the duplicate URL normalization that allowed auth calls to disagree.
- Django continues requiring CSRF for every browser authentication write, even when a caller supplies a bearer token or claims to be mobile. Native clients continue using refresh tokens in response bodies.
- Browser refresh tokens remain HttpOnly and are never stored in Expo web JavaScript storage. Each new sign-in still starts in the account's original persona; admin assignments remain switchable access rather than replacing that persona.

## Verification

- Expo TypeScript check passes.
- Expo lint passes.
- `users.tests.BrowserTokenExposureTests`: 6 tests pass, covering browser CSRF enforcement, cookie-only refresh tokens, refresh rotation, logout revocation and native token compatibility.
- A disposable Explorer signed in through `http://localhost:8081/login` without the previous `CSRF cookie not set` response and opened `/explorer/availability`.
- Reload preserved the signed-in Explorer persona.
- Removing the JavaScript access token and reloading successfully recovered through the HttpOnly refresh cookie, with no console error.
- Logout cleared browser storage, revoked the server session and sent a protected Explorer route back to `/login`.
- The disposable user and isolated Playwright session were removed after verification.

## Decision

The CP6 Expo browser authentication blocker is fixed and locally accepted. Web browser and Expo web now follow the same cookie/CSRF security contract, while native Expo retains bearer-token authentication. Native Android/iOS device sign-in remains a separate device-render smoke check rather than a blocker for this browser CSRF defect.
