# ChemistTasker launch grill — independent review

## Verdict

The grill is broad and much better than a typical launch questionnaire, but it is not yet safe to present unchanged. Twenty-five questions need material corrections and six missing decisions should be added. The binding register is internally preserved; no carried answer needs alteration.

The largest defects are legal framing, not copy polish: ABN does not decide worker status, stored AHPRA expiry is not authoritative registration status, professional indemnity is not an ABN-only duty, permanent deactivation may require the federal platform-worker process, and cancellation charges need Australian unfair-contract-term review before use.

Code review confirms most audit findings. It also found missing Award posting gates, undefined failed-payment retry semantics, no early-finish/overtime payment rule, no evidence-retention schedule, and no explicit GST/tax-invoice treatment for platform fees.

## Top 10 problems

1. **AG-Q04 could induce misclassification.** The pharmacy currently selects ABN/TFN (`backend/shifts/engagement.py:581`), but Fair Work applies the real relationship test; an ABN or label is not determinative.
2. **ON-Q06/Q07/LA-Q01 treat an expiry date as registration status.** Verification stores a point-in-time flag (`backend/onboarding/verification/policy.py:59`; `backend/onboarding/verification/ahpra.py:121`) and booking never refreshes the public register.
3. **ON-Q09 wrongly limits professional indemnity to ABN pharmacists.** The Pharmacy Board standard follows practising registration, including provisional registration, and permits personal or third-party cover.
4. **P08/P09 charges are not launch-ready.** The legacy 10%/20% checkout is still routed (`backend/billing/urls.py:11`), while the new table lacks demonstrated unfair-contract-term, classification and proportionality review.
5. **CX-Q30 omits the Digital Labour Platform Deactivation Code.** Two reviewers are not a substitute for reasons, notice, response, review and appeal where the federal regime applies.
6. **TFN shifts lack complete Award gates.** Engagement logic flags some rates and shifts over 12 hours (`backend/shifts/engagement.py:354`), but posting does not enforce minimum engagement, breaks or all overtime/penalty rules.
7. **Privacy decisions expose too much.** Authenticated talent reads reveal anonymous authors; emergency evidence, dispute evidence and credential files lack minimisation, access-class and deletion decisions (`backend/talent/views/explorer.py:81`; `backend/talent/serializers/explorer.py:13`).
8. **Payment/tax wording is incomplete.** Checkout computes subscriber status but chooses standard fixed prices (`backend/billing/views.py:677`); GST treatment and a platform tax-invoice path were not found.
9. **Lifecycle coverage had two operational holes.** Failed checkout retry/release and early finish/extra hours were not decided. Assignment rows also have no explicit reserved/confirmed/started/completed state (`backend/shifts/models.py:463`).
10. **Several recommendations overstate competitor evidence.** ShiftRx now redirects to Works.ai; no source proved an exact payment-reservation pattern, 48-hour emergency evidence rule, 24-hour urgent opt-in, or two-reviewer suspension standard.

## Per-area findings

### Onboarding

- Preserve browsing, but gate every apply, accept, direct request and registered-role roster assignment. Today only public interest applies the Verified gate (`backend/shifts/interest.py:65`).
- Use the AHPRA public register at booking and periodically; do not infer lapse solely from the displayed renewal expiry.
- PII cover must be evidenced for every practising pharmacist within the Board standard, including provisional registrants, regardless of ABN/TFN.
- Add an evidence-retention decision. The code stores verification results/files but the reviewed launch material contains no evidence-class deletion schedule.
- The mobile upgrade defects remain launch blockers; do not bundle an unreachable web organisation page into the same owner decision.

### Posting

- Add a pre-acceptance Pharmacy Award gate for TFN work. Marketplace slots can be posted independently; the existing terms engine is not a complete posting validator.
- Correct PO-Q03: super is already represented, while GST treatment and a whole-shift total are missing.
- Show wages, super, platform fee, GST treatment and payable total before posting/payment; the fee first appearing at checkout is avoidable surprise pricing.
- Multi-date and recurring choices cover the main structure, but compliance and pay must be assessed per date and across the applicable employment period.

### Booking

- BK-Q07's context is false: the backend already permits simultaneous offers and first acceptance reserves the slot (`backend/shifts/offers.py:330`).
- BK-Q13 already has accurate reserved/not-confirmed wording and deadlines; the remaining choice is only whether to add a live countdown.
- Add the failed-payment rule: keep the original deadline, allow retry, never confirm or extend merely because checkout failed.
- Conflict checks exist, but credential validity must be rechecked at the point of commitment rather than trusted from onboarding.

### Agreement

- Replace “pharmacy picks ABN or TFN” as the recommended legal model. A relationship assessment must precede labels and contract wording.
- Existing terms snapshots include a schema version and worker acceptance but omit cancellation policy/version and pharmacy acceptance (`backend/shifts/engagement.py:523`).
- Accepted shifts remain editable outside locked slot fields (`backend/shifts/posting.py:142`); D09 needs immutable snapshots and consent for material changes.

### Cancellation, attendance and completion

- Keep the carried no-fines decision. Do not revive the legacy penalty checkout.
- Emergency evidence should be reason-first and minimal, requested only when necessary; health documents should be support-only and deleted when no longer needed.
- CX-Q20's recommended remedy was not represented by its option. The patched option now says the fee is retained only when replacement is delivered; otherwise refund/credit is offered.
- Give parties the allegation, relevant facts and outcome, not each other's sensitive evidence.
- Tie the reliability badge to active incidents; CX-Q28 and the old CX-Q29 otherwise offered effectively duplicate 12-month rules.
- A permanent restriction must follow the applicable platform-worker deactivation process. P10 remains binding but cannot override statute or a mandatory code.
- Add an actual-hours rule for late arrival, early release and authorised overtime. Timesheet checks compare planned and actual duration (`backend/workforce/timesheet_checks.py:64`) but do not settle marketplace pay.
- Existing questions cover pharmacy closure, illness, emergency, partial/multi-date cancellation, replacement, no-show, late arrival, disputes and completion; the new question closes the early-finish/overtime gap.

### Talent board

- Restrict authenticated discovery to authorised hiring roles plus the author's own post. Public cards, if retained, must remain server-masked.
- The authenticated API defeats anonymous posting and ordinary list/detail bypass feed visibility (`backend/talent/views/explorer.py:81`; `backend/talent/views/explorer.py:169`).
- Clarify that surname, contacts, address and documents stay hidden only until the separately chosen reveal point; scrub free-text contact leakage too.
- Web and mobile permissions diverge: web uses an explicit hiring-role list (`frontend_web/src/pages/dashboard/sidebar/TalentBoard/index.tsx:312`), while mobile defaults broadly (`frontend_mobile/roles/shared/talent-board/index.tsx:313`). Backend policy must govern both.
- View counts increment on every authenticated call without per-viewer deduplication (`backend/talent/views/explorer.py:214`); track separately from the launch permission decision.

### Availability

- Live availability is private; copied post dates become stale. Because workers can withdraw dates, fix the split source before launch or remove the copied calendar claim.
- Any sharing with staff/favourite pharmacies needs explicit worker opt-in. A relationship alone is not consent to disclose calendar data or notes.
- Keep one matching-shift consent at launch; no evidence supports a mandatory separate “urgent” consent switch.
- Matching treats touching endpoints as overlap (`backend/shifts/announcements.py:210`), alerts omit escalated shifts and Verified filtering (`backend/shifts/announcements.py:460`), and API writes lack semantic validation (`backend/talent/serializers/availability.py:7`).

### Launch

- Before launch: public-register credential checks; broken reachable onboarding; legacy penalty route removal; subscriber pricing/environment configuration; scheduled escalation; offer expiry capped at start; versioned terms acceptance; talent anonymity/visibility; availability validation and alert eligibility.
- Add before launch: Award posting validation, verification-evidence retention, failed-payment semantics, actual-hours rules, GST/tax-invoice treatment, and Australian review of cancellation charges.
- LA-Q15 was four decisions bundled together. The patch leaves hiring permission as the owner decision and treats route, duplicate-hook and view-count work as separate engineering cleanup.
- LA-Q16 should be before launch, not after, because stale advertised dates are a false representation to pharmacies.

## New live research findings

- [Fair Work contractor guidance](https://www.fairwork.gov.au/find-help-for/independent-contractors/independent-contractors): since 26 August 2024, many businesses use the whole-of-relationship test; practical reality matters and an ABN does not decide status.
- [Fair Work employee-like workers](https://www.fairwork.gov.au/find-help-for/regulated-workers/employee-like-workers): the Digital Labour Platform Deactivation Code has applied since 26 February 2025 and provides a fair-process route for protected workers.
- [Pharmacy Industry Award](https://awards.fairwork.gov.au/MA000012.html): minimum engagement, breaks, ordinary-hour limits, overtime, casual loading and penalty rates require more than the current partial rate check.
- [ACCC contracts](https://www.accc.gov.au/consumers/buying-products-and-services/contracts) and [2023 penalty warning](https://www.accc.gov.au/media-release/businesses-urged-to-remove-unfair-contract-terms-ahead-of-law-changes): unfair standard terms are prohibited, and merely making a term clear does not make it fair.
- [OAIC APP 3](https://www.oaic.gov.au/privacy/australian-privacy-principles/australian-privacy-principles-guidelines/chapter-3-app-3-collection-of-solicited-personal-information), [APP 6](https://www.oaic.gov.au/privacy/australian-privacy-principles/australian-privacy-principles-guidelines/chapter-6-app-6-use-or-disclosure-of-personal-information) and [APP 11](https://www.oaic.gov.au/privacy/australian-privacy-principles/australian-privacy-principles-guidelines/chapter-11-app-11-security-of-personal-information): collect/disclose the minimum needed, protect it, and destroy or de-identify it when no longer required.
- [AHPRA employer obligations](https://www.ahpra.gov.au/News/2015-12-31-obligations-for-employers.aspx): employers should check the online register; renewal timing means the displayed expiry date is not by itself proof of lapse.
- [Pharmacy Board PII standard](https://www.pharmacyboard.gov.au/documents/default.aspx?chksum=VYWldu%2FPTLuLnEzS1inDaQ%3D%3D&dbid=AP&record=WD15%2F19184): the obligation follows practising pharmacist registration, not ABN status.
- [LocumCo client platform](https://locumco.com.au/locumco-client/): Australian pharmacy employers can manage bookings, reverse-search jobseekers and use real-time availability; it supports structured matching but not the grill's exact sanctions or reservation timings.
- [STATshifts](https://statshifts.ca/): an Ontario pharmacy marketplace advertises self-service relief, extended and permanent staffing; it validates the marketplace category, not ChemistTasker's precise policies.
- [LocumBooking](https://www.locumbooking.com/): the UK healthcare/pharmacy platform advertises registration, right-to-work and credential-expiry controls visible before confirmation.
- The prior ShiftRx source now redirects to [Works.ai](https://www.works.ai/); treat old ShiftRx operating claims as stale unless separately archived and dated.

## Legal launch blockers

1. Australian employment counsel must approve the employee/contractor decision model and labour-only contractor super treatment; onboarding attestations cannot cure misclassification.
2. Pharmacy counsel/clinical governance must approve live registration and PII evidence checks, including conditions and provisional registration.
3. Employment counsel must map every TFN shift to the Pharmacy Award before acceptance, including minimum engagement, breaks, penalties and overtime.
4. Australian consumer/contracts counsel must review every standard-form cancellation, suspension, refund and credit term before it is proposed or relied upon.
5. Platform-worker counsel must determine coverage of the employee-like worker regime and implement the Deactivation Code before material or permanent restrictions.
6. Privacy counsel/owner must approve collection notices, sensitive-evidence access, overseas processors, retention/deletion schedules and incident handling before real identity, credential or health evidence is collected.
7. Australian tax advice must settle GST on platform fees, price display and tax-invoice responsibility before live checkout.

## Scope and confidence

All 130 questions were checked against the register, audit, research and relevant code paths. This was a read-only review: no repository edits, builds or tests were run. The patch validates structurally, but legal conclusions are launch risk flags for qualified Australian advice, not legal or tax advice.
