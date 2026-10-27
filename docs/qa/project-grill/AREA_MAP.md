# ChemistTasker project-wide area map

This is an initial navigation map assembled from the PR #203 repository structure and the legacy Grill. It is **not** a claim that every listed file or user journey has been semantically reviewed. Before discussing an area, verify current behaviour against the latest PR #203 head and cite the exact commit and source/test locations.

| ID | Sequence | Area | Initial repository entry points | Scenario scope |
|---|---|---|---|---|
| GM-01 | Identity and trust | Accounts, authentication and sessions | `backend/users`, `backend/notifications`, `shared-core/src/domains/auth` | Signup, login, reset, MFA, logout, cross-device sessions |
| GM-02 | Identity and trust | Worker onboarding and professional credentials | `backend/onboarding`, `backend/client_profile`, web onboarding pages | Pharmacist, intern, other staff and Explorer; AHPRA, ABN and insurance |
| GM-03 | Identity and trust | Pharmacy and owner setup | `backend/organizations`, `backend/client_profile`, web setup pages | Site creation, identity, ABN, verification and responsibility |
| GM-04 | Identity and trust | Organisations, chains and regions | `backend/organizations`, `shared-core/src/domains/organizations` | Hierarchy, site ownership, regional scope and admin boundaries |
| GM-05 | Identity and trust | Roles, permissions, memberships and invites | `backend/memberships`, `backend/organizations`, shared membership domain | Owner/manager/admin/worker powers, invites, removal and history |
| GM-06 | Workforce | Employment, staff lifecycle and leave | `backend/workforce`, `backend/memberships` | Contract type, status, rehire, availability and leave |
| GM-07 | Workforce | Internal roster, cover and swaps | `backend/workforce`, `backend/shifts`, shared roster domain | Draft/publish, employee assignment, cover, swaps and approval |
| GM-08 | Workforce | Attendance, kiosk and device control | `backend/attendance`, mobile attendance, kiosk docs | Clock in/out, offline sync, PIN, revocation, exceptions |
| GM-09 | Workforce | Timesheets, payroll and actual hours | `backend/workforce`, `backend/worker_finance` | Approved hours, overtime, payroll export and pay handoff |
| GM-10 | Shifts and matching | Shift posting, dates, rates and eligibility | `backend/shifts`, shared shift domain | Multi-date shifts, roles, locations, prices, Award floor and edits |
| GM-11 | Shifts and matching | Audience tiers, escalation and outreach | `backend/shifts`, `backend/notifications` | Staff, favourites, chain, organisation, public, anonymity and notices |
| GM-12 | Shifts and matching | Interest, selection, offers and counteroffers | `backend/shifts`, `backend/talent` | Applicants, offers, negotiation, eligibility and conflicts |
| GM-13 | Shifts and matching | Reservations, deadlines and confirmation | `backend/shifts`, `backend/billing` | Pending versus confirmed, deadlines, duplicates, payment failure and late webhooks |
| GM-14 | Agreements and money | Agreements, Award, tax and super | `backend/shifts`, `backend/workforce`, `backend/worker_finance` | ABN/TFN relationship, frozen terms, Award, super, GST and consent |
| GM-15 | Agreements and money | Cancellation, no-show, disputes and ratings | `backend/shifts`, `backend/ratings`, workforce | Authority, financial effects, cover, incidents, sanctions, appeals and reviews |
| GM-16 | Agreements and money | Subscriptions, checkout and platform fees | `backend/billing`, `backend/rewards`, shared billing domain | Pricing, seats, Pills, idempotency and customer expectations |
| GM-17 | Agreements and money | Invoices, refunds and reconciliation | `backend/invoicing`, `backend/worker_finance`, billing | Receipts, invoices, refunds, reconciliation and provider actions |
| GM-18 | Discovery and communication | Talent board, profiles and recruitment | `backend/talent`, web talent pages | Identity masking, hiring permissions, visibility and contact |
| GM-19 | Discovery and communication | Availability, matching and preferences | `backend/talent`, `backend/shifts`, `backend/team_calendar` | Private calendar, sharing, matching, freshness and alerts |
| GM-20 | Discovery and communication | Chat, Pharmacy Hub and Public Hub | `backend/chat`, `backend/pharmacy_hub`, `backend/public_hub` | Messages, polls, groups, revocation, deletion and retention |
| GM-21 | Discovery and communication | General and ethical marketplaces | `backend/marketplace`, `backend/ethical_marketplace` | Listings, stock, enquiries, ownership, moderation and payment |
| GM-22 | Discovery and communication | Notifications, rewards and communications | `backend/notifications`, `backend/rewards`, shared notification domain | Email, push, in-app, opt-in, unread and referrals |
| GM-23 | Operations and experience | Calendars and pharmacy operations planner | `backend/team_calendar`, shared calendar domain | Events, rosters, tasks, scope and visibility |
| GM-24 | Operations and experience | Explorer and public journeys | `backend/talent`, web pages, `presentation_web` | Role upgrade, public listings, landing pages and signup |
| GM-25 | Operations and experience | Web, Next, Expo, shared-core and accessibility | `frontend_web`, `frontend_mobile`, `presentation_web`, `shared-core` | Persona parity, mobile usability, notification and error states |
| GM-26 | Operations and experience | Admin, governance, security and release | `backend/core`, `backend/testing`, architecture docs and scripts | Moderation, retention, privacy, staging, CI, deployment and support |

## Legacy crosswalk

The original Launch Grill remains unchanged on branch `docs/launch-grill-20261020` and contains 142 questions in eight areas. Use [QUESTION_INVENTORY.md](QUESTION_INVENTORY.md) to map them without duplicating decisions.

| Legacy area | Questions | New areas to inspect first |
|---|---:|---|
| Onboarding | 19 | GM-01 to GM-06, GM-24 |
| Post a shift | 17 | GM-10, GM-11, GM-14, GM-16 |
| Apply and book | 15 | GM-02, GM-12, GM-13, GM-17 |
| Agreements and changes | 12 | GM-14, GM-15, GM-17 |
| Cancellations and no-shows | 37 | GM-07, GM-09, GM-15, GM-17, GM-22 |
| Talent board | 10 | GM-18, GM-24, GM-25 |
| Availability | 9 | GM-19, GM-22, GM-23 |
| Fix list and launch | 23 | All; separate engineering defects from owner choices |
| **Total** | **142** | Count is not a completion percentage |

## Definition of discussion-complete

An area is discussion-complete only when its important journeys and permission/payment boundaries have exact-commit evidence; old questions are marked carried, superseded, technical or open; owner decisions are recorded; contradictions become implementation gaps; and an approved area specification plus implementation/test backlog exists. This is not production signoff.
