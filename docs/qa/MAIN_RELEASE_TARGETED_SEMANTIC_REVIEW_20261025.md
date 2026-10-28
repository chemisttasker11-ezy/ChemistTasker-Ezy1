# Risk-targeted semantic source observations — 25 October 2026

Baseline `b77e9fd296bc2710350ef6f3cd402ce2529ffc06` and draft PR #200. This supplements first-pass chunk reports with **file-distinct evidence** and positive/negative contracts. Observations were reasoned from source call paths; no independent second agent or runtime execution is claimed. Presentation-only modules and untraced files retain S1/structural status. B/C/F issues are not automatically fixed or verified by UI affordances.

## Expo C064

**[PostComposer.tsx](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/frontend_mobile/roles/shared/hub/PostComposer.tsx#L109-L249)** — The post composer loads tags by pharmacy, organisation, or group via the shared hub API, filters the returned member list for staff employment types, normalizes attachment URIs (including native FileSystem copy) and submits create/update posts. Client filtering cannot enforce private-group membership: server Hub access/mention rules B46/B48 are the authority.

*Tests:* Negative: forged group scope/tag IDs and lost membership on submit; positive: accepted member posts and only eligible people are notified.

**[FinanceInvoiceEditor.tsx](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/frontend_mobile/roles/shared/invoices/FinanceInvoiceEditor.tsx#L180-L201)** — The canonical mobile finance editor retrieves defaults and internal shift prefill and obtains recalculation through finance.preview before finance.saveInvoice(value, initial?.id). It uses a request key, revision and error state. This differs from the legacy invoice generator and should be parity-tested against web InvoiceComposer.

*Tests:* Negative: changing invoice after optimistic preview, forged customer/source assignment, stale version; positive: correct GST/super/locked source values.

**[FinanceWorkspace.tsx](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/frontend_mobile/roles/shared/invoices/FinanceWorkspace.tsx#L29-L55)** — The new native finance workspace loads customers/items/invoices/expenses, serializes actions through running.current and displays errors. It uses finance.send(id, version), finance.markPaid and finance.superDocument, the same shared-core domain as Vite.

*Tests:* Negative: duplicate send and payment, stale version, cross-tenant received invoice, failed file sharing; positive: send once and consistent revision PDF.

**[InvoiceGenerate.tsx](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/frontend_mobile/roles/shared/invoices/InvoiceGenerate.tsx#L104-L155)** — The legacy native generator defaults superRateSnapshot to 10%; only an existing truthy onboarding snapshot overwrites it. The submitted FormData contains that figure, and backend invoicing.services computes super using the snapshot. This is newly recorded as C064-N1; current Australian SG standard is 12%.

*Tests:* Negative: new eligible worker without snapshot creates legacy 2026 invoice and displays a 10% super line; positive: explicitly lawful rate and contextual eligibility, matching actual SGR and source policy.

**[InvoiceList.tsx](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/frontend_mobile/roles/shared/invoices/InvoiceList.tsx#L48-L56)** — InvoiceList embeds the canonical FinanceWorkspace but also retains the legacy editor/list under Existing tools, so defects in the legacy invoicing API remain reachable even though the new finance UI is functional.

*Tests:* Negative: bypass finance revision restrictions via legacy actions; positive: finance-managed invoice routes back to FinanceWorkspace and legacy invoice remains readable.

## Expo C065

**[[id].tsx](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/frontend_mobile/roles/shared/messages/[id].tsx#L403-L467)** — The native direct-message view uses shared sendRoomMessageService and updates local messages with deduplicated optimistic IDs. A failed text send is merely console.error'd and leaves draft without a visible warning, unlike Vite. Attachments are separately sent through FormData; F12-N1 covers native error UX gap.

*Tests:* Negative: lose network, attempt text or file send, confirm visible failure and draft; positive: websocket or optimistic update creates a single message.

**[useLiveMessages.ts](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/frontend_mobile/roles/shared/messages/useLiveMessages.ts#L20-L93)** — The native websocket helper obtains a ticket with fetchWsTicket, maintains current callback refs and reconnects. It does not itself reauthorize group membership on every event; B05/B30 revocation requires server consumer/notification enforcement.

*Tests:* Negative: remove member while socket remains connected, assert no further private events; positive: reconnect a valid room without duplicates.

**[LocumManager.tsx](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/frontend_mobile/roles/shared/pharmacies/LocumManager.tsx#L292-L438)** — LocumManager handles multiple invitation rows, role checks, sending invitations, generating links, and deletion of membership by deleteMembershipService. Server invitation permissions and membership deletion effects are critical; this UI should not mask backend F03/B03 hazards.

*Tests:* Negative: revoked manager invitation and removal of member with historical chat/attendance; positive: owner invites permitted locum and can revoke access without deleting history.

**[MembershipApplicationReviewDialog.tsx](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/frontend_mobile/roles/shared/pharmacies/MembershipApplicationReviewDialog.tsx#L239-L306)** — The manager review dialog saves application draft then calls approveMembershipApplicationService. It relies on backend application review scope; generic ModelViewSet delete gap C012-N2 is not prevented by this normal UI.

*Tests:* Negative: forged application ID, repeated approval, approval after invitation expiry and generic DELETE; positive: authorized approval with auditable status.

**[PharmacyAdmins.tsx](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/frontend_mobile/roles/shared/pharmacies/PharmacyAdmins.tsx#L131-L169)** — The admins page creates a PharmacyAdmin through createPharmacyAdminService and deletes assignments through deletePharmacyAdminService. The admin revocation bypass F03-N1 is a backend reaccept path, not a missing button guard.

*Tests:* Negative: delete assignment then reuse historical acceptance API; positive: fresh owner invitation restores authority only after explicit grant.

## Expo C066

**[PharmacyForm.tsx](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/frontend_mobile/roles/shared/pharmacies/PharmacyForm.tsx#L520-L664)** — PharmacyForm resolves ABN, uploads verification files, creates a pharmacy using a persisted idempotency key, and updates an existing pharmacy then re-reads server state. Client choosing a pharmacy ID is not sufficient authorization; organization permission and document validation remain server gates.

*Tests:* Negative: pharmacy ID switch, duplicate create, forged ABN/file MIME; positive: verified owner maintains only authorized pharmacy without deleting prior evidence.

**[StaffManager.tsx](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/frontend_mobile/roles/shared/pharmacies/StaffManager.tsx#L319-L525)** — StaffManager checks invited user's role, builds bulk invitation payload, creates an invite link, and invokes deleteMembershipService. It crosses workforce, memberships, notification and private Hub/chat membership contexts.

*Tests:* Negative: staff role mismatch, bulk invalid tenant, duplicate/revoked invite and deletion effects; positive: accepted membership scoped to correct pharmacy.

**[PillsScreen.tsx](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/frontend_mobile/roles/shared/pills/PillsScreen.tsx#L70-L96)** — PillsScreen loads rewards balance/history/referrals concurrently and displays transaction history. Actual spend/reward idempotency must be checked in rewards backend; B10 reports shift-wide ledger key collision and C/F rewards concurrency candidates remain open.

*Tests:* Negative: two concurrent redemptions or referral claims; positive: one transaction equals one balance delta.

## Expo C067

**[index.tsx](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/frontend_mobile/roles/shared/shifts/ActiveShiftsPage/index.tsx#L119-L149)** — Poster active shift screen calls payShiftWithPills then loadShifts, or chargeShiftFulfillment and opens the Stripe checkout URL. Payment/slot lock is a server-managed lifecycle; checkout can outlive the shift if it is deleted via the same page, as F08-N3 documents.

*Tests:* Negative: delete after opening checkout; concurrent payment/offer acceptance; positive: valid paid offer finalized once with durable record.

**[useTabData.ts](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/frontend_mobile/roles/shared/shifts/ActiveShiftsPage/hooks/useTabData.ts#L20-L90)** — The tab-data hook fetches interests and per-slot member status via fetchShiftMemberStatus. F04-N1 is a backend object-scope bug affecting these member lists even if UI selects the correct visibility.

*Tests:* Negative: external authenticated worker requests FULL_PART_TIME member_status for public shift; positive: scoped manager sees only own pharmacy.

**[useShiftActions.ts](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/frontend_mobile/roles/shared/shifts/ActiveShiftsPage/hooks/useShiftActions.ts#L15-L71)** — Poster actions call shared escalateShiftService, deleteActiveShiftService and acceptShiftCandidateService. The delete call is a direct destructive endpoint, with no local check of paid assignments or attendance and is shared with Vite.

*Tests:* Negative: delete partly booked/paid or already attended shift, confirm server refusal and correct notice; positive: delete unbooked draft succeeds.

**[useCounterOffers.ts](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/frontend_mobile/roles/shared/shifts/ActiveShiftsPage/hooks/useCounterOffers.ts#L24-L83)** — Per-shift counter-offer review loads and maps offers, resolves slot ID from payload, and calls shared acceptShiftCounterOfferService or rejectShiftCounterOfferService. It must not trust offer slot/user IDs without backend ownership checks.

*Tests:* Negative: another pharmacy's offer ID and conflicting slot allocation; positive: selected offer accepted for eligible slot once.

## Expo C068

**[activeShiftRuntime.ts](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/frontend_mobile/roles/shared/shifts/ActiveShiftsPage/utils/activeShiftRuntime.ts#L71-L106)** — The runtime derives 'payment required' UI from shift.paymentStatus and awaiting-payment slot flags, using selected slot ID and pendingPaymentSlotIds. UI is only a projection and can become stale after Stripe callbacks; client must refresh based on server state.

*Tests:* Negative: stale PENDING after webhook or paid-offer failure; positive: exactly matching pending slot and offer appear.

**[CommunityShiftsView.tsx](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/frontend_mobile/roles/shared/shifts/CommunityShiftsView.tsx#L126-L173)** — CommunityShiftsView filters by workspace and selectedPharmacyId, merges fetchCommunityShifts with worker interests/rejections and passes server data to ShiftsBoard. Server scope remains authoritative; client tabs/markers can outlive account changes.

*Tests:* Negative: account switch and inappropriate internal visibility, rejections under different worker; positive: current worker's eligible shifts and offers only.

**[ConfirmedShiftsView.tsx](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/frontend_mobile/roles/shared/shifts/ConfirmedShiftsView.tsx#L40-L98)** — ConfirmedShiftsView derives scopedPharmacyId from activeAdminPharmacyId, but activeAdminPharmacyId is hard-coded null; consequently the client-side pharmacy filter is inactive even for admin personas. This may cause a selected-pharmacy UX mismatch, not proof of backend cross-tenant leakage.

*Tests:* Negative: admin with two pharmacies selects one, verify only intended shifts visible; positive: permitted multi-pharmacy overview if that's the defined UX.

**[HistoryShiftsView.tsx](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/frontend_mobile/roles/shared/shifts/HistoryShiftsView.tsx#L25-L74)** — HistoryShiftsView similarly sets activeAdminPharmacyId to null and filters returned history only if scopedPharmacyId exists, making local pharmacy scoping ineffective. User-visible scope requires checking product expectations; backend permissions must still isolate tenants.

*Tests:* Negative: site switch on history; positive: user with multiple assignments sees expected scoped view.

**[OwnerAssignedShiftBoard.tsx](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/frontend_mobile/roles/shared/shifts/OwnerAssignedShiftBoard.tsx#L196-L344)** — The assigned board shows locked slot rate, assigned worker and shift details; history mode enables rate-worker action and profile reveal on assigned slot. Profile reveal and rating permission must be enforced server-side.

*Tests:* Negative: view assignment/profile from other pharmacy or rate nonassigned worker; positive: manager views assigned staff and leaves correct rating.

## Expo C069

**[PostShiftScreen.tsx](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/frontend_mobile/roles/shared/shifts/PostShiftScreen.tsx#L727-L781)** — Native poster expands recurring slot dates, reconciles per-slot rate rows and calls calculateShiftRates for non-PHARMACIST_PROVIDED rates. Final builder uses shared-core postingDraft. An authorized UI pharmacy selection does not neutralize F04-N2 backend writable pharmacy/payment state during later edits.

*Tests:* Negative: forged pharmacy/pay state, stale rate callback, recurring date boundaries; positive: same draft payload as Vite for identical days and visibility.

**[PostShiftVisibilityStep.tsx](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/frontend_mobile/roles/shared/shifts/PostShiftVisibilityStep.tsx#L58-L177)** — Visibility step selects starting audience and optional notifications separately, supports anonymous posting, and configures escalation timers. Backend must enforce the selected audience and notification obligations; B09 says escalation may omit audience notifications.

*Tests:* Negative: force restricted tier or unauthorized anonymous flag; positive: explicitly chosen audience and notifications reach intended recipients only.

**[PublicShiftsView.tsx](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/frontend_mobile/roles/shared/shifts/PublicShiftsView.tsx#L146-L236)** — PublicShiftsView fetches public shifts plus the current worker's interests, loads onboarding verification and guides payment profile setup. UI verification/qualification checks are advisory: backend must refuse blocked worker applications.

*Tests:* Negative: unverified worker and stale onboarding, direct application to hidden shift; positive: verified worker can apply and see server response.

**[CounterOfferDialog.tsx](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/frontend_mobile/roles/shared/shifts/ShiftsBoard/components/CounterOfferDialog.tsx#L90-L160)** — Counter-offer dialog collects per-slot proposed rates and optional travel location with Google autocomplete. Shared-core submitShiftCounterOfferService serializes those values. Validate date, numerical cap and authorized shift/slot server-side.

*Tests:* Negative: forged slot, malformed rate, time span across midnight, unreachable Google API; positive: valid dated slot and travel request.

## Expo C070

**[useShiftPersistence.ts](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/frontend_mobile/roles/shared/shifts/ShiftsBoard/hooks/useShiftPersistence.ts#L59-L158)** — Hydrates and persists applied, rejected and saved markers to device-global AsyncStorage keys without user ID. Account switch can surface prior account state, especially before fresh parent props hydrate. Source supports the C070-N1 cached-state isolation candidate.

*Tests:* Negative: worker A marks shifts then logs out, worker B signs in same device; positive: each worker sees only own server state.

**[useCounterOffers.ts](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/frontend_mobile/roles/shared/shifts/ShiftsBoard/hooks/useCounterOffers.ts#L104-L245)** — Counter-offer hook persists globally under counter_offer_map and fetches offers serially per listed shift ID. It filters own offers by currentUserId for display, but backend must filter; compared with Vite batch, this scales to N requests for N visible shifts.

*Tests:* Negative: switch worker account, list 50 shifts and measure requests, forged user ID; positive: same offer list as Vite batch.

**[constants.ts](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/frontend_mobile/roles/shared/shifts/ShiftsBoard/constants.ts#L6-L11)** — All six AsyncStorage marker keys are global literals, including saved/applied/rejected shifts and counter_offer_map. Expo does not namespace by session user; Vite only namespaces saved markers, Next migrated not even saved. This extends C070-N1 parity scope.

*Tests:* Negative: same-device multiple-account tab switching; positive: namespace by user ID, clear on sign-out.

## Vite C046

**[useCounterOffers.ts](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/frontend_web/src/pages/dashboard/sidebar/ShiftsBoard/hooks/useCounterOffers.ts#L180-L242)** — Vite batches offered-shift IDs into one shared-core counter-offers batch API, filters returned offers to currentUserId and reconciles persisted badge state. Server must enforce query and shift audience boundaries; F04 object scope remains open.

*Tests:* Negative: query unrelated shift IDs; positive: same own slot map as Expo but fewer requests.

**[useShiftPersistence.ts](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/frontend_web/src/pages/dashboard/sidebar/ShiftsBoard/hooks/useShiftPersistence.ts#L40-L156)** — Vite adds userId only to saved shift key, but applied/rejected markers remain generic global keys; UI also reconciles to server prop IDs. Account switch in same browser may momentarily show old markers; session storage clear in Next browser-session mitigates some cases.

*Tests:* Negative: use two accounts in same tab with page restored while API unavailable; positive: scoped state resets.

## Vite C048

**[ChatPage.tsx](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/frontend_web/src/pages/dashboard/sidebar/chat/ChatPage.tsx#L571-L590)** — ChatPage sends text/attachment through shared sendRoomMessageService and relies on socket event to render result, avoiding double insertion. Composer retains drafts on failure. Backend chat member checks are critical on websocket and POST; B51/B05 remain.

*Tests:* Negative: revoked membership sending after websocket kept alive; positive: one message event and visible send failure.

**[MessageComposer.tsx](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/frontend_web/src/pages/dashboard/sidebar/chat/MessageComposer.tsx#L166-L185)** — Composer awaits onSendText/onSendAttachment, clears draft only on promise success, sets visible sendError on failure, unlike native direct message. This is a confirmed UI divergence but S3 device test remains outstanding.

*Tests:* Negative: failed network request; positive: retry preserves attached file/draft.

## Next C073

**[route.ts](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/frontend_web/landing_next/app/api/[...path]/route.ts#L1-L9)** — Same-origin canonical /api/v1 facade rejects other first path components and forwards through platformProxy. This route itself does not perform Django object authorization. Endpoint checks belong to backend.

*Tests:* Negative: non-v1 root and ../ path; positive: authorized canonical request with cookie and CSRF.

**[route.ts](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/frontend_web/landing_next/app/api/hub/[...path]/route.ts#L1-L14)** — Hub BFF maps /session GET, POST and DELETE to current-user, login and logout; other hub paths forward to public-hub prefix through platformProxy, optionally using HUB_API_URL. Backend remains source of authentication and content permission.

*Tests:* Negative: forged origin/CSRF or private post access; positive: same authentication status as Vite.

**[marketplace-item.tsx](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/frontend_web/landing_next/app/(public)/marketplace/items/[id]/[slug]/marketplace-item.tsx#L19-L43)** — The item view fetches approved public listing and user marketplace access; enquiry submits client_request_id UUID with chosen buying_pharmacy. Client dropdown restricts eligible pharmacy but backend must enforce it; concurrent identical enquiries remain C011-N1.

*Tests:* Negative: edit buying_pharmacy manually and replay same request ID concurrently; positive: one verified enquiry in permitted pharmacy.

## Next C074

**[ethical-workspace-v2.tsx](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/frontend_web/landing_next/features/marketplace/ethical-workspace-v2.tsx#L18-L87)** — Ethical workspace obtains access contexts and selected pharmacy, then fetches private lots/transfers/listings in that context. UI gates owner-specific actions but cannot stop forged API calls, thus C010-N1 and F10-N4 server bugs remain release-critical.

*Tests:* Negative: client modifies pharmacy ID and stage/product in draft; positive: isolated private data per admitted pharmacy.

**[engine.ts](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/frontend_web/landing_next/features/paediatric-calculator/lib/engine.ts#L28-L48)** — Dose engine applies age/weight/specialist/category blockers and dose caps before numeric results; routine regimens still render from unvalidated source transcriptions. Public release decision and pharmacist signoff required, no proof of specific wrong calculation.

*Tests:* Negative: neonatal, older child, contraindication flags, extreme capped dose; positive: independently validated regimen and formulation yields correct value.

**[calculator.tsx](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/frontend_web/landing_next/features/paediatric-calculator/components/calculator.tsx#L27-L49)** — Calculator is client-side and renders mg/mL for routine cases; UI banner explicitly says clinical validation pending, which is not a production gate. The route is public. Release-governance P1 condition already recorded in MAIN_RELEASE_NEXT_CALCULATOR_BOUNDARY_REVIEW_20261025.md.

*Tests:* Negative: unauthenticated user with valid age/weight receives unvalidated numbers; positive: clinically signed-on clinical tool restricted or not released.

## Next C076

**[useCounterOffers.ts](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/frontend_web/landing_next/migrated/pages/dashboard/sidebar/ShiftsBoard/hooks/useCounterOffers.ts#L180-L239)** — Migrated Next counter-offer hook uses per-shift fetchShiftCounterOffersService, unlike Vite batch API, with local identity filtering. Browser performance and parity must be benchmarked, and backend must still authorize response.

*Tests:* Negative: cross-tenant shift query, 50+ shifts and user switch; positive: same current-user offer state as Vite.

## Next C077

**[session-provider.tsx](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/frontend_web/landing_next/shared/session-provider.tsx#L7-L16)** — Next shared session provider uses a request generation counter for reload and ignores stale asynchronous profile results. Logout event increments generation and clears user/status. This is stronger than Expo's unguarded post-await refresh path.

*Tests:* Negative: simultaneous refresh and logout in two tabs; positive: session remains anonymous and no prior user is restored.

**[browser-session.ts](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/frontend_web/landing_next/shared/browser-session.ts#L4-L44)** — Next/browser shared session storage clear on logout, claim a user-owner storage marker and allow only user-scoped saved_shift_ids:<id> to survive cross-login. Migrated Next ShiftBoard still reads unscoped saved_shift_ids, which is not whitelisted and is deleted upon session changes.

*Tests:* Negative: refresh session amid logout; positive: user A's scoped saved IDs retained without exposing to user B.

**[tokenService.ts](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/frontend_web/landing_next/migrated/utils/tokenService.ts#L41-L117)** — Migrated tokenService leaves browser refresh token in HttpOnly-cookie flow and memory bearer, does not persist refresh credentials in JS-readable storage, and listens for signout. The shared browser-session refresh lock serializes cookie rotation.

*Tests:* Negative: token refresh race, external origin, logout with refresh pending; positive: HttpOnly session and auth generation preserved.

## Release gates and accounting

- 7 F12 actions have source comparisons in `out_F12.json`; no executed browser/native or PostgreSQL/Stripe tests in this continuation.
- 3 P0 candidates remain CONFIRMED_SOURCE independently in VERIFIED.json, NOT S3 reproduced.
- New legacy Expo super default C064-N1 and native chat send failure F12-N1 are unconfirmed P1/P2 respectively; both have negative/positive contracts.
- C016-N2 ordinary Hub group PATCH cross-tenant claim refuted for the cited serializer path. Preserve historical ID but exclude from active blockers.
- All earlier 2,151 file paths remain accounted for; this document does not inflate independently defensible 99% S2.
