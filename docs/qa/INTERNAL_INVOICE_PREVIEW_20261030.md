# New internal invoice preview preserves Save behavior

30 October 2026, Australia/Brisbane. Parent: draft #230 at
`17fc8aa2ac99752d7058c40866edc46e70181f5e`.

The real authenticated browser journey failed on its first invoice preview: HTTP 404,
run `40955330442`, job `123733836821`. A new accepted-shift draft deliberately uses
customer_id=0 until Save creates its pharmacy customer. Preview incorrectly required
that customer to exist already. This also prevents the native composer from showing
its server-calculated total before Save.

The preview now validates the worker-owned accepted source through the existing
read-only internal-prefill service, verifies the submitted source rows, and uses the
same existing calculation and editable monetary values. It creates no customer,
invoice, revision, payment or delivery. Save still owns customer creation and all
transactional source locking. Saved revisions and external-customer checks retain their
existing behavior. No rounding, GST, super, accepted-rate or invoice eligibility policy
is changed.

Five real HTTP controls pass: preview/Save arithmetic agrees; preview makes no writes;
foreign sources and replaced/removed source rows are refused; external drafts still
require an owned customer; saved internal revisions still preview edited values.
A broader 70-test run passed all 65 existing invoice-integrity tests and four new tests;
one new negative-control expectation needed correction to the established serializer's
HTTP 400 response. The corrected five-test selection passed **5/5**, no skips.

The real browser test supplied the reproduction, rather than an intercepted API fixture.
Hosted browser/native re-execution and PostgreSQL validation are still required on this
new source. A local PostgreSQL binary is available, but this execution environment
cannot switch OS identity, so it cannot start PostgreSQL safely; SQLite is not claimed
as lock evidence. No product workflow or provider configuration was changed.
