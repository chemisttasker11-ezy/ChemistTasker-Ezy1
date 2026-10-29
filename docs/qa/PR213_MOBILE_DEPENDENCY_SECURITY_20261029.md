# PR #213 mobile dependency security continuation

Date: 29 October 2026 (Australia/Brisbane). Reviewed starting head: `0bc2da97c8d31c511bd0f7ccece60a7d9f834e91`.

## Result and scope

The mobile dependency gate passes locally. After preserving the concurrent contributor's regression and install-time exploit check, the reconciled candidate passes all 34 dependency-security test cases and the strict live dependency gate. The earlier candidate also passed a fresh locked install, 33 security cases, all 71 configured mobile behavior cases, Expo lint and TypeScript; those results remain attached to that earlier candidate. The final reconciliation changes only security verification/test code and retains the same patch, package, lockfile and fingerprint bytes. Final published-head hosted CI remains the integration owner's next evidence step. This document does not declare the whole PR merge-ready.

The patch changes dependency code and its verification only. It does not change invoice calculations, booking/eligibility rules, native versions, application endpoints, provider configuration or deployment state. There was no live Stripe, email, native build or provider operation.

## Original failure and complete audit

[Current starting-head mobile job 123285442725](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/actions/runs/40824706527/job/123285442725) passed lint, types, eight existing security tests and 71 mobile behavior cases, then failed at `verify-dependency-security.cjs` on `GHSA-gcqx-w48m-w2h4`.

The assertion's `actual: undefined`, `expected: deepmerge` meant that the advisory was absent from the set of fingerprint-verified patches. It did **not** mean that the installed package identity was undefined.

A fresh complete `npm audit --omit=dev --json` found three direct advisory leaves, not only the first displayed CI error:

| Leaf | Original installed version and consumer | Action |
| --- | --- | --- |
| [deepmerge / GHSA-gcqx-w48m-w2h4](https://github.com/advisories/GHSA-gcqx-w48m-w2h4) | `deepmerge@4.3.1`, used by `@expo/config@12.0.14` | Locally patch both input loops in every shipped implementation; verify installed source hashes. No upstream fixed release was listed. |
| [qs / GHSA-6pq8-jhm2-2vcw](https://github.com/advisories/GHSA-6pq8-jhm2-2vcw) | `qs@6.16.0`, used by `react-native-google-places-autocomplete@2.6.4` | Use the official fixed release `6.16.1` through a specific override and npm-generated lockfile resolution. |
| [node-forge / GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv) | `node-forge@1.4.0` | Existing installed-code patch and exploit/compatibility controls retained unchanged. |

The original raw report contained 17 dependency entries: 15 low, one moderate and one high. After the repair, the complete fresh report still contained 17 transitive entries: 12 low and five high. The remaining leaf set was exactly **deepmerge and node-forge**, each covered by installed patch fingerprints and behavioral regressions; qs was absent. The high entry count includes propagation of the same node-forge advisory through Expo dependencies. These are upstream version-metadata counts, not counts of distinct unpatched defects. Raw `npm audit` still exits 1; the stricter repository gate verifies the installed patches and exits 0. No severity threshold, time waiver or unverified exception was added.

## Protected rules, routes and smallest repairs

**Rule 1: merging config data must not make the returned object inherit attacker-controlled fields.**

The existing deepmerge check only examined the target object's inherited properties. A null-prototype target, a nested null/primitive placeholder, or an own `__proto__` on the target bypassed that check. The target-copy loop had no corresponding guard. The result could inherit an injected field even though global `Object.prototype` remained unchanged.

`patches/deepmerge+4.3.1.patch` skips `__proto__` in both the target-copy loop and source-merge loop. The check occurs before reading or assigning that key. The source `index.js`, CommonJS entry `dist/cjs.js`, and distributable `dist/umd.js` receive the same change and have separately verified SHA-256 fingerprints. Ordinary keys, symbols, array policies and custom merge behavior stay intact. The fix is equivalent in scope to the [unmerged upstream proposal #274](https://github.com/TehShrike/deepmerge/pull/274/files); it is explicitly a local security patch, not an upstream release claim.

| Route | Guard and evidence | Status |
| --- | --- | --- |
| CommonJS `require('deepmerge')` | Target and source `__proto__` guards; null-prototype/placeholder/own-key exploit matrix and ordinary-data controls | Guarded |
| Packaged UMD entry | Same guards and independent execution of the same matrix | Guarded |
| Source entry used by package rebuilds | Same guard patch and source fingerprint, preserving agreement with shipped builds | Guarded by source/fingerprint evidence |
| Actual Expo config modification | `@expo/config` is required to resolve the fingerprinted CommonJS entry; `modifyConfigAsync` regression checks injected nested fields and legitimate plugin merging in dry-run mode | Guarded and positive workflow verified |
| Install/reinstall | Existing `postinstall` runs `patch-package --error-on-fail` followed by installed fingerprint/version verification | Fresh `npm ci` passed |

The installed Formik dependency (`deepmerge@2.2.1`) and theme-provider dependency (`deepmerge@3.3.0`) remain unchanged; neither was a node listed by this specific advisory report. This is not a new claim that all arbitrary input use of every deepmerge major is safe.

**Rule 2: the audited qs comma-serialization path must safely handle non-callable own `toString` data, while valid Places query encoding remains unchanged.**

The official [qs 6.16.1 release](https://github.com/ljharb/qs/releases/tag/v6.16.1) is the only version update. The gate verifies both the lockfile and installed version and confirms that the Google Places consumer resolves that checked package. Tests use inputs produced by JSON parsing, prototype-permitting query parsing, and null-prototype query parsing, with both encoder options, plus ordinary comma arrays and a valid Australian Places query round trip. The inspected Places consumer uses normal query serialization; these tests do not assert that the app exposed the advisory's comma-mode exploit to users.

**Rule 3: the dependency gate must reject every unhandled advisory and every extra unpatched instance.**

The live CLI still verifies installed fingerprints before reading the audit. The deepmerge advisory is recognized only with the fixed installed implementation, exact version and expected single package location. New leaves are now collected into one refusal message, so a later advisory such as qs cannot be hidden by the first unknown leaf. Existing duplicate-location and unknown-advisory refusals remain, with an additional regression proving two unknown leaves are both reported.

## Failing-first and final local evidence

Runner: Linux, Node `24.22.1`, npm `11.9.0`. Hosted Node 22 validation is separate and remains pending at this document's creation. The default sandbox restricted Node's test child processes; the ordinary runner was executed with approved local process access, without changing test scripts or skipping controls.

Before changing dependency code, the focused new tests reported 24 tests: four passed and 20 failed (including two failed parent containers). The failing leaf cases were 16 actual deepmerge prototype-poisoning cases, one actual Expo config modification case, and one qs coercion case. Cloned-array and ordinary merge controls passed on the original dependency versions. These were assertion failures from the vulnerable behavior, not setup/import failures.

After updating the lock and patch, a new `npm ci` applied all four patches (`braces`, `deepmerge`, `metro`, `node-forge`) and passed installed verification. No hand-edited node_modules state was used as final proof.

| Executed command from `frontend_mobile` | Result |
| --- | --- |
| `npm ci` | Passed; 1,100 packages installed; shared-core prepared and built; all patch applications and fingerprints passed |
| `npm run test:security` | 33/33 passed, no skips/failures/cancellations; 0.601 seconds |
| `npm run security:dependencies` | Passed against the live advisory response; every remaining leaf mapped to fingerprint-verified installed code |
| `npm ls deepmerge qs --all` | Confirmed the dependency paths and qs override described above |
| `node node_modules/typescript/bin/tsc --noEmit` | Passed |
| `CI=1 EXPO_NO_TELEMETRY=1 npm run lint` | Passed |
| `node --test scripts/calendar-request-budget.test.cjs scripts/attendance-double-clock.test.cjs scripts/attendance-pin-guidance.test.cjs scripts/invoice-generation.test.cjs features/parity/attendanceLocum.test.mjs features/parity/attendanceCoverTerms.test.mjs` | 71/71 passed, no skips/failures/cancellations; 2.407 seconds |
| `git diff --check -- frontend_mobile` | Passed |

The security and mobile selections test different contracts; their totals should not be interpreted as project-wide coverage. No broader suite was repeatedly rerun.

## Changed files and review notes

- `frontend_mobile/package.json`: exact qs security override.
- `frontend_mobile/package-lock.json`: only the qs package's version, tarball and registry-provided SRI change; npm also removes the old redundant root lock-entry `overrides.follow-redirects` field. The actual `package.json` follow-redirects override remains unchanged and its version guard still passes.
- `frontend_mobile/patches/deepmerge+4.3.1.patch`: two-loop prototype-key guards in three package entry implementations.
- `frontend_mobile/scripts/dependency-security-integrity.json`: three additional exact installed source fingerprints.
- `frontend_mobile/scripts/verify-dependency-security.cjs`: exact version/consumer resolution checks, fingerprint-backed advisory mapping and complete unresolved-leaf reporting.
- `frontend_mobile/scripts/dependency-security.test.cjs`: exploit, actual Expo config, legitimate merge/query, and audit rejection controls.

Final hosted CI must run on the commit actually published by the integration owner. A future upstream deepmerge release should replace this local patch only after repeating these preservation and security controls.

## Independent continuation review

The preserved uncommitted candidate was independently reviewed and verified again on 29 October 2026 before publication. The review checked both patched loops in all three shipped deepmerge source/build entries; the exact source fingerprints; the installed and locked qs versions; actual Expo/Places dependency resolution; and the live CLI's ordering of installed verification before audit acceptance. No additional product or gate changes were required.

Current primary-source checks confirmed that the [deepmerge advisory](https://github.com/advisories/GHSA-gcqx-w48m-w2h4) lists 4.2.0–4.3.1 as affected with no patched release, and the [qs advisory](https://github.com/advisories/GHSA-6pq8-jhm2-2vcw) identifies 6.16.1 as the fixed version. The linked deepmerge proposal is closed and unmerged; this remains a reviewed local patch, not an upstream-approved release.

The independent runner was Node 24.22.1/npm 11.9.0. A new `npm ci` installed 1,100 packages, rebuilt shared-core, applied all four patches and passed installed verification. Then:

| Independent check | Result |
| --- | --- |
| `npm run test:security` | 33/33 passed; no failures, skips or cancellations; 0.653 seconds |
| `npm run security:dependencies` | Passed against the live npm audit response |
| Complete `npm audit --omit=dev --json` inspection | Exactly two remaining leaves: deepmerge at `node_modules/deepmerge` and node-forge at `node_modules/node-forge`; qs absent. Raw metadata: 12 low + five high = 17 dependency entries; raw command exits 1 as expected. |
| Same six-file configured mobile behavior command above | 71/71 passed; no failures, skips or cancellations; 2.498 seconds |
| Mobile TypeScript, Expo lint with telemetry disabled, whitespace | All passed |

Initial default-sandbox invocations could not start required Node child processes (`EPERM`); those attempts are environmental failures and are not passing test evidence. The same unchanged scripts subsequently ran successfully with normal approved process access. The earlier failing-first record above was preserved, not relabeled as a new independent execution. Hosted Node 22 and final published-head acceptance remain the integration checkpoint's responsibility.

## Concurrent branch reconciliation and final local security proof

Before publication, the remote branch advanced from `d70806e755d581c3f8beb85afb0f860e59e8db47` through [the concurrent deepmerge repair](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/commit/4f783432ea68c0e5d2b61f8e30aa9c5f2a0633bb) to `f97643eeb397b2cb2e9a93743ac5c61d1639087a`. The latter removes the billing module-size exception and is identical to that portion of this candidate. Publication must preserve this new remote ancestry.

The reconciliation retains the concurrent contributor's exact 36-line `patched deepmerge drops __proto__ for every vulnerable merge shape` test. It preserves legitimate `debug: false` target data, new `verbose` source data and array scalar data while rejecting poisoned prototypes. It also retains the exact runtime exploit smoke-check statements inside `verifyInstalled`, which execute the installed CommonJS package during both postinstall and the live gate. Duplicate version checks and the advisory mapping remain single definitions.

The comprehensive candidate's three-entry deepmerge patch and fingerprints, actual Expo/Places dependency-resolution checks, qs 6.16.1 update, complete unresolved-advisory reporting and existing regressions remain intact. The remote CommonJS patch and the candidate patch express the same two-loop rule; one comprehensive patch covers source, CommonJS and UMD implementations.

All six mobile source/test/package files were hashed before execution and confirmed unchanged afterwards. On Node 24.22.1/npm 11.9.0:

| Reconciled candidate check | Result |
| --- | --- |
| `npm run test:security` | **34/34 passed**; no failures, skips or cancellations; 0.489 seconds. The newly retained remote test is explicitly named in the output. |
| `npm run security:dependencies` | **Passed** against the live npm response after installed fingerprints, versions, consumer resolution and retained runtime exploit checks. Raw metadata still reports 17 dependency entries and two patched advisory leaves. |
| Source hashes and `git diff --check -- frontend_mobile` | Passed; all six reviewed file hashes unchanged through execution. |

The earlier fresh install and 71 behavior positives were not repeated or relabeled as final-source executions: the package/lockfile/patch/fingerprint bytes are unchanged, and the reconciliation adds verification only. Final published-head hosted CI will supply integration evidence. No audit waiver, threshold relaxation, provider action, deployment or merge was introduced.
