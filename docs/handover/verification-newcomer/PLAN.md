# Light verification, badges, Pharmacy team, New to pharmacy: plan

Owner decisions: 2026-10-13 conversation. Base: local `main` bd68162, worktree `main-verification`.
Finish line: milestone commits on local main, then a pushed branch + draft PR (never straight to origin/main).

## Rules agreed with the owner

| Topic | Rule |
|---|---|
| Profile "Verified" (gate for public shifts + talent hub) | Email + mobile. Pharmacists also AHPRA (General). Interns also AHPRA (Provisional is enough). |
| ID, referees | Optional. Shown as their own badges (verified / not verified). Never block. |
| Tighten later | One setting lists extra requirements (`gov_id`, `referees`), empty now. A grace date keeps already-verified users verified while they complete them; afterwards a command re-evaluates and removes "Verified" from those still missing items. |
| Skill badges | Only skills that carry a certificate in the registry. Claims never need a certificate. |
| Interns / students | Intern: AHPRA number only. Hours proof, AHPRA proof file, 1st/2nd half: not required. Student uni ID: optional badge. |
| Assistant / technician certificate | Optional badge ("Qualification verified"). Never blocks submit or Verified. |
| Who grants badges | Automatic document check where it exists, admin otherwise. Never the employer. Worker can upload any time from their profile. |
| Employer explainer | "What do badges mean?" on talent hub, review candidate, interested lists. Each not-verified item explains itself. Copy lives once in shared-core. |
| Other Staff | Shown as "Pharmacy team" (with "Assistant · Technician · Intern · Student"); everywhere else the person's actual role. Code value `OTHER_STAFF` unchanged. |
| Explorer | Shown as "New to pharmacy". Separate path under the three main sign-up tiles. One question: overseas / school student or junior / internship or placement / new to the field. Code value `EXPLORER` unchanged. |
| Overseas | May skip the mobile check; then ID becomes required for Verified. Grey "Overseas" label (not a badge). |
| Talent post (newcomers) | One active post; edit any time; delete + re-post allowed, but a re-post within 7 days keeps the old place in the feed. |
| Under 18 | Minimum age 15. Under-18 posts: first name only, no photo, no contact before a match. |
| Reports | "Report" on public talent and job board posts → new "Talent board" / "Job board" areas in the existing Next Moderation tab. |
| Upgrade | Newcomer → Pharmacist or Pharmacy team via one backend service; profile carries over; the new role's verification applies. |

## Milestones (each ends with targeted tests + a commit on local main)

1. **Verification policy (backend).** One module `onboarding/verification/policy.py` owns "what Verified needs" per role and is used by the progress calculator and the background final evaluation (today they disagree). Regulatory submit stops requiring certificates/uni ID/hours/AHPRA proof. Interns get an AHPRA number (additive migration), checked by admin like pharmacists, Provisional accepted. Settings switch + grace + re-evaluate command.
2. **Badges data (backend + shared-core).** Same module lists every badge for a profile (ID, AHPRA, referees, qualification, ABN, enrolment, overseas label, certificate skills) with state verified / pending / not supplied. Skill certificates get a state (pending on upload, admin can verify in admin). Sent in candidate work profiles (review candidate, interested) and talent hub cards. shared-core: types, one helper, one explainer copy.
3. **Worker screens (Vite + Expo).** Skills: honest copy, no "Required". Regulatory: intern AHPRA number, every certificate optional with what it earns.
4. **Employer screens (Vite + Next + Expo).** One badge row component per platform + "What do badges mean?" sheet on talent hub, review candidate, interested lists.
5. **Pharmacy team label (Vite + Next + Expo + emails).** Labels only.
6. **New to pharmacy sign-up (backend + Vite + Next + Expo).** Three tiles + "New to pharmacy in Australia? Start here →"; newcomer question; date of birth (15+); overseas mobile skip.
7. **Newcomer talent rules (backend + screens).** One post; 7-day no-bump; under-18 privacy.
8. **Reports (backend + Next moderation + board cards).**
9. **Upgrade newcomer (backend service + Vite/Expo entry).**
10. **Finish.** Targeted tests, one browser check, design detector on changed web UI, handover, branch + draft PR.

## Scenarios (expected behaviour after this work)

1. Assistant claims Dispensing and a Cert III dispensary stream, no certificate → submits, becomes Verified with email + mobile, can apply and publish. Employer sees "Qualification: not verified, no certificate supplied".
2. Same assistant uploads the certificate later → "check pending" until admin/automatic check, then "Qualification verified".
3. Pharmacist with mobile + AHPRA verified, no ID, no referees → Verified; badges show "ID not verified", "References not provided".
4. Intern types AHPRA number → admin confirms Provisional registration → Verified. No hours proof, no half.
5. Student without uni ID → Verified on email + mobile; "Enrolment not verified".
6. Overseas newcomer skips mobile → must upload ID; Verified once ID passes; grey "Overseas" label on the talent post.
7. 16-year-old school student → post shows first name only, no photo; cannot be contacted before a match. 14-year-old cannot register.
8. Newcomer deletes their post and re-posts two days later → the new post keeps the old feed position.
9. Anyone reports a talent or job post → appears in the Moderation tab for the assigned moderators; "Hide and resolve" takes it down.
10. Settings later require referees with a grace date → verified users keep Verified until the date, see "References needed by …"; the command removes Verified from those still missing them after the date.
11. Newcomer gets AHPRA registration → "Upgrade my account" to Pharmacist; details carry over; Verified again once AHPRA is checked.

## Owner addition (2026-10-13, mid-build)
Onboarding pages touched in milestones 3 and 6 are finished to the Post shift / Shift Centre standard
(docs/frontend rules, page finishing standard): clear step purpose, one primary action, inline validation, all states.
