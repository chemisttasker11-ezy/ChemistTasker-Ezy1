# PR #200 finish: handover (25 October 2026, 00:20 UTC)

Audit-only. Baseline app commit `b77e9fd296bc2710350ef6f3cd402ce2529ffc06` (= main at the time; this PR changes no app code).
Anyone continuing (local orchestrator or an online agent) starts here.

## 1. Where it stands
- **File-by-file pass:** 51 of 89 chunks done = **1,134 / 2,151 source paths (52.7%) read in full** by an agent, each with a verdict (OK / ISSUE / NOTE / NA). Ledger: [`evidence/MAIN_RELEASE_FINISH_LEDGER.csv`](evidence/MAIN_RELEASE_FINISH_LEDGER.csv) (columns from the 99% plan; `PENDING` rows are not reviewed yet).
- **End-to-end flow traces:** 11 of 12 done (F01-F11). F12 (web vs mobile parity) is left. Definitions: [`evidence/pr200_finish/flows.json`](evidence/pr200_finish/flows.json).
- **139 new candidate findings** (3 P0, 95 P1, 41 P2), all UNCONFIRMED: [`MAIN_RELEASE_FINISH_FINDINGS.md`](MAIN_RELEASE_FINISH_FINDINGS.md). P0 candidates: `F03-N1`, `F04-N1`, `F04-N2`.
- Not done yet: dedupe, second-agent verification, targeted tests, agy UI checks, grill/fix classification.
- Open item, unrelated to the findings: this PR adds `.github/workflows/pr200_readonly_static_audit.yml` with `contents: write` and `workflow_dispatch`. Drop it, or cut it to `contents: read`, before anything from this PR reaches main.

## 2. How the pass works (files in `docs/qa/evidence/pr200_finish/`)
| File | What |
|---|---|
| `chunks.json`, `files_Cxxx.txt` | The 2,151 inventory paths split into 89 chunks (~200 KB each, grouped by folder) |
| `BRIEF_TEMPLATE.md` | The file-chunk brief: read every listed file in full, verdict per file, real problems/production blockers only, the fixed cast, strict JSON reply |
| `FLOW_TEMPLATE.md`, `flows.json` | The cross-file flow brief and the 12 flows |
| `KNOWN_FINDINGS.md` | B01-B65 (do not re-report) |
| `FILE_PASS_TITLES.md` | Titles of every new candidate so far (do not re-report) |
| `out_<id>.json` | One agent's answer per chunk/flow. A chunk counts as done only when this file exists and lists >= 98% of its paths |
| `merge.mjs` | `node merge.mjs` rebuilds the ledger, `raw_findings.json`, `FILE_PASS_TITLES.md` and `../../MAIN_RELEASE_FINISH_FINDINGS.md` |
| `run-review.mjs` | Local fleet runner (Windows paths, my-stack relays). Online agents do not need it |

## 3. Remaining work, split so two workers never take the same chunk
| Who | Chunks | What they cover |
|---|---|---|
| **Local fleet** (Codex A/B after their reset ~04:45 UTC, Claude B after 02:40 UTC) | C008-C016, C046, C048, C054, C056-C061, F12 | backend core/dashboards/ethical_marketplace/marketplace/memberships/onboarding/organizations/pharmacy_hub, two web pages, Expo app routes and parity screens, the web-vs-mobile flow |
| **Online agent** | C064-C078, C080, C082-C086 | Expo shared screens (C064-C071), Vite e2e + Next.js site (C072-C078), scripts (C080), docs/archive + .agents skill scripts (C082-C086) |

If one side finishes early it may take the other's chunks, from the END of that list, after pulling and checking no `out_<id>.json` exists.

### Recipe for one chunk (any agent, no fleet tools needed)
1. `git pull` this branch. Skip the chunk if `docs/qa/evidence/pr200_finish/out_<id>.json` exists.
2. Read `BRIEF_TEMPLATE.md` (follow it exactly; ignore its PREAMBLE placeholder), `KNOWN_FINDINGS.md` and `FILE_PASS_TITLES.md`.
3. Read every path in `files_<id>.txt` in full. Open a caller or helper only when needed to judge a file.
4. Write the strict JSON answer to `out_<id>.json` (add `"reviewer": "<your name>"`). Every path must appear once.
5. `node docs/qa/evidence/pr200_finish/merge.mjs`, then commit `docs(audit): PR200 finish - <id>` and push. One chunk per commit keeps conflicts small (`out_*.json` never collide; regenerate merge outputs after a pull if they conflict).

For F12 use `FLOW_TEMPLATE.md` with the F12 entry from `flows.json`.

## 4. After the pass: finish order (be specific, save tokens)
1. **Dedupe** `raw_findings.json` (also against B66-B71, which wave 14 added in parallel after this pass started): the same root cause found by a file chunk and a flow trace becomes one finding (keep the best evidence; list the other ids).
2. **Verify every P0 and P1 with a different agent than the one that found it** (Codex verifies Claude/agy findings; Claude B verifies Codex findings). Read only the cited `path:line` evidence and its direct callers. Record `CONFIRMED`, `REJECTED` (with reason) or `DUPLICATE_OF` in `evidence/pr200_finish/VERIFIED.json` (`{ "<id>": {"verdict": ..., "reason": "...", "verifier": "..."} }`). P2s are verified only if they will become a grill question or a fix.
3. **Targeted tests only where a finding is not obvious from the code**, on the local Docker stack (Postgres + Redis compose stack, not SQLite run folders). One small negative test per finding, run once, result recorded in `VERIFIED.json` (`"test": "<command> -> FAIL as predicted"`). No broad suites, no fixes in this PR.
4. **agy UI checks as a user**, for confirmed findings that a person would see on screen (web or Expo): one agy slot per profile at most (agy is the front-end checker for the fix phase too, so save it). Brief per the my-stack visual lane (`ui-shots.ps1`, demo mode, named screens only); reply <= 10 lines per finding.
5. **Classify** each confirmed finding: **GRILL** (needs an owner decision; becomes a scenario question with the fixed cast, options, a recommendation, and the owner's previous answer or settled decision as a hint) or **FIX** (clear bug, obvious smallest fix). The owner will run one clean, final grill over the whole project on top of this work and current main, then all fixes.
6. Update `MAIN_RELEASE_AUDIT_TRACKER.md` (coverage and counts) and this handover.

## 5. Rules
- Audit only: no app code, migration, config or deployment changes in this PR. Fixes come after the grill, on a separate local branch.
- Real problems and production blockers only; no speculation, no style nits. Zero new findings is a fine result.
- Ponytail (full) for anything you write: the smallest complete change.
- Quota (local fleet): one slot per account, cheaper models for plain file reading, Opus only for flow traces and verification. On 25 Oct 19 parallel agents emptied Claude A/B 5-hour windows, Codex A/B and agy g2 within ~25 minutes; do not repeat that. Codex's "Your workspace is out of credits" means its usage limit is reached (the message offers paid top-up); it comes back at its reset.

## Continuation: 25 October 2026 — C008 and P0 verification

- **C008 completed:** all 36 backend/core paths read and recorded as a distinct file-review output in [out_C008.json](evidence/pr200_finish/out_C008.json), commit `0b5d4ed8ce08b77ee64dd4e16ff690f78e812adc`. No new distinct findings; `file_validation.py` attaches existing B49, and `serializer_lifecycle.py` attaches existing B44. Do NOT rework C008.
- **Three P0 independently SOURCE-CONFIRMED** by a different reviewer: F03-N1, F04-N1 and F04-N2. Recorded in [VERIFIED.json](evidence/pr200_finish/VERIFIED.json), commit `b65af7b41ff9ffd873a910db3a94a26352d28f56`, with exact baseline source links, negative/positive tests and impact. **No HTTP/PostgreSQL/real-user test executed**; do not promote these to runtime-reproduced.
- The **last regenerated aggregate CSV remains 1,134/2,151** because `merge.mjs` was not run in the GitHub-only continuation. Rebuild the ledger from committed outputs at next local checkout: `node docs/qa/evidence/pr200_finish/merge.mjs`. Expected after correct refresh is **1,170/2,151** full-file agent-reported rows (54.39%); exclude the two audit scripts for frozen-main numerator (1,170/2,149).
- Done chunks now **52/89**, remaining **37**. Earlier F01–F11 traces unchanged; **F12 still pending**. No application code, tests, migrations or deployment modified.
- Note: `merge.mjs` does not edit `VERIFIED.json`; preserve the independent verification decisions when regenerating.

## Next-phase continuation — C009 complete (25 October 2026)

- Completed [C009](evidence/pr200_finish/out_C009.json) with **24 full-file verdicts** in core task/OTP/URL contracts, all dashboard views/tests and ethical marketplace schema, administration and import-commit path. Commit `342e42f001c3e363b9fa2f85e522e8ca79e0a15c`.
- **Three new unconfirmed source candidates:** C009-N1 P2 audience leakage through pharmacist/otherstaff dashboard community_shifts query (not the same as worker eligibility filter); C009-N2 P2 mobile 'Total Income This Month' populated by lifetime invoiced totals including drafts; C009-N3 P1 ethical import-commit stock mutation does not check `ETHICAL_INVENTORY_ENABLED` after an import was staged. Each has expected denial/permitted test requirements. No app code or test execution.
- Existing findings, including B41, were checked to avoid duplicates. The count is now **53/89 completed chunks, 36 remain**. Last generated ledger CSV remains **1,134/2,151** until `node docs/qa/evidence/pr200_finish/merge.mjs` is run. A rebuild including C008 (36) and C009 (24) would yield **1,194/2,151 = 55.51%** reported complete-file review; do not present it as a committed recalculated ledger or runtime/S2 certification.
- F12 remains pending. Further deep review of C010 ethical marketplace/invoicing is underway but **NOT counted complete**. Source-inspection only, zero new runtime reproductions and no production modifications. Next continuation first refresh PR head and existing out_C files, then finish C010 with a complete JSON verdict for every file.
