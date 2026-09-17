# Workforce and kiosk implementation checkpoint

Status: IN PROGRESS. User scope overrides the attached plan: payroll is deferred.

## Scope

- Finish mobile terminal linking with explicit authorized pharmacy selection.
- Add worker attendance PIN setup/reset with explicit pharmacy membership scope.
- Repair kiosk contrast, instructions, pairing and touch interaction.
- Preserve calendar/classic/modern roster views; improve classic and staff/coverage views.
- Complete non-payroll roster revision safety, requests, reviewed time and worker self-service from W02-W06 and operational W10.
- Defer W07/W08/P01/P02, payroll-specific W01/W06/W10, wage calculations and financial integrations. Contractor billing is a distinct W09 workstream, not authority to execute payments.

## Baseline and design

- Existing local changes in native kiosk replay/storage and runtime acceptance are preserved.
- Skills loaded: token-efficiency, UI/UX Pro Max, design-taste-frontend. Taste excludes dense dashboards; apply its audit/consistency guidance only. Continue React/MUI and Expo/Paper instead of replacing component systems.
- Design direction: light operational workspace, navy text, existing brand primary accent, accessible semantic statuses, compact roster grid, spacious kiosk touch targets. Motion 2/10, variance 3/10; roster density 8/10.
- UI/UX search's operations result included a marketing landing pattern and dark terminal palette, which do not fit this roster. Those recommendations were not adopted; targeted accessibility guidance and existing brand tokens govern implementation.
- Tanda folder contains five images (one duplicate) and one video. Reference inspection in progress.

## Work log

- Confirmed mobile kiosk link screen currently requires a pharmacy ID from the link and has no selector.
- Confirmed authenticated worker PIN update silently selects latest active membership; this must become explicit when multiple pharmacies exist.
- Confirmed dedicated kiosk entry has no MUI theme provider despite dark hard-coded surfaces, explaining unreadable default labels and disabled controls.
- Existing staff and stacked roster components exist already. Preserve and enhance them, avoid duplicate parallel views.

## Validation

Pending implementation-specific checks. Prior migration, pairing, PIN-delivery and native tests remain documented in kiosk handovers; do not count them as verification of these new changes.
