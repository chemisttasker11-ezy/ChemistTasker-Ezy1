# PR #213 — independent confirmation delivery

Date: 29 October 2026 (Australia/Brisbane). Baseline: `1a2ea824a7017d067b4a26c85bd017c3001ff631`. Continue the existing draft PR; a second PR is unnecessary because notification hardening is already part of its authorized scope. No merge, deployment or live provider action.

## Rule and demonstrated failures

After a notification row or booking is saved, a WebSocket transport outage must not suppress independent push delivery, later recipients or confirmation emails. A failed payment-confirmation email enqueue must not prevent the next worker, other-candidate or owner attempt. Worker acceptance must retain its payment-pending state and still attempt the owner's confirmation if the worker email queue fails.

The baseline ten-test selection reproduced five transport failures (5 passed / 5 errors, no skips, 0.093 seconds): notification-created WebSocket failure, unread-counter WebSocket failure, payment worker WebSocket failure, first-worker email queue failure and other-candidate email queue failure. Errors were injected at actual notification/queue boundaries; real notification rows and the existing message builders were used. The separate real-endpoint acceptance regression then failed on the baseline with one email attempt instead of two (1 test, 1 failure, 0.048 seconds); its durable status was already payment-pending. This independently reproduced owner-email suppression.

## Changes and boundaries

- `notifications/services.py::_deliver_notification` isolates the created-event broadcast and unread-counter transport. Each failure is logged using notification ID; push and later recipients continue. Serialization remains outside the transport catch. Notification creation and token queries keep their existing exception behavior; counter database read remains outside the transport catch and explicitly propagates failures, while a PostgreSQL channel-layer transport error is isolated. No persistence or authorization error is intentionally converted into success. The existing push-network exception handling is retained.
- `shifts/emails.py::_queue_payment_notification_email` isolates email enqueue failures for exactly the three existing payment-related templates: successful worker confirmation, other-candidate filled notice and owner confirmation. The same `async_task` alias, templates, recipients, contexts and suppression flags remain. No automatic retry is added, because a lost broker acknowledgement does not establish non-delivery.
- `shifts/offers.py` registers worker and owner acceptance-email enqueues as independent robust commit callbacks within the existing acceptance-notification callback. The outer acceptance transaction and its robust callback remain. Each enqueue still uses the existing `shifts.offers.async_task` alias, preserving patch targets. No provider/payment/assignment operation moves.

This does not globally change `notify_users`' immediate-delivery default, introduce an outbox, certify exactly-once delivery or guarantee later delivery for an outage. It does not change the security workflow that requires immediate PIN verification-email acceptance.

## Route and preservation ledger

| Entry / owner | Guard and proof |
| --- | --- |
| Immediate and explicit commit-time `notify_users` | Created row remains authoritative; created/counter transport isolated; active-user/token filters and payload unchanged. Multi-recipient outage plus success/filter, push-network and rollback controls. |
| Counter database query | Counter read outside the transport catch; separate no-database boundary regression. PostgreSQL-backed channel transport errors remain isolated. Notification persistence error still propagates. |
| Free checkout: `billing/views.py` | Existing atomic finalization and robust commit owner unchanged. New real endpoint test injects socket and first-worker queue failures together: two assignments, accepted offers, ordinary 200, all four email attempts and four notification rows. No Stripe call. |
| Stripe checkout fulfillment: `billing/views.py` | Same existing robust callback reaches the changed payment delivery function. Webhook signature, event ID, payment intent ID, metadata, replay/refund and reconciliation owners unchanged. Existing billing contracts exercised; no live Stripe acceptance claim. |
| Pills settlement: `rewards/views.py` | Existing transaction completes before calling the same payment delivery function. Ledger/balance/assignment code unchanged. Existing rewards controls included in final targeted selection. |
| Free worker acceptance: `shifts/offers.py` | Existing finalized-payment notices execute inside the outer robust callback. Shared channel/payment enqueue protection prevents the named transport failures from stopping it. |
| Payment-pending worker acceptance: `shifts/offers.py` | New real endpoint regression proves a failed worker queue still allows owner email and leaves `ACCEPTED_AWAITING_PAYMENT` intact. |
| Other-candidate notices: `shifts/emails.py` | Same candidate set, dedupe, selected-user exclusions and context; failed queue no longer stops owner confirmation. |
| Admin, serializers, background callers | Repository-wide name search found no further production callers of the two payment helpers beyond billing, offers and rewards. Common notification service is used more widely; no caller transaction/default was mechanically changed. |

AST comparison against the immutable baseline confirmed both existing payment-notification functions are identical after normalizing only the three email-adapter calls back to their original `async_task` calls. This preserves recipient construction, text, links and payment labels. It is structural evidence alongside execution, not provider certification.

## Remaining work

The earlier inventory remains a route ledger, with this document superseding its open WebSocket/counter channel and named payment/acceptance queue candidates. Remaining queue-failure candidates include buzz cooldown, decline, interest/rejection, counteroffer create/reject, reveal quota/audit, cover requests, posting/availability per-recipient queue loops, cancellation email and roster per-recipient persistence failures. They require their own real-path regressions; they are not all newly confirmed defects. No claim of whole-platform notification closure.

No further billing extraction, pricing abstraction or cycle baseline relaxation is included. The import graph remains 97 module-level edges, 72 delayed edges and seven approved mutual pairs. Final release acceptance remains separate; native branch conditions, device, invoice-browser, real broker/provider and authorized staging are not certified by these tests.

## Validation

The first 151-case expanded run passed with 7 PostgreSQL-only skips (144 passed, 14.573 seconds), and the new real free-checkout outage endpoint test passed separately (1/1, 0.068 seconds). An intermediate expanded run caught a Django robust-callback logging incompatibility with `functools.partial` (`__qualname__` missing). This was corrected to named callback functions; the intermediate failure is not counted as a passing gate.

Final source results are appended below. Test selections overlap; counts must not be summed as unique project coverage.

### Final verified source

Python 3.12.14 / Django 5.2.17, `core.contract_test_settings`, disposable in-memory SQLite with the real migration graph:

```bash
python backend/manage.py test \
  notifications.test_delivery_isolation shifts.test_payment_notification_isolation \
  notifications.test_api shifts.test_shift_actions_contract shifts.test_shift_posting_contract \
  billing.test_fulfillment_confirmation billing.test_pr201_checkout rewards.test_rewards \
  core.test_module_size_ratchet core.test_backend_ownership_boundaries \
  --settings=core.contract_test_settings --verbosity=1
```

**161 discovered: 152 passed, 9 existing PostgreSQL-only skips, zero failures/errors; 12.877 seconds after setup.** Includes all 13 new standalone channel/payment tests plus the new acceptance endpoint regression in the existing action module. No live provider call: transports are mocked for outage tests and Django tests use their test email backend. The nine skipped race tests are not claimed as new PostgreSQL proof.

Migration drift: no changes. Whitespace check: passed. Official module-size/ownership ratchets: passed within the final selection. Import-cycle baseline: passed with unchanged counts. Payment message-builder AST preservation: passed. No production edits followed this verified run; only this evidence was appended.

Both new modules are discovered by existing full `notifications` and `shifts` CI selections; the acceptance regression is also in the already-selected shift actions contract module. New-head hosted CI must be checked after publication; previous-head jobs do not certify this source. PR remains draft / NOT MERGE-READY while remaining side-effect and release acceptance items are open.
