# Mobile next-shift wave — handover and acceptance
Source: PR #249. Draft, unmerged, no deployment or live actions.

Implemented: server-scoped worker confirmed slots are projected into a minimal read-only per-account offline cache, with next-shift view reachable from More. Cached display is explicitly flagged as potentially stale. Calendar action opens the Google Calendar event editor and requires the user to save; directions opens Google Maps. No new paid, booking, attendance, rate, calendar or permission writes. The live API always remains authoritative.

Negative controls: no owner/admin shift data fetched, no financial details stored, no custom calendar permission, no automatic booking or attendance changes. Account switch remounts the screen, stale request generations cannot replace newer data, and cache-write failure does not hide live results.

Required before release: exact-head node tests, mobile TypeScript/lint, UI on iOS and Android, time zone and overnight-shift proof for every supported Australian state, delayed/cancelled shifts, offline/no cache/corrupted cache and account switches. Deep QA cannot be inferred from the source code alone.

Further features approved for investigation, not silently implemented: app lock after inactivity, server-level notification categories/quiet hours, true native home-screen widgets, cross-device QR contact records, and confirmed shift calendar subscriptions. These need distinct security, permissions, background-delivery and idempotency proofs.
