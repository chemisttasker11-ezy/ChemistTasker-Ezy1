# Phase 5 – distinct P0 verification and high-risk P1 regression contracts

Frozen source: `b77e9fd296bc2710350ef6f3cd402ce2529ffc06`.

The existing PR200 workflow now also executes `qa_release.test_pr200_phase5` and `client_profile.test_admin_invitations` on **frozen main**. All changes remain audit-only (Python tests/workflow/docs).

This adds:
- F03-N1: revoked admin disappears from pending invitation list AND cannot accept the old ID; legitimate staff membership remains active.
- F04-N1: public/platform shift is visible to an external worker, but staff-response listing must not be; valid pharmacy owner can list.
- F09-N1: a group-only Hub post remains unreadable by a same-pharmacy nonmember even after authorised deletion of its group; legitimate group member initially reads it.
- B03: membership removal must not erase historical messages for remaining coworkers while retaining unrelated coworker messages.

**Red tests may reveal real defects.** If any fixture fails before the target branch, mark `TEST_INFRA_BLOCKED` and correct the test harness; do not label an unexecuted case as runtime-reproduced. Do not change application logic, migrations, deployments or remediated PR201.

Source-level checks still lack independent second-person verification and do not establish 99% whole-repository semantic coverage.
