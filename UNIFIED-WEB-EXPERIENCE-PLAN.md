# One-account, one-login web experience

Updated 14 September 2026. This refines the Stage 1 integration plan. It is an implementation plan, not a claim that every flow below is already complete. Historical missing photos are out of scope.

## Goal and architecture

ChemistTasker is one website with one Django account and one browser session. An existing user's email and password work for public-page interaction, eligible hubs, private dashboards, and any assigned editorial responsibilities. Do not introduce a second community account, password, or login requirement when crossing frontend applications.

Keep all maintained browser code under `frontend_web`: Vite/React in `src`, Next.js in `landing_next`, and a shared browser-auth/navigation module consumed by both. Next.js itself uses React; consolidation means one user experience and shared contracts, while retaining the two routing/build systems already in place. A rewrite of the private dashboards into Next.js is unnecessary for this scope.

Use one public origin in each environment. Development: `npm run dev` from `frontend_web`, open `http://localhost:3000`. Next.js and Vite start together; Vite's internal port is not a user entry point. Django runs separately. Production: one canonical HTTPS hostname with Nginx routing. Keep localhost/127.0.0.1 and alternate hostnames consistent in links, cookies, callbacks and CSRF configuration.

## Current findings

- The consolidated launcher and Next-to-Vite routing are saved. Django accepts HttpOnly cookie authentication as well as existing bearer clients.
- `/login` and `/community/sign-in` still present distinct login flows. The public header checks a separate session endpoint and still offers registration to signed-in users.
- Vite and migrated Next pages have duplicated AuthContext/token helpers; newer public components use another browser API helper. Their return paths and error handling differ.
- Vite protected routes preserve navigation in router state; Next handoffs use browser navigation/sessionStorage. These do not yet form a reliable shared return-path contract.
- Refresh-token rotation is enabled. Concurrent tabs/frontends and remembered versus browser-session-only login need deliberate handling. Logout currently clears cookies; server refresh revocation and other open tabs need completing.
- The local account `es.ahmed.abas@gmail.com` is active and email-verified. Content-administrator access was granted directly on 14 September 2026 at the user's explicit request. Pending bootstrap invitations were revoked. SMTP authentication failed; future invitation delivery needs valid credentials.

## Step 1 — Complete activation using the existing account

1. Open the latest ChemistTasker publishing invitation email.
2. Sign in with the existing `es.ahmed.abas@gmail.com` account only if the website is not already signed in.
3. Return to the invitation and select **Accept invitation**.
4. Open `/content`. This adds content-administrator authority to the same User record; it does not change the professional role or grant Django staff/superuser access.

If the email did not arrive, inspect the existing email worker/delivery failure first. Resend only if needed, with FRONTEND_BASE_URL set to the running public origin. A resend invalidates the previous token. Do not create a duplicate account or change the user's password. In the improved invitation screen, show the current account, a single acceptance action when it matches, and a switch-account action only on a mismatch. New-account setup appears only when needed. Preserve the invitation through registration/verification and return automatically.

## Step 2 — Establish one route and navigation contract

| User destination | Canonical route | Frontend |
| --- | --- | --- |
| Home, pricing, contact and public information | Existing public paths | Next.js |
| Sign in / register / password recovery / email verification | `/login`, `/register`, existing recovery/verification paths | Next.js |
| Blog and news | `/blog/*`, `/news/*` | Next.js |
| Calculator | `/calculator` | Next.js |
| Public community directory, eligible role hubs, post details | `/hubs`, `/hubs/:hub`, `/hubs/posts/:id` | Next.js |
| Account dashboard | `/dashboard` resolves to the authorized role destination | React/Vite |
| Private professional workflows / onboarding | Existing `/dashboard/*`, private `/onboarding/*`, `/setup/*` | React/Vite |
| Editorial workspace and invitation acceptance | `/content`, `/content/invite/:token` | Next.js |

Maintain a shared route map and `AppLink`/navigation helper. Use the owning router within an application and ordinary same-origin navigation across applications. A document navigation is acceptable; it must restore the same session without another login, loops, or a flash of a logged-out screen. Preserve query strings, relevant fragments and existing shared links. Avoid duplicate public pages being rendered by the Vite router after internal navigation.

Redirect `/community/sign-in` to `/login`, preserving a validated return destination. Preserve legacy hub/post links through explicit ID-based mappings rather than breaking bookmarked discussions. Preserve restricted hub links in React. Audit email, notification, membership/referee, payment-return, mobile-shared links, and both desktop/mobile menus against the map.

## Step 3 — Share the browser session contract

Reuse the Django login, current-user, refresh, logout and CSRF endpoints. Extend the authenticated current-user response with editorial capabilities and eligible hub destinations, avoiding separate definitions of signed-in state.

Both frontends consume one shared auth client and React session adapter with explicit loading, authenticated, anonymous and temporarily-unavailable states. Read current user first, refresh once when necessary, then retry. Do not redirect to login while session restoration is pending. Treat a network outage differently from an expired/revoked session.

Use secure HttpOnly access/refresh cookies scoped to `/` on the same canonical host, CSRF on cookie-authenticated writes, and no persistent browser token copies or tokens in URLs. Keep mobile/bearer contracts intact. Serialize refresh requests within a page and coordinate rotation across tabs, with a tested fallback for browsers without the primary coordination API. Keep 'Remember me' semantics consistent after refresh. Recheck permissions on protected requests; revocation must not rely on stale UI capability data.

Complete logout so it revokes the applicable refresh session, clears cookies and in-memory state, and updates other tabs. It must work even if the access token expired. Do not silently report successful logout when the server could not be reached. Preserve Django-admin OTP protections.

## Step 4 — Implement one login and return journey

Use `/login?next=<validated relative path>` everywhere. Allow only same-origin known application routes; reject external/protocol-relative URLs and redirect loops. Preserve the destination through password recovery and required verification without leaking invitation tokens through analytics or external referrers.

- Logged-out reader clicks Like/Comment: show the same login page; after login return to that post. Do not automatically publish a comment or repeat a state-changing action.
- Logged-in reader clicks Like/Comment: act immediately when permitted; do not open a login prompt.
- User opens My dashboard: restore the shared session and enter their authorized role dashboard.
- Dashboard user opens a public hub/article: retain signed-in identity and interaction access.
- User opens the login page while authenticated: continue to the valid destination or their dashboard.
- Email-verified users may use their permitted public interactions without being forced through unrelated professional onboarding. Apply phone/profile/pharmacy requirements when the requested private workflow needs them; resume the saved destination afterwards.
- Authenticated users lacking a permission receive a clear explanation or an eligible destination, not a request to log in again.

Preserve any composer text during a login handoff as a local draft; require the user to explicitly submit afterwards. Never store calculator patient inputs as part of authentication or navigation restoration.

## Step 5 — Unify navigation and community access

Use consistent header/account controls on landing, articles, calculator, hubs and content pages. Signed-out users see Log in and Create account. Signed-in users see their name/account menu, My dashboard, Community and Log out; users with editorial responsibilities also see Publishing. Remove redundant registration prompts for signed-in users. Apply the approved ChemistTasker design handoff.

React's public-hub entries open the corresponding Next.js hub/post using shared link helpers. Next.js offers a clear return to My dashboard. Shared, Pharmacist, Intern, Staff and Explorer feeds reuse the public interface for readers and signed-in contributors, adding controls according to capabilities.

One account does not broaden permissions: verified users interact in the shared hub and their own eligible role hub. Owner, pharmacy, organization and internal-group content remains restricted to authorized members. These private areas stay in React for this stage. Editorial assignments remain separate from ordinary member posting and professional roles.

## Step 6 — Verify the journeys and roll out

Save each completed step before testing. Run a focused acceptance pass, using isolated data where necessary:

1. Existing account: dashboard → public hub → article → dashboard, with no second login.
2. Anonymous interaction → canonical login → original post; registration/verification also resumes correctly.
3. Refresh/page reload, a second tab, concurrent token rotation and an expired access cookie preserve valid sessions.
4. Global logout, revoked access and actual expiry have consistent results in both frontends; a network failure does not masquerade as logout.
5. Invitation acceptance upgrades the existing account, with no duplicate registration; editorial and ordinary posting permissions remain distinct.
6. Shared/own-role interactions succeed; restricted hub links and APIs remain restricted. Existing bookmarks, onboarding and mobile client contracts remain valid.
7. The single frontend command and production gateway serve all mapped routes under one origin; confirm desktop/mobile navigation and keyboard access.

Then recover deployed migration source and rehearse clean/staging migrations before production cutover, as required by the original plan. Keep routing/public-read rollout switches and rollback images. Do not repeat already-passing broad tests unless a relevant change or failure warrants it.

## Completion criteria

A user understands ChemistTasker as one website: one account, one login, one account menu, one development entry point, predictable links, and no reauthentication simply because navigation crosses Next.js and Vite. Additional verification or permission messages appear only when the requested action actually requires them.


## Saved implementation checkpoint — 14 September 2026

Implemented: direct local administrator grant; canonical login alias; shared browser session/refresh helper with tab coordination; shared public session provider and account menu on public, journal/community and landing headers; validated return paths; generic local API proxy preserving Django trailing slashes; role dashboard gate; public-route handoff from Vite; platform-hub handoff when anonymous hub rollout is enabled; existing-account-aware invitation screen; verification returns; local text drafts through community reauthentication; refresh-session revocation on logout; expired-cookie logout; session-only cookie preference retained after refresh; production canonical-host redirect and build/routing switches.

Verified: Next and Vite compilation, focused 32-test Django suite, two focused browser-auth unit tests, live CSRF rejection and expired-cookie logout, and the canonical login page in the browser. The user must sign in with their existing password for full authenticated UI review. Cross-browser tab rotation, role/persona/onboarding combinations, payment/mobile regressions and production staging/migration gates remain outstanding. Historical media recovery remains out of scope.
