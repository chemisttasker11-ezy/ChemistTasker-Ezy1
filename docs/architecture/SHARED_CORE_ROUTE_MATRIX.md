# Shared-core route matrix

**Checkpoint:** SC00  
**Inventory commit:** `77060bdc1b692bd68c1b2c0f8f472eb837ab4b01`  
**Inventory date:** 17 September 2026

This is the original SC00 migration ledger for the single Django API boundary. Rows preserve the 17 September 2026 inventory so the migration history remains auditable; individual `DUPLICATED_CLIENT` labels below are historical findings, not a claim about the final CP4 branch state.

The current enforcement state is recorded in **Final CP4 reconciliation** below. Django serializers and views remain the wire-contract authority.

## Status legend

| Status | Meaning |
|---|---|
| `SHARED` | An operation exists in `shared-core` and active consumers use it. |
| `MISSING_WRAPPER` | Django exposes the operation, but `shared-core` has no named operation yet. |
| `DUPLICATED_CLIENT` | A shared endpoint/operation exists, but at least one client still performs local networking or keeps a copied SDK. |
| `PLATFORM_SPECIFIC` | The operation is intentionally platform/bootstrap infrastructure rather than a cross-platform business operation. |
| `UNUSED` | No active first-party client consumer was found. |
| `SECURITY_NATIVE` | The contract may be shared, but transport, secrets, or durable state must remain native. |

## Route-to-consumer inventory

| Domain | Django route(s) below `/api` | Backend source | Shared endpoint / operation | React / Vite | Next.js | Expo | Status | Notes |
|---|---|---|---|---|---|---|---|---|
| Authentication/session | `users/login/`, `users/token/refresh/`, `users/me/` | `backend/users/urls.py` | `API_ENDPOINTS`; `login`, `refreshToken`, `getCurrentUser` | Shared calls plus local `AuthContext` bootstrap | Local BFF/session and copied shared-core | `AuthContext` uses shared login | `DUPLICATED_CLIENT` | Next SSR must use request-scoped auth; React/Next still contain direct session calls. |
| Authentication/session | `users/csrf/`, `users/logout/`, `users/ws-ticket/` | `backend/users/urls.py` | No complete named shared facade | Local Axios/session code | `shared/browser-session.ts` | Session bootstrap only | `PLATFORM_SPECIFIC` | CSRF/cookie proxy bootstrap may stay platform-specific; shared wire types can still be added later. |
| Account verification | `users/verify-otp/`, `users/resend-otp/`, `users/mobile/{request,verify,resend}-otp/` | `backend/users/urls.py` | `verifyOtp`, `resendOtp`, mobile OTP functions | Shared functions | Migrated copy uses package alias | Shared functions | `SHARED` | Preserve existing operations. |
| Account recovery/support | `users/password-reset/`, `users/password-reset-confirm/`, `users/contact/`, `account/` | `backend/users/urls.py`, `backend/core/urls.py` | `passwordReset`, `passwordResetConfirm`, `contactSupport`, `deleteAccount` | Shared functions | Mixed shared/migrated consumers | Shared functions | `SHARED` | No new wrapper required. |
| Mobile configuration | `users/mobile/app-config/` | `backend/users/urls.py` | None | — | — | Direct `fetch` in `utils/appUpdates.ts` | `PLATFORM_SPECIFIC` | Mobile update/bootstrap configuration is Expo-specific. |
| User/profile | `users/`, `users/{id}/` | `backend/users/urls.py` router | `API_ENDPOINTS.users`; `searchUsers` and user DTOs | Shared | Copied/migrated tree | Shared invite helpers | `SHARED` | Keep router semantics in legacy SDK during migration. |
| Organization memberships | `users/organization-memberships/`, `users/organization-memberships/{id}/`, `users/organization-role-definitions/`, `users/invite-org-user/` | `backend/users/urls.py` | Named membership/role/invite functions | Shared | Copied/migrated tree | Shared | `SHARED` | Do not duplicate membership permission rules. |
| Organizations | `client-profile/organizations/`, `organizations/{id}/`, `organizations/public/{slug}/`, `dashboard/organization/{id}/` | `backend/client_profile/urls.py` | Organization CRUD/dashboard/public functions | Shared | Shared via migrated alias | Shared | `SHARED` | DRF router actions are included in this row. |
| Pharmacies/chains | `client-profile/pharmacies/**`, `chains/**`, `pharmacy-claims/**`, `pharmacy-admins/**` | `backend/client_profile/urls.py` | Pharmacy, chain, claim and admin operations in `api.ts` | Shared | Copied/migrated consumers | Shared | `SHARED` | Existing service helpers are canonical until transport migration. |
| Memberships/pharmacies | `client-profile/memberships/**`, `my-memberships/**`, `membership-invite-links/**`, `membership-applications/**`, `magic/memberships/**` | `backend/client_profile/urls.py` | Membership/invite/application operations in `api.ts` | Shared; Vite owns the magic-link application UI | No active membership page; `/membership/*` proxies to Vite | Shared | `SHARED` | One application implementation only. Owner review, DOB, TFN/ABN readiness and EmploymentEngagement remain on the shared backend/core contract. |
| Onboarding | `client-profile/{owner,pharmacist,otherstaff,explorer}/onboarding/me/`, reference/claim routes | `backend/client_profile/urls.py` | `getOnboarding*`, `updateOnboarding*`, referee and claim operations | Shared; two screens still construct route locally | Copied/migrated consumers | Shared; two screens still construct route locally | `DUPLICATED_CLIENT` | Remove local role-path fetches only after shared artifact convergence. |
| Dashboards | `client-profile/dashboard/{owner,pharmacist,otherstaff,explorer}/` | `backend/client_profile/urls.py` | Dashboard operations in `api.ts` | Shared | Copied/migrated consumers | Shared where used | `SHARED` | Presentation mapping may remain local. |
| Job board/public shifts | `client-profile/public-job-board/`, `public-shifts/**`, `view-shared-shift/` | `backend/client_profile/urls.py` | `getPublicJobBoard`, public shift/detail and shared-shift operations | Shared | Shared through copied/migrated SDK | Shared public shift functions | `SHARED` | Reuse before any SC08 naming work. |
| Shift lifecycle | `client-profile/community-shifts/**`, `shifts/**`, `shift-interests/**`, `shift-rejections/**`, `shift-saved/**`, `shift-offers/**` | `backend/client_profile/urls.py` | Extensive shift functions/services in `api.ts` | Shared | Copied/migrated tree | Shared | `SHARED` | Includes claim, interest, escalation, offers, save and candidate actions. |
| Talent board | `client-profile/explorer-posts/**` plus onboarding profile reads | `backend/client_profile/urls.py` | Explorer-post feed/CRUD/action functions and shared profile types | Shared | Shared through copied/migrated SDK | Shared | `SHARED` | SC08 should reconcile semantics, not rewrite working calls. |
| Availability | `client-profile/user-availability/**` | `backend/client_profile/urls.py` | Availability CRUD/services | Shared | Copied/migrated tree | Shared | `SHARED` | Direct onboarding fetch in availability screens is tracked under onboarding. |
| Chat | `client-profile/rooms/**`, `messages/**`, `chat-participants/`, `my-memberships/` | `backend/client_profile/urls.py` | Room/message/participant functions and DTOs | Shared | Copied/migrated tree | Shared | `SHARED` | WebSocket/bootstrap remains a separate transport concern. |
| Notifications | `client-profile/notifications/**`, `device-tokens/**` | `backend/client_profile/urls.py` | Notification functions; device-token wrapper present in legacy SDK | Shared notification adapter | Copied/migrated tree | Shared notification functions | `SHARED` | Native push registration can remain platform-specific around the shared operation. |
| Ratings | `client-profile/ratings/**` | `backend/client_profile/urls.py` | Ratings list/summary/mine/pending functions | Shared, with one local Axios composition | Copied/migrated tree | Shared | `DUPLICATED_CLIENT` | Remove remaining local networking during domain migration. |
| Invoices | `client-profile/invoices/**` | `backend/client_profile/urls.py` | Invoice CRUD/PDF/send/report operations | Shared | Copied/migrated tree | Shared | `SHARED` | PDF URL helper is intentionally transport-adjacent. |
| Billing/subscription | `billing/subscription/`, `subscribe/`, `subscription/seats/`, shift charges | `backend/billing/urls.py` | Subscription and charge functions in `api.ts` | Shared | No active business consumer found | Shared | `SHARED` | Backend remains billing authority. |
| Billing webhook | `billing/webhook/` | `backend/billing/urls.py` | None | — | — | — | `UNUSED` | Provider-to-backend endpoint; must not be called by clients. |
| Calendar/work notes | `client-profile/calendar-events/**`, `work-notes/**`, `calendar-feed/**` | `backend/client_profile/urls.py` | Typed calendar/work-note functions | Shared | Copied/migrated tree | Shared | `SHARED` | Standard router actions grouped. |
| Public Hub community | `public-hub/community/**`, `posts/**`, `attachments/**`, `me/` | `backend/public_hub/urls.py` | `PLATFORM_ENDPOINTS.publicHub`; partial `publicContent` facade | Local public-hub adapters and shared authenticated Hub SDK | Local `/api/hub` proxy/client | Mobile shared Hub adapter | `DUPLICATED_CLIENT` | Public and authenticated Hub surfaces currently have separate client paths. |
| Public articles/news | `public-hub/articles/`, `articles/{slug}/`, comments/reactions/reports | `backend/public_hub/urls.py` | `publicContent.listArticles/getArticle/listArticleComments/createArticleComment/reactToArticle`; generic request for remaining actions | No canonical end-to-end consumer | Direct `hub-server.ts`/platform fetch | No active article UI | `DUPLICATED_CLIENT` | SC03 must formalize serializer DTOs and add missing named comment/report operations. |
| Authenticated pharmacy Hub | `client-profile/hub/**` | `backend/client_profile/urls.py` | Legacy Hub operations in `api.ts` | Shared via `src/api/hub.ts` | Direct BFF calls plus copied SDK | Shared via mobile Hub adapter | `DUPLICATED_CLIENT` | Existing shared operations should be reused; do not create a third Hub SDK. |
| Content management | `content/me/`, `documents/**`, `invitations/**`, `team/**`, `media/`, `moderation/**`, `audit/` | `backend/public_hub/content_urls.py` | `PLATFORM_ENDPOINTS.content`; named reads plus generic `request` | No active Vite editor found | Local `contentApi` and proxy routes | — | `DUPLICATED_CLIENT` | Named mutation/media/moderation wrappers and canonical DTOs remain for SC03. |
| Marketplace browse/access | `marketplace/categories/`, `listings/`, `listings/{uuid}/`, `me/access/`, `me/listing-options/` | `backend/marketplace/urls.py` | Named `marketplace` facade operations | Public UI bridged to Next | Direct fetch/`marketApi` | — | `DUPLICATED_CLIENT` | Shared wrappers exist but Next does not consume the root package artifact. |
| Marketplace seller | `marketplace/me/listings/`, dashboard, eligibility, audience, catalogue lookup | `backend/marketplace/urls.py` | Named reads in `marketplace` facade | Public UI bridged to Next | Direct `marketApi` | — | `DUPLICATED_CLIENT` | Formal DTOs still local to Next. |
| Marketplace mutations | Listing create/update/actions, images, enquiries, internal transfers | `backend/marketplace/urls.py` | Endpoint identities; generic `marketplace.request` only | Public UI bridged to Next | Direct `marketApi` | — | `DUPLICATED_CLIENT` | Add named wrappers from confirmed serializers in SC04. |
| Marketplace exchanges | `marketplace/me/exchanges/`, `exchanges/**`, `saved/**`, `reports/` | `backend/marketplace/urls.py` | Endpoint identities; generic `marketplace.request` only | Public UI bridged to Next | Direct `marketApi` | — | `DUPLICATED_CLIENT` | Server controls eligibility and exchange state. |
| Ethical access/admin | `ethical/me/access/`, `me/listings/`, `pharmacies/{id}/approval/`, grants/revoke | `backend/ethical_marketplace/urls.py` | Named reads for access/listings/approval/grants; generic request for mutations | Public UI bridged to Next | Direct `ethicalApi` | — | `DUPLICATED_CLIENT` | Authorization and grants stay server-side. |
| Ethical catalogue/inventory | `ethical/catalogue/**`, `inventory/imports/**`, `inventory/lots/**` | `backend/ethical_marketplace/urls.py` | Named collection reads; endpoint identities and generic request for detail/actions | Public UI bridged to Next | Direct `ethicalApi` | — | `DUPLICATED_CLIENT` | Import commit and reconciliation need named wrappers in SC05. |
| Ethical listings/transfers | `ethical/listings/**`, `transfers/**` | `backend/ethical_marketplace/urls.py` | Named list/detail reads; endpoint identities and generic request for actions/messages/documents | Public UI bridged to Next | Direct `ethicalApi` | — | `DUPLICATED_CLIENT` | Escalation, S8 ceilings and visibility remain Django policy. |
| Legacy roster | `client-profile/roster-owner/**`, `roster-worker/**`, `roster-shifts/**`, create-and-assign | `backend/client_profile/urls.py` | Existing roster operations/services in `api.ts` | Shared | Copied/migrated tree | Shared where used | `SHARED` | Keep compatibility while Roster V2 migrates. |
| Roster V2 core | `client-profile/attendance/roster/{period,validate,publish,unpublish,archive,worker,acknowledge,acknowledgements}/**` | `backend/client_profile/urls.py` | Named `rosterV2` operations | Direct Axios in roster/attendance screens | No active operational consumer | No active Roster V2 consumer found | `DUPLICATED_CLIENT` | Same `getWorkerRoster` must serve web and mobile. |
| Roster V2 planning/actions | Copy week, templates/apply, bulk edit, swap/cover, manager actions, audits | `backend/client_profile/urls.py` | Endpoint identities; only template/audit reads named | Direct Axios in roster screens | — | — | `MISSING_WRAPPER` | Add named wrappers before migrating consumers. |
| Attendance worker | `client-profile/attendance/worker/{status,clock-in,break-start,break-end,clock-out,pin/update}/` | `backend/client_profile/urls.py` | Named status/clock/break operations; PIN only endpoint identity | Direct Axios | — | Direct Axios for PIN | `DUPLICATED_CLIENT` | Add PIN wrapper and migrate both clients in SC06. |
| Attendance manager | Pending/approve/reject/correct/timeline routes | `backend/client_profile/urls.py` | Named pending/timeline reads; action endpoints only in registry | Direct Axios | — | — | `MISSING_WRAPPER` | Add named mutation wrappers before React migration. |
| Workforce roster | `client-profile/workforce/roster/{workspace,validate,publish}/` | `backend/workforce/urls.py` | Named `workforce` operations and contracts | Shared adapter | — | — | `SHARED` | Kept distinct from Roster V2; Django remains revision and validation authority. |
| Workforce settings/coverage/leave | `client-profile/workforce/work-settings/`, coverage requirements, leave/decision | `backend/workforce/urls.py` | Named `workforce` operations and contracts | Shared adapter | — | Shared facade | `SHARED` | Role and ownership decisions remain server-side. |
| Workforce timesheets | `client-profile/workforce/timesheet-periods/**`, `timesheets/**`, checks, `my-hours/` | `backend/workforce/urls.py` | Named `workforce` operations and contracts | Shared adapter | — | Shared facade | `SHARED` | Backend remains time-calculation authority. |
| Kiosk pairing/admin | `client-profile/attendance/kiosk/{activate,pairing/request,pairing/pair,qr,config,worker-pin/status,worker-pin/setup,active-staff,break}/` | `backend/client_profile/urls.py` | `PLATFORM_ENDPOINTS.kiosk`; protocol types in `kioskProtocol.ts` | Kiosk UI uses restricted local client | — | Pairing/PIN setup helpers use user auth where applicable | `SECURITY_NATIVE` | Device token, key material and native durable state must stay in Tauri/Rust. |
| Kiosk offline event transport | `client-profile/attendance/kiosk/pin-clock/`, `sync/batch/`, `workers/enrol/` | `backend/client_profile/urls.py` | Endpoint identities and signed event types only | Tauri/Rust restricted transport | — | — | `SECURITY_NATIVE` | Never route native sync through the general end-user bearer client. |

## Active duplication and migration order

The boundary audit now detects both `/api/...` literals and relative route literals
used with an API-root Axios/fetch client. A reviewed digest locks the legacy backlog
so any added, removed, or changed direct route requires an explicit migration or
baseline review. The matrix therefore records
the broader duplicate surfaces found by the inventory:

1. Next's copied `landing_next/shared-core` tree and source alias are removed; it
   now installs the same package artifact as React and Expo.
2. Next public Hub, content, and public Marketplace calls use shared-core's
   request-scoped facade. Its platform proxy remains a transport boundary only.
3. React attendance/Roster V2 and workforce screens retain local presentation
   adapters, while canonical endpoint identities and supported Roster V2 actions
   live in shared-core.
4. Expo attendance PIN and onboarding-location calls now use shared operations;
   device lifecycle, app-update bootstrap, and kiosk pairing remain mobile-owned.
5. All clients link the repository `shared-core` directory for local development. CI builds one shared-core tarball, verifies its SHA-256, and installs those same bytes into Vite, Next and Expo. No shared-core tarball is committed to the repository.

SC01 through SC12 are complete. Strict boundary enforcement is enabled in CI;
new Django business routes must be added to shared-core before client adoption.

## Final CP4 reconciliation

The CP1-CP4 hardening pass made the following current-state corrections to the historical ledger:

- Workforce, EmploymentEngagement, Timesheets, Attendance and Roster V2 use the established authenticated `api.ts` surface and `API_ENDPOINTS`; they are not exposed through the Next/platform facade.
- Worker Finance uses the same authenticated request engine as `api.ts`, with additional same-origin and `/client-profile/finance/` path confinement.
- Public Article comments/reactions/reports and public/community Hub reads use named shared-core operations. The generic Next Hub wrapper and `publicContent.request` escape hatch were removed.
- Original authenticated Pharmacy Hub mutations reuse the original `API_ENDPOINTS` route authority rather than creating duplicate platform endpoints.
- Vite, Next and Expo no longer depend on a checked-in `shared-core/*.tgz`. Local development links source; CI packs once and verifies one artifact across all clients.
- The boundary audit is a ratchet: newly introduced client-local business routes/generic escape hatches fail CI, while removal of historical debt is allowed.
- Kiosk native device credentials, encrypted persistence and offline sync remain intentionally native and outside end-user bearer transport.


## SC08 Job Board / Talent Board reconciliation

The two boards are not aliases. The Job Board is shift inventory
(`public-job-board`, public shift detail, interests and assignment actions); the
Talent Board is explorer-post inventory (`explorer-posts/public-feed`, profile
posts, views and likes). Their Django resources, payloads and state transitions
are different, so retaining distinct operation names is intentional.

Both surfaces nevertheless use the existing shared-core transport and legacy API
surface. React's remaining public Talent Board URL construction was replaced by
`getPublicTalentFeed`; React Job Board already uses `getPublicJobBoard`, and Expo's
authenticated talent feed already uses `getExplorerPostFeed`. No parallel Job or
Talent SDK was introduced.

## Evidence commands

```text
rg "path\(|router.register" backend -g "*urls.py"
rg "fetch\(|axios\.|/api/" frontend_web frontend_mobile
rg "API_ENDPOINTS|PLATFORM_ENDPOINTS" shared-core frontend_web frontend_mobile
rg "@chemisttasker/shared-core" frontend_web frontend_mobile
node scripts/audit-shared-core-boundary.mjs
```
