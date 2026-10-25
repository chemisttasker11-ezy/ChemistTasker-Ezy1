# Light Senior Review — ChemistTasker Engineering Handbook

**Version:** 1.0 — 26 October 2026 (Australia/Brisbane)  
**Invocation:** **"Light Senior Review"** (alias: **"Fast Senior Review"**)  
**Purpose:** Senior-level, efficient investigation, coding, review and specific testing **while work is in progress**.

This handbook is **independent of**, and sits beside, [Senior Package Testing](SENIOR_PACKAGE_TESTING.md). It does not replace, edit, weaken or silently invoke the full handbook. The owner's full **Senior-package-testing-handbook.md** in the Library also remains unchanged.

## 1. Choose your review mode

| When | Say | Outcome |
| --- | --- | --- |
| **Work still being developed**: coding, refactoring, implementing a feature, checking a draft PR | **Light Senior Review** | A quick, scoped senior review with targeted tests, fixes if permitted, and a concrete work-status decision |
| **Specific bug, security issue, UI problem or failing test** | **Light Senior Review on [issue/PR]** | Investigate cause, reproduce, fix when requested and verify the affected workflow |
| **Read-only investigation, no fixes** | **Light Senior Review — audit only** | Findings and evidence without product-code changes |
| **Feature/PR implementation finished and ready for comprehensive verification** | **Senior Package Testing** | All applicable final-head gates, integration, migrations, device/browser/staging evidence and explicit final approval assessment |
| **Production release / merge sign-off** | **Senior Package Testing** | Comprehensive acceptance evidence and release decision; owner approval still required for merge or deployment |

**Owner selection controls the mode.** Do not switch from Light to Full because an agent wants to avoid taking responsibility for a scoped conclusion. If work is still in progress, default to Light unless the owner explicitly requests the Full package. Full testing is not an everyday coding loop. It is a **final gate when the work is complete**. A full test package may be started early only if the owner explicitly requests that.

### Two different completion decisions

- **LIGHT COMPLETE** means the **specified investigation/work package** is finished, its relevant tests have been checked, and its remaining in-scope limitations are stated. It **does not** assert that the whole application was audited or is ready for production.
- **FULL PACKAGE COMPLETE** means the applicable finished-work acceptance steps in the original Senior Package Testing handbook have actually passed at the proper candidate SHA and the release decision is supported. If a required gate is blocked, label the full package **NOT COMPLETE** with the exact blocker.

Never let the phrase **"not the entire repository reviewed"** block closure of a valid Light task. Conversely, never use Light to claim production readiness.

## 2. Senior responsibilities that remain mandatory

1. **Own the requested outcome.** Investigate, decide, implement when authorised, test and conclude. Do not manufacture additional phases, endlessly move the finish line or repeatedly ask the owner to say "continue".
2. **Preserve the correct repository and scope.** Work on \`chemisttasker11-ezy/ChemistTasker-Ezy1\` unless otherwise directed. Read the exact PR/base/head SHA, newest relevant commit, existing findings and owner decisions. Respect unmerged PR stacks and do not overwrite others' changes.
3. **Preserve architecture and business rules.** Django enforces tenant, role, privacy, finance and state-machine authority. Shared-core owns cross-client contracts. Vite, Next and Expo have distinct session/transport responsibilities. Kiosk signs and replays offline events. Don't create a second source of truth.
4. **Never dilute safety to pass tests.** Do not weaken permission checks, leak personal data, hide Stripe errors, compromise payroll/Award compliance, silently delete migrated data, fake test results or change expected assertions merely to turn CI green.
5. **Keep operations safe.** Use disposable test databases, test identities and authorised environments. No direct push to \`main\`, merge, staging/production deployment, destructive migration, production data edit, force push, secret disclosure or skipped protection without explicit owner permission.
6. **Report observed evidence, not aspirations.** Distinguish \`PASS\`, \`FAIL\`, \`BLOCKED\`, \`NOT RUN\`, \`EXPECTED RED\`. Skipped workflow is not PASS. Older-head passes remain historical. Mocked Stripe and synthetic fixtures are not real-provider or production evidence.

## 3. The fast senior engineering loop

**A. Frame the actual question (one paragraph).** State the user action/business outcome and the **in-scope** boundaries. Focus first on one high-risk workflow or one failing feature. Do not declare a 99% repository-wide file-review target for an incremental task. Write what is explicitly out of scope.

**B. Review existing evidence once.** Look at the latest PR diff and affected files, relevant handbook/owner decisions, last meaningful CI results and existing PR #200/#201 findings if relevant. Deduplicate before opening another issue. Do not regenerate inventories or massive progress trackers.

**C. Trace the path that matters.** Trace only needed end-to-end segments: user/persona -> Vite/Next/Expo/kiosk -> shared-core/API -> Django authorization/serializer/service -> PostgreSQL/Stripe/notifications -> resulting client state. For a UI-only issue, confirm its backend contract without rereading all Django files. Expand scope only when a dependency is causally implicated.

**D. Prove or reject suspected defects.** Prefer one valid negative test **and** one valid positive control for meaningful behavior. Confirm fixture validity. For pure logic, a focused unit/contract test may suffice; for security, test unauthorized and authorized personas; for payments/concurrency, run a real isolated PostgreSQL multi-connection test when the conclusion depends on it. A hypothetical race is not a runtime-reproduced exploit.

**E. Apply the smallest safe change** **only when fixes are requested or authorised**. Put the change in the owning domain and add/update a regression test. Avoid speculative refactoring, architectural rewrites, unrelated dependency upgrades and new broad audit machinery. In **audit-only** mode, record the defect and a correction suggestion instead; do not modify application code.

**F. Test the changed behavior immediately.** Run targeted tests on the exact current head, inspect failures and relevant side effects. Fix actual in-scope regressions, rerun and conclude. Do not automatically rerun the complete CI matrix after every edit. Existing broader CI may run in the background while coding; evaluate exact-head results when they become available.

**G. Close this work package.** Say clearly what passed, failed, is conditional and remains outside scope. If the requested issue is fixed and the targeted acceptance checks pass, declare **LIGHT COMPLETE**, not "incomplete because the whole system was not reviewed." If a real in-scope blocker remains, say **LIGHT BLOCKED** and name precisely why.

## 4. Testing ladder — choose the smallest level that proves the change

| Changes under review | Minimum targeted evidence | Expand only when necessary |
| --- | --- | --- |
| Backend Django permission/role | Positive authorized request, negative unauthorized request, affected contract tests | PostgreSQL for transaction/race or DB-specific behavior |
| Shift booking, billing, refunds, Stripe webhooks | State transition and idempotency tests; check financial side effects | Real isolated PostgreSQL concurrency; Stripe test mode for provider-dependent claims |
| Payroll, Award, holidays | Correct effective-dated source, pharmacy location rule, example pay-rate and boundary calculations | Real attendance/timesheet/export path if changed; external authority verification for current Award rules |
| Shared-core or API transport | Changed domain tests, typecheck, and consuming client contract | Additional Vite/Next/Expo checks where touched |
| Vite or Next UI / UX | Affected build/typecheck and specific user journey; inspect relevant responsive state | Playwright and screenshots for changed visual/interaction flow |
| Expo native | Relevant TypeScript/lint and changed mobile flow | Android/iOS simulator/device testing if native behavior requires it |
| Kiosk/offline attendance | Signature/replay/sequence/permission tests | Native and sync tests for affected boundary |
| Schema migration | Migration plan and fresh isolated migration test; existing-data impact reasoning | Populated isolated upgrade/restore rehearsal before any risky rollout |
| Architecture-only refactor | No-drift contracts for altered boundaries and affected domain tests | Full matrix later, when finished work enters Senior Package |

**One genuine failing gate matters more than hundreds of unrelated green tests.** Diagnose test fixture mistakes separately from product bugs. For intended-red audit workflows, record the negative reproduction as proof of the **baseline defect**, not as evidence the correction is broken. After a fix, the same negative should turn green at the corrected head.

Use only the repository's existing commands/workflows and correct Docker root build context. The original [Senior Package Testing](SENIOR_PACKAGE_TESTING.md) contains the precise full-workflow paths and commands; consult only the relevant sections when needed.

## 5. Findings discipline: accuracy without paralysis

Every finding must be classified with one short explanation:

- **CONFIRMED** — fixture-valid reproduction or conclusive source plus demonstrated impact.
- **CONDITIONAL** — credible issue, but the missing prerequisite/test is named.
- **FIXED AND VERIFIED** — linked commit and passing relevant tests at the verified SHA.
- **ALREADY FIXED / DUPLICATE** — links existing root and avoids re-reporting.
- **REFUTED** — the actual guard or negative control disproves the claim.
- **POLICY DECISION** — implementation depends on the owner's business rule; preserve current behavior if not yet decided.

**Prioritize P0/P1 user, tenant, authorization, money, privacy, booking, attendance and data-integrity risks**, then regressions preventing a real user from completing a journey. Do not inflate a finding merely because it has many call sites or repeat issues across findings documents.

Risk is **not** an excuse to avoid a decision. When a blocker is genuine, name the exact failing contract and required action. When the scope is complete, state that directly.

## 6. Time, token and evidence economy

- Read the **changed files and their causal dependencies**, not every file in the repository.
- Reuse existing tests, manifests, evidence and CI runs. Don't make a parallel coverage ledger.
- Make one concise handover or PR note per meaningful work batch; consolidate, don't create dozens of near-duplicate markdown files.
- Prefer targeted test runs after changes. Do not repeatedly run a full, expensive CI suite during development.
- If two targeted attempts are blocked by the same external environment/runner issue, document it and move to another productive in-scope task; do not loop or invent a workaround that weakens confidence.
- Do not claim "fully security audited" from a small review. Equally, do not insist on independent 99% semantic file certification before declaring a scoped UI/bugfix investigation complete.
- When a multi-step request is feasible, continue through its bounded in-scope steps autonomously. End with a decision, not a list of reasons to start another audit round.

## 7. Light review finish line and single-page handover

A Light task is **LIGHT COMPLETE** when:

1. The named user/business workflow and relevant code/dependencies have been inspected sufficiently to answer the question.
2. The in-scope suspected defect is reproduced/refuted; for implementation tasks, the authorised correction is committed to the appropriate branch.
3. Relevant positive and negative tests have been inspected at the current affected commit (or a named environment blocker is explicit).
4. No unaddressed **in-scope** critical failure is presented as passing; any residual issue has a named owner/action.
5. A concise conclusion and next step are supplied.

Suggested response format (typically 8–15 lines, not a 50,000-line ledger):

\`\`\`text
Mode: LIGHT SENIOR REVIEW
Target: <PR/issue/feature>   Exact SHA: <...>
Scope: <user flow, permissions and boundaries reviewed>
Result: LIGHT COMPLETE | LIGHT BLOCKED | FINDINGS ONLY
Confirmed: <root cause and impact, or NONE FOUND IN SCOPE>
Code: <commit/PR link, or NO CODE CHANGES>
Checks: <test -> PASS/FAIL/EXPECTED RED/BLOCKED, with run link>
Unresolved IN scope: <specific issue or NONE>
Outside scope: <short, relevant boundaries>
Next: <one actionable step, or ENTER FULL SENIOR PACKAGE WHEN FINISHED>
\`\`\`

For read-only checks, use **FINDINGS ONLY — LIGHT REVIEW COMPLETE** when the requested investigation is genuinely finished. Do not block that status because a later production release still needs full testing.

## 8. Escalation to the original Full Senior Package

When the feature/PR is **implemented and stabilized**, the owner may invoke **"Senior Package Testing"** to execute the original full handbook: exact-head CI and security, SQLite/PostgreSQL, Docker QA, migrations and safe upgrade, appropriate Vite/Next/Expo integration, Playwright, native acceptance, staging and final release evidence. The full package remains unchanged and authoritative for release sign-off.

If Light reveals a serious uncontained vulnerability or financial integrity threat, report and contain it within the approved scope; identify any wider affected pathways. **Do not silently mark the release safe**, but do not start an unlimited whole-repository audit without the owner's instruction.

### Copy/paste prompts

**While developing:**  
> Light Senior Review of PR #201. Continue fixing the known in-scope failures. Investigate their real causes, make surgical changes, run targeted positive and negative tests, commit to the existing approved branch, and close each work package with evidence. Do not start the Full Senior Package or reopen the entire PR #200 audit.

**Specific testing only:**  
> Light Senior Review, tests only, on the payroll/holiday changes. Check official Award calculations and store-location rules through affected API/service/tests; do not modify application code. Report confirmed defects and give a scoped conclusion.

**When coding is finished:**  
> Senior Package Testing on the completed PR, using the existing full handbook for all applicable final-head gates and explicit acceptance.

---

**Maintainer note:** This is a *choice of workflow*, not a weakening of release standards. Keep the original full handbook byte-for-byte unchanged. New Light reviews should not add another permanent audit framework or require changes to the full handbook.
