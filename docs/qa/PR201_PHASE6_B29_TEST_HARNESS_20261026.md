# Phase 6 B29 isolated test harness repair — 26 October 2026

CI run [40200981222](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/actions/runs/40200981222) failed four manager approval tests with HTTP 404: the standalone `attendance_tests` in-memory test harness does not install the full Django URLconf. This is a **test harness routing error**, not a proven defect in the manager approval endpoint.

The B29 tests now invoke the actual DRF manager view classes through `APIRequestFactory` + `force_authenticate` inside that standalone harness, leaving the production URLconf unchanged. Real HTTP router acceptance should separately run under the full Django test environment. This fix does not waive the security, acceptance or payroll checks.
