# J7 — iOS native acceptance CI root-cause audit

PR #249 head: `97c4543e051b43fe30ec7e2e61ad3d69957a918e`. Read-only source and GitHub Actions log audit; no source change or test execution performed.

## Exact-head CI identity
GitHub Actions workflow run [41947345249](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/actions/runs/41947345249), head `97c4543e051b43fe30ec7e2e61ad3d69957a918e`, reports **failure**. Job [126982719455](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/actions/runs/41947345249/job/126982719455) is **native-acceptance / iOS native acceptance**, failing at **Prebuild and compile iOS simulator acceptance build with embedded JavaScript**. This is the reusable `.github/workflows/native_mobile_acceptance.yml` called by the architecture workflow, not an independently observed direct PR workflow run.

## Exact error evidence (job 126982719455, log line numbers)
| Log line | Verbatim diagnostic |
|---|---|
| 48091–48095 | `XCODE_APP_SUPPORT_DIR=/Applications/Xcode_16.4.app/...`; `XCODE_VERSION_ACTUAL=1640` |
| 48104–48106 | `[ExpoModulesJSI] Detected: source-built RN, static frameworks`; `[ExpoModulesJSI] Building framework slice for iphonesimulator...` |
| 48108 | `xcodebuild: error: Could not resolve package dependencies:` |
| **48109** | **`package 'apple' is using Swift tools version 6.2.0 but the installed version is 6.1.0`** |
| 49495, 49498–49499 | `** BUILD FAILED **`; `PhaseScriptExecution [CP-User] Build ExpoModulesJSI xcframework` |
| 50900 | `##[error]Process completed with exit code 65.` |

## Source and smallest corrective change
- `.github/workflows/native_mobile_acceptance.yml:516-519` configures `ios-native` with `runs-on: macos-15`; no explicit Xcode toolchain selection was found in that job. The native compile invokes `xcodebuild` at **line 790** (step starts line 754).
- **Fix required:** select an installed Xcode toolchain shipping Swift **6.2 or later** *before* the iOS native build. A runner-supported Xcode 26.x toolchain is a candidate; add explicit Xcode selection (e.g. `DEVELOPER_DIR` or a pinned setup-xcode action) and a fail-fast `xcodebuild -version && swift --version` preflight asserting Swift ≥6.2. Keep the actual native compile and acceptance assertions intact. File to touch: `.github/workflows/native_mobile_acceptance.yml:516-519,754-790`.
- **Runner/Xcode change:** **YES—toolchain selection/upgrade is necessary.** Whether `macos-15` already hosts a usable Xcode 26.x image, and whether a `macos-26` runner is needed, is **not verified**; check the specific hosted image inventory instead of assuming runner availability. The exact patch cannot be certified until a rerun is captured.
- **Executable acceptance:** rerun the exact pinned workflow on the same tested SHA with `swift --version` showing ≥6.2 and confirm the `ExpoModulesJSI` script and `xcodebuild` succeed. This would **fail on the current environment** at the version preflight; device/Maestro acceptance after compilation is not verified.

**Scope caveat:** the architecture workflow also has a separately failing Android job (job 126982719036); this report makes no assertion about its root cause. iOS diagnostics artifact is linked in iOS log lines 51030–51032; extraction not performed. No native job has been rerun.

## Inventory
Rows: 6 log evidence entries; GAPs: 1 (build toolchain). Top impact: blocked iOS simulator build; downstream native acceptance unexecuted; no trustworthy iOS release sign-off.
