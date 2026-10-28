# ChemistTasker-Ezy PR201 Phase 6 remediation tracker

25 October 2026. Baseline main `b77e9fd296bc2710350ef6f3cd402ce2529ffc06`. PR200 audit head seen `af74e45930c53201ecaa1e1e62c3cf6570334bdb`; **Phase 5 S2 certification remains incomplete**. This is not an approval to launch.

| ID | Phase 6 implementation | Verification |
| --- | --- | --- |
| B35 | Protect direct roster create/update/delete tenant, slot and worker boundaries | targeted SQLite regression passed at prior head; broad roles/parity open |
| B24 | Deny unaccepted exchange completion | targeted regression passed at prior head |
| B25 | Atomic audience/version/escalation mutation | targeted regression passed at prior head |
| B31 | Lock exclusive listing; normalize UUID receipt; genuine PG two-connection testing | PG run 40197597391 success at `9b8993ed`; later commits not yet verified |
| B29 | Prevent signed drift from applying live attendance | dedicated standalone regression wired and prior run passed; approval/rejection/payroll downstream open |
| B01 | Active subscriber price per resolved account | targeted regression passed at prior head; provider catalogue verification open |
| B53/B68 | Canceled tombstones versus recoverable inactive Stripe subscription | targeted regression passed at prior head; provider ordering suite open |
| B57 | Partial/full refund status, cumulative amount, migration 0003 | targeted regression passed at prior head; downstream ledger/payment status adapters and populated upgrade rehearsal open |
| C004-N2/B04 | Bound paid checkout to selected units, preserve pre-live free operation | shared-core backend failure on `9b8993ed` exposed misplaced selector guard; repaired at `85938d77`, later gate pending |
| B69 | Sequential duplicate Stripe payment intent de-duplication | source fix committed; no unique constraint yet, concurrency open |
| B02 | Existing paid extra seats cannot be resized | policy decision, proration and provider reconciliation remain open |
| B10 | Pills charge unit/idempotency | product unit policy still open |
| B14 | Effective dated award/holiday source and pricing parity | open |
| Chat revocation, roles, WebSocket and F12 | End-to-end authorization/client parity | open |

### CI evidence
At `9b8993ed`, 40197597386 release blocker regression, 40197597391 PostgreSQL ethical concurrency, 40197597388 backend finalization, 40197597422 serializer, 40197597387 E2E, 40197597403 lint and 40197597398 CodeQL succeeded. Shared Core Consolidation 40197597441 **failed** on a pre-live billing compatibility test; fix was committed subsequently. Full Isolated QA, iOS and native acceptance were skipped, not passing evidence.

Do not count earlier green commits as exact-head validation. Review latest running checks and follow up failures. No production rollout, merge or staging deployment performed. No PR200 app edits.

**Release verdict remains NO-GO.**
