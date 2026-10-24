# Known findings B01-B65 (do not re-report; reference by ID if you see the same issue)
B01 | P0 | Billing | Subscriber discount omitted from shift checkout 
B02 | P1 | Billing | Purchased extra seats cannot subsequently be adjusted 
B03 | P0 | Memberships/Chat | Removing staff cascades historical chat messages 
B04 | P0 | Billing | Empty and duplicate shift checkout sessions possible 
B05 | P1 | Chat | Already-connected sockets may outlive access revocation 
B06 | P0 | Calendar | Org feed may expose another pharmacy's work notes 
B07 | P0 | Calendar | Scoped admins can manage out-of-scope calendar items 
B08 | P1 | Shifts/Notifications | Region Admin notified about unrelated pharmacy shifts 
B09 | P1 | Shifts/Tasks | Shift escalation depends on reads and omits audience notification 
B10 | P0 | Rewards/Shifts | Multi-offer Pills spend uses one shift-wide ledger key; concurrency risk 
B11 | P1 | Shifts/Billing | Abandoned payments can indefinitely reserve slots 
B12 | P1 | Ratings | Rating can be submitted before completed work 
B13 | P1 | Accounts/Shifts | Account deletion leaves future booked shifts without handover 
B14 | P0 | Shift Pricing | Legacy casual award figures and incomplete future holiday data 
B15 | P0 | Billing | Penalty payment webhook can finalise unrelated offers 
B16 | P0 | Organizations | Pharmacy Admin update bypasses management privilege 
B17 | P0 | Organizations/Memberships | Chain update can attach foreign pharmacy and affect membership deletion 
B18 | P0 | Claims | Claim PUT path bypasses owner approval workflow 
B19 | P0 | Memberships | Invite links can be retargeted; removal may cascade applications 
B20 | P1 | Shifts | Interest/rejection mutation can target a different shift 
B21 | P0 | Workforce/Shifts | Cover request scope differs from assignment scope 
B22 | P0 | Pharmacy Hub | Org poll aggregation includes private pharmacy polls 
B23 | P0 | Organizations | Chief Admin may mutate/delete organization record 
B24 | P0 | Ordinary marketplace | Exchange action accepts confirm-completion while still in ENQUIRY / TERMS_PROPOSED, and arbitrary propose-terms/cancel/decline after accepted or completed; buyer can invoke decline. This bypasses accepted terms and reservation lifecycle. 
B25 | P1 | Marketplace listings | ListingAudience saves current circle and bumps listing.version before validating every requested schedule item. Invalid later schedule returns 400 after persistent state mutation. 
B26 | P1 | Ethical marketplace | EthicalListing draft is persisted before checking lot selection, lot ownership and available quantities; invalid listing create can leave orphan or partially allocated regulated-stock drafts. 
B27 | P1 | Workforce timesheets | TimesheetPeriod creation rejects inverted/overlong date ranges but allows overlapping ranges for same pharmacy, while payroll manifests can each represent the same attendance/roster minutes. 
B28 | P1 | Timesheet controls | Timesheet check decision path allows new resolved/waived decision on a check belonging to an already LOCKED period without correction/reopen process. 
B29 | P0 | Attendance/offline kiosk | Signed offline event integrity flags for clock-anchor drift, backward time, monotonic rollback and seven-day server drift mark evidence NEEDS_REVIEW but still call live attendance mutation, so suspect timestamps can create normal AttendanceSessions. 
B30 | P1 | Notification privacy | Established notification WebSocket stays subscribed to user group after logout, user deactivation or credential revocation; consumer sends notification and message badge events without checking current account/session eligibility. 
B31 | P1 | Ethical transfer concurrency | Ethical listing request verifies PUBLISHED status before transaction but never locks/rechecks listing inside it; two concurrent requests can create two active transfers for one single-reservation listing if they reserve different available lots. 
B32 | P1 | Offline attendance assignment semantics | The signed kiosk event field is named shift_id but is forwarded as assignment_id; an explicitly supplied ID shortcut accepts an assignment regardless of event-date shift window, potentially linking old assignments as current attendance. 
B33 | P0 candidate | Legacy invoicing tenant authority | InvoiceListView.perform_create stamps the caller but accepts arbitrary pharmacy, status, issuer and recipient snapshots via writable InvoiceSerializer. This lets an authenticated unrelated user create a self-authored SENT/PAID invoice referencing a foreign pharmacy, then it is eligible for that pharmacy manager's received-invoice queryset. 
B34 | P1 candidate | Talent board visibility | ExplorerPostViewSet feed and public-feed filter is_talent_board_visible (moderator hidden and expired), but generic retrieve, list and by-profile/raw view/like handlers inherit an unrestricted queryset; a hidden post can remain readable/reactable by ID and via list. 
B35 | P0 candidate | Roster-create cross-tenant writes: RosterOwnerViewSet is an authenticated ModelViewSet with pharmacy-filtered get_queryset but default create/perform_create; RosterA | SOURCE-FINDING 
B36 | P0 candidate | Roster-shift cross-tenant writes: RosterShiftManageViewSet is a ModelViewSet with a managed-only read queryset; default POST invokes ShiftSerializer.create which re | SOURCE-FINDING 
B37 | P1 candidate | Worker roster disclosure: RosterWorkerViewSet.get_queryset includes all assignments in pharmacies with is_active membership, but does not require status ACC | SOURCE-FINDING 
B38 | P1 candidate | Roster assignment overwrite: RosterShiftManageViewSet.update explicitly permits user_id to update_or_create each ShiftSlotAssignment after serializer update; i | SOURCE-FINDING 
B39 | P1 candidate | Rate default destructive update: sync_pharmacy_rate_defaults sets six pharmacy rate fields to None when apply_rates_to_pharmacy is true but caller omits those fiel | SOURCE-FINDING 
B40 | P1 candidate | Booking eligibility stale verification: onboarding verification evaluate preserves was_verified when base checks are missing except for specified AHPRA adverse states; th | SOURCE-FINDING 
B52 — P1 candidate — Expo startup trusts cached identity and role after server rejects or cannot verify account, unlike web
B53 — P1 candidate — Out-of-order Stripe subscription events may reactivate cancelled base billing or reset purchased seat entitlement
B54 — P0-impact / P1 candidate — Two worker confirmations can reserve and pay for the same slot; a paid losing offer can appear ACCEPTED without an assignment
B55 — P1 candidate — Concurrent approval of *unlinked* cover request publishes multiple paid vacancies
B56 — P1 candidate — Concurrent manager attendance corrections can violate final clock-in/out order and distort timesheet work minutes
B57 — P1 conditional — Refund provider events are acknowledged without reversing/reconciling local paid financial state
B58 — P1 conditional — Internal draft becomes pharmacy-visible when worker sets paid status without delivery
B59 — P1 conditional — Revisions can reduce payable below recorded payments, producing negative balance
B60 — P1 concurrency candidate — Two overlapping distinct PENDING leave requests can both be approved
B61 — P1 user-facing accuracy candidate — Expo payroll CSV exports blanks for fields absent from the timesheet API
B62 — P1 candidate — A Region Admin with communication-only privileges can manage shift operations despite missing roster capability
B63 — P1 conditional — Native-kiosk pairing authorization can be redeemed as web-online by declaring a non-native platform
B64 — P1 information-handling candidate — Kiosk one-time secrets are persisted to durable notifications and broadcast to app/WebSocket/device push
B65 — P1 scoped-information candidate — Authenticated pricing-preview endpoint lets unrelated users derive private pharmacy guide rates
B41 — P1 candidate — Pending/rejected membership can be treated as private shift audience
B42 — P1 candidate — Marketplace draft PATCH returns error after partial persistence
B43 — P0 candidate — Password reset does not invalidate previously issued JWT refresh tokens
B44 — P1 candidate — Invalid identity tab submission may erase or detach existing verified ID evidence
B45 — P1 candidate — Incomplete referee questionnaire can be counted as a verified reference
B46 — P0/P1 candidate: Pending/left pharmacy memberships can access or author private pharmacy, group and organisation Hub content
B47 — P1 candidate / owner role-policy decision: Organization email invitations immediately activate full administrative membership for an existing user
B48 — P1 candidate: Pharmacy Hub mention validation can deliver confidential private post text to ineligible locum or non-accepted members
B49 — P1 candidate — Attachment/document upload type validation trusts client-declared MIME after failed magic-byte detection
B50 — P1 candidate — Active but non-accepted pharmacy membership can read community-chat last-message previews
B51 — P1 / potentially P0-impact candidate: Revoked pharmacy chat participant can send new messages through direct message endpoint after leaving the pharmacy
