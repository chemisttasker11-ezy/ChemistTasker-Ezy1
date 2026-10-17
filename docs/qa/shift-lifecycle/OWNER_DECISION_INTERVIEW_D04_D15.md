# ChemistTasker shift lifecycle — owner decision interview, complete edition

**Prepared:** 17 October 2026 · **Branch:** PR #182 on PR #181, exact parent `9d1c6b760fcb3bb4e43215d03e37e0aacf047af3`. **Status: QUESTIONS, NOT APPROVED RULES.** Avoid editing PR #181 or deploying/merging any new cancellation or fee policy before acceptance.

## What the repository already establishes

1. The operational roster is owned by `workforce/roster`: reviewed period publication, whole-week/individual unpublish, staff swaps, cover requests and manager-authorised releases. A worker's cover request **does not** automatically remove their assignment.
2. The shifts marketplace owns posting/interest/offers/escalation through `FULL_PART_TIME → LOCUM_CASUAL → [OWNER_CHAIN] → [ORG_CHAIN] → PLATFORM`, skipping missing tiers. A favourite **notification list** is not a visibility tier. A private/dedicated offer cannot widen automatically.
3. `billing/views.py:charge_penalty` currently offers Stripe checkout at **10% of expected assignment wages within 72 hours and 20% within 24 hours**, using the earliest start on the shift. It does **not** distinguish employee vs external worker or public vs chain/organisation/favourite acquisition. This must **NOT** silently become the approved business policy.
4. `workforce/roster/views.py:escalate` can clear assignments when explicitly widening a roster-managed shift. Review this separately as a handoff that may have consequences; it is **not** the same as marketplace time-based auto escalation.
5. An existing cover-request approval endpoint currently chooses `LOCUM_CASUAL` as the handoff audience; this is an implementation detail to scrutinise against the owner's choices, not a universal authority to publish publicly.
6. D01=C, D02=generous (24h/6h/2h/30min capped at start), D03=B, D04=A with worker-request retention, and D05=C are **already owner-approved**. Do not re-ask them. The new phrase "both can cancel with guards" requires explicit agreement about **direct external self-cancellation versus request+approval**, not a silent reversal.
7. Australian employee deductions are legally restricted: never create an automatic wage deduction or force employees to pay cancellation charges based on this decision sheet. Separate warnings from contractual locum cancellation fees and platform booking-charge settlement; obtain appropriate Australian employment and contract legal review.

## The dimensions that MUST stay distinct

| Dimension | Examples | Why |
|---|---|---|
| Origin/owner | internal roster, independently posted community vacancy, private dedicated booking, marketplace vacancy | Publication and approval authority differ |
| Audience reached | staff, favourite outreach, owner chain, organisation, public | Privacy and communication differ; favourites is not an escalation tier |
| Worker's **contract** | employed FT/PT/casual, external ABN locum, TFN engagement, Shift Hero | Wage, invoice and legal basis differ |
| Cancellation actor | pharmacy, worker, support, mutual | Consequences and responsibility differ |
| State | unadvertised, advertised, interested, pending offer, reserved/unpaid, confirmed/paid, started, completed | A warning/charge cannot be computed on publicity alone |
| Time window | days to start, short notice, during shift, after shift | Guards and notice requirements differ |
| Occurrence scope | one slot+date, selected dates, entire recurring series | Never silently change unaffected dates |
| Money type | booking fee, worker compensation, wage/payroll, platform penalty, reimbursement, refund/credit | Must remain separate idempotent ledgers |

## How to answer

**Use `ID=A/B/C/D` and add your own explanation beside it.** Every question below includes a dedicated notes space. The letters represent design options, not recommendations or approvals. `OTHER` and a full written policy are always valid. Questions may be answered in multiple batches; any unanswered choice remains `DECISION_REQUIRED`.

## A. Internal pharmacy roster — workforce authority

The workforce/roster service owns weekly publish/unpublish, staff acknowledgement, cover, swaps, leave, published-week revision and attendance. None of these should by itself post a marketplace vacancy.

### R01 — What does publishing the roster mean to staff?

- A: Staff see only published weeks and changes; B: staff can preview drafts clearly labelled; C: draft view only for selected managers
- Other: describe a different rule

**Owner selection:** **A — APPROVED**  ·  **Your explanation / exceptions:**

> Internal roster for employed FT/PT/casual staff only; no additional explanation.
### R02 — Who can be assigned directly to an internal roster without confirming a marketplace offer?

- A: active FT/PT/casual employed staff; B: any active member including favourite external locums; C: manager-chosen people but external must still accept frozen terms
- Other: describe a different rule

**Owner selection:** _(pending)_  ·  **Your explanation / exceptions:** 

> 

### R03 — What is an employee's legitimate 'cannot work' action after roster publication?

- A: submit cover/leave/swap request, assignment remains until approved; B: allow immediate self-release above an approved notice threshold; C: separate rules for FT/PT and casual
- Other: describe a different rule

**Owner selection:** _(pending)_  ·  **Your explanation / exceptions:** 

> 

### R04 — If a manager cannot cover a roster shift internally, who authorises its handoff to vacancy discovery?

- A: roster manager explicitly confirms each occurrence and audience; B: scheduled automatic handoff after internal time window; C: owner only
- Other: describe a different rule

**Owner selection:** **A — APPROVED**  ·  **Your explanation / exceptions:**

> Existing staff swap and cover requests continue. Owner decides whether a staff member can self-publish a provisional request or manager must publish. Original assignment remains until manager decision or eligible replacement is fulfilled. For platform-public audience, require reason/notification and manager approval when there is enough lead time; thresholds and emergency exceptions remain unanswered.
### R05 — When a roster occurrence is handed off, which audience sees it first?

- A: the same pharmacy's internal community; B: favourites/locums; C: manager selects initial tier per situation; D: public immediately only for urgent coverage
- Other: describe a different rule

**Owner selection:** _(pending)_  ·  **Your explanation / exceptions:** 

> 

### R06 — Should the posted vacancy still appear on the published internal roster as an unfilled need?

- A: yes, clearly marked unfilled and linked, no duplicate shift; B: remove from staff roster and show only in marketplace; C: hybrid depending on worker type
- Other: describe a different rule

**Owner selection:** **A — APPROVED**  ·  **Your explanation / exceptions:**

> Retain original Shift/Slot visible as uncovered/needs cover and link any vacancy. No other exception.
### R07 — What constitutes a dangerous roster conflict: worker assigned twice, cancelled cover, or a marketplace worker booked for a roster slot?

- A: blocking errors until resolved; B: reviewed warning with explicit manager acknowledgement for some cases; C: manager override with audit and reason
- Other: describe a different rule

**Owner selection:** _(pending)_  ·  **Your explanation / exceptions:** 

> 

## B. Internal community, favourites and dedicated offers

A community vacancy is not a roster publication. Favourites is currently an outreach flag/list, not its own visibility tier. A dedicated one-to-one offer is private.

### C01 — Who exactly belongs to the pharmacy's internal community?

- A: active employment membership for that pharmacy; B: all active members including locums/Shift Heroes; C: split staff community and favourites community
- Other: describe a different rule

**Owner selection:** _(pending)_  ·  **Your explanation / exceptions:** 

> 

### C02 — What should qualify somebody for a pharmacy favourites list?

- A: explicit manager-favourited, accepted worker relationship; B: any prior worker at the pharmacy; C: both categories with different trust labels
- Other: describe a different rule

**Owner selection:** _(pending)_  ·  **Your explanation / exceptions:** 

> 

### C03 — Does notifying favourites mean a simultaneous invitation to all, or an exclusive booking window?

- A: group notice; first eligible applicant/offer process wins; B: time-limited exclusive invitation to selected workers; C: manager can choose group or individual
- Other: describe a different rule

**Owner selection:** _(pending)_  ·  **Your explanation / exceptions:** 

> 

### C04 — Can a favourite be in the favourites list of several pharmacies and receive duplicate announcements?

- A: yes per pharmacy, dedupe same shift/user; B: only one preferred pharmacy; C: shared owner-chain favourites with consent
- Other: describe a different rule

**Owner selection:** _(pending)_  ·  **Your explanation / exceptions:** 

> 

### C05 — When a private dedicated offer is rejected or times out, what may happen next?

- A: remain private until owner creates/authorises new posting; B: ask owner whether to convert to community; C: automatically reopen only to another preselected invited worker
- Other: describe a different rule

**Owner selection:** _(pending)_  ·  **Your explanation / exceptions:** 

> 

### C06 — What happens when a pharmacy's existing casual employee takes an open community shift?

- A: ordinary employed roster/payroll agreement, no marketplace booking fee; B: charge internal platform fee; C: decide per engagement type and payroll status
- Other: describe a different rule

**Owner selection:** _(pending)_  ·  **Your explanation / exceptions:** 

> 

## C. Owner chain, organisation, public posting and escalation

Existing possible tiers: FULL_PART_TIME → LOCUM_CASUAL → OWNER_CHAIN (if active owner chain) → ORG_CHAIN (if organisation) → PLATFORM. Posting audience and notify flags are separate.

### E01 — Is this exactly the correct sequence from pharmacy staff through favourites to owner chain, organisation and public?

- A: yes, skip tiers that do not exist; B: owner chain and organisation should be interchangeable order; C: owner chooses selected eligible tiers
- Other: describe a different rule

**Owner selection:** **A — APPROVED**  ·  **Your explanation / exceptions:**

> Normal sequence staff → favourites/locums → owner chain → organisation → public. Owner can skip eligible tiers/start later, choose not to notify a tier and post anonymous public. Audience visibility vs notification flags are distinct; public anonymity must preserve privacy.
### E02 — At posting time may the pharmacy start directly at any eligible tier?

- A: yes explicit manager choice with disclosure; B: must always start internal; C: only urgent shifts may start public
- Other: describe a different rule

**Owner selection:** _(pending)_  ·  **Your explanation / exceptions:** 

> 

### E03 — When should a shift automatically widen to the next audience?

- A: after manager-specified interval at posting; B: use centrally set tier-dependent time windows; C: never automatically, manager approves each step
- Other: describe a different rule

**Owner selection:** **A — APPROVED**  ·  **Your explanation / exceptions:**

> Owner selects time interval(s) when posting; no further explanation.
### E04 — Should the first expression of interest block escalation?

- A: yes, any interest holds; B: only a real offer/acceptance stops; C: pause while manager reviews, resume after timeout
- Other: describe a different rule

**Owner selection:** _(pending)_  ·  **Your explanation / exceptions:** 

> 

### E05 — After a worker declines or an offer expires, where does that occurrence return?

- A: same audience, with original escalation timer continuing; B: same audience with a fresh timer; C: next tier; D: manager decision
- Other: describe a different rule

**Owner selection:** _(pending)_  ·  **Your explanation / exceptions:** 

> 

### E06 — Can a cancelled confirmed external booking relist automatically?

- A: never without manager release and audience choice; B: automatically same tier after audit/notification; C: manager can pre-authorise automatic relist by scenario
- Other: describe a different rule

**Owner selection:** _(pending)_  ·  **Your explanation / exceptions:** 

> 

### E07 — May organisation/owner-chain members see a pharmacy's exact identity, rates, or private worker details before acceptance?

- A: existing role-/pharmacy-scoped visibility applies; B: trusted chain/org members see more; C: separate chain and organisation privacy policy
- Other: describe a different rule

**Owner selection:** _(pending)_  ·  **Your explanation / exceptions:** 

> 

### E08 — When a public shift is filled, should other candidates and interested users be automatically informed?

- A: change listing state only; B: notify applicant/offer holders only; C: notify all followers/recipients with frequency cap
- Other: describe a different rule

**Owner selection:** _(pending)_  ·  **Your explanation / exceptions:** 

> 

## D. Cancellation permission, request, occurrence and worker release

D04=A and D05=C were accepted: owner/authorised manager cancellations; workers submit requests preserving current assignment until manager approval; support one, selected, or all occurrences. Clarify the exceptions behind 'both can cancel with guards'.

### X01 — Does 'both can cancel' allow an external worker to leave a confirmed shift immediately in some time windows?

- A: always request/manager review, except emergency support override; B: direct cancellation if more than a chosen number of hours away; C: self-cancel allowed anytime, but guard/penalty depends on notice
- Other: describe a different rule

**Owner selection:** _(pending)_  ·  **Your explanation / exceptions:** 

> 

### X02 — Does a pharmacy owner/authorised manager cancel a confirmed paid engagement instantly?

- A: yes after explicit reason, consequence preview and confirmation; B: needs worker acceptance except emergencies; C: only owner may unilaterally cancel, admin can request
- Other: describe a different rule

**Owner selection:** _(pending)_  ·  **Your explanation / exceptions:** 

> 

### X03 — Which roles count as authorised cancellation managers?

- A: owner, org admin and delegated roster-capable manager for their own pharmacies; B: owner and org admin only; C: distinguish roster manager from booking/billing authority
- Other: describe a different rule

**Owner selection:** _(pending)_  ·  **Your explanation / exceptions:** 

> 

### X04 — When worker requests cancellation, who must respond and how quickly?

- A: manager reviews, escalation to owner after an SLA; B: auto-approve if outside time window; C: workers can request replacement directly, owner decides release
- Other: describe a different rule

**Owner selection:** _(pending)_  ·  **Your explanation / exceptions:** 

> 

### X05 — For multi-day single-worker bookings, may a worker request only certain occurrences?

- A: yes, keep the rest of the accepted contract; B: all-or-nothing unless manager makes new agreement; C: allow partial request with explicit re-consent
- Other: describe a different rule

**Owner selection:** _(pending)_  ·  **Your explanation / exceptions:** 

> 

### X06 — When a manager cancels selected occurrences in a recurring series, what happens to other dates?

- A: preserve other bookings, snapshots and rates; B: require entire series cancel; C: prompt to also update the recurring template
- Other: describe a different rule

**Owner selection:** _(pending)_  ·  **Your explanation / exceptions:** 

> 

### X07 — What should a late cancellation after shift start mean?

- A: separate early termination/no-show workflow, not normal cancellation; B: same cancellation with after-start severity; C: manager may classify by work performed
- Other: describe a different rule

**Owner selection:** _(pending)_  ·  **Your explanation / exceptions:** 

> 

### X08 — When a cancel/cover request is denied, does the assignment remain binding and what happens next?

- A: original assignment remains; worker can appeal; B: immediate support escalation; C: separate internal employee and external contractor outcomes
- Other: describe a different rule

**Owner selection:** _(pending)_  ·  **Your explanation / exceptions:** 

> 

## E. Warnings, penalty eligibility and timing by audience

Keep UI warnings, account reliability flags, booking-fee consequences, contractual compensation, and employment wages as five different things. Current optional billing endpoint uses 10% of expected wages inside 72h and 20% inside 24h; that is code, not a business approval.

### P01 — What does a 'warning' mean in ChemistTasker?

- A: pre-confirmation consequences banner only; B: banner plus recorded account reliability warning; C: separate first-warning, repeat-warning and account-restriction actions
- Other: describe a different rule

**Owner selection:** _(pending)_  ·  **Your explanation / exceptions:** 

> 

### P02 — Should penalties depend primarily on acquisition audience or on the employment/engagement contract?

- A: contract type first, audience adjusts consequences; B: audience first (public vs chain/org vs favourites); C: identical contractual fees across external channels
- Other: describe a different rule

**Owner selection:** **B — APPROVED**  ·  **Your explanation / exceptions:**

> Source/audience of booking is the primary policy axis for warning and penalties. No percentages, exceptions or charges approved yet; preserve engagement/legal guard.
### P03 — Should internal rostered FT/PT/casual employees have any ChemistTasker monetary cancellation charge?

- A: no platform charge, use leave/roster/HR and legal rules; B: certain employee charges subject to legal approval; C: owner-specific policy (requires legal review)
- Other: describe a different rule

**Owner selection:** _(pending)_  ·  **Your explanation / exceptions:** 

> 

### P04 — If a favourite external locum cancels, what is the default consequence?

- A: warning only unless repeated/malicious; B: same charge as public booking; C: softer fee/time windows than public; D: case-by-case
- Other: describe a different rule

**Owner selection:** _(pending)_  ·  **Your explanation / exceptions:** 

> 

### P05 — If a confirmed worker sourced through owner-chain or organisation-chain cancels, what happens?

- A: warning-only; B: public policy; C: intermediate policy; D: distinct owner-chain and organisation policies
- Other: describe a different rule

**Owner selection:** _(pending)_  ·  **Your explanation / exceptions:** 

> 

### P06 — If a public marketplace worker cancels, what consequences can apply?

- A: timing warning and reliability record, no charge; B: contractual cancellation fee with cap; C: support review if very late/no-show; D: tiered combinations
- Other: describe a different rule

**Owner selection:** _(pending)_  ·  **Your explanation / exceptions:** 

> 

### P07 — If the pharmacy cancels a booking, should the consequence vary by source?

- A: same compensation and refund principles across external channels; B: lower/no fee for favourites and chain/org; C: distinct policy for each channel
- Other: describe a different rule

**Owner selection:** _(pending)_  ·  **Your explanation / exceptions:** 

> 

### P08 — Which time thresholds should drive pre-cancel warnings and penalties?

- A: >72h, 24–72h, <=24h (existing code baseline); B: >7d, 72h, 24h, 12h, 2h, after start; C: different thresholds for urgent shifts
- Other: describe a different rule

**Owner selection:** _(pending)_  ·  **Your explanation / exceptions:** 

> 

### P09 — What should the monetary fee be based on, when legally and contractually applicable?

- A: flat platform service fee; B: percentage of frozen expected wage; C: demonstrated costs with a cap; D: mixed fee components
- Other: describe a different rule

**Owner selection:** _(pending)_  ·  **Your explanation / exceptions:** 

> 

### P10 — Should repeated short-notice cancellations increase warning severity?

- A: yes rolling 90-day window; B: yes rolling 12-month window; C: no automatic account strike; D: warning reset after completed shifts
- Other: describe a different rule

**Owner selection:** _(pending)_  ·  **Your explanation / exceptions:** 

> 

### P11 — What are automatic fee/warning exemptions?

- A: medical/family emergencies, pharmacy closure, force majeure, regulator suspension; B: support-reviewed exceptions only; C: tiered by evidence and urgency
- Other: describe a different rule

**Owner selection:** _(pending)_  ·  **Your explanation / exceptions:** 

> 

### P12 — If another eligible worker is found before start, should penalties reduce or disappear?

- A: fully waived; B: retain documented unrecovered costs only; C: retain contracted fee; D: split by who cancelled
- Other: describe a different rule

**Owner selection:** _(pending)_  ·  **Your explanation / exceptions:** 

> 

## F. Booking fees, worker compensation, refunds and disputes

Never confuse a platform booking charge with a locum's wage/invoice, employee payroll, travel expense, or compensation. Do not collect new funds or deduct wages from a question-only policy.

### F01 — If the pharmacy cancels after paying the platform booking fee, which remedy applies?

- A: full refund/credit when shift was not worked; B: time-dependent refund; C: refundable platform fee but worker compensation separate
- Other: describe a different rule

**Owner selection:** _(pending)_  ·  **Your explanation / exceptions:** 

> 

### F02 — Does a worker get compensation if a pharmacy cancels a confirmed paid locum shift?

- A: no automatic payment until terms agreed; B: specific time-based cancellation compensation; C: actual unrecoverable costs plus notice guard
- Other: describe a different rule

**Owner selection:** _(pending)_  ·  **Your explanation / exceptions:** 

> 

### F03 — If a worker cancels, is the paid platform booking fee refunded to the pharmacy?

- A: always credit for a replacement; B: retain consumed booking fee; C: refund/credit by timing and channel
- Other: describe a different rule

**Owner selection:** _(pending)_  ·  **Your explanation / exceptions:** 

> 

### F04 — When a late Stripe payment arrives after reservation expiry, what final financial action is allowed?

- A: automatic refund to original payer, never rebook; B: support-only review before refund; C: credit to pharmacy if expressly chosen
- Other: describe a different rule

**Owner selection:** _(pending)_  ·  **Your explanation / exceptions:** 

> 

### F05 — Who may waive or override a proposed fee or refund, and with what audit?

- A: restricted support/billing admin with mandatory reason; B: pharmacy owner within limits; C: two-person approval above threshold
- Other: describe a different rule

**Owner selection:** _(pending)_  ·  **Your explanation / exceptions:** 

> 

### F06 — Should travel, accommodation, or other commitments form separate claimable costs after cancellation?

- A: documented and pre-agreed only, reviewed manually; B: fixed allowances; C: never compensated by platform; parties handle separately
- Other: describe a different rule

**Owner selection:** _(pending)_  ·  **Your explanation / exceptions:** 

> 

### F07 — How are disputes resolved?

- A: evidence submission + human review + appeal window; B: automated decision with manual appeal; C: private party-to-party resolution only
- Other: describe a different rule

**Owner selection:** _(pending)_  ·  **Your explanation / exceptions:** 

> 

## G. Notifications, privacy, escalation and audit

Recipient lists for roster publication must not be reused as a broadcast list for public cancellation, and favourites are not equivalent to successful booking.

### N01 — Who receives a cancellation notice?

- A: confirmed worker and responsible pharmacy managers only; B: plus applicants with pending offers; C: also people notified during initial outreach
- Other: describe a different rule

**Owner selection:** _(pending)_  ·  **Your explanation / exceptions:** 

> 

### N02 — Which channels should be used for time-sensitive events?

- A: in-app and push immediately, email for material confirmations; B: all three for every state; C: worker-configurable except mandatory bookings
- Other: describe a different rule

**Owner selection:** _(pending)_  ·  **Your explanation / exceptions:** 

> 

### N03 — What is the minimum response window for urgent worker cancellation requests?

- A: 15 minutes, then owner escalation; B: 1 hour; C: varies with proximity to shift
- Other: describe a different rule

**Owner selection:** _(pending)_  ·  **Your explanation / exceptions:** 

> 

### N04 — Should an audience escalation notify the previous audience again?

- A: no repeat announcements; B: only changed/saved candidates; C: one limited reminder per tier
- Other: describe a different rule

**Owner selection:** _(pending)_  ·  **Your explanation / exceptions:** 

> 

### N05 — Should all cancellation decisions show an immutable audit trail to both parties?

- A: yes with privacy-filtered actor, reason, timing and financial status; B: support/full audit only, user sees status; C: transparency differs between roster and external shifts
- Other: describe a different rule

**Owner selection:** _(pending)_  ·  **Your explanation / exceptions:** 

> 

## H. Attendance, no-show, completion and history

The attendance/timesheet system is authoritative for hours worked. Cancellation should not be inferred from late check-in alone, especially when a kiosk is offline.

### H01 — How late must a worker be before 'no-show' may be formally recorded?

- A: 15 minutes after start; B: 30 minutes; C: manager confirms after attempted contact and evidence, not timer alone
- Other: describe a different rule

**Owner selection:** _(pending)_  ·  **Your explanation / exceptions:** 

> 

### H02 — How do we handle kiosk/network failure versus true no-show?

- A: require manager review of offline punches; B: trust app GPS/time; C: allow worker appeal with timestamps/evidence
- Other: describe a different rule

**Owner selection:** _(pending)_  ·  **Your explanation / exceptions:** 

> 

### H03 — Who can initiate emergency replacement after a no-show?

- A: on-duty authorised manager; B: owner only; C: automatic urgent posting after explicit approved delay
- Other: describe a different rule

**Owner selection:** _(pending)_  ·  **Your explanation / exceptions:** 

> 

### H04 — What confirms a shift as completed?

- A: attendance clock-out then manager timesheet approval; B: mutual worker/manager acceptance; C: invoice/payment completion; D: separate employee vs external gates
- Other: describe a different rule

**Owner selection:** _(pending)_  ·  **Your explanation / exceptions:** 

> 

### H05 — May users leave ratings after cancellation or no-show?

- A: only actual worked, approved shifts; B: separate reliability incident review; C: both, but cancelled shifts cannot receive ordinary service ratings
- Other: describe a different rule

**Owner selection:** _(pending)_  ·  **Your explanation / exceptions:** 

> 

### H06 — What remains in history?

- A: all bookings/cancellations/expired offers with limited privacy; B: only completed work visible, audit support-only; C: separate employee, marketplace and financial histories
- Other: describe a different rule

**Owner selection:** _(pending)_  ·  **Your explanation / exceptions:** 

> 

## Required cancellation consequence matrix (to be approved, not inferred)

| Worker relationship + origin/audience | Pharmacy cancels: warning? fee? compensation? | Worker cancels: warning? fee? restriction? | Notice time band | Waivers / evidence |
|---|---|---|---|---|
| FT/PT/casual employee, internal roster | Pending — employment/roster rules | Pending — employment/roster rules | Pending | Pending |
| Employed staff member claiming community vacancy | Pending | Pending | Pending | Pending |
| External locum direct/dedicated | Pending | Pending | Pending | Pending |
| External locum from pharmacy favourites | Pending | Pending | Pending | Pending |
| External locum from owner chain | Pending | Pending | Pending | Pending |
| External locum from organisation chain | Pending | Pending | Pending | Pending |
| External locum from public platform | Pending | Pending | Pending | Pending |

**Never infer a fee from the last visibility tier only.** Preserve original referral/booking source, contract type, accepted terms and current target audience independently, especially where a shift escalates over time.

## Required acceptance examples after answers

1. Publishing a roster week never posts an open platform vacancy, changes marketplace charges or escalates visibility.
2. A worker asks for roster cover; assignment persists until manager authorises replacement/release; no duplicate Shift/Slot.
3. Favourites outreach stays in the selected pharmacy's eligible audience, without fabricating a new visibility tier or blindly sending cancellation mail to all favourites.
4. Owner-chain versus organisation-chain vs public access guards and privacy redaction work across multiple pharmacy membership identities.
5. Shift moves between audience tiers after a declined offer according to **approved** timer/fallback policy only; stale interest never freezes it unexpectedly.
6. Pharmacy and worker cancel equivalent confirmed external work at 7 days, 72h, 24h, 12h, 2h and after start; warning/fee/dispute outcomes follow each distinct contract+audience+actor rule.
7. Partial recurring cancellation preserves unaffected assignments, frozen rates, worker timesheets and payment records.
8. Late payment or disputed penalty never silently rebooks/captures additional money/deducts wages.
9. Exactly-once cancellation notification and audit survive retry/concurrency; users see truthful state on Next, Vite and Expo.

**Engineering status:** question pack created, no user answers presumed beyond the dated decisions above. The source code changes already in PR #182 remain draft and runtime QA unverified. GitHub CI troubleshooting deferred at owner request.

## Round 3 supplemental approved answers — 17 October 2026

The owner resolved follow-ups R04A=A, R04B=C, R04C=A, E01A=OTHER, E01B=OTHER, R04D=A. Exact quotations and source mismatches are retained in [OWNER_DECISION_REGISTER.md](OWNER_DECISION_REGISTER.md).

- **R04A:** pharmacy owner configures whether employed staff may initiate their own cover publication per pharmacy.
- **R04B:** workers invite named eligible colleagues; manager approves widening to favourites or public. Worker request is not release.
- **R04C:** replacement must explicitly accept, satisfy eligibility/conflict guards, **then** manager approves reassignment.
- **E01A/E01B:** retain existing implementation of notify/not notify earlier audiences; **visibility is cumulative** through eligible older tiers as publication reaches organisation. There is **no organisation-wide notification**; organisation workers can view only via their own scoped channel. Anonymous public posting is separate. Earlier statement that a skipped audience loses access is superseded.
- **R04D:** public-platform worker cancellation always needs manager approval. Urgent requests use emergency escalation, not automatic withdrawal; exact SLA pending.

**Owner attention next:** cancellation source-specific warnings/fees and notification matrix (P01/P04–P12, F01–F07, N01–N05), not an unnecessary repeat of approved E01 options.
