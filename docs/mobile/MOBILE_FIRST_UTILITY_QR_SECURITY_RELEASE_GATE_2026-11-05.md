# Mobile-first utility features — implementation and production gate
Date: 2026-11-05
PR: #249 (draft, unmerged, undeployed)

## Delivered in the current wave (source only)
1. Mobile public-content install prompt on Next and legacy Vite: recognised Android/iOS browsers see verified store links plus a continue-in-browser choice. Session dismissal, non-blocking access, accessible controls and exclusion of signed-in/payment routes. Store URL discovery must still be checked against production store availability at release.
2. Mobile Settings (More): opt-in/out native biometric shortcut for the current account, OS PIN/Face ID/fingerprint management, view OS camera/notification permissions, request notification permission on tap, open device Settings for changes, explain location-free kiosk QR attendance, manually check app build version. Existing startup/resume store/OTA check is retained.
3. QR discovery: native scanner with just-in-time camera request, strict trusted-origin and supported-path validation, review before opening, saved contacts scoped per user, membership invite tokens stored only in OS-protected SecureStore, public links stored separately.
4. QR sharing: publication-only worker public listings discoverable from pharmacist/other-staff/explorer profiles, first-party QR browser display and shareable URL; existing pharmacy staff/locum invite-link dialogs now offer a first-party QR for their server-issued membership invitation token. The QR encodes links, never identity documents or payment information.
5. Existing membership application page remains authoritative: scanning/QR never silently adds a worker, creates favourites, grants manager access or creates a membership.

## Backend and product work NOT yet implemented
- **B1 Public cards:** server-backed, opt-in/revocable public worker and pharmacy QR identities (opaque public IDs, no emails/mobile/payment/ID/AHPRA number leakage). Server authorisation and signed-in lookup are required. Existing reference-code QR only links to a public talent listing and pharmacy QR requires a previously authorised invite token.
- **B2 Server-side action flow:** after scan, owner/admin selects a pharmacy and either *Invite as staff* or *Invite as favourite* through current membership rules. Worker selects *Apply to pharmacy staff* or *Request favourite membership*; manager review/consent, membership limits, role eligibility and explicit employment terms remain unchanged.
- **B3 Saved drafts across devices:** user-scoped server collection of scanned public cards and unsubmitted requests with expiry, consent, deletion and deduplication. This wave stores only device-local pending links.
- **B4 Notification preferences:** backend categories and quiet-hours preferences; device-token deregistration/revocation on opt-out and suppression at dispatch. OS permission alone is not a backend unsubscribed setting.
- **B5 Stronger optional app-lock policy:** OS credential challenge after inactivity or opening sensitive payment and identity screens, with an explicit timeout, session-generation check, and recoverable fallback. No separate unaudited low-entropy PIN login.
- **B6 Universal/App links:** verified Android App Links and iOS Associated Domains, with deep-link recovery to the same content after first install, signed-in route gate, and no web loop.

## Mandatory verification before marking DONE
- Exact-head TypeScript, ESLint, shared-core boundary and web routes; Android and iOS native builds and tests.
- Real iOS/Android camera permissions, denied/blocked paths, OS settings return, visual QR decode by third-party camera, share target, large text, TalkBack/VoiceOver and device rotation.
- Cross-account switch, sign-out, refresh expiry/revocation, hidden/unpublished talent, stale/expired invitation, different pharmacy/tenant, forged QR host/port/credentials, duplicate scans, offline drafts, lost device and credential revocation.
- True store listing destinations and availability, Expo OTA vs mandatory store policy, staging content URLs, install redirect loop prevention and first-load performance.
- Production design screenshots for iPhone small/large and Android small/large, dark/reduced-motion and keyboard accessibility; no release/merge until reviewed.

## Additional mobile-focused recommendations
- Read-only offline roster/confirmed-shift cache with explicit freshness indicator; never perform financial/attendance changes offline without reliable idempotency and server acknowledgement.
- One-tap calendar add for confirmed shifts, travel-time notification and OS widgets/shortcuts for next shift (subject to privacy settings).
- Worker availability quick editing, shift check-in shortcut and quick-share of confirmed invoice PDFs.
- Per-pharmacy notification controls, quiet hours, SOS priority alerts separated from marketing announcements.
- Device-specific biometric app lock, secure screenshot/privacy blurring on sensitive screens, account/device session management.
- Accessibility QA, dynamic font sizing, haptics, low-bandwidth mode and QR scanner flashlight/zoom.
