# PR #200 — senior full-stack, product, and UX gap verdicts

Audit: 25 October 2026, Brisbane. Frozen remote main baseline: b77e9fd296bc2710350ef6f3cd402ce2529ffc06 (main was reconfirmed at this commit). Owner direction: IDENTIFY GAPS ONLY; no application fixes, merges, or deployments.

## Audit outcome — distinguish evidence from assurance

- PR200 Read-Only Source Audit run: https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/actions/runs/40129505623 — **SUCCESS** at scanner SHA 1d655a007dc49c219bc39d16f981afed1d4b6edc.
- **2,149/2,149 source files inherited from frozen main fully read, Git-blob-hash checked and static-scanned; 2,150/2,150 including the added scanner script** (100% automated complete-file inspection). No read errors or Git hash mismatches. Python AST parse 776 passed, 0 failed.
- The per-file evidence ledger is evidence/MAIN_RELEASE_SOURCE_COVERAGE.csv. All signature hits and matched lines are in evidence/MAIN_RELEASE_STATIC_FLAGS.csv; machine-readable totals in evidence/MAIN_RELEASE_AUTOMATED_STATIC_AUDIT.json. **284 distinct files had scanner signatures, NOT 284 bugs.**
- 22 files were previously source-triaged to support B01–B23. **0 independently manually/semantically certified files**, 0 reproduced exploitation paths, 0 implemented fixes, 0 of the 23 issues proven green by negative-and-positive runtime regression. Automated static coverage does NOT equal production verification.
- This is a **completed static source inventory and review-signal audit**, not 99% verified application logic or approved real-user launch.

## Gap verdicts — 23 existing source findings

Confidence legend: D = direct observable mismatch in source (still NOT a reproduced exploit); C = conditional runtime-risk scenario; P = owner product-policy decision. The detailed code-line evidence for every ID is in MAIN_RELEASE_AUDIT_EVIDENCE.md and the owning-module links are in MAIN_RELEASE_AUDIT_TRACKER.md.

| ID | Impact | Confidence | Senior finding / affected journey |
| --- | --- | --- | --- |
| B01 | P0 | D | Active subscriber flag calculated but standard Stripe checkout price selected: potential overcharge |
| B02 | P1 | D | Previously purchased extra staff seats cannot be subsequently adjusted through existing endpoint |
| B03 | P0 | D | Staff membership deletion cascades authored chat messages: history and auditability lost |
| B04 | P0 | D | Fulfillment checkout can have no selected offers or slots, charging quantity one without a specific unpaid obligation |
| B05 | P1 | C | Room WebSocket caches participant membership; active connection may remain capable after membership revocation |
| B06 | P0 | D | Organization calendar feed aggregates sibling-pharmacy work notes beyond effective viewer scope |
| B07 | P0 | D | Region Admin roster capability is not intersected with assigned pharmacy scope for calendar writes |
| B08 | P1 | D | Region Admin shift notices fan out to all regional admins of an organization regardless of pharmacy |
| B09 | P1 | D | Scheduled shift escalation is triggered during shift query reads; source search found no independent scheduled invocation |
| B10 | P0 | D | Multi-offer Pills loop reuses one shift-wide idempotency key, with uncertain concurrent settlement correctness |
| B11 | P1 | C | Accepted-awaiting-payment offers are not targeted by the reviewed PENDING-only expiry transition |
| B12 | P1 | D | Rating submission checks assignment existence, even if future; pending list itself filters past work |
| B13 | P1 | C | Account deletion anonymizes and revokes sessions without proven future-booking handover/release |
| B14 | P0 | D | Shift casual pharmacist weekday rate uses $47.68 versus current July 2026 award $52.18; holiday data stops in 2026 |
| B15 | P0 | D | Cancellation-payment webhook may finalize waiting offers; payment-kind guard is missing on common success path |
| B16 | P0 | D | PharmacyAdmin generic update lacks target-management authorization and exposes identity/scope fields |
| B17 | P0 | D | Chain serializer accepts pharmacy IDs globally, bypassing specialized add-pharmacy tenant validation |
| B18 | P0 | D | Claim PUT inherited from UpdateModelMixin does not use owner-only PATCH workflow |
| B19 | P0 | D | Invitation link can be retargeted by generic update; deleting it may cascade old applications |
| B20 | P1 | D | Interest/rejection generic update can rewrite shift FK despite self-owned queryset |
| B21 | P0 | D | Cover request pharmacy and linked assignment can differ; manager approval acts on linked assignment |
| B22 | P0 | D | Organization poll list includes pharmacy-private polls, unlike explicitly organization-scoped hub posts |
| B23 | P0 | P+D | Chief Admin included in organization-record update/delete, contrary to agreed owner/Org Admin-only policy |

These priorities are *triage impact estimates*, not severity proven by exploitation. Source inspection and existing characterization tests do not prove a specific forbidden request succeeds. For any launch decision, verify both denied and permitted behavior with two organizations, two pharmacies and all personas.

## Additional conditional policy gap (P01; do not silently expand blocker count)

Source backend/billing/views.py (charge_penalty, approx. lines 716–758) charges 0% >72h, 10% at 24–72h and 20% <=24h including after shift commencement. The separately accepted shift-lifecycle proposal has 0%, 10%, 15%, 20%, 25%, 30% tiers across progressively later cancellation windows. **The current implementation and proposed future policy differ.** PR #182 remains independent and unmerged; the owner must choose rollout scope before this is elevated to a release blocker. No change is made here.

## Verified external award/calendar discrepancy

- backend/shifts/data/award_rates_casual_first_level.json: pharmacist casual ordinary weekday 47.68; backend/workforce/award_rates.py carries July 2026 52.18.
- Official Pharmacy Industry Award MA000012, Schedule B.2, effective 1 July 2026: casual adult pharmacist ordinary weekday $52.18. https://awards.fairwork.gov.au/MA000012.html
- backend/shifts/data/public_holidays.json has only 2026 dates; QLD Government publishes 2027 holidays. https://www.qld.gov.au/recreation/travel/holidays/public
- The audited rate path uses the older JSON. Verify effective-date behavior for state, employment type and role before determining monetary impact.

## Static false positives explicitly triaged

- Next article-detail JSON-LD uses dangerouslySetInnerHTML but JSON.stringify output escapes the less-than character. Scanner hit alone is not proof of XSS.
- Vite and migrated Next tokenService use localStorage for removal of legacy tokens while new browser tokens are in memory; scanner hit alone does not prove persistent refresh-token storage.
- Kiosk AllowAny endpoints rely on pairing codes / signed device credentials inside handlers. They still need device regression tests, but a public DRF permission declaration does not prove an attendance bypass.
- Evaluation, raw-SQL, upload, role and direct-transport signatures are a review queue, not 284 additional high-impact defects; every new severity claim needs an actual call path and effect.

## Separate release and UX verification gaps

| Gate | Evidence as inspected | Incomplete proof |
| --- | --- | --- |
| PR200 full-source static scanner | Run 40129505623 SUCCESS, 2150/2150, Python AST 776 pass | Does not validate business semantics |
| Shared-core, architecture, Vite, Next | Shared Core Consolidation run 40129508976: architecture/boundary/shared-core/Vite/Next job results PASS as inspected | End-to-end multi-persona logic not established |
| Mobile dependency security | Same run mobile job FAILS on fast-uri advisory GHSA-w74x-v6f9-j3xg | Advisory impact/fixed-version check and green job still missing |
| Backend, PostgreSQL, Windows kiosk | Jobs initially in progress when reviewed | Need completed counts per job on exact head |
| iOS native | iOS Native Repair Acceptance SKIPPED | Simulator / signed real-device acceptance not established |
| Main full isolated QA | Run 40019714397 PASSED on main baseline | Historical main pass, not permission-negative / final PR head |
| Main Staging QA | Run 40019714320 FAILED due HEAD^ shallow-history comparison issue | Unreliable boundary verification on staging baseline |
| Authenticated browser and UX | Manual frontend E2E workflow has frontend path filter and did not run on docs-only audit PR | No on-head screenshots or 390/1440 light/dark signoff, Vite to Next transitions, mobile navigation |
| Financial and persona negative cases | No new B01–B23 targeted fixture artifacts | Multi-offer, expiry, Stripe replay, role denial and two-tenant data isolation unverified |
| Mobile release readiness | RELEASE_CHECKLIST.md items remain unchecked | API keys, push, login persistence, signed builds and physical devices unverified |

### User and UX journey gaps to observe, not asserted visual defects

1. Organization onboarding, staff invitations and editable role controls vs backend authority (B16–B19, B23).
2. Calendar and hub privacy across two sibling pharmacies and two organizations (B06–B07, B22).
3. Shift offer, payment, reservation, cancellation, notification and escalation journeys for owner and worker; distinguish trial vs subscriber vs Pills (B01, B04, B08–B11, B15).
4. Chat history and active-socket revocation after staff removal (B03, B05); account deletion with future bookings (B13).
5. Future-shift ratings vs pending-rating UX (B12).
6. Responsive 390px/1440px Vite and Next, light/dark, role switch, Expo parity and the separate Windows kiosk; no screenshot/device results were claimed.

## Final audit verdict

**100% automated complete-file source inspection achieved on frozen main.** The 23 source-reasoned gaps plus product policy mismatch and assurance gaps are documented and independently navigable. **99% semantic/behavioral verification was NOT achieved.** This is not release approval. PR #200 should remain a **draft audit-only evidence PR**, with no application changes or implied fixes. Any future remediation and test execution requires separate scope/authorization; do not merge this audit as proof of readiness.
