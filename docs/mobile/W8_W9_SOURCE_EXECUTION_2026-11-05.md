# W8 Public & Content / W9 Native polish — execution ledger (5 Nov 2026)

**PR:** #249 (draft, stacked on #248). **Authoritative plan:** `docs/mobile/W8_PUBLIC_CONTENT_PLAN.md`, `docs/mobile/UI_UX_DIRECTION_AND_ROADMAP.md`. **No merge, deployment, OTA, store release or live provider actions.**

## Implemented source changes (not native-accepted)
- **W8a:** Signed-out and signed-in `/explore` navigation, without bypassing AHPRA/verification/owner setup; signed-in auth return limited to the first-party `/explore` allowlist; landing and More entries; branded screen, safe rich-content renderer, per-environment HTTPS public website navigation and URL-scheme tests.
- **W8b interim:** The approved calculator remains web-only in the system browser for store builds. No unvalidated native dosing algorithm is enabled.
- **W8c:** Native Learning/Blog/News lists query published publicContent API with server-side search, pagination, safe retry and deduplication; native articles display rich bodies, attribution, author, comments, delete-own, reactions and sharing.
- **W8d:** Native public community discovery, feed, pinned/editorial posts, polls, create, comments/replies, owner edit/delete, reactions and report; server-provided `can_interact` and `can_edit` remain authority.
- **W8e:** Read-only organisation and public talent profiles use the canonical shared-core public calls; talent contact routes through authenticated persona workspace; public organisation shifts preserve `organization` filter across pages.
- **W8f:** Configured in-app legal links across landing, registration, five profiles and Explore. Publishing workspace appears only when `contentManagement.getMe` returns editorial responsibilities; browser sign-in explicitly disclosed.
- **W9 (not a separately defined wave):** Initial design token/touch target cleanup in `ParityToolsCard`. No release or complete screenshot signoff implied.

## Review and required follow-up
The source implementation is **not** a full release-grade acceptance of the W8 web jobs. Backend/server authority remains unchanged; readers are intentionally signed-out readable and mutating actions are permission-gated. Validate with positive and negative users, including a signed-out reader, invited but unverified user, verified member, separate tenant, and contributor. Tests must cover older-page load, retries, cancelled requests, app resume, sign-in return, small/large phones, 1.6x text, accessibility and native screen behaviour.

**Not yet established:** native clinical calculator engine and cross-web golden fixtures, complete article comment reply/report/comment reaction parity, full hub post attachment upload and pagination/approval behaviour, all contributor web-only routes, production website legal/pricing availability, independent design review, native screenshots on both platforms, TestFlight/Play, device-farm/physical phones, staging provider acceptance. Keep these OPEN, not PASS.

**Senior gate:** Run mobile Node tests + exact-head TypeScript/lint, shared-core boundary/architecture/route tests, full isolated QA and Android/iOS native acceptance on the final SHA; review CI failures before further changes. No earlier-head green verdict can certify this source.
