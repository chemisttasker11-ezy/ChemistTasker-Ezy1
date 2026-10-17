# ChemistTasker Shift Journey — Owner Decision Register

**Evidence status:** Owner answers recorded in this conversation on 17 October 2026. **Base:** PR #182 stacked on PR #181 head `9d1c6b760fcb3bb4e43215d03e37e0aacf047af3`. This is a product-decision register, **not executable acceptance evidence**. PR #181 must remain unchanged, and GitHub CI troubleshooting is deferred by owner instruction.

## Interpretation conventions

- **APPROVED**: explicitly selected by owner; implement in the responsible domain with role/financial guards and tests.
- **APPROVED DIRECTION / DETAIL REQUIRED**: intent confirmed, but thresholds, permission flags, legal terms, or transition order still need a separate answer. Do not silently supply defaults.
- **SOURCE MISMATCH**: current source does not yet enforce the accepted decision; a documented implementation task, not a claim it has been fixed.
- The *internal roster*, *community vacancy*, *favourites notification*, *owner-chain*, *organisation-chain*, *public job board* and *direct/dedicated offer* are distinct product contexts. Their signals cannot be inferred from a single `Shift.visibility` value.
- **Publication versus release**: allowing a worker to share a cover request with eligible peers **does not** remove their original assignment. Only the manager's approved release/reassignment or a confirmed eligible replacement under an agreed approved workflow can release them. Preserve existing audit, payroll, privacy and timetable authority.
- **Posting audience versus notification (owner clarified E01A/E01B)**: higher-tier publication **accumulates eligible visibility** from earlier tiers; e.g. at ORG_CHAIN, eligible own-pharmacy staff, pharmacy favourites/locums, owner-chain workers and organisation workers retain their respective discovery channels. The owner may opt **not** to email/notify prior audiences, but doing so never revokes their discovery access. There is no organisation-worker broadcast notification. Posting public and anonymous uses existing public privacy redaction and remains a separate option.
- **Source-of-booking for penalties**: the owner prioritises audience/source of acquisition, not one uniform contract-based external penalty. Snapshot actual worker discovery/booking source and attribution during the accepted engagement, **not merely the shift's latest escalation level**; employment rules and enforceable agreed terms remain separate prerequisites for any charge.

## Existing foundational decisions (do not re-ask)

| ID | Owner answer | Binding outcome | Status |
|---|---|---|---|
| D01 | C | External worker acceptance creates a time-limited reservation; only verified booking payment confirms the assigned engagement | APPROVED |
| D02 | D → generous | At acceptance: >48h start → 24h pay; 12–48h → 6h; 2–12h → 2h; <=2h → 30min; cap to start | APPROVED |
| D03 | B | Unpaid reservation expiry releases to **same existing audience** with manager and worker notices; do not automatically escalate or penalise | APPROVED |
| D04 | A with note | Owner/authorised managers may cancel subject to guards. Staff can request cover/swap/cancellation, retaining assignment until approved/replaced. Direct-cancellation exception conditions unresolved | APPROVED DIRECTION / DETAIL REQUIRED |
| D05 | C | One occurrence, selected dates, or whole posting supported in approved cancellation design; preserve other dates and histories | APPROVED |

## Round 2 — owner answers explicitly received

| ID | Selection | Owner's actual explanation | Canonical interpretation | Status |
|---|---|---|---|---|
| **R01** | **A** | None | **Internal roster is for active employed pharmacy staff only (FT/PT/casual)**. External locums/favourites must follow the applicable shift engagement/offer workflow, not be directly roster-published as employees. | APPROVED |
| **R04** | **A** | “Also we have swap and cover request in our logic that staff member can ask swap and cover and this feature publishing is decided via the owner if they can publish it directly or manager has to do it. Any way no release until manager decide or fulfilled. For public audiancefrom the platform, need to give reason and notification and manager approves if there enough window to act” | (1) Worker may initiate swap/cover and, **if owner enables** it, may initiate outward **cover visibility**, otherwise manager controls publication; (2) no premature assignment release—manager decision or properly fulfilled replacement first; (3) for a platform-public shift worker cancellation, require reason/notification and manager-approval guard when adequate notice remains. **Configuration UI/storage, exact 'fulfilled' rule and 'enough window' threshold are not yet agreed.** | APPROVED DIRECTION / DETAIL REQUIRED |
| **R06** | **A** | None | If internal cover is opened as a vacancy, **keep the same Shift/Slot** represented as uncovered/needs cover on manager/employee roster with a link to the vacancy; do not duplicate or delete the original roster occurrence. | APPROVED |
| **E01** | **A** | “Also the owner can skip tiers, by not notifying and also posting anonymous to public” | Default available eligible tiers follow staff → locum/favourites community → owner-chain → organisation-chain → public. **Superseded clarification:** Owner can begin at a later eligible tier while earlier eligible groups **still retain visibility through their own channels**. A skipped notification is **not** skipped access. Owner may omit notices to pharmacy staff, favourites or chain members, and post **anonymously** to public, subject to privacy/quota controls. Organisation workers cannot be notified through an organisation broadcast. | APPROVED DIRECTION / DETAIL REQUIRED |
| **E03** | **A** | None | On posted vacancies the owner selects the escalation time interval(s) at posting time. These must be persisted/reviewable, obey allowed-tier/publishing rules and not allow roster publication itself to trigger escalation. | APPROVED |
| **P02** | **B** | None | **Audience where worker was sourced** (favourites, owner chain, organisation chain, public) is the primary axis for cancellation *warning/penalty policy*. Preserve worker's employment/contract classification separately and never charge an employee or external worker without a lawful, disclosed, agreed basis. | APPROVED DIRECTION / DETAIL REQUIRED |

### Specific source-to-decision mismatches to resolve surgically

| Scenario | Current source evidence | Gap/test |
|---|---|---|
| Owner-controlled *worker-initiated cover publication* | `workforce/roster/worker_actions.py:submit_cover_request` saves `PENDING` while retaining assignment. `shifts/worker_requests.py:approve` currently hands approved cover to `LOCUM_CASUAL`; `workforce/roster/v2_views.py` separately exposes manager release with selected `escalate_to_visibility` | Need owner-editable permission by pharmacy (possibly staff role), safe worker-visible **provisional cover advertisement** semantics, and manager/fulfilled release gate. Do not automatically release on request. |
| On public-platform work, cancellation reason and manager-approval notice guard | No dedicated approved external cancellation transition in current `shifts` domain | Require reason, truthful notices and manager-approved timing path when 'enough lead time'; urgent/emergency path and numeric window are not decided. |
| R06 same roster occurrence linked to vacancy | `workforce/roster/worker_actions.py:release_worker_from_assignment` reuses Shift/Slot, but removes assignment. `workforce/roster/views.py:escalate` can remove all assignments on an explicit visibility change | Do not treat a blanket roster shift escalation as safe release; preserve occurrence and make linked uncovered state explicit across roster/marketplace. |
| E01 'skip' and anonymity independence | `shifts/posting.py` accepts an eligible chosen `visibility`; `shifts/announcements.py` has separate notify booleans; `post_anonymously` affects outbound announcements | Verify UI allows tier skip and independent notification selection; privacy test anonymous PLATFORM public details; do not represent 'no email sent' as a shift hidden from a tier. |
| E03 owner-defined schedule | `shifts/models.py` has per-tier `escalate_to_*` timestamps; `shifts/escalation.py` processes due tier; internal roster excluded via `shifts/distribution.py` | Verify interval ownership/UI, skip-tier semantics, race with interest/booking, and exact-head Django/PostgreSQL/web/Expo acceptance. |
| P02 audience-primary policy | `billing/views.py:charge_penalty` uses one generic 10%/20% expected wage formula; `Shift.visibility` changes as shifts escalate | **Do not activate a new penalty formula.** Define source attribution (where *this worker* saw/accepted) and actor/channel/time/contract matrix first; distinguish warning, platform charge, external cancellation term, compensation and wage. |

## Safety and pending follow-up

No new automatic penalties, forced employee wage deductions, refund/credit, release of accepted worker, or unreviewed public publication is approved merely by R01/R04/R06/E01/E03/P02.

**Unresolved targeted clarifications to interview soon:**
1. Who can set the per-pharmacy self-publication permission, and is it employee-level or role-wide? Does "publish directly" reveal the uncovered slot before manager approval while incumbent is still assigned?
2. What exactly counts as “fulfilled” replacement—eligible worker applies, agrees, accepts with payment confirmed where applicable, or manager manually validates?
3. Does the platform-public cancellation approval window vary with shift proximity? Which action is permitted outside that window (emergency/support override, provisional cancellation, or worker self-cancel with warning)?
4. **Resolved (E01A/E01B):** preserve existing notification choices; they never restrict visibility. A shift at ORG_CHAIN remains discoverable to eligible pharmacy staff, favourites, owner-chain and organisation workers. No organisation broadcast exists. No new notification-setting UI is requested.
5. For P02, what is the stable attribution when a shift was first shown to favourites, escalated to public, but the accepting worker was already a favourite? Freeze at candidate engagement/offer confirmation, before later escalation, and ask owner to decide precedence.

## Verification

Exact-head runtime QA and GitHub CI checks are **not claimed**. This PR remains **draft and not merge-ready**; PR #181 remains unchanged.

## Round 3 — explicit six owner decisions (17 October 2026)

Owner message received verbatim:
- `R04A=A`; explanation: None.
- `R04B=C`; explanation: None.
- `R04C=A`; explanation: None.
- `E01A=OTHER`; explanation: "It is already built as notifying or not notifying previous tiers and posting anonymous. So publishing on org, the pharmacy staff, fav locum, chain workers can still see it via their own channels but the only difference is the owner send them notification and email or not. Org workers can't notified any way."
- `E01B=OTHER`; explanation: "Keep the existing behaviour as i explained".
- `R04D=A`; explanation: None.

| ID | Approved decision | Required code/QA boundary |
|---|---|---|
| **R04A=A** | Owner sets the staff-initiated cover publication permission **per pharmacy**, not per worker or role. | Configuration owned by pharmacy/roster permissions. No default grant invented; roster worker requests still preserve assignment. |
| **R04B=C** | Workers may **invite named, eligible colleagues** to cover; a manager must approve widening a vacancy to favourites or public. | This is not immediate marketplace publication or automatic release. `request_direct_swap` currently records a worker-selected target but must additionally confirm target acceptance before manager transfers (R04C). |
| **R04C=A** | Replacement is fulfilled only when target **accepts**, meets role/eligibility/conflict checks, and the authorised manager **approves transfer**. | Add explicit target acceptance proof before release. Existing `approve_direct_swap` and `approve_cover_replacement` require review: they validate and manager-approve, but acceptance evidence is not established in inspected code. Do not silently switch assignment. |
| **E01A=OTHER** | Keep the existing **cumulative discovery** model; at organisation-tier publication, eligible own pharmacy staff, pharmacy favourite locums, owner-chain workers and organisation workers may still find the shift through **their own existing channels**. Owners control *whether to notify* previous audiences, NOT their access. Anonymous public posting remains available. | `CommunityShiftViewSet.get_queryset` currently tests `visibility='ORG_CHAIN'` only for org membership: update it to retain prior eligible audiences. Do not introduce new tier-skip filters. |
| **E01B=OTHER** | **Keep existing staff/favourite/chain notification flags and anonymous-posting behaviour.** Organisation workers **do not receive an organisation-targeted notification**, even though they may discover an org-visible shift. | `announce_posted_shift` already offers `notify_pharmacy_staff`, `notify_favorite_staff`, `notify_chain_members`, but no `notify_org_members`; do not add a separate org broadcast. Verify that a skipped notification never hides a shift. |
| **R04D=A** | **Public-platform worker cancellation always requires manager approval.** As start approaches, use **emergency escalation**, reason and notifications; there is no automatic self-cancellation rule created by a short deadline. | Exact emergency timings, recipient and escalation SLA remain decisions in the next warning/penalty interview. Worker remains assigned until authorised approval/fulfilled replacement. |

### Resolution and correction of earlier E01 interpretations

An earlier register phrase "skip tiers/start at later tier" was misleading when read as hiding the shift from previous audiences. **The owner's latest explanation governs:** publication to a wider eligible audience does not revoke visibility of earlier eligible audiences. The only user-configured skips mentioned are **notifications** (and the existing choice of initial eligible visibility), not exclusion lists. When `post_anonymously=True` in public, preserve existing identity redaction; public visibility of internal channels under anonymity needs a separate privacy test and must not be guessed.

### Pending implementation

1. Correct cumulative `ORG_CHAIN` (and where applicable `OWNER_CHAIN`/`PLATFORM`) discovery without expanding to unrelated tenants or leaking anonymous details. Include view-query tests and a notification-disabled still-visible test.
2. Preserve existing notification selectors and absence of organisation broadcast; no new toggles or emails.
3. Implement per-pharmacy owner approval of named-worker cover invitations only after verifying suitable persisted permission configuration and consent. No immediate assignment release.
4. Add explicit target-acceptance evidence before manager transfer, then end-to-end role/overlap/attendance/roster tests; do not accidentally invalidate established roster operations.
5. Emergency public cancellation requires manual manager approval; do not invent cutoff, fee or auto-termination.
6. Continue D06–D15 and audience-specific penalties separately. No charges, refunds or punitive actions without approved thresholds, contract/legal safeguards and tests.

**Branch policy:** PR #182 only; PR #181 unchanged. GitHub CI deliberately deferred until the later testing phase, not counted green.
