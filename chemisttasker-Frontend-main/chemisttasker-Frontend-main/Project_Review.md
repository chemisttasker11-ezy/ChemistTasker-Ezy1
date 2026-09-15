# ChemistTasker Project Review

## Overview
I have performed a deep-dive code review of the `frontend_web` architecture, specifically focusing on the Roster and Shift Management modules. The project is structured as a modern, scalable enterprise application.

## Key Observations

### 1. Robust Architecture (The "Shared Core")
The project explicitly separates business logic into a `shared-core` package.
*   **Benefit:** This is a hallmark of high-quality engineering. It means the Web App and Mobile App share the *exact same* rules for calculating pay rates, filtering shifts, and managing user permissions. This drastically reduces bugs and ensures consistency.
*   **Evidence:** Imports like `from '@chemisttasker/shared-core';` in your components.

### 2. Complex Business Logic Handling
The **Escalation Logic** found in `ActiveShiftsPage` and `EscalationStepper` is sophisticated.
*   It supports a 5-tier visibility waterfall (`FULL_PART_TIME` -> `LOCUM_CASUAL` -> `OWNER_CHAIN` -> `ORG_CHAIN` -> `PLATFORM`).
*   This is not just a standard "job board"; it's a priority-queue dispatcher designed for multi-site groups. This is your USP (Unique Selling Proposition).

### 3. Modern UI/UX Practices
*   **Material UI V5:** You are using a robust component library with a custom theme system (`theme.ts`).
*   **Interactive Components:** Usage of `react-big-calendar` for the roster and custom steppers for workflows indicates an investment in user experience, not just data entry.
*   **Feedback Loops:** The code references "Worker Ratings" and "Counter Offers", adding depth to the marketplace aspect of the app.

### 4. Code Quality
*   **TypeScript:** The codebase is strictly typed, which is essential for a complex financial/roster application.
*   **Separation of Concerns:** Components are broken down logically (e.g., `StatusCard`, `PublicLevelView`, `CommunityLevelView`).
*   **Hooks:** Custom hooks like `useShiftsData` and `useShiftActions` keep the UI components clean.

## Strategic Recommendations for the Presentation
*   **Don't sell it as "Software":** Sell it as a "Network Optimizer". The code proves it's designed to connect disparate nodes (pharmacies).
*   **Highlight the "Owner Chain" Tier:** In the code, `OWNER_CHAIN` is a distinct visibility level. This is massive for franchise owners with multiple stores. Make sure they know this exists. It solves their #1 pain point: "I have staff at Store A, but Store B is empty."
*   **Mobile-First for Staff:** The "Uber-style" features (bidding, counter-offers) are what will sell this to the workforce.

## Conclusion
The codebase backs up the marketing claims. It is not a prototype; it has the structural integrity of a production-grade system ready for scaling.


## Prompt
Implement overdue unpaid accepted-shift enforcement for ChemistTasker.

Current behavior:
- When a worker accepts an offer and payment is required, the code sets:
  - `ShiftOffer.status = ACCEPTED_AWAITING_PAYMENT`
  - `Shift.payment_status = PENDING`
- If payment is later completed, billing webhook finalizes the offer and sets the shift to paid.
- There is already manual cancellation penalty logic in `backend/billing/views.py` via `charge_penalty(request, shift_id)`.
- There is currently no automatic handling when the shift start time passes and payment was never made.
- As a result, shifts can remain stuck in overdue unpaid state forever.

What I want:
1. Add backend logic to detect overdue unpaid accepted shifts.
2. Define and implement a clear state transition for:
   - shift payment still pending
   - accepted offer awaiting payment
   - shift start time has passed
3. Reuse the existing cancellation-penalty concept where appropriate, but do not force automatic charging without a clear trigger.
4. Make the behavior safe, explicit, and auditable.

Expected solution shape:
1. Add a scheduled backend task/job that runs periodically and finds shifts/offers where:
   - `Shift.payment_status == 'PENDING'`
   - at least one related `ShiftOffer.status == 'ACCEPTED_AWAITING_PAYMENT'`
   - the relevant shift start datetime has already passed
2. Decide and implement the overdue rule. Recommended default:
   - mark the accepted-awaiting-payment offer as expired/failed due to non-payment
   - keep a clear overdue marker on the shift, or introduce a state that indicates payment deadline missed
   - do not silently finalize or ignore it
3. If penalty should be collectible after overdue:
   - make the system expose/use the existing `charge_penalty` flow
   - do not automatically charge a card unless the business rule explicitly says so
4. Prevent easy escape hatches like deleting a shift to avoid consequence, or at least identify and document current delete behavior.
5. Keep the implementation role-aware:
   - owner
   - organization admin
   - pharmacy admin
   The system must not hardcode owner-only assumptions.

Also do this:
1. Review the current delete/cancel shift path and explain whether deleting an overdue unpaid shift is currently possible.
2. Review where the overdue-payment action should appear in the UI.
3. Recommend the best UI placement in plain English, based on the current active shift pages and billing flow.

Constraints:
1. Keep changes consistent with the existing billing model already in this codebase.
2. Avoid logging sensitive Stripe payloads or secrets.
3. Preserve current working subscription and shift payment flows.
4. If model changes are needed, add migrations.
5. Verify with `manage.py check`.

Files likely involved:
- `backend/billing/views.py`
- `backend/billing/models.py`
- `backend/client_profile/views.py`
- `backend/client_profile/models.py`
- any task/scheduler files already used in this project for periodic jobs

Deliverables:
1. backend overdue-payment enforcement
2. clear state transitions
3. review of delete behavior
4. recommendation for UI placement of overdue penalty/payment handling
5. concise summary of what changed and any remaining edge cases




for the welcome email.
backend\templates\emails\welcome_email.html


I need to add some description if the user is Onwer

such as navigate to this link
base frontend (changes between locally and production)/dashboard/owner/manage-pharmacies/my-pharmacies

so you can list your pharmacies bla bla bla

with some good language and welcoming behavior


and fix this url link
/onboarding/owner/

this is wrong this should be http://localhost:5173/dashboard/owner/onboarding

also changes based on the user role 