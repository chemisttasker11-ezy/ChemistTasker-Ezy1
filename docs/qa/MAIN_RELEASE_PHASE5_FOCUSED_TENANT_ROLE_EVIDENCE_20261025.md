# PR200 Phase 5 — targeted tenant and role-gate verification, 25 October 2026


## Phase 5 focused continuation — 25 October 2026
- [Run 40185020636](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/actions/runs/40185020636) at `40f70d1d` completed **45 tests, 34 intended safety-negative assertion failures, 11 passing controls, zero setup errors**. Newly isolated-runtime-reproduced: **B46** (pending active membership private Hub read and create, two scenarios; state reachability caveat), **B48** (locum tagged into confidential private Hub content despite Hub access denial) and **B51** (LEFT/inactive participant can still POST into former pharmacy community chat).
- Reconciled 226 canonical IDs without deleting aliases or source refutations: **30 distinct IDs with isolated runtime evidence; 34 failing safety scenarios**. No S2 99% claim. Neither this red suite nor these tests prove production exploits or staging data exposure.
- Next *targeted* qualification/booking suite committed on `a390420b` as `backend/qa_release/test_pr200_phase5_role_gates.py` with separate `.github/workflows/pr200_targeted_role_audit.yml`. **Two tests awaiting their exact-head result** at documentation time: C020-N1 manual roster pharmacist-role qualification; B54 competing paid-slot acceptance. Do not count as S3 before positive controls succeed and negative assertions execute.
- Existing full CI retained; audit-only changes. PR201 untouched. **Phase 5 OPEN; Phase 6 not started; release NO-GO.**

## Evidence-grade boundaries

- B46: normal invite creation may persist PENDING as inactive. The reproducible precondition is specifically `is_active=True,status=PENDING`; follow up with reachable data paths and negative state-mutation controls before interpreting practical frequency.
- B48: accepted-staff mention notification is a valid positive control. The actual LOCUM negative returned 201; the test's notification/non-persistence assertions are not reached after first failed expectation, so **do not assert email/push delivery was runtime observed**. Source trace does establish notification construction through `pharmacy_hub/posts.py` and `notifications/services.py`.
- B51: one preserved Participant entry after logical membership revocation allowed a new message; this is not the same historical-delete scenario as B03.
- C020-N1 and B54: source candidates, not yet reproduced; a targeted workflow is queued. B54 sequential reservation test is not a PostgreSQL concurrent race demonstration.
