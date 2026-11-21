# PR200 Phase 5 high-risk P1 HTTP verification batch

Frozen source: `b77e9fd296bc2710350ef6f3cd402ce2529ffc06`. Eight *test cases* in `backend/qa_release/test_pr200_phase5_p1.py` plus existing tests. No production code/migrations/deployment.

Root/ID mapping: `F09-N4` public poll unauthorized PATCH/DELETE (2), `C005-N1` ordinary chat-room member changes participant list (1), `C004-N1` foreign pharmacy recruitment into custom group (1, product-policy caveat), `C012-N1` disabled/expired numeric invite-link direct application bypass (1), `C012-N2` permanent deletion of decided application records (1), `C024-N1` reset token copied to signed-in bell (1) plus unknown email anti-enumeration positive control (1).

**Test validity rule:** A positive-control failure or fixture error is `TEST_INVALID`, not a production finding; correct the test, re-run exact SHA and preserve prior artifacts. All safety-negative failures are source findings **only** until a runnable Django request reaches the relevant branch. No fabricated exploit or green result.

Functional privacy caveat: cross-pharmacy custom chat may be a deliberate capability; classify `C004-N1` as `POLICY/CONDITIONAL` unless owner policy defines contact/consent. Other tests enforce ordinary ownership and audit-trail protections without assuming UI behaviour.
