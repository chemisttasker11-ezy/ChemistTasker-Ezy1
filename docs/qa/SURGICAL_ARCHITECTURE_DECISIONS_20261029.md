# PR #213 — remaining architecture decisions

Date: 29 October 2026 (Australia/Brisbane). Continuation baseline: `0bc2da97c8d31c511bd0f7ccece60a7d9f834e91`; base: completed E17 `0e2a4a14344492cddab1ed2998c14340d538ad30`.

## Outcome

The bounded R4–R6 review is complete. It found no additional concrete scope/eligibility defect and no useful pricing/time extraction in this batch. Keep the existing domain owners and record the remaining dependency debt. The conditional Stage J stop criterion is met: the safely common mechanics are too small to justify a new abstraction, while merging the calculations would conceal meaningful differences.

This is not a claim that all architectural debt is eliminated. Booking fixes and the billing extraction have their own evidence documents. No eligibility, Award, holiday, pricing, invoice or timezone policy is changed here.

## R4 — dependency graph

The current `scripts/module_import_graph.py --json --check --check-baseline` scan passes with:

| Measure | Result |
| --- | ---: |
| Module-level app edges | 97 |
| Delayed app edges | 72 |
| Mutual pairs | 7 |
| Existing strongly connected components | 1, containing 11 apps |
| Existing longer-cycle edges outside the mutual-pair allowlist | 29 |
| New unapproved mutual pairs, cycle edges or expanded components | 0 |

The seven pairs remain `chat/core`, `client_profile/onboarding`, `core/shifts`, `core/users`, `memberships/organizations`, `memberships/users` and `organizations/users`. The SCC contains `chat`, `client_profile`, `core`, `memberships`, `notifications`, `onboarding`, `organizations`, `public_hub`, `shifts`, `talent` and `users`.

The changed owners do not supply a natural way to remove one of those cycles. `core` contains real URL, ASGI, WebSocket and sitemap composition; users/membership/organization edges contain identity and action policy; the onboarding compatibility edge includes a migration-bound encrypted field. Moving those responsibilities into generic helpers, or only delaying imports to lower the count, would not establish simpler ownership. The existing graph baselines are unchanged.

`docs/architecture/BACKEND_DOMAIN_DEPENDENCIES.md` is corrected to distinguish the already deferred attendance/workforce dependency from current cycles, and to reflect that pricing data already lives in `shifts/data/` under `shifts.pricing_data`. Passing the ratchet establishes no regression, not an acyclic backend.

## R5 — scope and eligibility

| Fact or action | Existing owner and inspected evidence | Decision |
| --- | --- | --- |
| Organization membership covers pharmacy | `users/org_roles.py:275`, `membership_covers_pharmacy` | Keep as a coverage fact. Organization identity is checked before wide/assigned scope. |
| Invite, change membership, decide application | `memberships/access.py:12`, `:45`, `:82` | Preserve separate actor, capability and owner-derived membership rules. Coverage alone does not grant the action. |
| Roster/staff management | `workforce/permissions.py:13`, `_org_has_capability` and public action helpers | Retain active actor + action capability + pharmacy coverage. Staff and roster authority intentionally differ. |
| Pharmacy-record editing | `organizations/access.py:148`, `user_can_edit_pharmacy_record` | Retain its own action authority; managing a roster does not authorize editing the pharmacy record. |
| Public application | `onboarding/verification/state.py:170`, `require_public_ahpra` | Keep public/member exceptions and existing after-commit verification scheduling. This function is not a read-only explanation API. |
| Booking after verification may change | `onboarding/verification/state.py:181`, `lock_public_ahpra` | Keep locked transaction-time recheck. A prior read does not authorize a later booking. |
| Shared shift explanation | `shifts/serialization/projections.py:129`, `SharedShiftSerializer.to_representation` | Preserve role-only `can_apply`, including `None` for anonymous requests. Do not broaden the meaning silently. |
| Attendance eligibility | `attendance/eligibility.py:196`, `resolve_attendance_eligibility` | Preserve its read-only, action-specific result and assignment/member/unbooked-cover tiers. |
| Accepted invoice source | `invoicing/services.py:19`, source-selection helpers | Keep worker ownership, accepted terms and settlement routing. Present public-application eligibility is not reapplied to historical accepted work. |

The inspected public guard call sites belong to mutation workflows. No concrete consumer in this continuation requires a new common explanation adapter. The broader action/context explanation contract remains an optional, unimplemented feature; a universal `eligible` or `authorized` result is not introduced. This review does not certify unrelated permission callers or optimize unmeasured query costs.

## R6 / Stage J — retain distinct interval calculations

The shared business fact already has an owner: `shifts.holidays` resolves store-specific holiday classification and boundaries. Both calculations consume it. Their interval and valuation contracts differ:

| Aspect | `shifts/pricing.py` | `shifts/engagement.py` |
| --- | --- | --- |
| Input duration | Local date/time, overnight end advances one day (`:48`) | Local date/time, overnight end advances one day (`:382`) |
| Cutpoints | Pricing buckets plus explicit date-dependent cutpoints from July 2026 (`:95`) | Current weekday/weekend/holiday classification selects cutpoints as the cursor advances (`:421`) |
| Concrete difference | Current weekday pricing also splits at 18:00 | Weekday Award-floor boundary list does not split at 18:00 |
| Precision | Segment hours quantized to four decimals (`:60`) | Unquantized duration used for accumulation, display formatted separately (`:452`) |
| Review behavior | Generates pricing explanations and segment totals | Can return early for duration/overtime review and retains relevant segment/review evidence (`:387`, `:440`) |
| Output | Rate, buckets, metadata and segments | Award-floor rate, payroll/review state and segments |

A shared union of cutpoints could change segments and intermediate rounding even when the final rate looks unchanged. A configurable abstraction that models both loops would add more policy choices than it removes. Extracting only the few common overnight/filtering lines provides no meaningful ownership improvement.

The decision is therefore to retain these implementations under the plan's explicit stop condition. The 600-case pricing fingerprint remains unchanged. No data, golden fingerprint or rate schedule was adjusted.

`worker_finance/calculations.py:58`, `shift_hours`, is deliberately separate: it accepts timezone-aware instants, calculates UTC elapsed time and deducts unpaid breaks. It is not a replacement for either local-clock interval contract. PR #211's timezone/attendance presentation work is not revisited.

## Executed preservation checks

| Check | Result |
| --- | --- |
| `shifts.test_pr201_b14`, `test_pr201_holidays`, `test_pr201_award_floor`, `test_pr201_employee_work_base`, `test_pricing_contract` | **43/43 passed**, no failures/errors/skips; includes the unchanged 600-case rate/metadata fingerprint. |
| `python3 backend/shifts/data/reconcile_public_holidays.py --check` | Passed: eight state/territory calendars, 56 local regions and 10 part-day records validated. Existing explicitly pending dates/years remain pending. This is offline structure/source-reference validation, not a fresh government-calendar certification. |
| `python3 scripts/test_module_import_graph.py` | **11/11 passed**. |
| `python3 -m unittest discover -s scripts -p 'test_attendance_workforce_dependency.py' -v` | **4/4 passed**. |
| Runtime import graph with both reviewed gates | Passed with the values above. |
| Independent read-only review | Agreed with retaining the boundaries; identified the stale pricing-data documentation, now corrected. |

The pricing selection used the pinned isolated backend runtime and `core.contract_test_settings`; it required no database setup. An initial scanner invocation using package import syntax could not resolve its sibling module; the documented direct invocation above passed unchanged. An exploratory nonexistent script path ran no tests. These invocation mistakes are not product failures or passing evidence.

These checks support the stated preservation decisions. They do not replace final published-head CI, live provider validation or authorized release acceptance.
