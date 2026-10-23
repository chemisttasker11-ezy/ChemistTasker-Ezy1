# ChemistTasker Local Staging Audit Report

## Journey 1: ONBOARDING, Worker

### What Worked
- Mobile verification OTP flow works smoothly in test mode; the 6-digit code is clearly printed on screen ("Test mode: no SMS sent. Your code is XXXXXX").
- Pharmacist onboarding profile renders clear multi-step structure (Basics, Skills, Rates, Photo ID, Getting paid, References) with completeness tracker (starts at 22%).
- Public shifts can be browsed freely without verification.
- Pharmacy team (Technician, Assistant, Intern) and Explorer workspaces isolate role-specific tools (16% initial profile completion).
- Responsive layout functions properly on mobile viewport (390px width).

### Problems
- `[BUG] J1-01 Sign-up blocked by reCAPTCHA failure in test environment` - When registering on `/register`, the submit button is permanently disabled because `react-google-recaptcha` cannot initialize with the test sitekey, and backend `verify_recaptcha` fails against Google API using `local-fake-recaptcha-secret` with no local bypass; users expect a functional local mock or bypass - `journey1-pharma-after-reg.png` - severity high
- `[UX] J1-02 Radio buttons for role selection have pointer-events none` - Role selection cards wrap `<input type="radio">` with `pointer-events: none`, causing accessibility and automation input drop when clicking container boundaries vs nested text - `journey1-signup-filled.png` - severity low
- `[GAP] J1-03 Unclear AHPRA lookup feedback for invalid numbers` - Submitting an invalid or unrecognised AHPRA number (e.g. `PHA9999999999`) provides no validation error message and remains indefinitely in "AHPRA: Check pending", leaving the pharmacist unaware if their number was malformed or pending manual review - `journey1-ahpra-invalid.png` - severity med
- `[UX] J1-04 Blocked shift application gives generic modal without direct deep link` - Clicking "Apply Now" while unverified displays a popup: "Verify your profile (email and mobile, plus AHPRA for pharmacists and interns) before applying for public shifts", but provides no direct action button to jump directly to the missing verification step - `journey1-pharma-apply-dialog.png` - severity med
- `[GAP] J1-05 Mobile verification rate limit 30s lockout with generic error` - Repeatedly requesting OTP within 30 seconds triggers a 429 Too Many Requests error without a countdown timer on the "Send Code" button - `journey1-pharma-mobile-verify-sent.png` - severity low

### Questions for the Owner
1. Should local/staging environments automatically bypass Google reCAPTCHA or accept a dummy token (e.g. `TEST_MODE=1`) so prospective users and automated tests can complete self-registration end-to-end?
2. When an AHPRA lookup fails against the public register, should the UI immediately flag invalid format/unmatched registration instead of showing "AHPRA: Check pending"?
3. Should unverified pharmacists be allowed to save draft shift applications rather than being blocked completely with a modal?


## Journey 2: ONBOARDING, Owner & Multi-Store Admins

### What Worked
- New owner onboarding profile guides manager role selection, multi-pharmacy toggle, and legal names.
- Pharmacy wizard features a comprehensive 7-step setup (Basic, Regulatory, Docs, Employment & Software, Hours, Award Rates, About).
- Software selection cleanly captures Dispensing systems, DAA packing, S8 registers, and POS tools without mandating upfront payment methods.
- Inviting staff supports role, employment type, and custom job title with privacy protection for workers' TFN/super details.
- Organization RBAC works properly: `org_admin` sees all organization stores with full `Open`, `Edit`, and `Delete` authority; `region_admin` is scoped strictly to their assigned regional pharmacy (`Local Seed Org Pharmacy North`) with read-only (`Open`) operational access and no `Edit`/`Delete` controls.

### Problems
- `[UX] J2-01 Add Pharmacy wizard delays validation errors until final step` - Step 2 (Regulatory) allows the owner to click "Next" without an ABN, but clicking "Create Pharmacy" on Step 7 triggers "ABN must be 11 digits" with no step-level error indicator, stranding the user in the dialog - `journey2-add-pharm-step2-regulatory.png` - severity med
- `[BUG] J2-02 No idempotency or duplication protection on Pharmacy creation` - Submitting identical pharmacy details (same name, address, owner) multiple times creates duplicate pharmacy records with distinct IDs rather than warning or updating existing stores - `journey2-pharmacy-duplicate.png` - severity med
- `[UX] J2-03 Staff invitation modal displays generic error on missing job title` - Omitting the required "Job title" field displays a vague toast ("One or more invitations need attention before sending") without inline field highlighting on the specific input row - `journey2-invite-staff-dialog.png` - severity low
- `[GAP] J2-04 ABN live check blocks progress in offline/staging environments` - The wizard relies on live ABR lookup with no manual bypass when external APIs are unreachable, displaying "ABN not checked" - `journey2-add-pharm-step2-regulatory.png` - severity low

### Questions for the Owner
1. Should pharmacy creation enforce unique approval numbers or (name + address) pairs to prevent duplicate pharmacy entries?
2. Why are validation errors in multi-step dialogs deferred to the final step instead of validating each tab upon clicking "Next"?
3. Should region administrators be permitted to edit store hours or operational software, or must all store changes be escalated to organization administrators?


## Journey 3: TALENT BOARD

### What Worked
- Worker talent publishing flow provides an effective "Pitch Yourself" 3-step wizard (Basic Info, Location & Travel, Time Availability) with headline and bio.
- Anonymous identity masking is robust: the worker's real name (`Eslam Abas`), photo, phone, and email are completely withheld, showing only a system reference ID (`REF-8AFF655A`), distance radius (`+30km`), badges, and bio.
- Anonymity holds consistently across different user roles: neither owners nor other workers (`tech_user`) can see identifying personal details.
- Favourite / bookmark button functions and dynamically increments the profile count (0 to 1).
- Responsive layout works well on mobile viewport (390px width).

### Problems
- `[GAP] J3-01 No direct booking/invite action on talent card without explicit dates` - When a worker posts availability without selecting explicit date slots ("No dates shared yet"), the card lacks an "Invite to Shift" or "Message" button, leaving owners with no direct call-to-action to engage the talent - `journey3-owner-card-click.png` - severity med
- `[UX] J3-02 Missing aria-label on talent card favourite button` - The favourite/bookmark icon button contains no `aria-label`, tooltip, or text label, rendering it inaccessible to assistive technologies and confusing to first-time owners - `journey3-owner-favourite-clicked.png` - severity low
- `[BUG] J3-03 Google Maps failure banner on Location & Travel step` - Step 2 displays a prominent error banner ("Oops! Something went wrong. This page didn't load Google Maps correctly") due to fake API keys in local/staging without a graceful fallback - `journey3-worker-pitch-step2.png` - severity low

### Questions for the Owner
1. Should pharmacy owners have a direct "Invite to Apply" button on all talent cards even if specific dates are not pre-selected by the worker?
2. Should talent posts automatically pull verified skill tags (e.g. vaccination, DAA, dispensing software) from the worker's verified profile instead of relying only on freeform text?


## Journey 4: AVAILABILITY

### What Worked
- Worker can configure recurring weekdays (Mon, Wed, etc.), custom time intervals, and "All Day" presets.
- Calendar date selection provides multi-day highlighting and date ranges.
- Shift alerts toggle ("Notify me when new public shifts match my availability") clearly explains its notification purpose.
- Active shifts with indicated interest correctly appear on the pharmacist dashboard under "My next shifts".
- Responsive viewport rendering functions cleanly on mobile (390px width).

### Problems
- `[BUG] J4-01 Recurring availability in Set Availability page does not persist or sync to Talent Hub` - The "Set Availability" page has a "Save Location" button but lacks a dedicated "Save Availability" submit action for recurring day slots, causing added time slots to be lost on page reload and leaving the public talent post displaying "No dates shared yet" - `journey4-worker-set-weekly.png` - severity high
- `[UX] J4-02 Dual disconnected availability entry points (Set Availability vs Publish Availability)` - Workers have both "Set Availability" and "Publish Availability" in the navigation sidebar, which share similar calendar slot pickers but maintain separate state and confusingly different publishing behavior - `journey4-worker-set-weekly.png` - severity med
- `[GAP] J4-03 No explicit blocked date toggle` - Blocked dates can only be achieved by omission / deselecting dates, rather than explicitly marking a specific calendar date as "Unavailable / Blocked" with an optional reason - `journey4-worker-blocked-date.png` - severity low

### Questions for the Owner
1. Why are "Set Availability" and "Publish Availability" separate menu items instead of a unified availability management center?
2. Should recurring availability automatically update the worker's public talent card?
3. Can workers record explicit "Unavailable / Blocked" dates with notes to prevent roster conflict invites?


## 5 Worst Problems

1. **J1-01 Sign-up blocked by reCAPTCHA failure in test environment (Severity: High)**: Public registration is impossible out-of-the-box on local/staging because reCAPTCHA keys fail against Google's API with no local bypass, blocking self-serve onboarding.
2. **J4-01 Recurring availability in Set Availability does not persist or sync to Talent Hub (Severity: High)**: Added recurring availability slots have no save action on the Set Availability page, stranding worker preferences and leaving the talent card displaying "No dates shared yet".
3. **J2-02 Lack of idempotency on Pharmacy creation (Severity: Med)**: The database permits duplicate pharmacies with identical names, owners, and suburbs, leading to fragmented staff rosters and duplicate billing profiles.
4. **J2-01 Add Pharmacy wizard delays validation errors until final step (Severity: Med)**: Form validation errors (such as missing 11-digit ABN) are only surfaced on Step 7 (About), stranding users without step-level indicator of where the error occurred.
5. **J1-03 Unclear AHPRA lookup feedback for invalid numbers (Severity: Med)**: Pharmacists submitting invalid/unregistered AHPRA numbers receive no corrective feedback and remain in "AHPRA: Check pending" indefinitely.
