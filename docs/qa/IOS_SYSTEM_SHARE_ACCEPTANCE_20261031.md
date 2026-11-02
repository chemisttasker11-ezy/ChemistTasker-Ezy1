# iOS system share-sheet acceptance

Parent candidate: `71a65b938a5087a932e370533375c3e864b9e64a` (PR #236).

## Rule and reproduced boundary

The saved and sent revision-2 invoice must present its actual PDF in the system
share sheet. A successful PDF HTTP response or an application Share button alone
does not satisfy this rule. Invoice amounts, revisions, authentication, email
delivery, application binaries and platform sharing choices must stay unchanged.

The latest attempt of native run `41046784008`, iOS job `124053657686`, compiled
successfully and again failed Maestro's final sharing assertion. The job/run now
have conclusion `cancelled`; neither is a passing gate or an ongoing compile.
Android and the seven other final-head workflows passed on the parent candidate.

Diagnostic artifact `12977189917`, SHA-256
`a20aeb6763a1a9f488fc9aa4de5d1092ec290d9e6ed3c04d97cd87291fc9e29f`,
contains the failure screenshot and hierarchy for sequence 81 (artifact step 082).
The screenshot shows `INV-000001-revision-2`, PDF Document, Copy and Save to Files.
The contemporaneous Maestro hierarchy contains only the underlying application
and status bar; none of the visible system-share controls are present.

The recorded Share PDF tap finished at 12:55:03.304 UTC. The application created
UIActivityViewController at 12:55:03.505; SharingUIService bootstrap succeeded at
12:55:04.354. The assertion failed at 12:55:34.445 despite the screenshot showing
the sheet. This attempt does not support the earlier slow-service-bootstrap
hypothesis. Maestro 2.11.0's ViewHierarchyHandler reads the foreground application,
SpringBoard status bars and a special SafariViewService hierarchy, but does not
merge SharingUIService. Its XCTest log repeatedly snapshots com.chemisttasker.app.

## Bounded test correction

Keep the entire existing Maestro invoice journey, financial assertions and Share
PDF tap. Android retains the same share-control selector and 30-second timeout.
iOS hands that final assertion to a standalone XCTest runner, built before the
application compile. It reads the existing application and SharingUIService
without launching/replacing either, and requires the revision-2 document title
plus actionable Copy and Save to Files controls within one 30-second expectation.
The runner always attaches its screenshot and available process hierarchies.

The generated standalone test project uses pinned Xcodeproj 1.27.0, already used
by CocoaPods or installed for this CI-only step. No application project, binary,
dependency lockfile, UI, timeout, financial assertion or provider setting changes.
The iOS job cannot pass unless both Maestro and the native share assertion pass.

## Verification status

Local workflow/flow YAML parsing and generated shell syntax checks passed.
The failure screenshot, hierarchy, command timestamps and system-service events
were inspected together. This Linux workspace cannot compile or execute XCTest;
the hosted simulator result is required before acceptance is closed. A failed
native assertion remains a failed job; no optional assertion, retry-until-green,
image-only pass or timeout increase is introduced.

Configured Stripe/email providers, authenticated fixed-source staging, physical
devices, deployed recovery/rollback, legacy cancellation policy/restriction,
uncertain notification recovery, emergency-cover correction scope and historical
Stripe-session cutover remain as recorded in the programme handover. Nothing is
merged or deployed; no live payment or external email is performed by this change.
