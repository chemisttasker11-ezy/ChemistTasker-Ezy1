# M4-01 — Appendix E / J5 behavioral conversion mapping

Source inventory: `frontend_mobile/scripts/workforce-request-isolation.test.cjs` (old lines 288–291).

| Former assertion | Executable replacement | Classification / proof |
| --- | --- | --- |
| `key={scopeKey}` source regex (old :289) | `C: attendance scope content identity responds to account, pharmacy, screen and route changes` | Calls real `AttendanceParityScreen` and captures actual JSX child `key` at render; distinct accounts must not reuse children |
| `scopeKey` template source regex (old :290) | Same C above; `R: attendance manager capability change remounts scoped content without a site or user change` | Tests account, site, screen, route and manager flag via actual `useAuth` and `useWorkspace`; R fails on base's role-only manager detection |
| Unmount invalidation source regex (old :291) | `R: live pharmacy switch while A's timeline is pending` in `frontend_mobile/scripts/m4-attendance.test.cjs` | Uses deferred A timeline, live B context and stale completion to assert no prior-site state; additionally exercises remount/unmount cleanup behavior through production hooks |

No assertion is deleted without replacing the behavior it protected. These conversions belong to M4-01 and do not modify the orchestrator-owned job-pack branch.
