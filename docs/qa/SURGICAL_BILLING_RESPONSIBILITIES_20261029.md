# PR #213 — billing responsibility decomposition

29 October 2026 (Australia/Brisbane). Immutable baseline: `c955e13f8b7d2792b770bb0132d9d1f67d0d3e48`; branch `fix/surgical-backend-consistency-20261029`. The user explicitly authorized completing the responsibility-based decomposition after challenging the earlier decision to stop at the module-size threshold. This supersedes that earlier stopping decision, not its historical evidence.

## Outcome

`billing/views.py` goes from **1,162 physical / 960 official code lines** to **200 physical / 156 official code lines**. The former 306-line Stripe event processor is now a **17-line dispatcher with six domain handlers**. This is a separation of workflow responsibilities: the large function was not moved intact to a different file. Existing billing URLs still point to the same six decorated HTTP functions.

| Owner | Responsibility | Physical lines / largest function |
| --- | --- | --- |
| `billing/views.py` | HTTP authentication/decorators, parsing, action authority, account resolution and delegation | 200 / 25 |
| `billing/subscription_operations.py` | Authorized subscription checkout, reads and seat changes | 215 / 95 |
| `billing/shift_payments.py` | Authorized fulfillment and cancellation checkout workflows | 265 / 151 |
| `billing/webhooks.py` | Signature verification, event routing, durable delivery dedupe and transaction/retry envelope | 102 / 60 |
| `billing/subscription_events.py` | Checkout activation, provider updates, paid subscription invoices and cancellation | 174 / 45 |
| `billing/payment_events.py` | Payment-intent ledger, booking finalization, lost-booking refund alerts and cumulative refunds | 158 / 104 |
| `billing/fulfillment.py` | Existing selection normalizers and selected-offer finalization | 86 / 46 |
| `billing/stripe_support.py` | Existing Stripe client configuration, price constants, metadata and provider identity matching | 66 / 16 |
| `billing/checkout_context.py` | Existing role-scoped checkout return navigation | 55 / 28 |

The existing pure URL and subscription-account modules remain. No new Django app, model, migration, generic service container, shared eligibility engine, outbox or alternative financial policy was introduced. Application operations keep their existing DRF response values; this change does not add an intermediate response abstraction just to increase layering.

## Protected rules and source preservation

- An authorized action uses the same account, pricing, provider customer/subscription, selected offers, settlement channel and response as before. Unauthorized actors remain blocked before the same reads/input parsing as before.
- Stripe webhook **event identity**, **payment-intent identity** and **business checkout attempt** remain distinct. The delivery row/transaction owner stays in `webhooks.receive_stripe_webhook`; payment ledger and booking/refund rules stay in payment handlers invoked within that transaction.
- A failed webhook attempt rolls back financial/booking writes, remains retryable, and cannot downgrade a concurrently completed delivery marker. A duplicate intent does not book twice or turn a refunded payment back into paid.
- Subscription events still validate provider customer/subscription identity, consult current provider state, preserve canceled-plan restrictions, and keep base and extra-seat lifecycles distinct.
- Payment finalization, competing-offer expiry, refund-required notices and post-commit callbacks retain their original lock acquisition, query and mutation order. Cancellation penalties still cannot finalize worker offers. No new concurrency behavior is claimed from SQLite.

AST comparisons against the immutable baseline verified:

1. All **five operation bodies** are identical after binding the original `request.user` / `request.data` accesses to explicit internal arguments. Original permission/parsing prefixes stay in the HTTP adapters. Readable formatting and removal of unused local imports do not change runtime decisions.
2. All **six event-handler bodies** are identical to their original selected branches. The dispatcher retains the original event/mode/paid predicates and fallback behavior.
3. The webhook signature/identity handling, transaction, successful/failed marker writes, exception handling and responses are identical after moving body/header extraction to its HTTP adapter.
4. All **ten moved helper definitions** and every endpoint decorator are AST-identical.
5. The aggregate provider-call inventory is unchanged: Customer.create 1; Subscription.create 1; checkout.Session.create 4; Subscription.retrieve 4; Subscription.modify 1; checkout.Session.list 1; Webhook.construct_event 1.
6. Existing assertion bodies in **16 changed test files** are unchanged, apart from the one independently characterized notification-counter assertion described below. Mock targets were moved to the implementation actually executed.

These structural checks complement execution. They do not establish live Stripe configuration or certify delivery/replay behavior against a real provider.

## HTTP boundary and caller ledger

| Route / writer | Guard and preservation evidence |
| --- | --- |
| `POST subscribe/` | Same authentication/throttle decorators; JSON parsing before existing billing-account authority check; same create-vs-read subscription selection. Existing owner/org-admin, denied actor, exact metadata/customer/return URL and invoice/card controls retained. |
| `GET subscription/` | Same account authority and query parameter behavior; account selection still permits its existing active-owner fallback; read remains non-mutating. |
| `POST subscription/seats/` | Same integer/minimum validation before account resolution; same row lock, provider-item/customer matching, desired/current extra-seat logic and response. |
| `POST charge-fulfillment/<id>/` | Same shift lookup and operational payer guard before JSON parsing; existing selector validation/free atomic confirmation/idempotency key/Stripe payload preserved. |
| `POST charge-penalty/<id>/` | Same shift lookup/payer guard/account subscription read before JSON parsing; wage, cutoff and half-up cents calculation unchanged. Historical timezone behavior is deliberately not changed during extraction. |
| `POST webhook/` | Same CSRF/auth decorators and body/header extraction; signature rejection, unique delivery record and transactional dispatch now owned by `webhooks.py`. Existing failed/retry/replay/late-event/refund/booking-loss tests retained. |
| Shared booking finalizer | Same function body in `fulfillment.py`; both checkout and paid-event owners import it. No second booking policy. |
| Admin, serializers, tasks and external private imports | Repository-wide reference search found runtime HTTP routes in billing URLs; other references were tests. Legacy private helper imports in `billing.views` remain explicit compatibility aliases. No workflow module imports `billing.views`, no reverse proxy or mutable global forwarding was introduced. |
| Mock/patch boundaries | Provider method patches use the shared `stripe_support.stripe` client; the one whole-client mock patches `subscription_operations.stripe`. Webhook/finalizer/logger stubs patch their new execution owners. Old private import aliases do not silently reconnect implementation ownership to views. |

## Baseline and targeted execution

Python **3.12.14**, Django **5.2.17**, real migration graph on disposable in-memory SQLite with `core.contract_test_settings` and CI placeholder configuration.

The initial unchanged billing baseline discovered **145** tests and exposed one existing stale assertion from the preceding notification-channel repair: the outage test expected one broadcast attempt, while the service correctly tries both `notification.created` and `notification.counter`. It reported **141 passed, 1 failure, 3 PostgreSQL-only skips**. The correction asserts those two event types in order, while retaining the durable refund/payment/replay assertions. It changes no production behavior.

After that test-only correction, before decomposition, the same selection passed: **142 passed, 3 skips**, 8.338 seconds. The decomposed implementation then passed the same selection: **142 passed, 3 skips**, 8.744 seconds.

Five new HTTP boundary tests ran against a separate detached checkout of the immutable baseline and passed **5/5**, 0.089 seconds. They establish authorized/unauthorized/missing-shift malformed-JSON precedence, subscription checkout's earlier parsing, and seat validation before missing account context. The same tests are included after decomposition. No baseline application source was edited to obtain these results.

Three new architecture/routing contracts passed **3/3**: HTTP adapters cannot write or call Stripe directly; billing runtime module dependencies are acyclic; subscription, payment, refund and unsupported/unpaid event paths dispatch separately.

### Final source command and result

```bash
python backend/manage.py test billing \
  shifts.test_payment_notification_isolation shifts.test_shift_actions_contract rewards.test_rewards \
  core.test_module_size_ratchet core.test_backend_ownership_boundaries \
  --settings=core.contract_test_settings --verbosity=1
```

**231 discovered: 219 passed, 12 existing PostgreSQL-only skips, zero failures/errors; 12.139 seconds after setup.** No assertion was skipped or weakened to accommodate the move. Test selections overlap; do not sum them as unique project coverage.

- Migration drift: **no changes**.
- Whitespace: passed.
- Official size and ownership ratchets: passed in the final selection; `LARGE_MODULES = {}` remains unchanged.
- Final source AST/provider-call/endpoint-decorator preservation checks: passed.
- Global import-cycle baseline: passed; **97 module-level edges, 72 delayed edges, seven approved mutual pairs** remain. Billing's internal runtime import graph is acyclic. This does not claim removal of wider cross-app debt.

Local PostgreSQL was unavailable; package setup could not complete because of environment permissions. No local PostgreSQL result, race proof or populated upgrade rehearsal is claimed. Existing hosted workflows will run the resulting head's PostgreSQL selections; skipped or pending jobs are not passes. No production edit followed the final source run; subsequent changes add this evidence and mark the earlier billing checkpoint superseded.

## Completion boundary

Stage I's agreed responsibility-based decomposition is **implemented**, subject to final integrated hosted acceptance. The wider circular dependencies, remaining bounded notification candidates and environment/provider/native/staging release checks remain separate. No live Stripe/email/broker operation, deployment, merge or production data operation occurred. PR remains draft / NOT MERGE-READY until applicable acceptance is established.
