# Mobile UX Teardown: Competitor Pharmacy & Healthcare Shift Apps

**Date:** 4 November 2026  
**Context:** ChemistTasker Expo App (`frontend_mobile`) — UX Research & Pattern Steal/Avoid Sheet  
**Methodology:** Public audit of App Store listings, Google Play listings, and vendor official help center articles. No accounts created, no apps installed, no forms submitted. All referenced screenshots are saved locally in `teardown/`.  
**Design Skills Applied:** `impeccable`, `ui-ux-pro-max`, `expo-native-ui`, `vercel-react-native-skills`.

---

## 1. App x Flow Matrix

| App | Flow | What the user sees & does | Screenshot name(s) | Source URL |
|---|---|---|---|---|
| **Locumate** (AU) | Onboarding | Sets up profile with AHPRA registration, ABN, hourly rates, and dispensing software proficiencies; account is verified with checkmark and badge before shift access. | `locumate-onboarding-1.png` | [App Store](https://apps.apple.com/au/app/locumate/id1587046385), [Locumate Help](https://support.locumate.com.au/portal/en/kb/articles/how-to-start-viewing-jobs-on-locumate-existing-locums) |
| **Locumate** (AU) | Find & Apply | Views prioritised pharmacy cards with distance (12km), date checklist, and hourly rate ($47/h); accepts shift instantly with auto-confirmation modal (24h approval timer). | `locumate-find-apply-1.png`, `locumate-find-apply-2.png` | [App Store](https://apps.apple.com/au/app/locumate/id1587046385) |
| **Locumate** (AU) | Clock-in | *not public* (platform does not implement mobile clock-in; uses post-shift timesheet submission). | *not public* | [Locumate Payment Process](https://support.locumate.com.au/portal/en/kb/articles/payment-process) |
| **Locumate** (AU) | Timesheet / Invoicing | Locum logs completed hours and break times in roster calendar; pharmacy has 48h to approve before auto-approval. Invoices generate on Tuesdays with bank details for direct transfer. | `locumate-timesheet-1.png` | [Locumate Payment Process](https://support.locumate.com.au/portal/en/kb/articles/payment-process) |
| **LocumCo+** (AU) | Onboarding | 8-step wizard with progress dots; selects "Pharmacy" industry, multi-selects roles ([Pharmacist], [Pharmacy Assistant], [Dispensary Technician]) using chips, and taps "Continue". | `locumco-onboarding-1.png` | [App Store Candidate](https://apps.apple.com/au/app/locumco-candidate/id6759357281) |
| **LocumCo+** (AU) | Find & Apply | Browse Jobs list with [Open Jobs]/[Applied] tabs and dual [View details] / [Accept] buttons; Job Details features a 2x2 metadata grid, location radius map, and sticky [Apply Job] CTA. | `locumco-find-apply-1.png`, `locumco-find-apply-2.png` | [App Store Candidate](https://apps.apple.com/au/app/locumco-candidate/id6759357281) |
| **LocumCo+** (AU) | Clock-in | Candidate Home hero "Now card" highlights current shift ("Starts now", 09:00-17:00, Pharma Hub) with a prominent orange [Check-in] button and address maps link. | `locumco-clock-in-1.png` | [App Store Candidate](https://apps.apple.com/au/app/locumco-candidate/id6759357281) |
| **LocumCo+** (AU) | Timesheet / Invoicing | Worker gets "Timesheet approved!" celebration displaying exact Check-in (09:00), Check-out (17:03), and Break (30m). Client app shows [Pending]/[Dispute]/[Approved] tabs with worker photos and hours. | `locumco-timesheet-1.png`, `locumco-timesheet-2.png` | [App Store Candidate](https://apps.apple.com/au/app/locumco-candidate/id6759357281), [App Store Client](https://apps.apple.com/au/app/locumco-client/id6759357169) |
| **Relief Buddy** (CA) | Onboarding | Minimal stark registration screen displaying "Healthcare Profession" [Pharmacy] and "Register As" [Select] dropdowns. | `reliefbuddy-onboarding-1.png` | [App Store](https://apps.apple.com/ca/app/relief-buddy-dental-rx/id1252239337) |
| **Relief Buddy** (CA) | Find & Apply | Shift detail highlights critical dispensary operations (Technician On-site [X], Assistant On-site [X], Software [Kroll], Daily Rx [>80]). Owners review candidate cards with photos, licenses, rates, and [Select]/[Reject]. | `reliefbuddy-find-apply-1.png`, `reliefbuddy-find-apply-2.png` | [App Store](https://apps.apple.com/ca/app/relief-buddy-dental-rx/id1252239337) |
| **Relief Buddy** (CA) | Clock-in | *not public* (platform does not implement mobile clock-in; post-shift hours confirmation workflow is used after shift completion). | *not public* | [Relief Buddy KB](https://knowledgebase.reliefbuddy.com/how-do-i-confirm-shift-hours-once-a-shift-is-complete) |
| **Relief Buddy** (CA) | Timesheet / Invoicing | Two-step post-shift confirmation: worker taps "Confirm Hours" under Accepted shifts ("Yes, Submit Hours" or "No, update Hours" with unpaid break minutes); manager reviews and confirms (auto-approves in 3 business days). | `reliefbuddy-timesheet-1.png`, `reliefbuddy-timesheet-2.png` | [Relief Buddy KB](https://knowledgebase.reliefbuddy.com/how-do-i-confirm-shift-hours-once-a-shift-is-complete) |
| **ShiftPosts** (CA/US) | Onboarding | *not public* (onboarding gated behind unauthenticated web sign-up; store screenshots feature only active authenticated views). | *not public* | [ShiftPosts Pharmacy](https://shiftposts.com/for-pharmacy/) |
| **ShiftPosts** (CA/US) | Find & Apply | Week-strip calendar browser shows daily shifts with total earnings ($440). Shift detail shows retail type, dispensing software (PharmaClik RX), script count (650), with dual [Bid/Decline] and [Apply] buttons. | `shiftposts-find-apply-1.png`, `shiftposts-find-apply-2.png`, `shiftposts-find-apply-3.png` | [App Store](https://apps.apple.com/ca/app/shiftposts-pharmacy-shift-app/id1438860003) |
| **ShiftPosts** (CA/US) | Clock-in | *not public* (shifts confirmed by scheduled start/end times and direct messaging; no geofenced mobile clock-in publicly documented). | *not public* | [ShiftPosts Pricing](https://shiftposts.com/pricing/) |
| **ShiftPosts** (CA/US) | Timesheet / Invoicing | "Quicker payments" view with [Week] [Month] [Year] segmented control; lists completed shifts by date badge with pharmacy name, hours worked, hourly rate, and payout amount. | `shiftposts-timesheet-1.png` | [App Store](https://apps.apple.com/ca/app/shiftposts-pharmacy-shift-app/id1438860003) |
| **Locate a Locum** (UK) | Onboarding | Locum signs up and submits professional accreditation / license documents; app gates shift applications until compliance documents are validated. | `locatealocum-onboarding-1.png` | [App Store](https://apps.apple.com/gb/app/locate-a-locum-shift-manager/id1239779099), [Locate a Locum KB](https://help.locatealocum.com/en/articles/15014361-how-to-renew-and-update-my-credentials-on-my-locate-a-locum-app) |
| **Locate a Locum** (UK) | Find & Apply | Search board with category chips ([For you] [Favourites] [Emergencies] [Instant Book]). Detail screen features "You've worked this shift ✓" badge, automated payment disclosure, break terms, and dual [Negotiate] / [Apply] CTAs. | `locatealocum-find-apply-1.png`, `locatealocum-find-apply-2.png` | [App Store](https://apps.apple.com/gb/app/locate-a-locum-shift-manager/id1239779099) |
| **Locate a Locum** (UK) | Clock-in | In-store Time & Attendance terminal: worker enters employee credentials, sees personalised greeting ("Good day, Rory!"), scheduled shift (09:00-17:00), employer notes, notes field, and [Clock-in] button. | `locatealocum-clock-in-1.png` | [Locate a Locum KB](https://help.locatealocum.com/en/articles/4634775-how-to-clock-in-for-a-shift) |
| **Locate a Locum** (UK) | Timesheet / Invoicing | "My Finance" section segregates Automated Payments (invoices generated automatically upon manager approval) and Manual Invoices, with Processed, Reconciled, and Rejected states. | `locatealocum-timesheet-1.png` | [App Store](https://apps.apple.com/gb/app/locate-a-locum-shift-manager/id1239779099), [Locate a Locum KB](https://help.locatealocum.com/en/articles/4514330-what-do-the-different-invoice-statuses-mean) |
| **Mable** (AU) | Onboarding | *not public* (worker accreditation, police check, and NDIS screening handled via web submission; native store screenshots show only post-login views). | *not public* | [Mable Agreements](https://mable.com.au/help_centre/agreements-how-it-works/) |
| **Mable** (AU) | Find & Apply | Worker searches shifts by suburb/postcode with "Include nearby suburbs" toggle. Client dashboard features "Find support faster" hub with [Post a job], [Search workers], and active application counts. | `mable-find-apply-1.png`, `mable-find-apply-2.png` | [App Store Worker](https://apps.apple.com/au/app/mable-manage-clients/id6745159145), [App Store Client](https://apps.apple.com/au/app/mable-find-support/id6761354249) |
| **Mable** (AU) | Clock-in | Worker home screen displays "Planned for today" sessions with [Check in] status chips ("Now" vs "In 3 h"). Session details provide [Check in now] and [Check in at a different time] action buttons. | `mable-clock-in-1.png`, `mable-clock-in-2.png` | [App Store Worker](https://apps.apple.com/au/app/mable-manage-clients/id6745159145) |
| **Mable** (AU) | Timesheet / Invoicing | Client dashboard shows an "Important updates" inbox with worker photo, name, and hours ("Linda J · 2 hours, Sun 1 Feb") with a direct [Review hours] button. Worker home alerts on missing hours/notes. | `mable-timesheet-1.png` | [App Store Client](https://apps.apple.com/au/app/mable-find-support/id6761354249) |
| **ShiftKey** (US) | Onboarding | Profile setup includes specialized clinical skills with years/months of experience and a multi-select EMR proficiency list (Epic, Allscripts, PointClickCare). | `shiftkey-onboarding-1.png` | [App Store](https://apps.apple.com/us/app/shiftkey-prn-healthcare-jobs/id1532097671) |
| **ShiftKey** (US) | Find & Apply | Explore shifts by zipcode (`75038`), filter by Favorites and Shift Type. Displays conflict awareness banner ("You booked 2 shifts on this day. BOOKED ✓") and instant `[⚡ Accept]` suggested bid button. | `shiftkey-find-apply-1.png` | [App Store](https://apps.apple.com/us/app/shiftkey-prn-healthcare-jobs/id1532097671) |
| **ShiftKey** (US) | Clock-in | Timed notification prompt alerts worker: "Status: Check In for your Shift" leading to on-site facility check-in verification. | `shiftkey-clock-in-1.png` | [App Store](https://apps.apple.com/us/app/shiftkey-prn-healthcare-jobs/id1532097671) |
| **ShiftKey** (US) | Timesheet / Invoicing | Instant Pay & Payments tab with Year/Month/Week segmented view and monthly totals. Upon shift approval, celebration screen shows "Payment Received! You earned $253.50" with an immediate [Explore Shifts] CTA. | `shiftkey-timesheet-1.png`, `shiftkey-timesheet-2.png` | [App Store](https://apps.apple.com/us/app/shiftkey-prn-healthcare-jobs/id1532097671) |

---

## 2. STEAL: 12 Proven Mobile Patterns to Adopt

1. **The Hero "Now Card" with Instant Check-in & Navigation**
   - **App:** LocumCo+ (`locumco-clock-in-1.png`)
   - **Why it helps on a phone:** When a pharmacist arrives at a pharmacy in the morning, they should never have to drill through menus. A prominent top card with "Starts now", the exact address with an open-in-maps icon, and a full-width primary [Check-in] button solves the single job they opened the app for in one tap.
   - **ChemistTasker screen:** Pharmacist / Locum Home & Attendance Clock.
   - **Screenshot:** `locumco-clock-in-1.png`

2. **Dispensary Context Badges: Software, Script Count & Support Staff**
   - **App:** ShiftPosts (`shiftposts-find-apply-2.png`) & Relief Buddy (`reliefbuddy-find-apply-1.png`)
   - **Why it helps on a phone:** A locum pharmacist cannot safely commit to a shift without knowing the dispensing software (e.g. Fred NXT, Minfos, Aquarius) and whether they are flying solo. Presenting "Software: PharmaClik", "Script Count: 650", and "Tech On Site: Yes / No" as scannable metadata chips prevents high-stress pharmacy mismatches.
   - **ChemistTasker screen:** Find Shifts / Shift Details card.
   - **Screenshot:** `shiftposts-find-apply-2.png`

3. **Dual Shift Action: Direct Apply vs In-App Rate Negotiation**
   - **App:** Locate a Locum (`locatealocum-find-apply-1.png`, `locatealocum-find-apply-2.png`)
   - **Why it helps on a phone:** Urgent or hard-to-fill shifts frequently require rate adjustment. Rather than leaving the app to make phone calls, providing side-by-side [Negotiate] and [Apply] buttons allows locums to counter-propose a rate with an optional reason, which automatically converts into a confirmed booking once accepted by the owner.
   - **ChemistTasker screen:** Shift Details & PostShift Counter-Offer sheet.
   - **Screenshot:** `locatealocum-find-apply-1.png`

4. **Familiarity Trust Badge: "You've worked this shift ✓"**
   - **App:** Locate a Locum (`locatealocum-find-apply-1.png`)
   - **Why it helps on a phone:** Pharmacists strongly prefer returning to stores where they already know the layout, alarm codes, and regulars. Showing a discrete, reassuring checkmark badge ("You've worked this shift") increases repeat bookings and shortens booking deliberation.
   - **ChemistTasker screen:** Shift Board / Shift Cards.
   - **Screenshot:** `locatealocum-find-apply-1.png`

5. **Horizontal Calendar Week Strip with Status Dots**
   - **App:** ShiftPosts (`shiftposts-find-apply-1.png`)
   - **Why it helps on a phone:** Full 30-day monthly calendar grids take up the entire viewport and make tap targets minuscule. A compact 7-day horizontal strip with day numbers, selected state, and shift indicators allows rapid horizontal swiping while leaving 70% of the screen free for shift cards.
   - **ChemistTasker screen:** Roster / Shift Board calendar view.
   - **Screenshot:** `shiftposts-find-apply-1.png`

6. **In-App Double-Booking Awareness Banner**
   - **App:** ShiftKey (`shiftkey-find-apply-1.png`)
   - **Why it helps on a phone:** Locums frequently browse multiple opportunities across neighboring suburbs. An unmistakable striped banner ("You booked 2 shifts on this day. BOOKED ✓") prevents inadvertent double-booking before submission.
   - **ChemistTasker screen:** Shift Board / Shift Detail.
   - **Screenshot:** `shiftkey-find-apply-1.png`

7. **Actionable Manager Timesheet Inbox with Face & One-Tap Review**
   - **App:** Mable (`mable-timesheet-1.png`) & LocumCo+ (`locumco-timesheet-2.png`)
   - **Why it helps on a phone:** Pharmacy owners are on their feet all day and review timesheets between customer consultations. Displaying the locum's photo, name, hours ("Linda J · 2 hours, Sun 1 Feb"), and a direct [Review hours] button on the Home screen clears approvals without searching through reports.
   - **ChemistTasker screen:** Pharmacy Owner Home & Timesheet Inbox.
   - **Screenshot:** `mable-timesheet-1.png`

8. **Structured Two-Step Post-Shift Hour Reconciliation**
   - **App:** Relief Buddy (`reliefbuddy-timesheet-1.png`, `reliefbuddy-timesheet-2.png`)
   - **Why it helps on a phone:** Prevents payment friction by asking the locum first: "Yes, Submit Hours" or "No, update Hours" (with precise unpaid break minutes and overtime notes). The owner then receives a pre-reconciled submission that auto-approves after 48-72 hours if no dispute is logged.
   - **ChemistTasker screen:** Timesheet Submission & Verification flow.
   - **Screenshot:** `reliefbuddy-timesheet-1.png`

9. **Human Milestone Celebration with Immediate Next Action**
   - **App:** ShiftKey (`shiftkey-timesheet-2.png`) & LocumCo+ (`locumco-timesheet-1.png`)
   - **Why it helps on a phone:** Completing a timesheet or receiving pay is a key emotional moment. Displaying an uplifting card ("Payment Received! You earned $253.50") paired with an explicit next step ([Explore Shifts] / [Back to Home]) eliminates dead ends and drives retention.
   - **ChemistTasker screen:** Timesheet Approval & Payment success state.
   - **Screenshot:** `shiftkey-timesheet-2.png`

10. **Multi-Select Competency & Dispensing Software Chips in Onboarding**
    - **App:** ShiftKey (`shiftkey-onboarding-1.png`) & LocumCo+ (`locumco-onboarding-1.png`)
    - **Why it helps on a phone:** Typing software experience and roles into mobile text inputs causes heavy drop-off. Providing tap-toggle chips for roles ([Pharmacist], [Assistant], [Tech]) and software (Fred, Minfos, Aquarius) allows completing setup in under 60 seconds with thumb navigation.
    - **ChemistTasker screen:** Locum Onboarding Step 2 & Profile Skills.
    - **Screenshot:** `locumco-onboarding-1.png`

11. **Flexible Check-in Modal: "Check in now" vs "Check in at a different time"**
    - **App:** Mable (`mable-clock-in-2.png`)
    - **Why it helps on a phone:** Pharmacy opening often involves delayed handover or early arrival to count the safe. Offering dual buttons ([Check in now] and [Check in at a different time]) allows pharmacists to record honest arrival times without triggering system rejection.
    - **ChemistTasker screen:** Attendance Clock-in screen.
    - **Screenshot:** `mable-clock-in-2.png`

12. **Transparent Payment Disclosure on Shift Cards**
    - **App:** Locate a Locum (`locatealocum-find-apply-1.png`)
    - **Why it helps on a phone:** Locums often worry about invoice chasing and payment terms. Disclosing "Payment Method - Automated Payments. No need to issue an invoice. Payment will be made automatically to your bank account" directly on the shift card removes financial hesitation before applying.
    - **ChemistTasker screen:** Shift Details & Confirmation Sheet.
    - **Screenshot:** `locatealocum-find-apply-1.png`

---

## 3. AVOID: 7 Anti-Patterns to Reject

1. **Sterile "Mystery Meat" Onboarding Screen**
   - **App:** Relief Buddy (`reliefbuddy-onboarding-1.png`)
   - **Why it hurts on a phone:** Presenting a blank white screen with two stark navy dropdown boxes ("Healthcare Profession", "Register As") and zero contextual guidance or value proposition feels like an unstyled internal database form, creating immediate user bounce.
   - **ChemistTasker screen to protect:** Onboarding steps (always use welcoming copy, icon headers, and explanatory microcopy).
   - **Screenshot:** `reliefbuddy-onboarding-1.png`

2. **Blind Multi-Day Checklists Without Per-Day Terms**
   - **App:** Locumate (`locumate-find-apply-1.png`)
   - **Why it hurts on a phone:** Displaying 4 consecutive dates with simple checkboxes and generic "1 Shift" labels without disclosing whether individual days have different start/end times, lunch break policies, or sole-charge responsibilities forces blind commitment.
   - **ChemistTasker screen to protect:** Multi-Day Shift Posting & Shift Apply.
   - **Screenshot:** `locumate-find-apply-1.png`

3. **Sluggish Web-Wrapper Architecture (GoNative Shell)**
   - **App:** Locumate (`locumate-find-apply-1.png`, Play package `io.gonative.android.xozlmb`)
   - **Why it hurts on a phone:** Wrapping a responsive web page into a native shell creates noticeable tap latency, missing pull-to-refresh physics, sluggish modal transitions, and unresponsive bottom navigation tabs that feel cheap and foreign to mobile users.
   - **ChemistTasker screen to protect:** All Expo screens (stay strictly native with Paper 5 kit, native Stack, and `@expo/ui` controls).
   - **Screenshot:** `locumate-find-apply-1.png`

4. **Gamified Rewards on Clinical Healthcare Platforms**
   - **App:** Locate a Locum (`locatealocum-onboarding-1.png` / App Store slide 4)
   - **Why it hurts on a phone:** Offering coffee coupons ("Get a coffee on us - 2 more shifts") or trophy icons on a professional locum tool trivializes licensed clinical work and adds unnecessary cognitive clutter to the navigation hierarchy.
   - **ChemistTasker screen to protect:** More Screen / Profile.
   - **Screenshot:** `locatealocum-onboarding-1.png`

5. **Multi-Input Credential Login on Shared In-Store Clock-In Terminal**
   - **App:** Locate a Locum (`locatealocum-clock-in-1.png`)
   - **Why it hurts on a phone:** Requiring locums to select a user type, type an employee number, enter a password, and fill out a text box on a shared dispensary terminal creates counter congestion when a pharmacy opens at 8:30 AM.
   - **ChemistTasker screen to protect:** Attendance Clock / Kiosk PIN (use personal mobile geofence or single 4-digit PIN).
   - **Screenshot:** `locatealocum-clock-in-1.png`

6. **Prominent Headline Earnings That Obscure Hourly Rates**
   - **App:** ShiftPosts (`shiftposts-find-apply-1.png`)
   - **Why it hurts on a phone:** Highlighting large total sums ($440, $480) in bright green while rendering the actual hourly rate ($55/h) in faint micro-typography makes 10-hour grinds look artificially attractive compared to 6-hour shifts.
   - **ChemistTasker screen to protect:** Shift Board & Roster cards.
   - **Screenshot:** `shiftposts-find-apply-1.png`

7. **Unreconciled Timesheet Disputes Hidden Behind Support Tickets**
   - **App:** Locumate (`locumate-timesheet-1.png`)
   - **Why it hurts on a phone:** If an owner disputes a timesheet or if a locum worked 45 minutes overtime, forcing them to open an external Zendesk/Zoho support ticket rather than offering an in-app hours amendment flow delays payroll and damages trust.
   - **ChemistTasker screen to protect:** Timesheet Details & Dispute flow.
   - **Screenshot:** `locumate-timesheet-1.png`

---

## 4. "Not Covered" List (Public Evidence Boundaries)

Per the research brief rules ("If a flow is not visible publicly, write 'not public' for that cell; never guess"), the following flows have no public evidence available and were excluded from speculative analysis:

1. **Locumate — Clock-in:** Locumate does not implement a real-time mobile clock-in or attendance check-in feature. Its public help documentation confirms shifts transition directly from completion to post-shift timesheet submission.
2. **Relief Buddy — Clock-in:** Relief Buddy does not use a real-time mobile clock-in or GPS check-in feature. Completed shifts are validated solely via its post-shift two-step hours confirmation workflow.
3. **ShiftPosts — Clock-in:** ShiftPosts provides no public evidence or documentation of an in-app GPS clock-in or arrival scanning feature.
4. **ShiftPosts — Onboarding:** The end-to-end credential submission and validation flow is gated behind unauthenticated web registration; mobile app store listings only showcase active, logged-in roster screens.
5. **Mable — Onboarding:** The formal support worker credentialing, police check, and NDIS screening verification wizard is completed through web onboarding; mobile store screenshots display only post-activation dashboards.
