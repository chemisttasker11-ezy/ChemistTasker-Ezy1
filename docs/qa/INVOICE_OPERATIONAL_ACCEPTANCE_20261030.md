# Invoice operational acceptance continuation

30 October 2026, Australia/Brisbane. Parent: draft #229 at
`59139e0c3674b3391e26deef86f813c250f8bb64`. M4/M5 acceptance work; no deployment.

## What this adds

The authenticated Next/Vite/Django runner now seeds one genuine accepted ABN assignment
in its disposable database. The new browser journey logs in as its worker, changes the
prefilled hours, obtains the server preview, saves revision 1, saves revision 2, reads both
immutable revisions and PDFs, sends the current version through captured email, and
verifies stale-version refusal and replay fencing. Source terms remain eight hours at
AUD 70 even when invoiced hours are revised from 7.5 to 8. Totals are AUD 577.50 and 616.00.
The test does not intercept invoice, preview, PDF or delivery API responses.

Both native simulator journeys now use the same accepted-work fixture, create and revise
the invoice through real controls, send through captured email and open native PDF sharing.
A backend verification step checks committed versions, the one sent delivery, frozen
source terms and readable PDFs for both revisions. Native QA can be explicitly selected
using `native-qa` or `release-acceptance`; it is no longer restricted to an obsolete branch
prefix. Existing login, workspace persistence, deep-link and attendance checks remain.

The seed refuses ordinary application settings and requires APP_ENV=test and a captured
email backend. Native/browser mail remains local; these tests do not send real emails.

Four additional delivery tests use Django's actual SMTP backend and smtplib over TCP to
a loopback-only sink. They parse the actual MIME attachment and rendered PDF, verify
successful acknowledgement and immutable revision contents, drop the acknowledgement
after receiving DATA, reject DATA, and fail database finalization after SMTP acceptance.
Repeated requests must not send again. This is wire-protocol/failure evidence, not proof
of the configured staging provider or inbox delivery.

## Current evidence and failures

The first six-test local selection found one expectation error: the established invoice
version guard returns HTTP 400 for a stale version, rather than 409. The browser and SMTP
assertions now preserve that existing contract; application policy was not changed.
The final selection includes the existing real-PDF rendering contracts: **8/8 passed**, no skips, 2.685 seconds after setup.

Draft #229's hosted Shared Core and Full Isolated QA stopped at a public-export count
assertion: 432 exports now exist, while the assertion still expected 430. This continuation
explicitly accounts for the two new billing-owned recovery operations and preserves all
existing identity/retirement checks. The complete Shared Core suite now passes locally:
**446 tests across 57 files**. Browser acceptance TypeScript checks and YAML parsing pass.
This correction does not certify #229's historical failed runs as green.

Hosted browser and simulator execution on this new source is required. A physical device,
real email provider, real Stripe test-mode account and deployed staging/rollback acceptance
remain open. Public staging smoke already passed, but staging exposes no commit identity
and authenticated/configuration access is unavailable here. Do not mark P4, P8, P5/P7 or
M5 complete from these invoice additions.
