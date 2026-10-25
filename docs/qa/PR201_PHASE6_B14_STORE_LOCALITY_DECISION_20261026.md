# Phase 6 B14 correction: registered store controls holiday classification

The previous 26 October employee-specific confirmation gate was an incorrect product requirement and has been removed at PR201 commit 43ddb8bc.

**Product rule:** For ordinary ChemistTasker shifts, the location of the registered pharmacy posting the shift (its configured `state` and `public_holiday_region`) determines which local or state public-holiday calendar the system uses. A worker's place of residence or independently entered base must never override that store classification.

Removed the new worker confirmation validator, offer input, forced timesheet-only deferral, payroll-activation denial, separate EmploymentEngagement work-base snapshot, and associated overrides in shift pricing. Retained the official 2026–27 statewide/council/part-day resolver and the unverified-store-date review status.

Targeted positive/negative tests for Gold Coast Show versus Brisbane store, and an attempted worker-supplied region override now enforce this rule.

Legal caveat: Some Fair Work/NES facts can differ in genuinely nonstandard work-base/substitution agreements. ChemistTasker should flag such exceptional cases for employer review rather than requiring every pharmacy worker to submit additional evidence or silently determining a disputed entitlement.

No deployment or merge. Prior work-base acceptance note superseded by this file. Release NO-GO.
