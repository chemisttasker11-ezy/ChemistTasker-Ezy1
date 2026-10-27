# Grill Me interview playbook

## Purpose and guardrails

This is an owner-led product decision process, not a coding session or a repeat of the release audit. PR #203 is the base snapshot; its latest source must be rechecked when an area is discussed. The original October 20 Grill is historical input, not proof of current behaviour.

## Repeatable question format

For each open decision, present only one question at a time:

1. **Question and why it matters**
2. **What the current code actually does**, with exact paths/lines and commit SHA; mark unverified if not inspected
3. **Realistic scenario**, including a normal path and an edge case
4. **Options**, in plain language with concrete consequences for worker, pharmacy, organisation, platform, money, privacy and support
5. **Recommendation**, clearly marked as advice rather than the owner's decision
6. **Owner answer**: selected option, custom answer, or defer
7. **Acceptance examples**: positive, negative, boundary and cross-role/client cases
8. **Dependencies and downstream questions**
9. **Decision ledger entry** with date and source

Ask the owner to decide, then wait. Do not batch a long questionnaire into one turn. Use short plain-language explanations before technical detail.

## Before asking

- Read the area map and legacy question inventory.
- Check the exact current PR head and inspect the relevant source and tests.
- Search the decision ledger for an existing binding answer.
- Classify each item: settled decision, genuinely open policy, verified defect, legal/compliance advice, or optional enhancement.
- Do not ask the owner to decide whether a reproducible defect exists; explain the defect and propose a safe fix.
- Do not present an unverified statement from the old questionnaire as current behaviour.

## Scenarios to cover where applicable

- Normal successful path.
- Boundary conditions and time zones.
- Duplicate/concurrent actions and retries.
- Cancellation, deletion, suspension and restoration.
- Wrong tenant, role, pharmacy, organisation or audience.
- Web versus Expo mobile versus Next/shared-core behaviour.
- Payment success/failure, delayed webhook, refund and reconciliation.
- Accessibility and small-screen usability.
- Audit history, retention and privacy.
- Failure recovery and support escalation.

## After each area

Create or update:
- an owner-approved area specification;
- a table of decisions and explicit deferrals;
- a separate implementation backlog with acceptance criteria;
- a risk list and dependencies;
- a current-source evidence note tied to an exact commit.

Mark the area **discussion-complete** only when the Area Definition of Done in AREA_MAP is met. This does not mean implemented, tested or production-approved.

## No-code boundary

This branch is documentation only. Do not modify product code, schemas, migrations, environment configuration, workflows, deployment, billing settings or production/staging data. Do not merge PR #203, change its state, or start the owner interview automatically.
