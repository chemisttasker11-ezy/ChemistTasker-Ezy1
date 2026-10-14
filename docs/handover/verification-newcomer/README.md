# Light verification, badges, Pharmacy team, New to pharmacy

Branch `feat/light-verification-new-to-pharmacy`. This README explains what changed and why. `HANDOVER.md` has every owner
decision (D1-D33), the three senior review rounds in order with their fixes and tests, migrations, and what still needs
testing. `PLAN.md` is the original plan.

**Every behaviour change below is an owner decision**, agreed in conversation on 2026-10-13/14. If something looks like a
loosened rule, check `HANDOVER.md` first: it is deliberate, not a logic change by mistake.

## Why

Workers were blocked from onboarding by documents that should never have been required (the reported bug: a Level 3
assistant claiming dispensing could not continue without a certificate). Verification rules were spread across the
progress calculator, a background task and each tab, and disagreed. Employers could not tell what ChemistTasker had
actually checked. People new to pharmacy had no proper path in.

## What changed

### Verification (backend `onboarding/verification/policy.py`, one place for the rule)
- **Verified profile = email + mobile**, plus a checked AHPRA registration for pharmacists and interns (interns:
  provisional registration, checked by our team like pharmacists). Verified is the gate for public shifts and the talent hub.
- **Everything else is a badge, never a block**: photo ID, references, qualification certificates, certificate skills.
  A skill without a certificate can still be claimed; it shows "Not verified" with an explanation for the employer.
- **Tighten later with one switch** (`VERIFICATION_EXTRA_REQUIREMENTS`) and a grace date; `manage.py
  reevaluate_verification` applies it. During grace, verified workers see "References needed by <date>".
- **Verified is only removed when evidence changes** (a new AHPRA number, a new photo ID that Verified relies on,
  leaving Overseas). Pressing Submit or editing ordinary details never removes it.
- **AHPRA numbers are for life and unique**: a checked number cannot be changed in the app (support can in admin), and
  no two accounts may hold one. Ownership is a table with a unique number (`AhpraRegistration`, migration 0080), changed
  in one small transaction with the profile, so concurrent saves cannot share a number.
- **A Pharmacy team role is fixed once chosen** (assistant / technician / intern / student). A pharmacy can still give
  the person an assistant, technician or student role inside its own team (membership role, internal shifts only);
  pharmacist and intern memberships need the matching registration.

### Badges and what employers see
- Badges in the skill-symbol style: green tick verified, blue clock pending, soft slate "!" not verified (deliberately
  not alarming). Same artwork on web, Next and Expo; "What do badges mean?" on every employer screen.
- **One worker profile everywhere** (Review, Reveal, Confirmed, History): photo, role, badges, bio, experience, rates,
  skills. **Contact details and CV only in Confirmed**, with **Message now** to open a chat. History has no contact data.
- Worker skills show as two rows, **Skills** and **Software**, the job board's split.
- **Work rights in Australia** is asked of everyone (self-declared); "No work rights yet" shows as a label.
- **Overseas** is a label, not a guarantee: ChemistTasker does not vouch for overseas profiles.

### People and onboarding
- "Other Staff" is shown as **Pharmacy team**, "Explorer" as **New to pharmacy** (labels only; codes unchanged).
- New to pharmacy has its own sign-up path (newcomer type + date of birth, minimum age 15; under-18s show first name
  only). Overseas newcomers may skip the Australian mobile check and then need photo ID.
- One talent post per newcomer; reports on public talent and job board posts go to new moderation areas in Next.
- Upgrading New to pharmacy to Pharmacist or Pharmacy team carries details, photo ID, work rights and references,
  removes the newcomer post, and referee links follow the person.
- Onboarding pages rebuilt on one shell to the Post shift / Shift Centre standard; "Payment" renamed "How you get paid".

### Shift Centre for workers
- Public, Community, Confirmed and History share one "Shift Centre" header and section tabs, like the owner pages.
  Confirmed and History are booked-shift cards with pharmacy details (address, documents, reviews), invoice and rating.

## Open items
- **Under-18 rules** are an open product decision (contact before a match is not restricted).
- **Legacy duplicate AHPRA numbers are kept** (test accounts stay active everywhere): migration 0080 only registers one
  owner per number and changes no profile; new claims of a taken number are refused. Tighten again at launch with clean data.
- See `HANDOVER.md` "What still needs testing".
