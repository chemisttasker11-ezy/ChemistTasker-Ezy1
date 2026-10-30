# Bounded cancellation and notification assessment

Parent: #232, `d93dfbe6e06044d31415b7f4cf396b1ae700eea0`.
These findings distinguish technical fixes from product decisions. A passing
characterization test records the legacy risk; it does not approve that behavior.
No provider calls or recipient messages were sent by this assessment.

## P7 technical repair

A two-worker roster publication reproduction failed because an exception while
notifying worker one aborted the loop before worker two. Isolate and log each
recipient attempt for both whole-week publication and individual-shift republication.
Keep the committed publication/audit, recipients, payload, permission checks and
existing notification choices. Attempt each recipient once; do not retry ambiguous
provider deliveries. Existing payment email fan-out isolation controls remain.

## Decisions that remain open

| Item | Reproduced evidence | Decision required before closing launch exposure |
| --- | --- | --- |
| P5 cancellation time and scope | Same store and instant, 20 hours before a Brisbane occurrence: request timezone UTC produces 500 cents; Brisbane produces 1000 cents for the same 0.5-hour, $100/hour fixture. A past first occurrence and an unrelated later 8-hour assignment produce 17000 cents despite a submitted first-slot selector. | Confirm occurrence selection, store-time interpretation, eligibility for already-started/past work and the approved charge schedule; or explicitly restrict the reachable charging endpoint. Do not silently replace percentages. |
| P5 duplicate cancellation obligations | Two identical authenticated requests each reach Stripe Session.create with no persistent obligation identity/idempotency key. This proves two sessions can be opened, not that real provider charges were collected. | Establish the cancellation obligation/policy before extending durable reservation ownership to this route. Fulfillment reservations do not protect cancellation sessions. |
| P7 reminder uncertainty | Lost queue acknowledgement yields HTTP 500 after last_buzzed_at and one in-app row persist. Immediate retry returns 429 and does not queue a second email. | Decide recovery/status treatment for definite failure versus uncertain acceptance. Resetting cooldown or resending blindly can duplicate reminders. Existing cooldown is preserved. |
| P7 reveal uncertainty | Lost queue acknowledgement yields HTTP 500 after reveal quota, revealed state and access audit persist. Retry returns the profile without a second email or a second quota debit. | Decide whether to expose delivery uncertainty and provide a durable reconciliation/outbox process. No automatic resend was added. |
| P8 emergency cover | Non-rostered cover recording and ABN cover acceptance retain their existing workflow; existing frozen manifests stay immutable. | Extending PAYROLL booking freeze restrictions to emergency-cover recording/consent needs a defined correction process. Do not prevent recording worked attendance by introducing an unspecified flow. |

The earlier occurrence-based cancellation design was a read-only/policy-gated
proposal. The currently reachable legacy charge-penalty path does not implement all
of those activation gates. This is a launch blocker for enabling that charge route
without a separate explicit release decision. No claim is made about deployed
configuration, legal enforceability, automatic refunds or provider test completion.

## M1 acceptance harness corrections

#231 fixes the real new-internal-invoice preview 404. Its next browser run reached
Save successfully, then stopped at an ambiguous Open button locator (three matches).
Scope the action to the saved invoice row identified by its unique invoice number.
Do not change invoice behavior to satisfy the test.

The older fixture browser suite returned generic paginated objects for two newer
attendance endpoints that actually return arrays: worker cover terms and manager
pending kiosk reviews. Recorded artifacts show .find/.map errors from those fixture
responses. Supply empty arrays for those exact endpoints; leave the interactions,
permissions and correction/timezone assertions unchanged. The separate 390px visual
snapshot differences require inspection; no screenshot golden was updated here.

## Evidence and limitations

The bounded selection passed locally: 39 tests, 37 passed and two PostgreSQL-only
skips, covering outage cases, cancellation rounding/exposure, roster publication and
payment fan-out. Browser runner types and fixture syntax passed. See exact-head CI
for browser/native execution. Source-only provider mocks cannot establish configured
Stripe behavior, real email receipt or delivery after provider outages.
