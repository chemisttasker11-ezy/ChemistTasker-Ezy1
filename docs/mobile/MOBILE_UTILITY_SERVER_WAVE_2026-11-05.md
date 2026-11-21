# ChemistTasker Expo PR #249 — mobile utility wave implementation and acceptance
Date: 5 November 2026. Draft branch only. No merge, app-store release, EAS/OTA publish, provider traffic, or deployment.

## Changes in this wave
1. Fixed QR scanner's optional `user.id` TypeScript error identified in the previous exact-head Full Isolated QA.
2. Worker-only Next Shifts screen: canonical `fetchMyConfirmedShifts` API, one row per authorised assigned slot, local Australian pharmacy wall-clock and DST/overnight handling, Google Calendar **edit** URL and Google Maps directions; user explicitly saves any calendar event. Minimal account-scoped read-only local snapshot has last-sync and stale/offline warning. No booking, finance, or attendance writes.
3. Configurable inactivity app lock: native OS passcode/biometrics unlock and user preference per account, 0/30/60/300 second grace period, privacy overlay when backgrounded, password-sign-in/logout fallback; account remount and same-session preference change events. OS credential challenge does **not** replace JWT/session checks or create a new PIN store.
4. Authenticated server-side notification push preferences: categories MESSAGE, TASK, WORK_NOTE and ALERT; DST-aware quiet hours for supported Australian time zones; alerts bypass **quiet hours only** unless their own category is opted out. The original durable in-app notification, unread counter and websocket flows are unchanged. Muted pushes are suppressed rather than queued for later.
5. Account-scoped saved worker and organisation contacts: authenticated backend CRUD validates only currently public talent listings and existing organisation slugs, prevents cross-account reads/deletion, deduplicates, enforces cap and does not create memberships. Native QR contacts sync with the account; if offline public cards remain local drafts. Sensitive membership application bearer links remain OS SecureStore-only, never uploaded to public-card API.
6. Added targeted test cases to the Senior Package CI for UI sources, notification isolation, time zones, QR access and membership protection.

## Releasing safely
This is source implementation, not full Android/iOS acceptance. The new migrations `notifications.0004` and `talent.0006` require migration-drift and PostgreSQL verification before any rollout. The new server endpoints and mobile views must deploy as one compatible release candidate, or feature gating should be added before deploying a mobile build against an older backend. Test with owner, organisation, delegated admin, pharmacist, other staff, explorer, and anonymous/cross-tenant actors. Ensure no implicit employment/favourite grant or cancellation charging changes.

## Unfinished feature areas
- **Full QR membership action flow:** scanning worker -> select scoped pharmacy -> proposed staff/favourite invite -> worker acceptance, and scanning pharmacy -> authorised membership application/approval. Existing membership APIs remain authority and may demand employment terms and additional eligibility checks; no automatic grants have been introduced.
- **Native home-screen widget:** needs iOS widget extension/Android AppWidget design, background timeline security, OS builds and app-store acceptance. The Next Shifts screen is an in-app shortcut, NOT an OS widget.
- **True device calendar subscription:** current calendar action opens Google Calendar event editor rather than writing silently to iOS/Android calendars.
- **Deep link associated domains**, migration rollout, device/browser accessibility screenshots, push/quiet-hour staging with stub provider and physical iOS/Android UX remain required.
- **Senior Package final acceptance:** exact-head branch TypeScript+lint, all node tests, backend Django tests/migrations, shared-core contracts, PostgreSQL concurrency, real native builds, inaccessible/expired QR cases, next-shift stale cancellation tests, push provider retry policy and mobile app restart/lock flows.

## Operational safety decisions
App lock settings are per account and OS credential verification. Notification preferences suppress Expo push, not critical durable in-app records. Workers must still review current confirmed shifts on ChemistTasker rather than treating cached entries as contractual confirmation. No background task or provider usage initiated.
