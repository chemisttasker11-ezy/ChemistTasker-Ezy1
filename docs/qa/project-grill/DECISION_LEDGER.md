# Grill Me decision ledger

**Initial status:** seeded from the existing Launch Grill; the historical entries below are carried forward as prior decisions, not newly decided today. Verify their provenance and supersession status before relying on them for implementation.

## Carried decisions

The source is `docs/qa/launch-grill/questions.json` on branch `docs/launch-grill-20261020`. It contains 30 carried decisions. Preserve their original IDs and wording when migrating into the live ledger.

| ID | Carried decision |
|---|---|
| D01 | Outside booking acceptance creates a time-limited reservation; only verified payment confirms it. |
| D02 | Payment deadline depends on lead time: 24h when start is over 48h away; 6h at 12–48h; 2h at 2–12h; 30 minutes under 2h; never beyond shift start. |
| D03 | Unpaid reservation expiry releases the shift to the same audience and notifies worker and manager; no automatic escalation or penalty. |
| D04 | Owner and authorised managers may cancel with guards; staff request cover, swap or cancellation and remain assigned until approval or replacement. |
| D05 | Cancellation may affect one date, selected dates or the whole posting; other dates and history remain. |
| R01 | Internal roster is for employed full-time, part-time and casual staff; locums/favourites use shift offers. |
| R04 | Staff may request swap/cover; no release before manager decision or replacement; public worker cancellation needs a reason. |
| R04A | Owner configures staff cover publishing per pharmacy, not per worker or role. |
| R04B | Staff invite named eligible colleagues; widening to favourites/public requires a manager. |
| R04C | Replacement is fulfilled only after target accepts, passes role/conflict checks and manager approves transfer. |
| R04D | Public worker cancellation needs manager approval; near-start cases use emergency escalation; no self-cancel. |
| R06 | Cover is the same shift/slot marked needs-cover and linked to vacancy; do not create a duplicate. |
| E01 | Audience order: staff, favourites, owner chain, organisation, public; owner may start later and post anonymously to public. |
| E01A | Earlier audiences retain access when posting widens; skipping notice does not hide the shift. |
| E01B | Keep existing staff/favourite/chain notification flags; no organisation-wide broadcast. |
| E03 | Owner selects escalation intervals when posting; roster publishing does not trigger escalation. |
| P02 | Cancellation policy follows worker source (favourite, chain, organisation, public), separate from employment type. |
| P04 | Platform alone sanctions workers case-by-case, scaled by notice; managers report only; owners may face fees. |
| P05 | Chain/organisation cancellations are handled internally; no-show and repeat-cancellation badges may still apply. |
| P06 | Public worker late cancellation/no-show uses notice-based warnings; serious cases go to platform review. |
| P07 | Owner fees depend on time before shift and apply only to confirmed outside bookings, not internal roster work. |
| P08 | Notice bands: over 7 days, 72h, 24h, 12h, 2h, and at/after start. |
| P09 | Owner fee is a percentage of frozen agreed wages for the cancelled dates only. |
| FEES | Over 7d 0%; 72h–7d 0%; 24–72h 10%; 12–24h 15%; 2–12h 20%; under 2h 25%; at/after start 30%. |
| P10 | Platform-verified incident ladder: first warning; second 14-day no-applying; third 28-day suspension plus badge; fourth 56 days; fifth permanent only after human review; cap six months. |
| P11 | Different exemptions apply to owners, internal workers and public workers, including mutually agreed cancellation. |
| P12 | Replacement can alter consequences depending on who cancelled and notice remaining. |
| F01 | Booking fee, refund/credit and worker pay are separate money streams. |
| F04 | Payment arriving after expiry never rebooks; pharmacy chooses credit or refund after approved review. |
| NOPEN | No monetary penalties, fines, deductions or charges on workers for cancellation/no-show. |

## Later directions requiring provenance confirmation

- Keep the pharmacy's **store location** as the basis for public-holiday rules; do not introduce an employee work-base prompt.
- For the next stage, discuss the project area by area, one question at a time, with current code behaviour, scenarios and consequences. Do not restart completed audits.
- The owner expects unresolved implementation/policy decisions to be gathered in the project-wide Grill, rather than silently settled by the reviewer.
- PR #203 should remain untouched by this documentation branch.

## Decision record template

For each new decision append:

- **ID / area**
- **Date**
- **Exact question and scenario**
- **Current behaviour evidence** (commit SHA, paths/lines)
- **Options shown**
- **Owner's exact answer**
- **Reason supplied by owner** (if any)
- **Consequences/dependencies**
- **Acceptance examples**
- **Status:** decided / deferred / superseded / implementation gap
- **Supersedes:** prior decision ID, if explicitly changed

Never overwrite a prior answer silently. Record the new answer and explicit supersession.
