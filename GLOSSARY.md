# ChemistTasker

A marketplace and workforce tool for Australian pharmacies: pharmacies fill shifts from their own staff, trusted locums and the public, then run rosters, attendance, timesheets and invoices for the work. Terms below come from owner decisions already made; the owner grill (`docs/qa/grill-me-20261121/OWNER_GRILL.md`) adds more as it settles them.

## People and relationships

**Owner**:
The person responsible for a pharmacy on ChemistTasker, who sets its policies and pays its fees.
_Avoid_: Admin, manager (those are other roles)

**Employee**:
A worker employed by the pharmacy full-time, part-time or casually; the only people on its internal roster.
_Avoid_: Staff member (ambiguous), member

**Favourite**:
An outside worker the pharmacy has marked as trusted; booked through shift offers, never rostered.
_Avoid_: Favourite staff, preferred locum

**Locum**:
An outside pharmacist or pharmacy worker booked for individual shifts.
_Avoid_: Contractor, temp

**Explorer**:
A person new to pharmacy who can look around and show interest but never holds an admin role, never becomes one by role change, and never receives invoices.
_Avoid_: Newcomer, student (unless the role is student)

## Shifts and booking

**Audience**:
The widening set of people who may see and take a shift: employees, favourites, the owner's chain, the organisation, then the public. A wider audience adds viewers; it never removes earlier ones.
_Avoid_: Visibility level, tier (alone)

**Escalation**:
Moving an unfilled shift to the next audience at owner-chosen intervals.
_Avoid_: Broadcast, reposting

**Reservation**:
The time-limited hold created when an outside worker's acceptance of an offer is waiting for the pharmacy's payment.
_Avoid_: Pending booking, provisional booking

**Booking**:
An outside worker's confirmed place on a shift; it exists only once payment is verified.
_Avoid_: Reservation (that is the step before), assignment

**Pay-by window**:
How long the pharmacy has to pay before a reservation expires; shorter as the shift gets closer and never past its start.
_Avoid_: Checkout expiry (that is the payment provider's, not the business rule)

**Cover**:
A request by a rostered employee for someone else to take their shift; they stay assigned until a manager approves a replacement.
_Avoid_: Swap (a swap is two employees exchanging shifts), release

**Needs cover**:
The state of the same shift and slot while its cover request is open; never a duplicate shift.
_Avoid_: Vacancy copy, reposted shift

## Money and consequences

**Booking fee**:
What the pharmacy pays the platform for an outside booking; kept separate from refunds, credits and the worker's pay.
_Avoid_: Penalty, commission

**Owner cancellation fee**:
A percentage of the frozen agreed wages for the cancelled dates, set by how much notice the pharmacy gave; only for outside confirmed bookings.
_Avoid_: Penalty (workers never pay money penalties)

**Incident**:
A platform-verified late cancellation or no-show by a worker, counted on the worker incident ladder. Workers never pay money for incidents.
_Avoid_: Strike, fine
