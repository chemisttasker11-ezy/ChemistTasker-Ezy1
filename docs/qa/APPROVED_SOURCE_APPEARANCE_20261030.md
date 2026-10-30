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

The parent's iOS diagnostic artifact also identifies one fixture targeting mismatch:
iOS exposes the accepted-shift list row as the combined accessibility label
“Native Pharmacy A, date · hours/rate”, while Android exposes the title separately.
Match that exact pharmacy title with its optional description suffix. Keep the same
row selection and invoice assertions; no application or permission change. Native
rerun is required.

## Final native interaction correction

At 51569b645fb794066ea7b1cea6e3eb4df71dff5e, all 24 strict visual comparisons,
authenticated browser, Full Isolated QA, Shared Core and recovery workflows passed.
PostgreSQL ran 511 tests successfully. Android native acceptance also passed,
including invoice revisions, captured delivery, PDF sharing and saved-data checks.
These results describe that exact source, not a later untested commit.

iOS run 41002254547, job 123889128871, reached the edited 7.5 quantity and failed
only at Maestro's hideKeyboard command. Artifact 12954717782 records step 053:
the standard iOS decimal pad has digits, decimal and Delete but no dismiss action.
The same screen exposes the static Items & services heading within the editor's
ScrollView. Use that existing non-interactive heading to dismiss on iOS after each
quantity edit. The installed React Native ScrollView's handled-tap responder already
blurs the focused input for this unhandled child tap. Keep Android's passing
hideKeyboard command, and preserve all amount, Save, revision, send, PDF-share and
backend saved-data assertions. No application source or keyboard behavior is changed.

Platform conditions follow Maestro's documented runFlow when/platform syntax:
https://docs.maestro.dev/maestro-flows/flow-control-and-logic/conditions.
YAML and artifact-target controls are checked locally; a final-head native run is
still required. Do not count the earlier iOS failure as a passing business journey.

## iOS link-consent setup

At 026f2cb63984e14db3a9621e8c1678d68fca1d6c, all seven non-native workflows
and Android native acceptance passed. iOS job 123989882519 stopped before the
business flow, at native-link-consent step 005: it required an Open in ChemistTasker
prompt. Artifact 12968483996 instead shows the app already open at Welcome back,
with no consent dialog. No invoice or keyboard-dismissing result is established
by that run.

Accept either the actual prompt or the already-open unauthenticated app in this
preparatory session, and tap Open only when that prompt is present. Keep the
separate XCUITest session boundary used for consent delivery. The main flow still
requires real authenticated Shift Center and Clock & breaks destinations, the
camera, both invoice revisions and actual PDF sharing, followed by independent
saved-record/PDF verification. Merely seeing the login screen cannot pass those
assertions. No application source or business acceptance assertion changes.


## Captured email Message-ID hostname

The 7420821 iOS artifact reaches both saved invoice revisions with the correct
577.50 and 616.00 amounts. Its Send email request then outlives the unchanged
30-second UI wait. A targeted macOS job on immutable 7420821 reproduces the
actual HTTP Save/revise/send path using real PDF generation and captured email.

The send succeeds in 70.482 seconds. A server traceback identifies the delay in
socket.getfqdn, called by Django CachedDnsName while EmailMessage.message builds
the Message-ID, before sending. It is not a failure of invoice arithmetic or PDF
generation. Probe run 41045452916 / job 124028314640 also verifies both persisted
revisions, rendered PDF totals, immutable original shift terms and one sent
delivery.

Configure the generated native-smoke settings' shared Django DNS_NAME cache with
native-smoke.localhost for captured test mail on both platforms. The same macOS
probe then succeeds in 0.282 seconds (run 41046224512 / job 124030856929), with the
same independent persisted-record/PDF checks. No renderer, MIME, SMTP acceptance,
status transition, retry, fee or application source is changed. The native Send
wait remains 30 seconds, and all actual business/share assertions remain.

This isolates the test runner's external hostname resolver from a fixture that
already requires APP_ENV=test and locmem email. Production hostname/provider
configuration is unchanged and still requires authorized staging verification.
Django 5.2.17's cache implementation is pinned here:
https://github.com/django/django/blob/5.2.17/django/core/mail/utils.py.
Final-head native verification remains required.
