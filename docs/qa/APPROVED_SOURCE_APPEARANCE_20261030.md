# Appearance comparison against immutable approved source

Parent: #235, `28c69952bf3a41c8fca2aca18302db85bd7f2ad1`.

The #234 candidate passes functional Vite Playwright, authenticated browser, wiring,
Full QA, Shared Core and recovery checks. The visual job still compares 390px views
against screenshots from 3df951b, before the 44px touch-target repair. Main already
contains 54f1550a7, which explicitly enlarged those header targets from 38px to 44px.
Inspection of the invoices artifact confirms the six-pixel header shift. Reverting
approved accessibility fixes or approving screenshots from the changed candidate
would not establish preservation of the intended current interface.

In the Windows visual job, capture the reference by building immutable main
25ef200f0c32b2b6fc764a4d05a648b604038794 in a separate worktree, with the same browser,
locale, fixed clock, fixtures, viewports and test interactions used for the candidate.
Then run the existing strict candidate comparisons against that independent reference.
This checks all 24 existing view/theme/viewport combinations. The native-date text
exclusion retains its fixed geometry; no extra mask, threshold or tolerance is added.

Capture requires the exact pinned main SHA, clean application/shared-core source,
a separate app root and explicit --update-snapshots. A local negative control confirms
that the current candidate cannot generate its own approved reference. CI's generated
reference is uploaded for review. The committed historical screenshots are unchanged;
no application style, layout or business behavior changes. Any remaining pixel
mismatch still fails the normal comparison. The explicit separate Shift Centre
proposal-capture step remains separate from acceptance.

Validation here: JavaScript syntax, workflow YAML and diff checks passed, and the
candidate self-capture negative control passed. Actual Windows execution remains
required; no new visual pass is claimed before CI completes. Source identity and
reference images are available in that run's artifacts. This changes the test's
reference to the already-approved main source, not to the current unreviewed view.
