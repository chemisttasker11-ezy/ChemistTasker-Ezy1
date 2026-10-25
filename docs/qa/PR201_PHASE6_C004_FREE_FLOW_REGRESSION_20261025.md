# Phase 6 C004-N2 follow-up: preserve pre-live and trial checkout

At commit 9b8993ed, Shared Core Consolidation backend failed in `billing.tests.OrganizationBillingScopeTests.test_http_shift_charge_allows_operational_payer_but_subscription_stays_restricted`: PRE_LIVE was rejected with HTTP 400 by a paid checkout guard. This is a genuine regression, not a fixture failure.

Moved explicit selector requirement to paid Stripe checkout **after** PRE_LIVE/FREE_TRIAL return so authorised free shift finalisation remains compatible. Paid checkout still rejects ambiguous unit/offer selection. Added a standalone PRE_LIVE positive regression to the PR201 targeted suite; historical billing suite remains a gate.

CI that exposed this: [40197597441](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/actions/runs/40197597441). No deployment. Release NO-GO.
