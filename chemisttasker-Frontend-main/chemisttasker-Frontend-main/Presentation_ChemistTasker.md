# ChemistTasker: The Future of Pharmacy Workforce Management
**Prepared for Chempro Group HR & Directorate**

---

## Slide 1: The Vision
**Title:** ChemistTasker: Unlocking the Power of the Chempro Network
**Subtitle:** Seamlessly deploying staff across the entire group—instantly.

**Visual:** [Hero Image: Abstract visualization of the Chempro network with glowing nodes connecting pharmacies, symbolizing the fluid movement of staff]

**Script:**
"Managing a multi-site pharmacy group is complex. You have the staff, you have the shifts, but connecting them efficiently is the challenge. ChemistTasker isn't just a roster tool; it's a **Workforce Orchestration Engine** designed specifically for groups like Chempro to turn your headcount into a flexible, rapid-response network."

---

## Slide 2: The "Expansion Pain"
**Title:** Growing Pains in Multi-Site Management
**Bullet Points:**
*   **Siloed Staffing:** Staff at Store A are idle while Store B is desperate for coverage.
*   **Communication Breakdown:** Endless WhatsApp groups, lost texts, and frantic calls.
*   **Compliance Risks:** Unverified locums, expired registrations, and confusing pay rates.
*   **High Costs:** Over-reliance on expensive external agencies when internal casuals are available.

**Script:**
"As Chempro expands, these problems multiply. We currently operate in silos. Store A is short-staffed, paying premium rates for an agency locum, while a casual at Store B—just 5km away—is looking for hours. This inefficiency costs us thousands per week and slows down our ability to launch new sites."

---

## Slide 3: The Solution – ChemistTasker
**Title:** An "Uber-Style" System for Private Pharmacy Groups
**Key Analogy:** 
> "Think of it as **Facebook Groups** for community + **Uber** for shifts + **Seek** for recruitment + **WorkVivo** for culture—all in one secure platform."

**Visual:** [Attached Screenshot: `dashboard_main` - The Command Center showing notifications, upcoming shifts, and quick actions.]

**Core Pillars:**
1.  **Centralized Roster:** Drag-and-drop simplicity.
2.  **Smart Escalation:** The "Secret Sauce" for groups.
3.  **Compliance Tracker:** Automatic checks on AHPRA registration.
4.  **Team Hub:** Operational tasks and announcements.

---

## Slide 4: The Game Changer – "Smart Escalation"
**Title:** Maximizing Internal Staff Utilization
**Concept:** 
Most platforms just post a job. ChemistTasker **cascades** the job to the cheapest and most reliable staff first.

**Visual:** [Attached Screenshot: `active_shifts` - Showing the 'EscalationStepper' and tiered release logic.]

**The "Nano Banana" Flow (Internal First Strategy):**
1.  **Tier 1 (My Pharmacy):** Notification goes to your store's permanent/part-time staff. *(Cost: Base Rate)*
2.  **Tier 2 (Favorites):** Notification to your trusted list of casuals. *(Cost: Standard Casual)*
3.  **Tier 3 (Owner Chain):** **CRITICAL FOR CHEMPRO.** Automatically notifying staff from *other* Chempro stores owned by the same partners.
4.  **Tier 4 (Org Chain):** Opens to the entire Chempro group network.
5.  **Tier 5 (Platform):** Last resort—external locums.

**Impact:** "We fill 90% of shifts internally before ever paying external agency fees."

---

## Slide 5: Operations & Task Management
**Title:** More Than Just Shifts
**Visual:** [Attached Screenshot: `roster_view` - Showing the calendar, task lists, and compliance indicators.]

**Features:**
*   **Live Roster:** See who is working where in real-time.
*   **Task Lists:** Assign daily operational tasks (e.g., "Check DD Book", "End of Month Stock") to specific shifts.
*   **Feedback Loop:** Rate workers after every shift to build a high-quality internal talent pool.

---

## Slide 6: The "Uber" Experience for Staff
**Title:** engaging the Modern Workforce
**Visual:** [High-fidelity mobile mockup of a staff member receiving a push notification: *"New Shift at Chempro Surfers Paradise: $65/hr. Accept?"*]

**Benefits for Staff:**
*   **One App:** They manage their availability, payslips, and roster in one place.
*   **Instant Access:** They see shifts the moment they are posted.
*   **Career Growth:** Exposure to different stores and partners within the group.
*   **Employment Fair Ready:** This app is the perfect onboarding tool for new recruits at the upcoming fair. "Download the app, join the Chempro Talent Pool instantly."

---

## Slide 7: Technical Superiority
**Title:** Built for Scale & Security
**Visual:** [Diagram of the Architecture: "Shared Core" logic engine feeding into both Web Dashboard and Native Mobile Apps.]

**The Tech Stack:**
*   **Shared Core Technology:** Ensures logic (pay rates, matching rules) is identical across Web and Mobile.
*   **Real-time Sync:** Changes on the Roster appear instantly on Staff mobiles.
*   **Scalable Backend:** Built on Django/Python (enterprise standard) to handle thousands of concurrent users and complex payroll calculations.
*   **Secure:** Role-based access control (Owner vs Manager vs Pharmacist vs Student).

---

## Slide 8: Implementation Plan
**Title:** Deployment Roadmap
**Timeline:**
*   **Phase 1 (Pilot):** 5 Stores. Validate "Owner Chain" escalation.
*   **Phase 2 (Group Rollout):** Onboard all Pharmacists and Managers.
*   **Phase 3 (The Fair):** Launch "ChemistTasker Talent" for students/interns.

---

## Slide 9: The Bottom Line
**Title:** Why This Matters Now
**Closing Statement:**
"ChemistTasker transforms our workforce from a static cost center into a dynamic, responsive asset. It is the infrastructure Chempro needs to expand rapidly without losing control."

**Call to Action:**
"Let's schedule a live demo with your Roster Managers next week."

---

## Appendix: Logic Flowchart

```mermaid
graph TD
    A[Manager Creates Shift] --> B{Is it Urgent?}
    B -- Yes --> H[Post to Platform/External]
    B -- No --> C[Tier 1: Notify Store Staff]
    C -->|No Fill| D[Tier 2: Notify Favourites]
    D -->|No Fill| E[Tier 3: Notify Owner Chain (Sister Stores)]
    E -->|No Fill| F[Tier 4: Notify Chempro Group]
    F -->|No Fill| H
    
    H --> I{Candidate Applies}
    I --> J[Manager Reviews Profile & Rating]
    J --> K[Accept & Assign]
    K --> L[Shift Added to Roster]
    L --> M[Payroll Auto-Calculated]
```
