# GM-21 — Ordinary / Ethical Marketplace — Full Grill Documentation

> **Corrections against current code (21 Nov 2026 review).** 11 claims checked at `main` `8ccf8f77` and `pr257` `21add924`; 9 hold, 2 below need the correction shown. Where a question below says otherwise, this table wins. Full evidence: [`../followup/claim-check-2026-11-21.md`](../followup/claim-check-2026-11-21.md).

| Where | Claim in this file | Verdict | Correct statement | Evidence |
|---|---|---|---|---|
| Q01, first question | “all write flags off”; read-only catalogue at defaults | WRONG | Defaults disable new goods listings, contact and commitments, but the master goods-write flag and ethical access applications default on. Describe individual flags rather than calling every write disabled. | `main:backend/core/settings.py:241`; `pr257:backend/core/settings.py:235`; `pr257:backend/core/settings.py:241`; `pr257:backend/core/settings.py:251` |
| Q03 / Q05 | Trading always requires verified identity and adulthood | WRONG — age claim overbroad | Identity verification is checked. Age is checked when a date of birth exists; the explicit missing-DOB age-assurance fallback applies only to Explorer and Junior roles. | `pr257:backend/marketplace/policy.py:57`; `pr257:backend/marketplace/policy.py:78`; `pr257:backend/marketplace/policy.py:84` |

**Area:** GM-21 Ordinary/ethical marketplace (Issue #250, area 21 of 26)
**Method:** Issue #250 interview rules + PR #184 format; Web (Vite + Next) and Expo traced together in every question, side by side, including parity gaps.
**Status:** TRACED + RE-VALIDATED. Decision status per question in Part C. No owner decision recorded yet. No code changed in this phase — documentation and decisions only.

## Web and Expo today, side by side (pr257 `21add924`)

Source for both web and Expo is `origin/agent/pr257-int` `21add924` (what merges to main). Read-only code check by agy, 21 Nov 2026; every cited file:line was checked to exist at that commit. "Parity question" = a choice for the owner, asked in this area's rounds. "Possible defect (to verify)" = drift that looks unintended; it is confirmed in code before it goes to the engineering backlog, never asked as a question. The Platforms table says which platforms each question applies to.

| Flow | Web (Vite + Next) | Expo | Same? | If different |
|---|---|---|---|---|
| Seller creates listing for ordinary goods | Next web provides goods listing creation wizard (`frontend_web/landing_next/app/(public)/marketplace/new/page.tsx:1`). Vite web has no marketplace routes (`frontend_web/src/main.tsx:1`). | Mobile provides listing creation flow with category and mode selection (`frontend_mobile/features/parity/marketplace.tsx:31`). | Yes | Verified 21 Nov: parity question, not a defect. The goods marketplace lives on the Next public site and Expo, not on Vite; which web app hosts it is GM-24-Q24 (canonical public site). |
| Listing submission and review gate | Listing transitions to pending review for moderator approval in Django admin (`backend/marketplace/models.py:45`). | Mobile surfaces pending review state and prevents unapproved listings from public view (`frontend_mobile/features/parity/marketplace.tsx:55`). | Yes | |
| Buyer browses public marketplace catalogue | Next web renders public marketplace catalogue with category and mode filters (`frontend_web/landing_next/app/(public)/marketplace/page.tsx:1`). Vite has no catalogue (`frontend_web/src/main.tsx:1`). | Mobile catalogue renders approved listings with category search (`frontend_mobile/features/parity/marketplace.tsx:80`). | Yes | Parity question: Public catalogue lives on Next web and Expo, with no presence on Vite web. |
| Buyer opens enquiry / exchange | Buyer initiates enquiry on item detail page in Next web (`frontend_web/landing_next/app/(public)/marketplace/items/[id]/[slug]/marketplace-item.tsx:25`). | Buyer opens enquiry via mobile item detail modal (`frontend_mobile/features/parity/marketplace.tsx:120`). | Yes | |
| Accept exchange terms and reserve listing | Buyer/seller agree on terms; backend locks listing idempotently (`backend/marketplace/models.py:120`). | Exchange details reflect accepted state and reserved badge (`frontend_mobile/features/parity/marketplace.tsx:145`). | Yes | |
| Ethical marketplace stock preparation and inventory | Next web ethical workspace manages stock lots and private transfers (`frontend_web/landing_next/app/(ethical)/marketplace/ethical/page.tsx:1`). Vite has no ethical workspace (`frontend_web/src/main.tsx:1`). | Mobile ethical marketplace handles lot preparation and owner authorisation (`frontend_mobile/features/parity/ethicalMarketplace.tsx:108`). | Yes | Parity question: Ethical pharmacy marketplace operates exclusively on Next web and Expo. |

### Platforms per question
| Question id | Platforms |
|---|---|
| GM21-Q01 — Do we launch the goods marketplace at all, and for whom? | Web + Expo |
| GM21-Q02 — What may be traded, and what is banned? | Web + Expo |
| GM21-Q03 — Who can sell personally, and who can sell for a pharmacy? | Web + Expo |
| GM21-Q04 — Who can buy, and how far does a listing travel? | Web + Expo |
| GM21-Q05 — What identity check must a trader pass before listing or buying? | Web + Expo |
| GM21-Q06 — Which marketplace terms must a user accept, and when? | Web + Expo |
| GM21-Q07 — How does listing review work, and how fast? | Web + Expo |
| GM21-Q08 — Sell, swap, free: what are the price rules? | Web + Expo |
| GM21-Q09 — Audience circles and escalation: who sees it first, and when does it widen? | Web + Expo |
| GM21-Q10 — Enquiry or firm offer: what is an exchange, and when is a listing held? | Web + Expo |
| GM21-Q11 — How is money handled — in-platform, or off-platform? | Web + Expo |
| GM21-Q12 — Delivery and pickup: who pays, who organises, what happens on dispute? | Web + Expo |
| GM21-Q13 — How are disputes, returns, and damaged/missing goods handled? | Web + Expo |
| GM21-Q14 — Ratings and reviews for marketplace transactions | Web + Expo |
| GM21-Q15 — Ethical marketplace: launch together or defer? | Web + Expo |
| GM21-Q16 — Ethical marketplace: who can access S4/S8 inventory? | Web + Expo |
| GM21-Q17 — Ethical marketplace: batch tracking and expiry compliance | Web + Expo |
| GM21-Q18 — Ethical marketplace: wholesaler vs direct transfer documentation | Web + Expo |
| GM21-Q19 — Marketplace notifications: which events notify whom, on which channel? | Web + Expo |
| GM21-Q20 — Marketplace admin: who moderates listings, manages categories, and views audit logs? | Web + Expo |
| GM-21-W01: Which marketplace switches are on at launch? | Web + Expo |

## 0. Verification header — read first

| Item | Value / result |
|---|---|
| Active PR re-validated against | PR #249, head **`97c4543e051b43fe30ec7e2e61ad3d69957a918e`** — verified live via `pull_request_read get` on 2026-11-21. **Unchanged from the task snapshot and unchanged from the first pass.** Still open, draft, stacked on #248, `updated_at` 2026-11-05, base `feat/mobile-merge-sdk` (`c98cf2ef74c6de356cceb8dee3a61dad47b6b843`), 458 commits, 314 files changed. |
| PR body "working head 26cae2d6" | **Resolved:** `26cae2d6` is the short SHA of the last implementation commit listed in the PR body text, not the branch head. The API head is `97c4543e…` and all tracing below is at that head. |
| Issue #250 | Read live. Scope confirmed: 26 areas, GM-21 = ordinary/ethical marketplace; docs-only, no code changes. |
| PR #184 format source | Read live (`pull_request_read get`, head `c786a4b8182ebf9b505d47cd81980eb3b9851ce3`). `docs/qa/launch-grill/questions.json` + `AUDIT.md` read at `refs/pull/184/head`. **142 questions, 30 carried decisions, 8 areas** (onboarding, posting, booking, agreement, cancel, talent, availability, launch). |
| Other heads | PR #248 head `25939534a1c5543454a8e770571e4dff46380d96`; `main` `8ccf8f7` (merge PR #247, 2026-11-03). |
| **Rate limit — this re-run** | **No real HTTP 429 occurred.** 146 GitHub calls, all strictly sequential, one at a time, 9 s sleep between calls (loops: 69 + 37 + 27 + 11 fetches plus the PR/issue/format reads). One **false-positive stop** in loop 1 at job 38: the stop detector matched the identifier `EMAIL_TASK_RATE_LIMIT` (a settings constant) inside a successfully downloaded file (`backend/core/settings.py`, `ok:true`, 27,384 chars). That was not a rate limit; the detector was fixed to count only an `ok:false` response mentioning 429/rate-limit, the file was fully downloaded and is usable, and the loop resumed. No call was made after any real 429, because none occurred. The first-pass deviation (one GitHub call after a 429) was **not repeated**. |
| Search inventory caveat | `search_code` results reflect the **default branch** (`main`, `8ccf8f7`), not ref `97c4543…`. File names from search are flagged as default-branch-only where they were not also confirmed by a ref-pinned fetch. All file-content claims below come from ref-pinned fetches at `97c4543…` unless marked otherwise. |
| Senior review | `~/workspace/chemisttasker-grill/senior-review-gm21-ordinary-ethical-marketplace.md` (2026-11-21, PASS partial trace). Its required re-run list was followed: `docs/marketplace/IMPLEMENTATION.md` and `FINALISATION_HANDOVER_2026-09-17.md` read first, then views/services/serializers/listing_policy/tasks/urls, the whole ethical app, tests, celery, Stripe wiring, Next + Expo screens, Vite check. |

## 1. What the current code verifiably contains (ref `97c4543…`)

### 1.1 The two marketplace apps and their docs

- `backend/marketplace/` — goods marketplace: `models.py` (20,085 bytes), `views.py` (24,783 bytes), `serializers.py`, `services.py`, `policy.py`, `listing_policy.py`, `tasks.py`, `signals.py`, `urls.py`, `entry_views.py`, `admin.py`, `public_sitemap.py`, `tests.py`, `test_listing_policy.py`, `test_pr201_b24_b25.py`, `management/commands/` (`finalize_marketplace_data.py`, `check_marketplace_release.py`, `seed_marketplace_categories.py`), `migrations/0001_initial.py` (**exists at this head — see §1.8**).
- `backend/ethical_marketplace/` — medicines/ethical marketplace: `models.py` (17,713 bytes), `views.py` (38,048 bytes), `owner_views.py`, `policy.py`, `serializers.py`, `signals.py`, `tasks.py`, `urls.py`, `admin.py`, `tests.py`, `test_finalisation.py`, `test_pr201_b31_pg.py`, `migrations/0001_initial.py` (**exists at this head — see §1.8**).
- `docs/marketplace/IMPLEMENTATION.md` (2026-09-16) and `docs/marketplace/FINALISATION_HANDOVER_2026-09-17.md` — both read in full this pass.

### 1.2 What `docs/marketplace/IMPLEMENTATION.md` says (verified design, 2026-09-16)

Plain English first: two Django domains share one public Next shell. The goods marketplace is public-facing; the ethical (medicines) marketplace is private and never leaks into the public catalogue.

- Public routes: `/marketplace`, `/marketplace/items/<uuid>/<slug>`, `/marketplace/medicines`. Signed-in goods routes: `/marketplace/new`, `/mine`, `/exchanges`. Ethical routes: `/marketplace/ethical/*`.
- API prefixes: `/api/platform/marketplace/` + `/api/platform/ethical/` (browser), `/api/marketplace/` + `/api/ethical/` (Django).
- Public goods serializers **never include** ethical product/inventory/PAN/pharmacy-name/user-name/contact/exact-address/evidence.
- Ethical responses are `private, no-store` + `noindex`, and never appear in the sitemap.
- Trading requires: active account, email + mobile verified, completed verified role onboarding, accepted identity assurance, current terms, adult assurance, no active restriction.
- Pharmacy-owned goods require **current verified ownership**; workforce / pharmacy-admin / org-admin permissions do **not** grant authority.
- S8 is never public / platform-wide, and is capped at a real shared organisation.

### 1.3 What `docs/marketplace/FINALISATION_HANDOVER_2026-09-17.md` says — and what changed since

- **Its critical release blocker — "NO committed `migrations/` directories for either marketplace app" — is RESOLVED at this head.** Both `backend/marketplace/migrations/0001_initial.py` (26,603 bytes fetched) and `backend/ethical_marketplace/migrations/0001_initial.py` (28,655 bytes fetched) exist at `97c4543…` as real `Migration` classes with `CreateModel` operations. The handover's `check_marketplace_release` intentionally failed until migration history was committed/reconciled against the target PostgreSQL `django_migrations` ledger. **Caveat:** only `0001_initial` was fetched for each app; whether later model changes have follow-up migrations, and whether the release-check command passes on other grounds, was **not** read (see Unknowns).
- Keep `ETHICAL_S8_ENABLED=false` until a separate legal/compliance decision (still the stated position in the handover; the settings default at this head is also False — §1.4).
- Vite public-route bridge hands marketplace / learning / how-it-works to Next (confirmed in code — §1.10).
- Review is OTP-protected Django admin only (confirmed — §1.6).

### 1.4 Settings defaults (`backend/core/settings.py`, read at head)

| Flag | Default | Effect |
|---|---|---|
| `MARKETPLACE_READ_ENABLED` | True | Public catalogue readable |
| `MARKETPLACE_NEW_LISTINGS_ENABLED` | False | Cannot create listings |
| `MARKETPLACE_CONTACT_ENABLED` | False | Cannot enquire/contact |
| `MARKETPLACE_NEW_COMMITMENTS_ENABLED` | False | Cannot start exchanges |
| `MARKETPLACE_ESCALATION_ENABLED` | False | No audience escalation |
| `MARKETPLACE_CATALOGUE_LOOKUP_ENABLED` | False | No catalogue lookup |
| `MARKETPLACE_ALL_WRITES_ENABLED` | True | Master write switch (on, but the per-feature flags above are off) |
| `ETHICAL_ACCESS_APPLICATIONS_ENABLED` | True | Ethical access applications accepted |
| `ETHICAL_PRIVATE_READ_ENABLED` | False | No private ethical reads |
| `ETHICAL_INVENTORY_ENABLED` | False | No ethical inventory writes |
| `ETHICAL_NEW_TRANSFERS_ENABLED` | False | No new ethical transfers |
| `ETHICAL_ESCALATION_ENABLED` | False | No ethical escalation |
| `ETHICAL_S8_ENABLED` | False | No S8 at all |

**At defaults the marketplace is a read-only public catalogue.** Every write path is gated by these flags and returns 503 while off.

### 1.5 Access and listing policy — the gates that actually run

`backend/marketplace/policy.py` (full file read at head):

- `CURRENT_TERMS_VERSION = "2026-09"`.
- `evaluate_marketplace_access` gates, in order: authenticated, active, not deleted, email OTP verified, mobile verified, onboarding profile verified, identity OK (`IdentityVerification` VERIFIED **or** `gov_id_verified`), age 18+ (or AGE assurance for EXPLORER/JUNIOR), terms accepted (current version), no active restriction.
- Eligible pharmacies: OWNER + pharmacy owner = profile + `verified=True`. `owns_pharmacy`: OWNER + `pharmacy.owner.user_id == user.id` + `pharmacy.verified`.

`backend/marketplace/listing_policy.py` (full file read at head):

- Personal seller roles = **all 8 roles** (OWNER, PHARMACIST, INTERN, TECHNICIAN, ASSISTANT, STUDENT, EXPLORER, JUNIOR/CAREER_SWITCHER via `resolved_role`).
- Pharmacy listing is **owner-only**; admin status does not grant authority.
- Medicines → `MEDICINE_PRIVATE_ONLY` (refused here, ethical app only).
- Per-role guidance; ethical entry available for OWNER with eligible pharmacies or an active PharmacyAdmin on a verified pharmacy.

### 1.6 Goods marketplace backend — what each file does

`backend/marketplace/views.py`:

- Public catalogue = PUBLISHED, not WITHDRAWN/EXPIRED, gated by `MARKETPLACE_READ_ENABLED`. **No circle / `public_discovery` filter — `public_discovery` is never read in any fetched file, so anonymous visitors see every PUBLISHED listing regardless of circle** (code gap CG-03).
- Create gated by `ALL_WRITES` + `NEW_LISTINGS_ENABLED` (503 `NEW_LISTINGS_DISABLED` otherwise), access blockers, idempotency receipt, audit event.
- Patch only DRAFT/REJECTED with `expected_version` (409 `STALE_VERSION`). Submit → PENDING_REVIEW if `requires_review` else PUBLISHED; withdraw.
- Audience: seller picks current/max circle + schedule steps.
- Images max 6, ≤4 MB, ≤20 MP, converted to JPEG; visible only if APPROVED + PUBLISHED (or owner).
- Enquiries gated by `CONTACT_ENABLED` + `buyer_can_contact`, `client_request_id` required.
- Exchanges: accept / decline / cancel / propose-terms / confirm-completion (dual confirm → COMPLETED).
- Reports AllowAny (anonymous reporter possible).
- Internal transfers owner-only, distinct pharmacy owned by same owner, states PROPOSED → AUTHORISED → IN_TRANSIT → RECEIVED/CANCELLED — **no destination-manager acceptance**.
- Catalogue lookup: APPROVED non-medicine, barcode, flag + access gates.
- **No payment and no notification/outbox writes anywhere in views / services / tasks / signals / serializers / admin / urls.**

`backend/marketplace/services.py`:

- `buyer_can_contact` applies the same access gates to buyers (including identity + terms + adult), blocks self-contact, requires role in `allowed_buyer_roles`; PHARMACY listings require buying pharmacy owned by buyer + circle checks (OWNED_CHAIN same owner / ORGANISATION same org); PERSONAL listings have **no circle check**.
- `accept_exchange`: idempotent, row locks, `ALREADY_RESERVED` if a live reservation exists, creates `MarketplaceReservation` **without `expires_at`**.
- `request_receipt`: reuse with a different payload → `ValidationError`.

`backend/marketplace/serializers.py`: public serializer = AUD, coarse location (suburb + state), seller role label only (no name), APPROVED images only, 180-char summary. Write serializer validates mode/amount rules, category context, buyer roles ⊆ category maximum, delivery payer/organiser for postage; version-checked.

`backend/marketplace/tasks.py`: `process_goods_escalations` gated by `MARKETPLACE_ESCALATION_ENABLED`; locks step, rechecks authority/state/version/max circle, PAUSED otherwise, audit event; **no notification to the new audience**.

`backend/marketplace/signals.py`: pre-save enforces seller policy; pharmacy audience defaults current OWNED_CHAIN, maximum PLATFORM; personal listings circles nulled.

`backend/marketplace/admin.py`: publish / reject / hide + image approve/reject actions; **no SLA**.

`MarketplaceListingRevision` model is never referenced in views / services / tasks / signals (model-only, no API). `entry_views.py`: ListingOptions + MyListingDashboard.

`backend/marketplace/models.py` (re-read at head, 20,085 bytes — matches senior review): review-gated, circle-based buy/swap/free board; medicines refused in `clean()`; listing DRAFT → PENDING_REVIEW → PUBLISHED/REJECTED/HIDDEN/ARCHIVED/WITHDRAWN; exchange ENQUIRY → TERMS_PROPOSED → ACCEPTED → AWAITING_COMPLETION → COMPLETED/DECLINED/CANCELLED/EXPIRED with dual `seller_confirmed`/`buyer_confirmed`; one live `MarketplaceReservation` per listing (partial unique on `active=True`), `expires_at` nullable with no default; `MarketplaceNotificationOutbox` (recipient, event_type, safe_payload, dedup key unique, attempts, next_retry_at, status PENDING) — **nothing writes to it**; `MarketplaceRequestReceipt` idempotency (actor, action, `client_request_id` unique); `MarketplaceReport` (reporter nullable, status OPEN, public_reference UUID); `MarketplaceAuditEvent`; `MarketplaceImage.moderation_status` default PENDING; `MarketplaceCategory.requires_review` default True, `is_medicine` default False; `ListingAudiencePolicy.public_discovery` default True; `ListingEscalationStep` (target_circle, due_at, schedule_version, PENDING). **No payment, price-paid, fee, Stripe, refund or payout field exists on any model in this file** (senior-review confirmed: 0 occurrences of Stripe/stripe/payment/fee).

Seed (`seed_marketplace_categories.py`): 5 categories — books-study, workwear, office-tools (BOTH, SELL/SWAP/FREE), pharmacy-fixtures, pharmacy-stock (PHARMACY, OWNER-only). Each `field_schema` has a "prohibited" list (patient records, confidential documents, name badges, access cards, items carrying patient/staff identifiers, medicine, restricted clinical devices, security keys, credentials) — **guidance data only, not enforced in `can_list_category`**; enforcement is `requires_review=True` (all 5) + human reviewer. Policy version `2026-09-17`.

### 1.7 Ethical marketplace backend — the whole app

Models cover `EthicalPharmacyApproval` (NOT_SUBMITTED…REVOKED, PBS number, evidence file), `EthicalProfessionalAccess` (schedules/activities/jurisdictions, expiry), `EthicalPharmacyGrant` (per pharmacy+user, exact actions, unique active), `EthicalJurisdictionPolicy` (effective-dated, reviewed), `EthicalProduct` + identifiers, import batches/staging rows, stock lots (reserved ≤ on-hand check, `available_quantity`), movements, `EthicalListing` (circles CHAIN_PHARMACIES / ORGANISATION_OWNERS / PLATFORM_OWNERS; DRAFT/PUBLISHED/RESERVED/WITHDRAWN/COMPLETED/QUARANTINED), revisions, escalation steps, `EthicalTransfer` (REQUESTED…DISCREPANCY, source/destination approvals, `legal_basis`), lines, reservations, messages, documents, policy decisions, audit, outbox, receipts.

`ethical_marketplace/policy.py`: access = marketplace access **minus terms** + owner/admin authority + VERIFIED premises approval + VERIFIED unexpired professional access + per-action grant + schedule/activity/jurisdiction/policy checks; `listing_visible_to` circle rules; **S8 never PLATFORM_OWNERS** (False), S8 at ORGANISATION_OWNERS requires `scope_organization_id`.

`ethical_marketplace/views.py`: approvals, owner-only grants issue/revoke, APPROVED-only catalogue, CSV imports (≤5 MB, rights attestation, ≤5000 rows), lots + reconcile with version checks, listings (DRAFT-only patch, owner-authorised publish, S8 ceilings), transfer requests (idempotent, lot reservation, listing RESERVED, S8 org ceiling), transfer actions agree/authorise/dispatch/receive/cancel with stock movements and reservation release, messages, documents with file-signature validation. `owner_views.py`: MyListings + ImportCommit (per-row accept/reject, COMMITTED/PARTIAL/REJECTED). `ethical_marketplace/tasks.py`: escalation gated by `ETHICAL_ESCALATION_ENABLED`, rechecks policy/authority/S8, **no notifications**. Signals derive scope server-side; S8 platform ban. Admin: approvals/listings/products managed; rest registered plainly. **No payment, no notifications anywhere in the ethical app either.**

Tests exist and are substantive (concurrency, idempotency, privacy, S8 ceilings, forged contexts); the handover claims they pass (2026-09-16) — **not re-run in this trace**.

### 1.8 Migrations — the September blocker is resolved at this head

Both `backend/marketplace/migrations/0001_initial.py` and `backend/ethical_marketplace/migrations/0001_initial.py` exist at `97c4543…` as real `Migration` classes with `CreateModel` operations for the models in §1.6–1.7. The handover's "no committed migrations" release blocker therefore **no longer holds at this head**. Not verified: whether later model changes have follow-up migrations, or whether `check_marketplace_release` passes on other grounds (the command itself was not read).

### 1.9 Celery

`backend/core/celery.py` registers **only the two marketplace escalation tasks every minute** (`process_goods_escalations` + ethical escalation). There is no shift-escalation beat task (see Part B, SH-05 — CHANGED).

### 1.10 Clients — Next, Expo, Vite

**Next web** (`frontend_web/landing_next`):

- `app/(public)/marketplace/page.tsx` — public catalogue, 5 hardcoded categories, Add item → `/marketplace/new`, ethical links to `/marketplace/medicines` + `/marketplace/ethical/access`.
- `marketplace-catalogue.tsx` — search/category/mode, 250 ms debounce, error/retry/empty states, AUD amounts, "Image awaiting approval".
- `features/marketplace/api.ts` — `chemistTaskerApi.marketplace` + `ethicalMarketplace`.
- `goods-listings-v2.tsx` — submit/withdraw, audience escalate + schedule `datetime-local`, image upload.
- `workspace.tsx` — GoodsWorkspace (mine/exchanges), GoodsComposer — buyer-role checkboxes only OWNER/PHARMACIST/INTERN/TECHNICIAN/ASSISTANT/STUDENT, **no Explorer-family in the UI though the backend allows them** (code gap CG-08); EthicalWorkspace home/access/inventory/new/transfers; grant/inventory/listing forms, modes SALE/TRANSFER/SWAP; transfer request terms `settlement:'EXTERNAL'`.
- `access-steps.tsx` — blocker checklist, deep links mobile-verify, onboarding `?step=identity`, terms checkbox.
- Item page is a thin wrapper around `./marketplace-item`; exchanges page renders GoodsWorkspace `view="exchanges"`.

**Expo** (`frontend_mobile`):

- Goods: all routes are thin wrappers around `features/parity/marketplace.tsx` `MarketplaceParityScreen` (14 screens: browse/filters/item/seller/category/details/photos/audience/review/mine/mine-detail/exchanges/exchange-detail/report) with a full creation wizard.
- Ethical: separate routes (`app/marketplace/ethical/access.tsx`, `grants.tsx`, `requests.tsx`, `pharmacy.tsx`, `inventory/index.tsx` + `scan.tsx` + `lots/[id].tsx`, `listings/index.tsx` + `new/index.tsx` + `new/s8.tsx`, `transfers/index.tsx`) are thin wrappers around `features/parity/ethicalMarketplace.tsx` `EthicalMarketplaceScreen` (16 screens: access/grants/pharmacy/inventory/scan/import/import-review/lot/listings/listing-new/listing-s8/requests/transfers/transfer/documents/complete) — **full ethical UI on Expo**, including S8 composer, CSV import, lot scan and transfer documents.
- Correct item/exchange paths are `items/[id]/index.tsx` + `report.tsx`, `exchanges/[id].tsx` + `index.tsx`, `mine/index.tsx`, `new/seller|category|details|photos|audience|review.tsx`.

**Vite web** (`frontend_web/src`): **no marketplace screens**. Only `PublicRouteBridge.tsx` mentions marketplace (bridge to Next) plus incidental mentions elsewhere. Marketplace on web is Next-only.

## 2. GM-21 traced flow

### 2.1 Current-flow matrix

| # | Trigger | Actor | Backend / API | Vite web | Next web | Expo | Persisted state | Event / side effect | Recovery / denial path |
|---|---|---|---|---|---|---|---|---|---|
| F1 | Seller starts a listing | Any signed-in user; `evaluate_marketplace_access` gates (email+mobile verified, onboarding verified, identity OK, 18+, terms v2026-09, no restriction); `AccessDecision.can_trade_personally` / `can_trade_for_pharmacy`, `blockers`, `eligible_pharmacies` | `POST /api/marketplace/listings/` — gated by `ALL_WRITES` + `NEW_LISTINGS_ENABLED` (503 `NEW_LISTINGS_DISABLED` at defaults), access blockers, idempotency receipt, audit event | None — bridged to Next | `goods-listings-v2.tsx` composer; `access-steps.tsx` blocker checklist (mobile-verify, onboarding identity, terms) | `MarketplaceParityScreen` creation wizard (`new/seller|category|details|photos|audience|review`) | `MarketplaceListing` DRAFT; `ListingAudiencePolicy`; `ListingDeliveryTerms` | Audit event | Denial = `AccessDecision.blockers` shown as checklist steps; 503 while flags off |
| F2 | Listing submitted for review | Seller | Submit → PENDING_REVIEW if `requires_review` (all 5 seeded categories) else PUBLISHED | None | Submit/withdraw in `goods-listings-v2.tsx` | Wizard review step | `publication_status` PENDING_REVIEW; `MarketplaceListingRevision` row exists in model but **no revision is created by the API** | **No notification** (outbox never written) | Reject/hide in Django admin only; no SLA; resubmit by patching DRAFT/REJECTED only |
| F3 | Reviewer approves / rejects | Platform reviewer/admin — Django admin only (OTP-protected) | Admin actions publish / reject / hide + image approve/reject | None | Seller sees status in workspace | Seller sees status in mine screens | PUBLISHED (+ `published_at`) or REJECTED | None | Rejected listing: patch DRAFT/REJECTED and resubmit; no revision API, no appeal path in code |
| F4 | Buyer browses / discovers | Buyer roles per `ListingAudiencePolicy.allowed_buyer_roles`; circles OWNED_CHAIN → ORGANISATION → PLATFORM; `public_discovery` default True | Public catalogue = PUBLISHED, not WITHDRAWN/EXPIRED, gated by `MARKETPLACE_READ_ENABLED`; **no circle/`public_discovery` filter — anonymous visitors see every PUBLISHED listing** | None | `page.tsx` catalogue + `marketplace-catalogue.tsx` (search/category/mode, 250 ms debounce, AUD, "Image awaiting approval") | Parity browse/filters/item screens | Read-only; `MarketplaceSavedListing` on save | None | Wrong-role / wrong-circle denial not enforced on the public catalogue (CG-03); signed-in catalogue also shows all PUBLISHED |
| F5 | Audience widens over time | System (scheduled) | `ListingEscalationStep` (due_at, schedule_version, PENDING→processed) + `process_goods_escalations` every minute via celery (gated by `MARKETPLACE_ESCALATION_ENABLED`, off by default); rechecks authority/state/version/max circle, PAUSED otherwise, audit event | n/a | Audience escalate + schedule `datetime-local` in composer | Audience step in wizard | `current_circle` advances; step `processed_at` | **No notification to the newly eligible audience** | Missed/failed step: PAUSED, no retry traced |
| F6 | Buyer opens enquiry / proposes terms | Buyer (+ optional `buying_pharmacy`) | Enquiries gated by `CONTACT_ENABLED` + `buyer_can_contact` + `client_request_id`; `buyer_can_contact` applies full access gates to buyers (identity + terms + adult), blocks self-contact, role ⊆ `allowed_buyer_roles`; PHARMACY listings require buying pharmacy owned by buyer + circle checks; PERSONAL listings have **no circle check** | None | Exchanges routes render GoodsWorkspace | Exchanges screens | `MarketplaceExchange` ENQUIRY → TERMS_PROPOSED; `proposed_terms` JSON; `MarketplaceMessage` (default VISIBLE) | **No notification to seller** | Duplicate enquiry: idempotency receipt; concurrent enquiries allowed until accept |
| F7 | Terms agreed | Buyer + seller | `agreed_terms` JSON; state ACCEPTED; `version` increments; patch with wrong `expected_version` → 409 `STALE_VERSION` | None | Same API | Same API | `agreed_terms`; `version` | None | One side changes terms after accept: propose-terms again (new proposal, old void — inferred from state machine, not separately traced) |
| F8 | Listing reserved for the deal | System on accept | `accept_exchange`: idempotent, row locks, `ALREADY_RESERVED` if a live reservation exists; creates `MarketplaceReservation` **without `expires_at`** — **reservations never expire in code** (CG-04); listing `availability_status` RESERVED | None | Same | Same | `MarketplaceReservation` (one live per listing, `expires_at` null, `release_reason` null) | None | Expiry: none implemented; second buyer gets `ALREADY_RESERVED`; release only via cancel/complete paths |
| F9 | Delivery arranged | Buyer + seller | `MarketplaceDeliveryLeg` per direction: method, payer, organiser, `agreed_cost` / `quote_required`, `confirmed_by_buyer` + `confirmed_by_seller` | None | Delivery terms in composer | Delivery in wizard | Delivery legs | None | Quote never arrives / cost disputed / no-show pickup: no verified path |
| F10 | Both sides confirm completion | Buyer + seller | confirm-completion; dual confirm → COMPLETED; listing COMPLETED | None | Same | Same | `seller_confirmed` + `buyer_confirmed`; state AWAITING_COMPLETION → COMPLETED | None | One side never confirms: no timeout/forced-close in code |
| F11 | Payment | **Nobody — no payment path exists.** No payment/fee/Stripe/refund/payout field on any model in `models.py`; no payment code in views/services/tasks/signals/serializers/admin/urls of either app; ethical transfer terms carry `settlement:'EXTERNAL'` in the Next UI | None | None (no checkout UI) | None (no checkout UI) | None | None | None | None — money, if it moves, moves off-platform with no record |
| F12 | Internal transfer (own pharmacies) | Accountable owner | Owner-only; distinct pharmacy owned by same owner; PROPOSED → AUTHORISED → IN_TRANSIT → RECEIVED/CANCELLED; `transport_terms` JSON; **no destination-manager acceptance** | None | Workspace transfer UI | Not separately traced as a goods screen (ethical transfers have full Expo screens) | `MarketplaceInternalTransfer` | None | Destination cannot refuse in code; transfer vs public listing choice is the owner's |
| F13 | Report / moderate | Any user (reporter nullable = anonymous report possible); reviewer/admin | Reports AllowAny; admin publish/reject/hide + image approve/reject; `MarketplaceRestriction` (user and/or pharmacy, dated, `reviewed_by`); `MarketplaceAuditEvent` | None | Report via item screen | Report screen in parity component | `MarketplaceReport` OPEN; restriction dated | None | Takedown SLA: none; restriction notice/appeal: none in code; restricted pharmacy's listings freeze: not enforced in code |
| F14 | Images | Uploader | Max 6, ≤4 MB, ≤20 MP, converted to JPEG; visible only if APPROVED + PUBLISHED (or owner) | None | Upload in composer | Photos step in wizard | `MarketplaceImage.moderation_status` default PENDING | None | PENDING images hidden from buyers; re-upload after rejection |
| F15 | Medicines / ethical side | Verified pharmacies + authorised professionals only (see §1.7) | Approvals (NOT_SUBMITTED…REVOKED, PBS number, evidence file); professional access (schedules/activities/jurisdictions, expiry); per-pharmacy+user grants (exact actions, unique active); jurisdiction policy (effective-dated); S8 never PLATFORM_OWNERS, S8 at ORGANISATION_OWNERS requires `scope_organization_id`; `ETHICAL_S8_ENABLED` False at defaults | None | EthicalWorkspace (home/access/inventory/new/transfers); S8 composer exists in UI | Full ethical parity component (16 screens incl. S8 composer, scan, CSV import, transfer documents) | Approvals, grants, lots, listings, transfers, reservations, messages, documents, audit, outbox, receipts | **No notifications** | Ethical responses `private, no-store` + `noindex`, never in sitemap; public serializers never include ethical data |
| F16 | Catalogue import | Importer; reviewer | Goods: catalogue lookup APPROVED non-medicine, barcode, flag + access gates. Ethical: CSV imports ≤5 MB, rights attestation, ≤5000 rows; per-row accept/reject (ImportCommit → COMMITTED/PARTIAL/REJECTED) | None | Import via EthicalWorkspace | Import + scan screens | `MarketplaceCatalogueImport` STAGED; staging rows PENDING; `EthicalImportBatch` | None | Bad rows rejected with reason, rest continues; duplicate identifiers blocked by unique kind+value |
| F17 | Retry / idempotency | Any client | `MarketplaceRequestReceipt` unique (actor, action, `client_request_id`); reuse with different payload → `ValidationError`; `MarketplaceNotificationOutbox` dedup key + attempts + `next_retry_at` — **but nothing ever writes to the outbox** | None | Same API | Same API | Receipts + (empty) outbox | Retried notification delivery: n/a — no notifications exist | Receipt failure handling: not traced beyond the validation error |

### 2.2 Actor-by-actor summary (verified)

- **Seller (personal):** all 8 roles may list personally if they pass `evaluate_marketplace_access` (email+mobile verified, onboarding verified, identity OK, 18+, terms v2026-09, no restriction). Categories with context PERSONAL/BOTH; modes SELL/SWAP/FREE with amount rules enforced at DB/model level (SELL `amount > 0`; FREE/SWAP `amount = 0`; SWAP requires `desired_swap`).
- **Seller (for a pharmacy):** PHARMACY context requires a pharmacy; **owner-only** (admin status does not grant authority); pharmacy must be `verified=True` and owned by the seller.
- **Buyer:** roles limited per category (`maximum_buyer_roles`) and per listing (`allowed_buyer_roles`); buyers must pass the same access gates (identity + terms + adult); self-contact blocked; PHARMACY listings require a buying pharmacy owned by the buyer + circle checks; PERSONAL listings have no circle check. Whether a buyer needs identity verification *before* an exchange completes is enforced by `buyer_can_contact` (identity is part of the gates).
- **Reviewer / platform admin:** review exists (admin publish/reject/hide + image approve/reject, OTP-protected Django admin), but there is no SLA, no revision API, no appeal path.
- **Owner (pharmacy):** accountable for internal transfers; audience source owner/org recorded; owners approve grants in the ethical app (owner-only grant issue/revoke).
- **Anonymous / logged-out visitor:** sees every PUBLISHED listing (no circle/`public_discovery` filter); public serializer shows AUD, coarse location (suburb+state), seller role label only (no name), APPROVED images only, 180-char summary. Anonymous reporting is possible (reporter nullable, AllowAny).

### 2.3 Web vs Expo parity (verified)

- **Next web:** full goods surface (catalogue, item, create, mine, exchanges) + full ethical workspace (home/access/inventory/new/transfers). **Expo:** full goods parity component (14 screens incl. creation wizard) + full ethical parity component (16 screens incl. S8 composer, scan, CSV import, transfer documents). **Vite web: no marketplace screens at all** — marketplace is Next-only on web (bridge in `PublicRouteBridge.tsx`).
- **Parity gaps (code):** (1) Next composer buyer-role checkboxes exclude the Explorer-family roles though the backend allows them (CG-08). (2) Goods internal transfers have no dedicated Expo screen traced (ethical transfers do). (3) `marketplace-item` detail component was not read (item page is a thin wrapper around it) — its exact rendering is unconfirmed, though the public serializer contract is verified.

---

## Part B — Old questions re-validated (PR #184 / AUDIT.md)

Method: every question in `questions.json` (142) was scanned for marketplace mechanics. #184 never grilled the marketplace — confirmed again this pass. Two AUDIT.md items touch GM-21 and are now re-validated.

| Old ID | Old question | Verdict | Evidence (current code, head `97c4543e`) |
|---|---|---|---|
| AUDIT.md **ON-06** | "`Pharmacy.verified` is only read by the ethical marketplace (`marketplace/policy.py:100`). `shifts/posting.py:62` checks neither it nor `abn_verified`." Decision gap: should pharmacy verification gate shift posting? | **CHANGED** | `Pharmacy.verified` is now read by **both** marketplace apps: `owns_pharmacy` and the eligible-pharmacy filter in `backend/marketplace/policy.py`, and `admitted_pharmacy verified=True` in `backend/ethical_marketplace/policy.py`. The Oct 2026 claim "only the ethical marketplace reads it" no longer holds. The decision part (should verification gate *shift* posting) routes to GM-05/shifts, not GM-21. The Oct path `marketplace/policy.py` was also ambiguous — two policy files now exist. |
| AUDIT.md **SH-05** | "Scheduled escalation only runs when someone loads a shift list… `celery.py` schedules only the goods marketplaces." | **CHANGED** | `backend/core/celery.py` registers **only the two marketplace escalation tasks every minute** (goods + ethical). There is no shift-escalation beat task. The "only the goods marketplaces" half is still true in substance (marketplace escalation is the only beat work), but the shift half is GM-11/GM-23's ground — escalation remains request-driven for shifts (see GM-22). |
| questions.json (all 142) | Keyword scan for marketplace / ethical / goods / buy / sell / listing returned **no marketplace question**. | **Confirmed absent from #184** | #184 never grilled the marketplace. GM-21 has no carried questions; the queue in Part C is new. The 30 carried decisions (D01–D05, R01/R04/R06, E01/E03, P02–P12, F01/F04) are all shift/cancellation decisions; none covers marketplace trading. |

**Old questions NOT carried forward unvalidated:** none — the two items above were re-checked at head; everything else in #184 is outside GM-21.

---

## Part C — GM-21 question queue (new + carried, #184 format)

Per-question format: plain-English explanation first, then ACTUAL TODAY with **Web** and **Expo** side by side, RECOMMENDED, ALTERNATIVE A (keep), ALTERNATIVE B/C, Other/defer. Normal case, edge case, retry/concurrency, denied role/wrong tenant, payment/notification side effects, and Web/Expo difference are shown inside each question. Sources are file/function at PR #249 head `97c4543e` unless noted. Decision status: **OPEN** for all — no owner answer recorded. Revalidation status per question: **VERIFIED** (blocked-file premise now confirmed at head) or **CHANGED** (actual differs from the blocked file's premise — the premise was UNKNOWN, so CHANGED here means "now known, and it differs from what the old text assumed or left open").

### GM21-Q01 — Do we launch the goods marketplace at all, and for whom? [FIRST — see Part D] — VERIFIED, recommendation strengthened

**Plain English:** a whole buy/swap/free-goods marketplace is built in code — listings, reviews, buyer circles, deals, delivery, reports — plus a separate private one for medicines. Should any of that be in the first launch, or do we launch shifts and talent only and bring trading later?

**ACTUAL TODAY — Web:** Next has the full goods surface (catalogue, item, create, mine, exchanges) and the ethical workspace; Vite has no marketplace screens at all (bridged to Next). **ACTUAL TODAY — Expo:** full goods parity component (14 screens, creation wizard) and full ethical parity component (16 screens). **Backend:** both apps fully built; at defaults the marketplace is a **read-only public catalogue** (all write flags off). The September "no migrations" release blocker is **resolved** (both `0001_initial` exist at head). What is still missing is verified in §2: **no payment path anywhere in either app**, moderation is Django-admin-only with no SLA, **no notification is ever sent by either marketplace**, reservations never expire, and `public_discovery` is never consulted.
**Normal case:** pharmacy lists surplus stock; another pharmacy buys it. **Edge case:** a listing exists while flags are off — it is visible but nobody can enquire. **Retry/concurrency:** idempotency receipts exist. **Denied role:** access blockers return checklist steps. **Payment/notification:** no money moves in-platform; no notice exists for any marketplace event. **Web/Expo difference:** none in scope — both clients are built; Vite has nothing.
**RECOMMENDED: A — Defer the goods marketplace from the launch cut.** Severity: high. Rationale: the payment path does not exist (GM21-Q11), moderation has no SLA or appeal (GM21-Q14), no notification exists (GM21-Q16), and the medicines side is regulatory-sensitive (GM21-Q15). Deferring keeps the launch focused on shifts/talent and avoids taking money or liability for goods before the rules exist. Benefit: no fraud/dispute exposure on day one; risk: delayed value for pharmacies wanting to trade surplus stock; legal/financial impact: avoids taking money or liability for goods before the rules exist.
**ALTERNATIVE A — Keep current logic (launch as designed):** review-gated listings, circles, exchanges, as the models describe. Trade-off: needs GM21-Q11/Q14/Q15/Q16 answered and built before it is safe; the write flags are off by default, so "launch as designed" also means deliberately switching the flags on.
**ALTERNATIVE B — Launch pharmacy-to-pharmacy only (no personal trading):** surplus stock moves between pharmacies; personal trading waits. Trade-off: smaller blast radius, still needs payment/moderation decisions.
**ALTERNATIVE C — Launch personal trading only (no pharmacy-context listings):** trade-off: avoids pharmacy-stock permission questions, but personal trading is the higher-fraud surface.
**Other (describe) / Defer.**
**Sources:** `backend/marketplace/` + `backend/ethical_marketplace/` (all files, §1), `backend/core/settings.py` (flags), `frontend_web/landing_next/app/(public)/marketplace/`, `frontend_mobile/features/parity/marketplace.tsx`, `frontend_mobile/features/parity/ethicalMarketplace.tsx`.
**Decision status:** OPEN.

### GM21-Q02 — What may be traded, and what is banned? — VERIFIED

**Plain English:** five categories are seeded, medicines are refused here, and every listing needs human review. But the "banned" list in the seed data is only guidance — nothing in code enforces it. What is actually banned, and where is it enforced?

**ACTUAL TODAY — Web and Expo (same):** 5 seeded categories — books-study, workwear, office-tools (BOTH, SELL/SWAP/FREE), pharmacy-fixtures, pharmacy-stock (PHARMACY, OWNER-only). **Backend:** each category's `field_schema` has a "prohibited" list (patient records, confidential documents, name badges, access cards, items carrying patient/staff identifiers, medicine, restricted clinical devices, security keys, credentials) — **guidance data only, not enforced in `can_list_category`**; enforcement is `requires_review=True` (all 5) + human reviewer. `MarketplaceListing.clean()` refuses medicine categories ("Medicines belong to the private ethical marketplace").
**Normal case:** seller lists office chairs under pharmacy-fixtures. **Edge case:** seller lists a name badge or a box of patient records — nothing in code stops the submit; only the reviewer can catch it. **Retry/concurrency:** n/a. **Denied role:** banned-category listing has no server-side rejection rule today. **Payment/notification:** no sale of banned goods can be stopped automatically. **Web/Expo difference:** none — same categories both clients.
**RECOMMENDED: B — Open categories with an explicit banned list, enforced in `listing_policy.py` + review.** Severity: high (safety/legal). Rationale: free-text listings will attract medicines, expired stock and recalled items; the `clean()` medicine refusal proves the risk was already foreseen but a list is not in the model. Benefit: the reviewer is a backstop, not the only defence. Risk: a list needs maintaining.
**ALTERNATIVE A — Keep current logic:** categories as seeded, medicines excluded, review-gated. Trade-off: simplest; the prohibited list stays unenforced guidance and the reviewer catches everything — or misses it.
**ALTERNATIVE B — Pharmacy goods only (equipment, consumables, furniture; no personal items):** trade-off: narrower, safer, less value for staff.
**ALTERNATIVE C — Catalogue-only:** sellers pick from approved `MarketplaceCatalogueProduct`s, no free-text listings. Trade-off: cleanest catalogue, slowest to grow.
**Other (describe) / Defer.**
**Sources:** `backend/marketplace/management/commands/seed_marketplace_categories.py`, `backend/marketplace/models.py` (`MarketplaceCategory`, `MarketplaceListing.clean()`), `backend/marketplace/listing_policy.py`.
**Decision status:** OPEN.

### GM21-Q03 — Who can sell personally, and who can sell for a pharmacy? — VERIFIED

**Plain English:** the code already answers most of this: anyone who passes the access gates can sell personally, but selling for a pharmacy is owner-only. The owner needs to confirm that is the rule, not discover it later.

**ACTUAL TODAY — Web and Expo (same):** `policy.py` returns `AccessDecision(can_trade_personally, can_trade_for_pharmacy, blockers, eligible_pharmacies)`; `resolved_role()` maps OTHER_STAFF via onboarding `role_type`. **Backend:** personal seller roles = **all 8 roles**; pharmacy listing is **owner-only** (admin status does not grant authority); pharmacy must be `verified=True` and owned by the seller (`owns_pharmacy`). `evaluate_marketplace_access` gates: email+mobile verified, onboarding verified, identity OK, 18+, terms v2026-09, no active restriction.
**Normal case:** owner lists surplus stock for their pharmacy; a locum lists a textbook personally. **Edge case:** worker leaves the pharmacy — their pharmacy listings must freeze (no code path traced for this; record as a gap). **Retry:** resubmit after role change. **Denied role:** clear blocker message naming the missing step (access-steps checklist). **Wrong tenant:** listing under pharmacy A by a member of pharmacy B fails server-side (`owns_pharmacy`). **Web/Expo:** same gate both clients.
**RECOMMENDED: A — Any Verified user may sell personally; selling for a pharmacy needs owner or authorised manager of that pharmacy.** Severity: high. Rationale: matches the model's personal/pharmacy split and `eligible_pharmacies`; stops a locum listing a pharmacy's stock without permission. Note: current code is owner-only for pharmacy listings — "authorised manager" in this recommendation would be a **change** (manager authority does not exist today); if the owner picks A as written, that is new work.
**ALTERNATIVE A — Keep current logic:** whatever `AccessDecision` enforces today (personal: all roles passing the gates; pharmacy: owner-only, verified pharmacy). Trade-off: no work; managers cannot list for their pharmacy.
**ALTERNATIVE B — Owners only, both personally and for the pharmacy:** trade-off: simplest permission model, staff cannot trade at all.
**ALTERNATIVE C — Staff may list for their pharmacy only with owner approval per listing:** trade-off: most control, most friction, needs an approval flow that does not exist.
**Other (describe) / Defer.**
**Sources:** `backend/marketplace/policy.py`, `backend/marketplace/listing_policy.py`, `frontend_web/landing_next/features/marketplace/access-steps.tsx`.
**Decision status:** OPEN.

### GM21-Q04 — Who can buy, and how far does a listing travel? — CHANGED (public catalogue is wider than the model promises)

**Plain English:** the model promises circles and a public-discovery switch, so a listing should travel chain → organisation → platform and only be public if the seller allows. In code, the public catalogue ignores both: anyone, signed in or not, sees every published listing.

**ACTUAL TODAY — Web and Expo (same):** per-category `maximum_buyer_roles`, per-listing `allowed_buyer_roles`, circles OWNED_CHAIN → ORGANISATION → PLATFORM, `public_discovery` default True, scheduled `ListingEscalationStep`s. **Backend:** the public catalogue query is PUBLISHED + not WITHDRAWN/EXPIRED only — **no circle filter, no `public_discovery` read anywhere in any fetched file**. Anonymous visitors see every PUBLISHED listing. `buyer_can_contact` does enforce gates at enquiry time (identity + terms + adult, role ⊆ allowed roles; PHARMACY listings need a buying pharmacy owned by the buyer + circle checks; PERSONAL listings have **no circle check**).
**Normal case:** buyer in the same chain enquires. **Edge case:** a buyer from outside the circle finds a listing via search/sitemap — today they can read it; at enquiry, a PHARMACY listing blocks them but a PERSONAL listing does not check circles at all. **Retry/concurrency:** circle widening while a buyer is viewing — buyer keeps access once granted (mirrors shift audience decision E01A). **Denied role:** wrong-circle denial is not enforced on the catalogue. **Payment/notification:** none. **Web/Expo:** same catalogue both clients.
**RECOMMENDED: B — Any signed-in Verified user may buy; public sees anonymous cards only.** Severity: medium-high (privacy/safety). Rationale: public discovery helps surplus stock move, but seller identity and contact must stay hidden until an exchange starts — same principle as the talent board's anonymity problem (TB-01 in #184). This recommendation **requires fixing CG-03** (enforce circles + `public_discovery` on the catalogue) — it is not the current behaviour.
**ALTERNATIVE A — Keep current logic:** circles + escalation + public discovery as modelled (i.e. catalogue ignores them, enquiry enforces some gates). Trade-off: no work, but the public catalogue leaks every listing to everyone.
**ALTERNATIVE B — Pharmacies/owners only; workers never buy:** trade-off: narrowest, least useful.
**ALTERNATIVE C — Public (logged-out) sees full catalogue including prices, sign-in only to enquire:** trade-off: maximum discovery, maximum exposure — this is effectively today's behaviour, made explicit.
**Other (describe) / Defer.**
**Sources:** `backend/marketplace/views.py` (catalogue query), `backend/marketplace/services.py` (`buyer_can_contact`), `backend/marketplace/models.py` (`ListingAudiencePolicy`), `frontend_web/landing_next/app/(public)/marketplace/page.tsx`.
**Decision status:** OPEN.

### GM21-Q05 — What identity check must a trader pass before listing or buying? — VERIFIED

**Plain English:** there is a separate identity-verification table, distinct from onboarding "Verified". The code already requires it (or a verified government ID) before anyone can trade. The owner needs to confirm that bar, and what happens when it is revoked.

**ACTUAL TODAY — Web and Expo (same):** `evaluate_marketplace_access` requires identity OK — `IdentityVerification` VERIFIED **or** `gov_id_verified` — as one of the gates for trading (list and buy: `buyer_can_contact` applies the same gates). `IdentityVerification` model: PENDING / VERIFIED / REJECTED / REVOKED, `assurance_method`, `provider_reference`, human `reviewed_by`, `verified_at`, `revoked_at`. What `assurance_method` means in practice, and whether revocation freezes live listings, is **not traced in code** (no revocation-freeze path found in views/services/tasks).
**Normal case:** verified user lists and buys. **Edge case:** verification revoked mid-deal — no freeze path traced; the exchange continues. **Retry:** re-verify and resume (no path traced). **Denied role:** "verify your ID" blocker step, not a dead end (access-steps checklist). **Web/Expo:** same checklist both clients.
**RECOMMENDED: B for SELL, A for buy** — list only after identity verification; buy after onboarding Verified, identity check before money/goods move. Severity: high (fraud). Rationale: the model built a whole verification table, so the design intent is a real check; a marketplace with no ID check invites fake sellers. Note: current code already requires identity for **both** sides at enquiry time, so this recommendation is mostly a confirmation plus the missing revocation-freeze rule.
**ALTERNATIVE A — Keep current logic:** identity (or gov ID) required to list and to enquire, as enforced today. Trade-off: no work; revocation mid-deal stays unhandled.
**ALTERNATIVE B — Both sides identity-verified before any exchange:** trade-off: strictest, matches the recommendation's sell half.
**ALTERNATIVE C — No extra check: onboarding Verified is enough for both sides:** trade-off: friendliest, weakest; would mean removing the identity gate.
**Other (describe) / Defer.**
**Sources:** `backend/marketplace/policy.py` (`evaluate_marketplace_access`), `backend/marketplace/services.py` (`buyer_can_contact`), `backend/marketplace/models.py` (`IdentityVerification`).
**Decision status:** OPEN.

### GM21-Q06 — Which marketplace terms must a user accept, and when? — VERIFIED

**Plain English:** terms are versioned (2026-09) and acceptance is recorded per user per version. The owner needs to confirm the re-accept rule for version bumps.

**ACTUAL TODAY — Web and Expo (same):** `MarketplaceTermsAcceptance` unique per (user, version); `CURRENT_TERMS_VERSION = "2026-09"`; `MarketplaceCategory.policy_version` and `ListingAudiencePolicy.policy_version` also default `"2026-09"`. Terms acceptance is one of the `evaluate_marketplace_access` gates, and the access-steps UI shows a terms checkbox. The terms text itself, and what happens on a version bump mid-exchange, are **not traced** (no bump-handling code found).
**Normal case:** user accepts v2026-09 once, trades freely. **Edge case:** version bump mid-exchange — no code path traced; the exchange presumably continues under the version accepted at agreement. **Retry:** n/a. **Web/Expo:** same version gate both clients.
**RECOMMENDED: A — Accept once at first listing/enquiry; re-accept only when the version changes.** Severity: medium (legal). Rationale: the unique-per-version table already implements exactly this; re-accepting every time is friction, implied acceptance is unenforceable.
**ALTERNATIVE A — Keep current logic:** versioned acceptance as modelled. Trade-off: same as recommended in practice.
**ALTERNATIVE B — Accept on every exchange:** trade-off: strongest record, most friction.
**ALTERNATIVE C — Terms shown but acceptance implied by use (no record):** trade-off: unenforceable; contradicts the table that exists.
**Other (describe) / Defer.**
**Sources:** `backend/marketplace/policy.py` (`CURRENT_TERMS_VERSION`), `backend/marketplace/models.py` (`MarketplaceTermsAcceptance`), `frontend_web/landing_next/features/marketplace/access-steps.tsx`.
**Decision status:** OPEN.

### GM21-Q07 — How does listing review work, and how fast? — VERIFIED

**Plain English:** every seeded category needs review, and review happens in Django admin by a human. There is no SLA, no resubmission API, and no appeal. The owner needs to set the speed and the resubmission rule.

**ACTUAL TODAY — Web and Expo (same):** `requires_review` defaults True per category (all 5 seeded); `publication_status` PENDING_REVIEW → PUBLISHED/REJECTED; `MarketplaceListingRevision` stores versioned resubmissions with reviewer + reason **in the model only — no revision is created by the API and no revision endpoint exists**. Review is Django-admin-only (OTP-protected), actions publish/reject/hide + image approve/reject. **No SLA in code. Nothing auto-publishes** (submit goes to PENDING_REVIEW when `requires_review`, else PUBLISHED — and all seeded categories require review).
**Normal case:** seller submits, reviewer publishes within the (undecided) SLA. **Edge case:** reviewer rejects — seller gets the reason (reason field exists on the revision model) and can patch DRAFT/REJECTED and resubmit; no appeal path. **Retry:** resubmit creates no revision row (model-only). **Denied:** rejected listings never become visible, including to the seller's own pharmacy circle. **Notify:** seller is **not** notified on approve/reject (no notifications exist — GM21-Q16). **Web/Expo:** seller sees the same status both clients.
**RECOMMENDED: A at launch, B later** — human review for every listing before publish, target 1 business day; later, auto-publish trusted sellers (identity-verified, no prior rejection). Severity: high (safety). Rationale: launch volume is low and the cost of a bad first listing (fake medicine-adjacent goods, scams) is high; the revision model already supports resubmission (but the API does not — see code gap CG-05).
**ALTERNATIVE A — Keep current logic:** review as built (admin-only, no SLA, no revision API). Trade-off: no work; review speed is whatever the admin's day allows, and sellers get no notice.
**ALTERNATIVE B — Auto-publish trusted sellers, human review for the rest:** trade-off: faster for good sellers, needs the trust rule built.
**ALTERNATIVE C — Auto-publish everything, review only after a report:** trade-off: fastest, riskiest.
**Other (describe) / Defer.**
**Sources:** `backend/marketplace/models.py` (`MarketplaceCategory.requires_review`, `MarketplaceListingRevision`), `backend/marketplace/views.py` (submit), `backend/marketplace/admin.py`.
**Decision status:** OPEN.

### GM21-Q08 — Sell, swap, free: what are the price rules? — VERIFIED

**Plain English:** the price rules are enforced in the model — sell needs a price, swap and free must be zero — and a published price cannot be changed at all (only draft/rejected listings can be patched). The owner needs to confirm currency, GST, and whether that freeze is right.

**ACTUAL TODAY — Web and Expo (same):** model-enforced: SELL `amount > 0`; FREE and SWAP `amount = 0`; SWAP requires `desired_swap` text; `quantity` default 1, `unit` default `"bundle"`. Public serializer shows AUD. **Patch is allowed only on DRAFT/REJECTED listings** (with `expected_version`, 409 `STALE_VERSION`) — so a PUBLISHED price cannot change; the seller must withdraw and relist. Currency, GST treatment, and minimum price are **not stated in code**.
**Normal case:** seller lists at $50 AUD. **Edge case:** seller edits price after publish but before enquiry — not possible; withdraw + relist. **Retry/concurrency:** concurrent edits — version check (409) enforced. **Payment side effect:** price is what the buyer agreed, not the current listing price (agreed terms are snapshotted in the exchange). **Web/Expo:** same rules both clients.
**RECOMMENDED: A + C** — prices in AUD, GST-inclusive stated on the listing, no price change after first enquiry; free listings limited (e.g. one active free listing per user) to stop spam. Severity: medium (financial clarity). Rationale: GST-inclusive AUD removes the commonest dispute; the published-price freeze already stops bait pricing; free-listing spam is a known marketplace failure mode. Note: the "no change after first enquiry" half is **stricter than code** (code freezes at publish); the owner is choosing between freeze-at-publish (today) and freeze-at-first-enquiry (needs a change).
**ALTERNATIVE A — Keep current logic:** model rules as they stand, price frozen at publish. Trade-off: no work; GST/minimum unstated.
**ALTERNATIVE B — Price may change until an exchange is ACCEPTED, with notice to enquirers:** trade-off: flexible, needs the notice mechanism that does not exist (GM21-Q16).
**ALTERNATIVE C — Free listings limited to stop spam:** trade-off: needs a per-user active-free-listing count that does not exist.
**Other (describe) / Defer.**
**Sources:** `backend/marketplace/models.py` (`MarketplaceListing` DB checks), `backend/marketplace/views.py` (patch gating), `backend/marketplace/serializers.py` (AUD, mode/amount validation).
**Decision status:** OPEN.

### GM21-Q09 — Audience circles and escalation: who sees it first, and when does it widen? — VERIFIED

**Plain English:** circles exist (own chain → organisation → platform) and a scheduled job widens them every minute — but only if the escalation flag is on (it is off by default), and nobody is told when the audience widens.

**ACTUAL TODAY — Web and Expo (same):** circles OWNED_CHAIN → ORGANISATION → PLATFORM; `ListingEscalationStep` schedules widening with `due_at` + `schedule_version`; `maximum_circle` caps it; pharmacy audience defaults current OWNED_CHAIN, maximum PLATFORM (signals). `process_goods_escalations` runs every minute via celery, gated by `MARKETPLACE_ESCALATION_ENABLED` (off by default); it locks the step, rechecks authority/state/version/max circle, PAUSED otherwise, writes an audit event — and **sends no notification to the new audience**. Seller picks current/max circle + schedule steps in the composer (Next `goods-listings-v2.tsx` has audience escalate + schedule `datetime-local`; Expo wizard has the audience step). Default starting circle: OWNED_CHAIN for pharmacy listings (signals default); personal listings have circles nulled.
**Normal case:** listing starts at own chain, widens on schedule. **Edge case:** escalation fires while an exchange is in progress — no freeze rule in code. **Retry:** failed step → PAUSED, no retry traced. **Notify:** newly eligible buyers are **not** notified. **Web/Expo:** same visibility both clients.
**RECOMMENDED: B — Seller picks the starting circle and whether it ever widens.** Severity: medium. Rationale: surplus pharmacy stock is often chain-sensitive first (internal transfer is cheaper than a public sale); the seller knows. This is largely what the composer already offers; the decision confirms it and adds the missing notification (GM21-Q16).
**ALTERNATIVE A — Keep current logic:** circles + escalation as modelled (schedule picked by seller, no notification on widening). Trade-off: no work; new audiences discover listings only by browsing.
**ALTERNATIVE B — Start at OWNED_CHAIN, widen on a schedule the seller picks:** trade-off: same as recommended minus the opt-out of widening.
**ALTERNATIVE C — No escalation: listing stays in the circle the seller chose:** trade-off: simplest, stock moves slower.
**Other (describe) / Defer.**
**Sources:** `backend/marketplace/models.py` (`ListingAudiencePolicy`, `ListingEscalationStep`), `backend/marketplace/tasks.py`, `backend/marketplace/signals.py`, `backend/core/celery.py`, `frontend_web/landing_next/features/marketplace/goods-listings-v2.tsx`.
**Decision status:** OPEN.

### GM21-Q10 — Enquiry or firm offer: what is an exchange, and when is a listing held? — CHANGED (reservations never expire)

**Plain English:** an exchange goes enquiry → proposed terms → accepted → both sides confirm → done, and the first accepted exchange reserves the listing. But the reservation has no expiry at all — once reserved, it stays reserved until someone cancels or completes it.

**ACTUAL TODAY — Web and Expo (same):** `MarketplaceExchange` states ENQUIRY → TERMS_PROPOSED → ACCEPTED → AWAITING_COMPLETION → COMPLETED (or DECLINED/CANCELLED/EXPIRED); `proposed_terms` vs `agreed_terms`; dual `seller_confirmed`/`buyer_confirmed`; one live `MarketplaceReservation` per listing with `expires_at`. **Verified now:** `accept_exchange` is idempotent, takes row locks, returns `ALREADY_RESERVED` if a live reservation exists, and creates the reservation **without setting `expires_at`** — and **no release task exists** — so a reservation never expires in code (CG-04). The EXPIRED exchange state exists in the model but no code path was found that sets it. Who can start an exchange: any buyer passing `buyer_can_contact`; terms can be countered (propose-terms); no chat-first requirement in code.
**Normal case:** buyer enquires, terms proposed, seller accepts, listing reserved, both confirm, done. **Edge case:** buyer proposes terms, seller counters — new proposal, old void. **Retry:** double-tap submit must not create two exchanges — `MarketplaceRequestReceipt` idempotency exists and is enforced (reuse with different payload → `ValidationError`). **Concurrency:** two buyers enquire — first ACCEPTED reserves the listing, second gets `ALREADY_RESERVED`; the reservation then **never releases on its own**. **Payment side effect:** no money moves at ENQUIRY. **Notify:** both sides on every state change — **not implemented** (no notifications exist).
**RECOMMENDED: A — Enquiry first (chat/questions), firm terms only when the seller proposes them.** Severity: high (disputes). Rationale: goods need questions (condition, pickup time, postage quote) before commitment; the ENQUIRY state already exists for this. This recommendation now also needs a reservation-expiry rule (code gap CG-04) — the owner must pick the expiry length.
**ALTERNATIVE A — Keep current logic:** state machine as modelled, reservation never expires. Trade-off: no work; a stalled exchange holds the listing forever.
**ALTERNATIVE B — Buyer proposal is a firm offer the seller accepts or declines, no chat-first step:** trade-off: faster, less room for questions.
**ALTERNATIVE C — Either, chosen per listing by the seller:** trade-off: flexible, more UI.
**Other (describe) / Defer.**
**Sources:** `backend/marketplace/models.py` (`MarketplaceExchange`, `MarketplaceReservation`), `backend/marketplace/services.py` (`accept_exchange`), `backend/marketplace/views.py` (exchange actions).
**Decision status:** OPEN.

### GM21-Q11 — How is money handled — in-platform, or off-platform? — VERIFIED (no payment path exists)

**Plain English:** there is no payment path. Not in the models, not in the views, services, tasks, signals, serializers, admin or URLs of either marketplace app, and not in the billing code that was searched. The ethical transfer form says settlement is "EXTERNAL". If money moves, it moves off-platform with no record.

**ACTUAL TODAY — Web and Expo (same):** no payment/fee/Stripe/refund/payout field on any model in `marketplace/models.py` (senior-review confirmed 0 occurrences); no payment code in any fetched file of either app; no checkout UI on either client; `settlement:'EXTERNAL'` in the Next ethical transfer form. Stripe wiring was searched (`search_code` for Stripe/billing in the marketplace context — default branch) and no marketplace payment integration was found. Whether the shift-billing Stripe flow could be reused is **not traced** (no wiring exists).
**Normal case:** buyer and seller settle privately (cash/bank) — with no platform record. **Edge case:** buyer pays privately and goods never arrive — platform cannot help without a payment record. **Retry:** failed checkout must not create a duplicate exchange — n/a, no checkout exists. **Denied:** payment failure cancels the reservation and releases the listing — n/a. **Notify:** payment events to both sides — n/a. **Web/Expo:** identical (no) checkout both clients.
**RECOMMENDED: D at launch, B as the target** — if GM21-Q01 is not "defer", launch with FREE/SWAP only; target in-platform Stripe checkout with funds held until both sides confirm. Severity: **critical** (financial/legal). Rationale: taking money without a verified payment, hold, refund and fraud path is the highest-risk thing in this area; the model's silence on payment is now verified as an absence everywhere, not just in one file.
**ALTERNATIVE A — Off-platform:** buyer and seller settle privately, platform takes no fee and no responsibility. Trade-off: honest about what exists; no dispute help, no fee revenue.
**ALTERNATIVE B — In-platform Stripe checkout, platform holds funds until both sides confirm:** trade-off: safest money path, most build.
**ALTERNATIVE C — In-platform payment, immediate release to seller, platform fee on top:** trade-off: faster payout, no hold means no leverage in a dispute.
**ALTERNATIVE D — No money at launch: FREE and SWAP only until payments are built:** trade-off: same as recommended launch cut.
**Other (describe) / Defer.**
**Sources:** `backend/marketplace/models.py` (absence verified + senior review), `backend/marketplace/views.py` / `services.py` / `tasks.py` / `signals.py` / `serializers.py` / `admin.py` / `urls.py` (no payment code), `backend/ethical_marketplace/` (same), `frontend_web/landing_next/features/marketplace/workspace.tsx` (`settlement:'EXTERNAL'`).
**Decision status:** OPEN. **Blocks launch of paid listings.**

### GM21-Q12 — Delivery and pickup: who pays, who organises, what proves it arrived? — VERIFIED

**Plain English:** delivery terms are fully modelled — pickup, postage or both, who pays, who organises, known cost or quote required, and both sides confirm each leg. What is missing is what happens when it goes wrong.

**ACTUAL TODAY — Web and Expo (same):** `ListingDeliveryTerms` (PICKUP/POSTAGE/BOTH; payer/organiser BUYER/SELLER; `known_cost` or `quote_required`; notes) and per-exchange `MarketplaceDeliveryLeg` (agreed cost, both sides confirm). What happens when a quote never comes, goods are damaged in post, or pickup never happens is **not in code**.
**Normal case:** buyer collects from the pharmacy. **Edge case:** buyer never collects — no return-to-available rule in code. **Retry:** redelivery is a new leg, not an edit (inferred from the leg model). **Payment side effect:** postage cost is part of `agreed_terms`, not added later. **Notify:** both sides on delivery confirmation — not implemented (no notifications exist).
**RECOMMENDED: A at launch, C later** — pickup only at launch (no postage); later, seller organises postage, cost agreed in the exchange before acceptance. Severity: medium-high. Rationale: postage adds cost disputes, damage claims and tracking — pickup keeps the launch simple and matches pharmacy-to-pharmacy transfers.
**ALTERNATIVE A — Keep current logic:** delivery terms as modelled (pickup/postage/both available). Trade-off: no work; postage disputes have no path.
**ALTERNATIVE B — Postage allowed, buyer pays and organises unless the listing says otherwise:** trade-off: more reach, more disputes.
**ALTERNATIVE C — Seller organises postage, cost agreed in the exchange before acceptance:** trade-off: single accountable party for delivery.
**Other (describe) / Defer.**
**Sources:** `backend/marketplace/models.py` (`ListingDeliveryTerms`, `MarketplaceDeliveryLeg`), `backend/marketplace/serializers.py` (delivery payer/organiser validation).
**Decision status:** OPEN.

### GM21-Q13 — Internal transfers between a owner's pharmacies: transfer or listing? — CHANGED (no destination acceptance exists)

**Plain English:** transfers between a owner's own pharmacies exist and are owner-driven — but the destination pharmacy cannot refuse one. The old recommendation assumed destination acceptance; that does not exist in code.

**ACTUAL TODAY — Web and Expo (same):** `MarketplaceInternalTransfer`: source ≠ destination pharmacy (DB check), `accountable_owner`, `transport_terms` JSON, `state` default PROPOSED → AUTHORISED → IN_TRANSIT → RECEIVED/CANCELLED. Owner-only, distinct pharmacy owned by same owner. **No destination-manager acceptance step exists** (no accept/reject action for the destination in views/services). When a transfer is used instead of a listing, and whether it needs review, is **not in code** — it is a direct owner action.
**Normal case:** owner moves stock from site A to site B. **Edge case:** source and destination are the same pharmacy — blocked by the DB check. **Retry:** re-propose after decline — no decline action exists for the destination. **Wrong tenant:** a transfer between pharmacies with different owners fails server-side (same-owner check). **Web/Expo:** no dedicated goods-transfer screen traced on Expo (ethical transfers have full Expo screens).
**RECOMMENDED: A + B** — owner-initiated, destination manager accepts. Severity: medium. Rationale: stock moving between own sites is the commonest pharmacy case and should be frictionless, but the destination must be able to refuse (no room, wrong item). **This recommendation is now a build, not a confirmation:** the acceptance step (B) does not exist and must be added.
**ALTERNATIVE A — Keep current logic:** transfers as modelled (owner-only, instant, no review, no destination acceptance). Trade-off: no work; destination cannot refuse.
**ALTERNATIVE B — Transfers need acceptance by the destination pharmacy's manager:** trade-off: same as recommended.
**ALTERNATIVE C — No separate transfer flow: use a listing limited to OWNED_CHAIN:** trade-off: reuses the listing machinery, loses the direct transfer states.
**Other (describe) / Defer.**
**Sources:** `backend/marketplace/models.py` (`MarketplaceInternalTransfer`), `backend/marketplace/views.py` (transfer actions).
**Decision status:** OPEN.

### GM21-Q14 — Moderation, reports, restrictions: who acts, how fast, can it be appealed? — VERIFIED

**Plain English:** reports, restrictions and an audit trail all exist in the model, and the admin can publish/reject/hide listings and approve/reject images. But there is no SLA, no takedown timing, no restriction notice, and no appeal — and a restricted pharmacy's listings do not freeze automatically.

**ACTUAL TODAY — Web and Expo (same):** `MarketplaceReport` (OPEN, reporter nullable, `public_reference` UUID), `MarketplaceRestriction` (user and/or pharmacy, dated, `reviewed_by`), `MarketplaceAuditEvent` (every action logged), `MarketplaceImage.moderation_status` default PENDING, `MarketplaceMessage.moderation_state` default VISIBLE. Admin actions: publish/reject/hide + image approve/reject (Django admin only). **No SLA, no takedown timing, no restriction notice/appeal, no automatic freeze of a restricted pharmacy's listings in code.** Reports are AllowAny (anonymous reporting possible).
**Normal case:** user reports a bad listing; admin hides it. **Edge case:** report about a live exchange — exchange freezes, money (if any) held — no code path for this. **Retry:** n/a. **Denied:** restricted user sees the reason and the end date — not in code (no notice exists). **Wrong tenant:** a restriction on pharmacy A must not block the same user's personal listings unless the restriction says so — not enforced in code. **Notify:** reporter (reference number), seller, affected buyer — not implemented.
**RECOMMENDED: A — Platform moderates; report → hide pending review within 1 business day; restriction with written reason + appeal.** Severity: high (safety/legal). Rationale: the audit trail and dated restrictions already assume a human process with reasons; immediate hiding on any report (B) is too easy to abuse against competitors.
**ALTERNATIVE A — Keep current logic:** report/restrict/audit as modelled (admin actions, no SLA, no appeal). Trade-off: no work; moderation speed is whatever the admin's day allows.
**ALTERNATIVE B — Report hides the listing immediately, review later:** trade-off: fastest takedown, easiest to abuse.
**ALTERNATIVE C — Pharmacy owners moderate their own pharmacy-context listings; platform moderates personal ones:** trade-off: distributes the work, needs owner-moderation UI that does not exist.
**Other (describe) / Defer.**
**Sources:** `backend/marketplace/models.py` (`MarketplaceReport`, `MarketplaceRestriction`, `MarketplaceAuditEvent`), `backend/marketplace/admin.py`, `backend/marketplace/views.py` (reports AllowAny).
**Decision status:** OPEN.

### GM21-Q15 — The ethical marketplace (medicines): who can use it, and what are the "ethical" rules? — VERIFIED (whole app traced)

**Plain English:** the ethical marketplace is a complete second app: verified pharmacy approvals, per-person professional access with schedules and expiry, per-pharmacy grants for exact actions, jurisdiction policies, verified stock lots, private listings in three circles, and transfers with a full paper trail. S8 is the tightest part — never platform-wide, and off by default. The owner still needs to decide whether any of it launches, and under what legal review.

**ACTUAL TODAY — Web:** EthicalWorkspace (home/access/inventory/new/transfers); S8 composer exists in UI. **ACTUAL TODAY — Expo:** full ethical parity component (16 screens incl. access, grants, pharmacy approval, inventory, scan, CSV import, lot detail, listings, S8 composer, transfer requests/detail/documents/complete). **Backend:** access = marketplace access minus terms + owner/admin authority + VERIFIED premises approval + VERIFIED unexpired professional access + per-action grant + schedule/activity/jurisdiction/policy checks; listings circles CHAIN_PHARMACIES / ORGANISATION_OWNERS / PLATFORM_OWNERS; **S8 never PLATFORM_OWNERS**, S8 at ORGANISATION_OWNERS requires `scope_organization_id`; `ETHICAL_S8_ENABLED` False at defaults; transfers REQUESTED…DISCREPANCY with source/destination approvals and `legal_basis`; lots enforce reserved ≤ on-hand; CSV imports ≤5 MB, rights attestation, ≤5000 rows; documents with file-signature validation; ethical responses `private, no-store` + `noindex`, never in sitemap; public serializers never include ethical data. **No payment, no notifications** in the ethical app either.
**Normal case:** verified pharmacy with a grant lists short-dated stock to its chain. **Edge case:** short-dated stock, cold-chain items, controlled drugs — each needs its own rule (not in code beyond S8 ceilings and jurisdiction policy). **Payment:** same as GM21-Q11 (none; settlement EXTERNAL in UI). **Web/Expo:** ethical side must never leak into the public catalogue — verified at the serializer level.
**RECOMMENDED: D at launch, A as the target** — do not launch any medicine trading until the ethical rules, verification gate and audit are traced and legally reviewed. Severity: **critical** (regulatory — medicines supply, PBS/poisons law, wholesaler terms). Rationale: medicine trading between pharmacies is regulated; launching it on unreviewed rules risks licence and legal exposure. The tracing is now done; the **legal review** is what is still missing.
**ALTERNATIVE A — Medicines only between verified pharmacies, private (no public discovery), owner-approved:** trade-off: matches what the code already enforces; needs the legal sign-off.
**ALTERNATIVE B — Verified pharmacies + pharmacists, with full audit and no public listing:** trade-off: wider than A, still private.
**ALTERNATIVE C — Same rules as the goods marketplace, just a separate section:** trade-off: would drop the ethical gates — contradicts the whole app.
**ALTERNATIVE D — Defer the ethical marketplace from launch entirely:** trade-off: same as recommended launch cut.
**Other (describe) / Defer.**
**Sources:** `backend/ethical_marketplace/` (all files, §1.7), `docs/marketplace/IMPLEMENTATION.md`, `frontend_mobile/features/parity/ethicalMarketplace.tsx`, `frontend_web/landing_next/features/marketplace/workspace.tsx`.
**Decision status:** OPEN. **Blocks launch of medicine trading.**

### GM21-Q16 — What are buyers and sellers told, and what happens when a notification fails? — VERIFIED (no notifications exist)

**Plain English:** nothing. No marketplace event — listing approved, enquiry, terms agreed, reservation, delivery, completion, report outcome — sends any notification, on any channel. The outbox table exists but nothing ever writes to it. The owner needs to decide the whole notice rule from scratch.

**ACTUAL TODAY — Web and Expo (same):** `MarketplaceNotificationOutbox` (dedup key unique, attempts, `next_retry_at`, PENDING) and `EthicalNotificationOutbox` exist as models. **Nothing in views/services/tasks/signals/serializers/admin/urls of either app writes to them** (verified by reading all of those files). No notification is sent by either marketplace on any event. GM-22 owns the cross-cutting channel rule (GM22-04); GM-21 owns which marketplace events need a notice.
**Normal case:** seller's listing is approved — seller is not told; they must check. **Edge case:** notification fails repeatedly — n/a, nothing sends. **Retry:** dedup key prevents double-notify — n/a. **Web/Expo:** same (no) events both clients.
**RECOMMENDED: A — Notify on every state change (listing approved/rejected, enquiry, terms, reservation, delivery, completion, report outcome) by in-app + email.** Severity: medium. Rationale: marketplace deals stall silently without notifications; the outbox already has dedup + retry, so the design intent is reliable delivery. **This recommendation is a build, not a confirmation** — the outbox must be wired to every event first.
**ALTERNATIVE A — Keep current logic:** outbox + receipts as modelled (i.e. nothing sends). Trade-off: no work; deals stall silently.
**ALTERNATIVE B — In-app only; email only for reservation expiry and moderation decisions:** trade-off: cheaper; money/cancel-equivalent events (moderation) still get email.
**ALTERNATIVE C — Seller chooses which notifications they get:** trade-off: most control, most settings UI.
**Other (describe) / Defer.**
**Sources:** `backend/marketplace/models.py` (`MarketplaceNotificationOutbox`), `backend/ethical_marketplace/models.py` (outbox), all views/services/tasks/signals of both apps (absence verified).
**Decision status:** OPEN.

### GM21-Q17 — Photos: what shows before review, and what is banned in images? — VERIFIED

**Plain English:** photos are hidden until a human approves them, max 6 per listing, size and resolution capped, converted to JPEG. The owner needs to confirm the limits and the banned-content rule.

**ACTUAL TODAY — Web and Expo (same):** max 6 images, ≤4 MB, ≤20 MP, converted to JPEG; visible only if APPROVED + PUBLISHED (or owner). `MarketplaceImage.moderation_status` defaults PENDING; `alt_text` exists; original + derivative files stored. Banned image content (e.g. a photo of a medicine on a goods listing) is **not a coded rule** — it is caught, if at all, by the listing reviewer.
**Normal case:** seller uploads 3 photos, reviewer approves, buyers see them. **Edge case:** seller uploads a photo of a medicine on a goods listing — reject the listing, not just the photo (no coded rule; reviewer judgement). **Retry:** re-upload after rejection. **Web/Expo:** same rules, same limits.
**RECOMMENDED: A — Images hidden until moderated, max 5 per listing.** Severity: medium. Rationale: photos are the easiest place for misleading listings (wrong item, stock photos of medicines); the PENDING default already leans this way. Note: code allows **6**, recommendation says 5 — the owner is choosing between 6 (today) and 5.
**ALTERNATIVE A — Keep current logic:** image moderation as modelled (max 6, hidden until approved). Trade-off: no work.
**ALTERNATIVE B — Images visible immediately, removed only after a report:** trade-off: fastest, riskiest.
**ALTERNATIVE C — No photos at launch (text-only listings):** trade-off: safest, least useful.
**Other (describe) / Defer.**
**Sources:** `backend/marketplace/views.py` (image rules), `backend/marketplace/models.py` (`MarketplaceImage`).
**Decision status:** OPEN.

### GM21-Q18 — Catalogue products and imports: who adds products, and who checks the rights? — VERIFIED

**Plain English:** there is a shared product catalogue with a rights attestation on imports, and listings can look up approved non-medicine products by barcode. The owner needs to decide whether sellers must use the catalogue or can keep writing free text.

**ACTUAL TODAY — Web and Expo (same):** `MarketplaceCatalogueProduct` (status default PENDING, `provenance`, `reviewed_by`, `is_medicine`), `MarketplaceCatalogueIdentifier` (unique kind+value), `MarketplaceCatalogueImport` (`source_rights_attested`, file, STAGED), staging rows with per-row status/reason. Goods catalogue lookup: APPROVED non-medicine, barcode, flag + access gates. Ethical CSV imports: ≤5 MB, rights attestation, ≤5000 rows; per-row accept/reject (ImportCommit → COMMITTED/PARTIAL/REJECTED). Who may import, what "rights attested" covers, and whether listings must use catalogue products are **not in code** (no role gate traced on import beyond the access gates).
**Normal case:** importer stages a CSV, reviews rows, commits. **Edge case:** import row fails (bad data, duplicate identifier) — row rejected with reason, rest of batch continues; rights attestation false — import blocked (attestation is required on the import). **Web/Expo:** same catalogue both clients (Expo has import + scan screens; Next has import via EthicalWorkspace).
**RECOMMENDED: B — Sellers may propose products; platform approves before any listing uses them.** Severity: medium. Rationale: a shared catalogue stops duplicate/conflicting product entries and gives the banned-goods check (GM21-Q02) something to hang on; seller proposals keep it growing.
**ALTERNATIVE A — Keep current logic:** catalogue/import as modelled. Trade-off: no work; the "who may import" question stays open.
**ALTERNATIVE B — Platform-only catalogue; sellers pick from it, no free-text products:** trade-off: cleanest, slowest to grow.
**ALTERNATIVE C — Drop the catalogue: free-text listings only:** trade-off: simplest, duplicates and banned goods have nothing to check against.
**Other (describe) / Defer.**
**Sources:** `backend/marketplace/models.py` (catalogue models), `backend/ethical_marketplace/views.py` + `owner_views.py` (CSV import, ImportCommit), `backend/marketplace/views.py` (catalogue lookup).
**Decision status:** OPEN.

### GM21-Q19 — Web vs Expo parity: which marketplace screens exist on each client? — VERIFIED

**Plain English:** both clients are fully built for the marketplace — Next has the whole goods surface and the ethical workspace, Expo has full goods and ethical parity components. Vite has nothing; marketplace on web is Next-only. The one UI gap found is small: the Next composer does not offer Explorer-family buyer roles, though the backend allows them.

**ACTUAL TODAY — Web:** Next full goods (catalogue, item, create, mine, exchanges) + full ethical workspace; **Vite: no marketplace screens** (bridge to Next in `PublicRouteBridge.tsx`). **ACTUAL TODAY — Expo:** full goods parity (14 screens, creation wizard) + full ethical parity (16 screens incl. S8 composer, scan, CSV import, transfer documents). **Parity gaps (code):** (1) Next composer buyer-role checkboxes exclude Explorer-family though backend allows them (CG-08). (2) Goods internal transfers have no dedicated Expo screen traced (ethical transfers do). (3) `marketplace-item` detail component not read (item page is a thin wrapper around it).
**Normal case:** a listing created on web shows the same state on Expo immediately (same API). **Edge case:** Explorer buyer role selectable on Expo but not in the Next composer — same listing, different role options per client. **Retry:** same idempotency both clients. **Denied:** same gates both clients.
**RECOMMENDED: A as the target, B as the launch cut** if GM21-Q01 is not "defer" — full parity: create, browse, exchange, delivery, moderation status on web (Next) and Expo; at launch, browse + enquire on both, create/manage on web only. Severity: medium. Rationale: sellers and buyers are the same people on both clients; but building full parity before the payment/moderation decisions is wasted work. Note: the build is largely **already done** — the remaining parity work is the small gaps above, not a rebuild.
**ALTERNATIVE A — Keep current logic:** both clients as built (full Next + full Expo, Vite none). Trade-off: no work; the Explorer-role checkbox gap stays.
**ALTERNATIVE B — Browse + enquire on both; create/manage on web only:** trade-off: less Expo build, sellers must use web to manage.
**ALTERNATIVE C — Marketplace is web-only at launch; Expo gets a read-only catalogue later:** trade-off: contradicts the Expo build that already exists.
**Other (describe) / Defer.**
**Sources:** §1.10 (all client files listed there).
**Decision status:** OPEN.

### GM21-Q20 — Fees and commission: does the platform charge for trades? — VERIFIED (no fee anywhere)

**Plain English:** there is no fee. No fee or commission field in any marketplace model, no fee code in any marketplace file, and no fee UI on either client. The owner needs to decide whether that stays.

**ACTUAL TODAY — Web and Expo (same):** no fee/commission field exists anywhere in `backend/marketplace/models.py` (verified absence in that file, senior-review confirmed) and no fee code was found in any other marketplace file read this pass; no fee display in any client screen read. Whether fees live in billing code was searched (default-branch search) and none was found for the marketplace.
**Normal case:** a $50 sale completes with $0 to the platform. **Edge case:** fee introduced later — applies only to exchanges started after the change, disclosed in terms (GM21-Q06). **Payment side effect:** charging needs the payment path (GM21-Q11) to exist first. **Web/Expo:** same (no) fee display both clients.
**RECOMMENDED: A — Free at launch, fee decided later.** Severity: medium (financial). Rationale: charging needs the payment path (GM21-Q11) to exist first; "free at launch" is honest and reversible, while an unbuilt fee is a promise that can't be kept.
**ALTERNATIVE A — Keep current logic:** no fee (as the model implies). Trade-off: same as recommended in practice.
**ALTERNATIVE B — Percentage fee on SELL exchanges, collected in-platform (needs GM21-Q11 = in-platform payment):** trade-off: revenue, needs the payment build.
**ALTERNATIVE C — Flat listing fee:** trade-off: simple, needs payment collection at listing time.
**Other (describe) / Defer.**
**Sources:** `backend/marketplace/models.py` (absence), all other marketplace files (no fee code), client screens (no fee display).
**Decision status:** OPEN.

---

## Part D — SINGLE first decision question to ask the owner

**GM21-Q01 — Do we launch the goods marketplace at all, and for whom?**

- **Why first:** Every other GM-21 question (categories, payments, moderation, parity) depends on whether the marketplace is in the launch cut and who it serves. The code has a full marketplace design, both clients are built, and the September migrations blocker is resolved — but the payment path does not exist anywhere, moderation is admin-only with no SLA, no notification is ever sent, and the medicines side is unreviewed legally. Asking about prices or moderation before scope is wasted effort.
- **Plain English:** "You have a whole buy/swap/free-goods marketplace built in code — listings, reviews, buyer circles, deals, delivery, reports — plus a separate private one for medicines, and both are built on web and mobile. Should any of that be in the first launch, or do we launch shifts and talent only and bring trading later?"
- **Options:**
  - **KEEP — launch as designed:** review-gated listings, circles, exchanges, as the models describe. (Needs GM21-Q11/Q14/Q15/Q16 answered and built before it is safe; the write flags are off by default, so this also means deliberately switching them on.)
  - **A — Defer the goods marketplace from the launch cut (RECOMMENDED):** launch shifts/talent only; marketplace post-launch. Nothing is deleted; catalogue and Expo routes stay hidden or read-only.
  - **B — Launch pharmacy-to-pharmacy only:** no personal trading; surplus stock moves between pharmacies.
  - **C — Launch personal trading only:** no pharmacy-context listings.
  - **Other (describe)** / **Defer**.
- **Recommendation:** **A — defer from launch cut.** Severity: high. Rationale: the payment path is verified absent everywhere (no payment fields, no payment code, settlement EXTERNAL), moderation is Django-admin-only with no SLA or appeal, no notification exists for any marketplace event, reservations never expire, and the medicines side needs legal review. Deferring keeps the launch focused on shifts/talent and avoids taking money or liability for goods before the rules exist. Cost: pharmacies wanting to trade surplus stock wait; benefit: no fraud/dispute exposure on day one. What changed since the first pass: the migrations blocker is **resolved**, so the defer case now rests on payment + moderation + notifications, not on deployability.
- **Ask second (after GM21-Q01 is answered):** GM21-Q11 (payments) together with GM21-Q15 (ethical medicines) — the two launch-blocking questions if the marketplace stays in scope.

---

## Part E — Code gaps vs decision gaps

### Code gaps (verified at head `97c4543e` — no decision needed, just build/fix once the rule is known)

| ID | Gap | Evidence |
|---|---|---|
| CG-01 | **No payment path in either marketplace app.** No payment/fee/Stripe/refund/payout field on any model; no payment code in views/services/tasks/signals/serializers/admin/urls of either app; no checkout UI; ethical settlement is `EXTERNAL` in the UI | `backend/marketplace/models.py` (0 occurrences, senior-review confirmed), all other marketplace files, `workspace.tsx` |
| CG-02 | **No notification is ever sent by either marketplace.** Outbox models exist (`MarketplaceNotificationOutbox`, ethical outbox) with dedup key + retry fields, but nothing writes to them | All views/services/tasks/signals of both apps (absence verified) |
| CG-03 | **`public_discovery` is never consulted.** Field defaults True; public catalogue shows every PUBLISHED listing to anyone, anonymous included, regardless of circle | `backend/marketplace/views.py` (catalogue query), grep across all fetched marketplace files (0 reads outside the model) |
| CG-04 | **Reservations never expire.** `MarketplaceReservation.expires_at` nullable with no default; `accept_exchange` sets none; no release task; the EXPIRED exchange state has no code path setting it | `backend/marketplace/models.py`, `backend/marketplace/services.py` (`accept_exchange`) |
| CG-05 | **Review is Django-admin-only, no SLA, no revision API.** `MarketplaceListingRevision` is model-only (never referenced in views/services/tasks/signals); no appeal path | `backend/marketplace/admin.py`, `backend/marketplace/views.py` |
| CG-06 | **Write flags default off — read-only catalogue at defaults.** `NEW_LISTINGS`/`CONTACT`/`NEW_COMMITMENTS`/`ESCALATION`/`CATALOGUE_LOOKUP` False; ethical writes False; S8 False | `backend/core/settings.py` |
| CG-07 | **Internal transfers are owner-driven with no destination-manager acceptance.** No accept/reject action for the destination pharmacy | `backend/marketplace/views.py` (transfer actions) |
| CG-08 | **Next composer buyer-role checkboxes exclude the Explorer-family roles** though the backend allows all 8 roles as personal sellers/buyers | `frontend_web/landing_next/features/marketplace/workspace.tsx` vs `backend/marketplace/listing_policy.py` |
| CG-09 | **Prohibited-goods list is guidance only.** Seed `field_schema` "prohibited" lists are not enforced in `can_list_category`; only `requires_review` + human reviewer stand between a banned item and publish | `seed_marketplace_categories.py`, `backend/marketplace/listing_policy.py` |
| CG-10 | **No revocation-freeze path.** Nothing freezes live listings/exchanges when `IdentityVerification` is revoked or a pharmacy loses `verified` | No freeze path found in views/services/tasks of either app |
| CG-11 | **Goods sitemap content not verified.** `public_sitemap.py` exists; whether PUBLISHED listings appear in it was not read (ethical listings are documented as never in the sitemap) | `backend/marketplace/public_sitemap.py` (existence only) |

### Decision gaps (owner must choose first — do not build until answered)

| ID | Gap | Questions |
|---|---|---|
| DG-01 | Launch scope: marketplace in the launch cut, and for whom? | GM21-Q01 |
| DG-02 | Banned-goods list and where it is enforced | GM21-Q02 |
| DG-03 | Seller eligibility: personal (all roles?) vs pharmacy (owner-only vs authorised manager?) | GM21-Q03 |
| DG-04 | Buyer eligibility + public visibility: circles enforced on the catalogue, or public cards only? | GM21-Q04 |
| DG-05 | Identity-check bar for each side; revocation consequence | GM21-Q05 |
| DG-06 | Terms version-bump rule (mid-exchange) | GM21-Q06 |
| DG-07 | Review SLA + resubmission/appeal rule | GM21-Q07 |
| DG-08 | Price rules: currency/GST/minimum; freeze at publish vs at first enquiry; free-listing limit | GM21-Q08 |
| DG-09 | Circle defaults + escalation schedule + widening notification | GM21-Q09 |
| DG-10 | Enquiry-first vs firm-offer; reservation expiry length | GM21-Q10 |
| DG-11 | Payment model: off-platform vs in-platform hold vs immediate release; FREE/SWAP-only at launch? | GM21-Q11 |
| DG-12 | Delivery model: pickup-only at launch vs postage, who pays/organises | GM21-Q12 |
| DG-13 | Internal transfers: destination acceptance or not; transfer vs listing | GM21-Q13 |
| DG-14 | Moderation SLA, takedown timing, restriction notice/appeal | GM21-Q14 |
| DG-15 | Ethical medicines: launch or defer; legal sign-off; S8 enablement decision | GM21-Q15 |
| DG-16 | Marketplace notice rule: which events, which channels (with GM22-04) | GM21-Q16 |
| DG-17 | Photo limits (5 vs 6) + banned-image rule | GM21-Q17 |
| DG-18 | Catalogue: must sellers use it, or free text? Who may import? | GM21-Q18 |
| DG-19 | Parity cut: full parity vs browse-only on one client | GM21-Q19 |
| DG-20 | Fees: free at launch vs percentage vs flat listing fee | GM21-Q20 |

### Gaps that are BOTH (decision first, then code)

- Payments (GM21-Q11 + CG-01): needs the payment-model decision, then the whole checkout/hold/refund build (nothing exists today).
- Marketplace notifications (GM21-Q16 + CG-02): needs the event/channel decisions, then wiring the outbox to every event.
- Public catalogue privacy (GM21-Q04 + CG-03): needs the visibility decision, then enforcing circles + `public_discovery` on the catalogue query.
- Reservation expiry (GM21-Q10 + CG-04): needs the expiry-length decision, then setting `expires_at` on accept + a release task.
- Moderation (GM21-Q14 + CG-05): needs the SLA/appeal decisions, then a revision API + notice paths (which depend on GM21-Q16).

---

## Part F — Implementation backlog — PROPOSED ONLY, frozen until owner answers

> Do not build any item below until its parent question is answered AND the behaviour is re-validated against the current head. Order is suggested, not approved. Nothing here is decided.

| # | Backlog item | Parent question | Depends on | Acceptance (positive / negative) |
|---|---|---|---|---|
| B0 | ~~Finish the trace~~ — **DONE this pass.** All 20 questions re-validated at head `97c4543e` | — | — | + this file; − no code changed |
| B1 | Launch-scope switch: hide or read-only the marketplace per GM21-Q01; flags on/off per decision | GM21-Q01 | GM21-Q01 decision | + marketplace hidden/read-only per decision; − no listing creatable while deferred |
| B2 | Enforce the banned-goods list in `listing_policy.py` + review | GM21-Q02 | GM21-Q02 | + banned-category submit rejected server-side; − reviewer is not the only defence |
| B3 | Confirm/adjust seller gates (owner-only vs authorised manager for pharmacy listings) | GM21-Q03 | GM21-Q01, GM21-Q03 | + locum cannot list a pharmacy's stock without permission; − owner flow unchanged |
| B4 | Enforce circles + `public_discovery` on the public catalogue; circle check on PERSONAL enquiries | GM21-Q04 | GM21-Q04 | + anonymous sees only public-discovery listings; − wrong-circle buyer cannot read or enquire |
| B5 | Revocation-freeze: freeze live listings/exchanges when identity is revoked or pharmacy loses `verified` | GM21-Q05 | GM21-Q05 | + revoked seller's listings freeze; − completed exchanges unaffected |
| B6 | Terms version-bump handling (mid-exchange rule) | GM21-Q06 | GM21-Q06 | + bump does not break in-flight exchanges; − new listings need the new version |
| B7 | Review SLA + revision API + resubmit/appeal flow | GM21-Q07 | GM21-Q07, GM21-Q16 | + seller sees status + reason + resubmit path; − rejected listing never visible |
| B8 | Price rules: AUD/GST display, freeze rule, free-listing limit | GM21-Q08 | GM21-Q08 | + price shown GST-inclusive; − bait pricing impossible |
| B9 | Escalation widening notification (wire the outbox to the new audience) | GM21-Q09 | GM21-Q09, GM21-Q16, GM22-04 | + newly eligible buyers notified once; − no duplicate on retry |
| B10 | Reservation expiry: set `expires_at` on accept + release task + notify next enquirer | GM21-Q10 | GM21-Q10, GM21-Q16 | + reservation releases after the decided length; − second buyer told when it frees |
| B11 | Payment path (per GM21-Q11 decision): Stripe checkout + hold + refund, or FREE/SWAP-only enforcement | GM21-Q11 | GM21-Q01, GM21-Q11 | + paid listing cannot complete without payment; − no money moves off-record |
| B12 | Delivery model: pickup-only at launch, postage later with agreed cost in terms | GM21-Q12 | GM21-Q12 | + postage cost agreed before acceptance; − cost never added after |
| B13 | Destination-manager acceptance for internal transfers | GM21-Q13 | GM21-Q13 | + destination can refuse; − same-pharmacy transfer still blocked |
| B14 | Moderation SLA + takedown timing + restriction notice/appeal | GM21-Q14 | GM21-Q07, GM21-Q14, GM21-Q16 | + report → hide within SLA; − restricted user sees reason + end date + appeal |
| B15 | Ethical launch gate: legal review + S8 enablement decision + audit check | GM21-Q15 | GM21-Q15 | + no medicine trading before legal sign-off; − S8 stays off until decided |
| B16 | Marketplace notifications: wire outbox to every state change (in-app + email per GM22-04) | GM21-Q16 | GM22-04, GM21-Q16 | + seller/buyer told on every state change; − no duplicate (dedup key) |
| B17 | Photo rules: limit (5 vs 6) + banned-image rejection at upload | GM21-Q17 | GM21-Q17 | + medicine photo on a goods listing rejected; − approved photos visible to buyers |
| B18 | Catalogue: seller-proposed products + platform approval before use | GM21-Q18 | GM21-Q18 | + no listing uses an unapproved product; − duplicate products stopped |
| B19 | Parity fixes: Explorer-family buyer roles in Next composer; goods-transfer screen on Expo; `marketplace-item` detail check | GM21-Q19 | GM21-Q19 | + same role options both clients; − same listing state both clients |
| B20 | Fees: implement only after the payment path exists | GM21-Q20 | GM21-Q11, GM21-Q20 | + fee applies only to exchanges started after the change; − fee disclosed in terms |

### Scenario bank (for acceptance tests after decisions)

- **Unverified seller:** user without identity verification tries to list — blocked with the named missing step on both clients. (GM21-Q03/Q05)
- **Public catalogue:** anonymous visitor opens `/marketplace` — sees only public-discovery listings with anonymous cards (after CG-03 is fixed). (GM21-Q04)
- **Banned item:** seller lists a name badge / patient records — rejected server-side, not just by the reviewer. (GM21-Q02)
- **Stalled exchange:** buyer accepts, never confirms — reservation expires after the decided length, listing frees, next enquirer told. (GM21-Q10)
- **Paid listing:** seller lists a $50 item — cannot complete without the in-platform payment path (or the listing is FREE/SWAP-only at launch). (GM21-Q11)
- **Destination refusal:** owner transfers stock to site B — site B manager can refuse; stock stays at site A. (GM21-Q13)
- **Report:** user reports a misleading listing — hidden pending review within the SLA; seller told the reason; reporter gets a reference number. (GM21-Q14)
- **Ethical leak check:** public serializer for a goods listing never contains ethical product/inventory/PAN/pharmacy-name/user-name/contact/exact-address/evidence; ethical responses are `private, no-store` + `noindex`, never in the sitemap. (GM21-Q15)
- **S8 ceiling:** S8 listing cannot be published to PLATFORM_OWNERS; at ORGANISATION_OWNERS it requires `scope_organization_id`; with `ETHICAL_S8_ENABLED=false` no S8 listing can be created. (GM21-Q15)

---

## Unknowns (not verified in this trace — do not present as fact)

- Whether later marketplace model changes have follow-up migrations beyond `0001_initial`, and whether `check_marketplace_release` passes on other grounds (the command itself was not read).
- Content of `backend/marketplace/public_sitemap.py` — whether PUBLISHED goods listings appear in the public sitemap.
- Exact rendering of the Next `marketplace-item` detail component (the item page is a thin wrapper around `./marketplace-item`, which was not read).
- Whether a worker leaving a pharmacy freezes that pharmacy's listings (no code path traced).
- What `assurance_method` means in practice for `IdentityVerification`, and the revocation-freeze behaviour (no path found).
- The terms text itself (v2026-09) and the version-bump mid-exchange rule (no code path traced).
- Whether the shift-billing Stripe flow could be reused for marketplace payments (no wiring exists; reuse was not traced).
- Test results: the marketplace/ethical tests are substantive (concurrency, idempotency, privacy, S8 ceilings, forged contexts) and the handover claims they pass (2026-09-16) — **they were not re-run in this trace**.
- Whether the live Next site serves the migrated copy (same caveat as GM-01).

## Method note

- Trace order followed the senior review: docs first (`IMPLEMENTATION.md`, `FINALISATION_HANDOVER_2026-09-17.md`), then views/services/serializers/listing_policy/tasks/urls, the whole ethical app, tests (existence + scope, not re-run), celery, Stripe wiring (searched, none found), Next + Expo screens, Vite check.
- GitHub calls: 146, all strictly sequential, 9 s apart, one at a time. No real 429. One false-positive stop (settings constant `EMAIL_TASK_RATE_LIMIT` matched by the detector inside a successfully downloaded file) — detector fixed, file usable, no finding rests on it.
- Do not raise a PR and do not change code during Grill Me — documentation and decisions only (Issue #250 scope freeze).


---

## Added 2026-11-21: waiting owner decisions (review of PR #267)

Evidence refs: `pr257:` = `origin/agent/pr257-int` at `21add924` (Expo app + newest backend), `main:` = `origin/main` at `8ccf8f77` (web as deployed). Each question is asked once, recommendation first. Source: the orchestrator's waiting-decision list of 21 Nov (items W-01 to W-17, mapped in [`../OWNER_GRILL.md`](../OWNER_GRILL.md) section 3).

### GM-21-W01: Which marketplace switches are on at launch? (W-04, D166)
**Scenario:** Ali wants to list spare stock at launch. Nadia wants to contact him. Tom wants to apply for ethical marketplace access.
**What happens today:** Goods browsing and the master write switch default on. Separate switches default off for new goods listings, contact, commitments, escalation and catalogue lookup. Ethical access applications default on. Ethical private browsing, inventory, transfers, escalation and S8 default off (`pr257:backend/core/settings.py:235`, `:251`).
**Recommendation first: A.** Launch goods browsing and keep ethical access applications open. Wait to enable trading until the relevant launch gates pass.
- **A (recommended):** Ali and Nadia can browse goods only. Tom can apply for ethical access. Private ethical browsing and trading stay off.
- **B:** Ali can list goods and Nadia can contact him. Goods commitments, escalation and catalogue lookup stay off. Ethical access stays as in A.
- **C:** Ali and Nadia also get goods commitments, escalation and catalogue lookup. Enable ethical private browsing, inventory, transfers, escalation and S8 after their release gates pass.
- **DEFER:** Decide within LAUNCH-01.

**Engineering: see BL-07.** The listing editor should explain when new listings are closed.
**Status:** OPEN (ask together with LAUNCH-01)
