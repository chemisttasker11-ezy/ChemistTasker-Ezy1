# B53 — out-of-order subscription entitlement challenge

**Frozen main:** `b77e9fd296bc2710350ef6f3cd402ce2529ffc06`. **Initial status: SOURCE-SUPPORTED, test queued; no S3 until fixture-valid run.**

`POST /api/v1/billing/stripe/webhook/` (route resolved from `api_v1:billing:stripe_webhook`) → signature verification + event-id receipt dedup → `backend/billing/views.py:897-948`. `customer.subscription.deleted` sets the local subscription inactive but retains the old Stripe ID; a later, separately identified `invoice.paid` event for the *same deleted subscription ID* finds it and sets it active. Event-id dedup alone does not impose causal ordering.

**Positive:** Current tracked subscription receiving a matching invoice.paid stays active. **Negative:** First send subscription.deleted event, verify inactive and processed receipt, then send a *different event ID* invoice.paid for the deleted subscription. Confirm the subscription does not return to active. Test uses actual HTTP handler and local DB; Stripe's cryptographic construct_event is mocked only to supply two valid synthetic events. No live Stripe charges, real provider event ordering or customer entitlement side effects tested. Distinguish B53 (stale event on originally tracked subscription) from B68 (customer fallback for an unknown subscription ID) and B70 (duplicate creation of recurring subscriptions).

Workflow: `.github/workflows/pr200_targeted_b53_webhook.yml` with exactly two targeted tests on disposable SQLite; intentional RED is a discovery, not a release PASS. The S2 whole-file coverage counter remains untouched.
