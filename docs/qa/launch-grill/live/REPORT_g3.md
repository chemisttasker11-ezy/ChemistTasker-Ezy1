# ChemistTasker User Testing Report

## Journey 1: POST A SHIFT (Owner)
### What Worked
- Owner logged in smoothly, accessed the 6-step wizard (Details, Skills, Who sees it, Dates, Pay, Review).
- Setting Urgent status accurately stamped an "Urgent" badge on the shift card preview and active board.
- Adding single dates, multi-day shifts ("One person works every date"), and recurring schedules ("Repeat every week") works.
- Pay step auto-references government award pay rates (guide 6 Feb 2026) with optional dollar top-up, ABN contractor vs TFN employee toggles, and superannuation additions.
- Review step provides an accurate live job card preview.
- Shifts posted successfully and redirected to Shift Centre (`/dashboard/owner/shift-center/active`).
- Existing shifts can be edited via wizard (`post-shift?edit=ID`), and unassigned shifts trigger a clear "Delete this shift?" confirmation modal.

### Problems Found
- [UX] J1-01 Silent validation failure on wizard step 1 - If an owner does not re-select pharmacy or click a role tile (which visually look selected/highlighted), the wizard allows proceeding through all 6 steps until the final "Post Shift" click triggers a vague snackbar "Choose a pharmacy, role and type of work" with no highlight or redirection to step 1 - screenshot: `j1-details-filled.png` - severity: high
- [GAP] J1-02 Anonymous posting option missing for owners - Prompt requires testing anonymous shift posting, but no anonymous checkbox or toggle is visible to the owner in the post-shift wizard - screenshot: `j1-details-filled.png` - severity: med
- [UX] J1-03 MUI Date picker friction - The date input uses segmented spinbuttons (`DD/MM/YYYY`) that require precise per-segment keyboard typing and fails standard text entry or datepicker clicks - screenshot: `j1-dates-added.png` - severity: med
- [GAP] J1-04 Chain and Organisation audiences omitted without explanation - The audience step only lists "Your pharmacy team", "Your favourite staff", and "Everyone on ChemistTasker", hiding chain/org tiers without explaining that the pharmacy is not linked to an enterprise group - screenshot: `j1-audiences.png` - severity: low

### Questions for the Owner
1. Should anonymous shift posting be accessible to all independent pharmacy owners, or is it gated behind enterprise/subscription tiers?
2. Why does Step 1 allow owners to click "Next" all the way to Step 6 without enforcing pharmacy and role selection upfront?
3. Can the date selector support a native HTML5 date input or one-tap calendar day selection?


## Journey 2: APPLY & BOOK (Pharmacist & New Worker)
### What Worked
- Seeded pharmacist browsed the public job board with functional filters (Role, Employment Type, Dates, Time of Day, Perks, Min Rate, Location, Sort).
- Worker can express interest in one click, and counter-offer modal supports custom hours, rates, and travel allowance.
- Unverified worker is blocked from applying to public shifts with an explicit banner: "Verify your profile (email and mobile, plus AHPRA for pharmacists and interns) before applying for public shifts."
- Owner reviews applicants with verification badges (AHPRA, ID, References) and assigns candidate with "Assign to this date", sending a formal offer.
- Worker views pending offers under the "Offers" tab and can Accept or Reject.
- Terms dialog enforces two mandatory agreement acknowledgements before confirming.
- Shift enters `ACCEPTED_AWAITING_PAYMENT` until the owner settles the $30 AUD booking fee.
- Paying with Pills (200 pills) successfully confirmed the shift, appearing in both Owner Confirmed and Worker Confirmed boards.

### Problems Found
- [BUG] J2-01 Registration blocked on local test stack by Google reCAPTCHA - The register form submit button has `disabled={loading || !acceptedTerms || !captchaValue}`, preventing new users from completing registration in local test environments where reCAPTCHA cannot be solved - screenshot: `j2-register-page.png` - severity: high
- [BUG] J2-02 Stripe payment initiation crashes with 500/400 due to unconfigured API key - Clicking "Pay selected with Stripe" triggers a backend exception (`stripe._error.AuthenticationError: You did not provide an API key`) returning HTTP 400 with snackbar "Failed to initiate payment", giving the owner no fallback checkout or simulated test payment - screenshot: `j2-stripe-click-result.png` - severity: high
- [UX] J2-03 Overlapping shift applications allowed without warning - A worker can express interest in multiple shifts occurring on the exact same date and time (e.g. Mon 26 Oct 09:00–17:00 and an overlapping slot) with no schedule conflict indicator - screenshot: `j2-overlapping-click.png` - severity: med
- [UX] J2-04 Blocked confirmation snackbar lacks deep-link to payment profile - When a worker with incomplete ABN details clicks "Confirm", a snackbar states "This offer cannot be confirmed until the required onboarding/payment details are completed" without linking to the profile/onboarding settings page - screenshot: `j2-worker-exact-confirm-clicked.png` - severity: med
- [UX] J2-05 Pharmacy scope in owner topbar silently hides booked shifts - Owner shifts are partitioned by pharmacy (e.g. Southport vs Brisbane); when viewing Shift Centre under the wrong pharmacy scope, newly accepted/confirmed shifts disappear with no notice indicating shifts exist under another pharmacy - screenshot: `j2-owner-shiftcenter-confirmed.png` - severity: med

### Questions for the Owner
1. Can the local/staging environments bypass or mock Google reCAPTCHA and Stripe checkout to allow automated end-to-end testing?
2. Should workers receive an explicit schedule clash warning before expressing interest in conflicting shift hours?
3. In Shift Centre, can an "All Pharmacies" view be provided for multi-pharmacy owners to avoid missing payment-required shifts?
