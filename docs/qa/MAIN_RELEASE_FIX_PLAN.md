# PR200 fix plan by area

Every confirmed plain bug (decisions go to the grill). P0 first within each area. `[201]` = already fixed in PR #201 (verify, do not redo).

## 1 Tenancy, permissions, auth (30: 10 P0, 15 P1, 5 P2)

- **B03** P0: Removing staff cascades historical chat messages
- [201] **B07** P0: Scoped admins can manage out-of-scope calendar items
- **B16** P0: Pharmacy Admin update bypasses management privilege
- **B17** P0: Chain update can attach foreign pharmacy and affect membership deletion
- [201] **B33** P0: InvoiceListView.perform_create stamps the caller but accepts arbitrary pharmacy, status, issuer and recipient snapshots via writable InvoiceSerializer. This lets an authenticated unrelated user create a self-authored SENT/PAID invoice referencing a foreign pharmacy, then it is eligible for that pharmacy manager's received-invoice queryset.
- **B35** P0: SOURCE-FINDING
- [201] **B36** P0: SOURCE-FINDING
- [201] **F03-N1** P0: A staff member whose admin role was removed can give it back to themselves by accepting it as a pending admin invitation.
- [201] **F04-N1** P0: Any worker who can see a shift can download the staff list of that pharmacy, or of its whole organisation, through the shift's member-status page.
- [201] **F04-N2** P0: Editing a shift can move it into another owner's pharmacy and overwrite that pharmacy's saved pay rates.
- **B19** P1: Invite links can be retargeted; removal may cascade applications
- **B30** P1: Established notification WebSocket stays subscribed to user group after logout, user deactivation or credential revocation; consumer sends notification and message badge events without checking current account/session eligibility.
- **B37** P1: SOURCE-FINDING
- **C023-N2** P1: Work notes and calendar events can be moved into, or attached to, a pharmacy or organisation the person has no rights over.
- **C024-N1** P1: Password-reset links are copied into the user's in-app notifications, so anyone holding a signed-in session can take over the account without email access.
- **C041-N3** P1: Editing chain details removes its pharmacy links
- **C071-N2** P1: Signing out of Expo leaves its push token registered to the prior account, so private alerts can keep arriving on a signed-out device.
- **C074-N1** P1: Next marketplace and publishing workspaces can display the previous account's private stock, messages or unpublished drafts after cross-tab login.
- **F01-N1** P1: Workers browsing shifts can see the names and emails of other workers who are booked on the shift or waiting for payment.
- **F03-N2** P1: When the owner removes a staff member who is also a pharmacy admin, their admin rights stay on, but when they quit themselves the rights are switched off.
- **F03-N3** P1: Re-inviting someone who left as an admin brings back their old admin role the moment they accept a plain staff invitation.
- **F05-N3** P1: Nothing checks that the person confirming an offer holds the role the shift needs, so a technician or intern can be booked into a pharmacist shift.
- **F09-N1** P1: Deleting a restricted Hub group exposes its posts to the whole pharmacy.
- **F09-N2** P1: Removed Hub group members still receive new private comment text.
- **F09-N4** P1: Users without pharmacy memberships can overwrite or delete each other's Hub polls.
- **C011-N2** P2: Revoked invitation sender continues receiving membership response notifications containing staff identities.
- **C012-N1** P2: Authenticated workers can create applications against expired or unauthorised invitation links by calling the generic applications endpoint.
- **C071-N1** P2: Concurrent mobile logout and in-flight refresh/profile hydration can resurrect old tokens or overwrite the newly signed-in account.
- **F11-N1** P2: Changing a pending phone number leaves the previous number's verification code usable.
- **F11-N3** P2: Phone verification replaces a browser-only session with a persistent 90-day session.

## 2 Shifts, booking, payments (53: 2 P0, 37 P1, 14 P2)

- **B10** P0: Multi-offer Pills spend uses one shift-wide ledger key; concurrency risk
- **B43** P0: P0 candidate — Password reset does not invalidate previously issued JWT refresh tokens
- **B08** P1: Region Admin notified about unrelated pharmacy shifts
- **B09** P1: Shift escalation depends on reads and omits audience notification
- **B14** P1: Legacy casual award figures and incomplete future holiday data
- **B20** P1: Interest/rejection mutation can target a different shift
- **B21** P1: Cover request scope differs from assignment scope
- **B38** P1: SOURCE-FINDING
- **B41** P1: P1 candidate — Pending/rejected membership can be treated as private shift audience
- **B45** P1: P1 candidate — Incomplete referee questionnaire can be counted as a verified reference
- **B48** P1: P1 candidate: Pharmacy Hub mention validation can deliver confidential private post text to ineligible locum or non-accepted members
- **B50** P1: P1 candidate — Active but non-accepted pharmacy membership can read community-chat last-message previews
- **B53** P1: P1 candidate — Out-of-order Stripe subscription events may reactivate cancelled base billing or reset purchased seat entitlement
- **B54** P1: P0-impact / P1 candidate — Two worker confirmations can reserve and pay for the same slot; a paid losing offer can appear ACCEPTED without an assignment
- **B55** P1: P1 candidate — Concurrent approval of *unlinked* cover request publishes multiple paid vacancies
- **B57** P1: P1 conditional — Refund provider events are acknowledged without reversing/reconciling local paid financial state
- **B62** P1: P1 candidate — A Region Admin with communication-only privileges can manage shift operations despite missing roster capability
- **B66** P1: P1 money-calculation candidate: overnight assignment produces negative cancellation wage and falsely skips penalty
- **B67** P1: P1 booking/financial-evidence candidate: generic shift-offer DELETE bypasses state-machine transitions
- **B68** P1: P1 conditional accounting/entitlement candidate: unrelated Stripe subscription invoice can activate local customer entitlement
- **B69** P1: P1 conditional duplicate-charge candidate: cancellation penalty has no durable cancellation obligation or paid-once guard
- **B70** P1: P1/P0-impact candidate: repeated base or extra-seat checkout can create two independent recurring Stripe subscriptions
- **C020-N3** P1: Recurring vacancies disappear from worker boards after their starting date
- **C020-N6** P1: Confirming one recurring date books dates outside the accepted terms
- **C021-N5** P1: Shift lifecycle filters compare pharmacy clock times with UTC.
- **C021-N6** P1: Named public shifts disclose internal pharmacy document links.
- **C027-N1** P1: Replacement approval keeps the departing worker's payment terms
- **C032-N1** P1: Editing a shift description breaks its pending offers.
- **C041-N2** P1: Jobs without dated slots never load internal candidates
- **C044-N1** P1: A cancelled shift replacement can delete the original shift after an unrelated posting.
- **C045-N2** P1: Staff on the worker roster can see coworkers' leave type and private leave notes.
- **C078-N2** P1: Editing a shift silently replaces custom date rates with calculated rates
- **C078-N3** P1: Saving a partially filled shift can delete its confirmed bookings
- **C079-N1** P1: Editing a shift replaces its saved per-date rates
- **F01-N2** P1: Editing a shift after a worker has accepted but before payment either locks the worker into new dates they never agreed to, or takes the payment without booking anyone.
- **F01-N3** P1: A worker or manager can silently delete a shift offer, including one that is accepted and waiting for payment, so payment can be taken with nobody booked.
- **F02-N2** P1: Cover requests from the web and mobile worker screens are never linked to the worker's assignment, so approving one never releases the worker.
- **F02-N3** P1: Removing or escalating an assignment from the owner roster page unbooks the worker silently, including paid marketplace bookings, and skips the attendance/leave history check.
- **F05-N1** P1: A New to pharmacy account can apply for public shifts without ever being verified, though the same profile is blocked from posting on the talent hub.
- **B42** P2: P1 candidate — Marketplace draft PATCH returns error after partial persistence
- **B49** P2: P1 candidate — Attachment/document upload type validation trusts client-declared MIME after failed magic-byte detection
- **B52** P2: P1 candidate — Expo startup trusts cached identity and role after server rejects or cannot verify account, unlike web
- **B58** P2: P1 conditional — Internal draft becomes pharmacy-visible when worker sets paid status without delivery
- **B60** P2: P1 concurrency candidate — Two overlapping distinct PENDING leave requests can both be approved
- **B61** P2: P1 user-facing accuracy candidate — Expo payroll CSV exports blanks for fields absent from the timesheet API
- **B65** P2: P1 scoped-information candidate — Authenticated pricing-preview endpoint lets unrelated users derive private pharmacy guide rates
- **B71** P2: P1 user-flow reliability candidate: shift offer acceptance commits before notification errors can surface to the caller
- **C020-N1** P2: Manual rostering allows staff to fill a pharmacist vacancy without pharmacist eligibility
- **C020-N2** P2: One claimed slot prevents claims on every remaining free slot
- **C020-N5** P2: Accepting a valid counter offer for a vacancy without dated slots crashes
- **C027-N2** P2: Coverage checks mark partly staffed intervals as fully covered
- **C039-N2** P2: Shared shift landing redirect produces non-existent dashboard routes for non-standard roles
- **C041-N1** P2: Accepting one date hides the remaining dates of a counter offer

## 3 Billing and Stripe (8: 3 P0, 5 P1)

- **B01** P0: Subscriber discount omitted from shift checkout
- **B04** P0: Empty and duplicate shift checkout sessions possible
- [201] **B15** P0: Penalty payment webhook can finalise unrelated offers
- **B02** P1: Purchased extra seats cannot subsequently be adjusted
- **C004-N2** P1: A shift checkout without selected offers charges one fee but confirms every worker waiting for payment.
- **F07-N2** P1: Marking an invoice paid leaves its balance and cash worksheet unchanged.
- **F08-N2** P1: Subscriptions remain active after Stripe marks them unpaid.
- **F10-N3** P1: Concurrent claims can award multiple rewards for the same referral.

## 4 Invoicing and finance (8: 5 P1, 3 P2)

- **C021-N2** P1: Confirmed counteroffers are invoiced using the original shift hours.
- **C025-N1** P1: Migration replaces historical invoice billing details with a customer matched only by name.
- **F06-N1** P1: Locking a period always produces an empty payroll handoff.
- **F07-N1** P1: Both invoice editors block saving an invoice prefilled from an accepted shift.
- **F07-N3** P1: Saving an invoice revision removes its recorded receipts from the cash worksheet.
- **C042-N1** P2: Organisation and pharmacy admins are treated as invoice issuers instead of recipients on legacy invoice detail view
- **C064-N1** P2: Legacy Expo invoice generator defaults superannuation to 10% despite Australia's current 12% SG rate.
- **F07-N4** P2: Finishing an older invoice email can publish a newer unsent revision.

## 5 Attendance, kiosk, timesheets (9: 8 P1, 1 P2)

- **B32** P1: The signed kiosk event field is named shift_id but is forwarded as assignment_id; an explicitly supplied ID shortcut accepts an assignment regardless of event-date shift window, potentially linking old assignments as current attendance.
- **C002-N1** P1: A repeated kiosk PIN submit flips the worker's clock state instead of being treated as a retry.
- **C026-N3** P1: Extending an active employment agreement bypasses its junior rate expiry.
- **C028-N4** P1: Overnight attendance corrections leave the next period approved with stale minutes
- **C028-N5** P1: Archiving a roster removes its scheduled work and approved leave from timesheets
- **C029-N1** P1: Extending an active junior agreement bypasses its birthday rate limit.
- **C039-N1** P1: Attendance timeline correction modal uses UTC string in local datetime input shifting timestamps
- **F06-N2** P1: Rejecting provisional attendance permanently blocks the whole timesheet period.
- **C029-N2** P2: Saving employment terms leaves existing timesheets using stale pay agreements.

## 6 Chat, Hub, notifications (9: 6 P1, 3 P2)

- **B05** P1: Already-connected sockets may outlive access revocation
- **C004-N1** P1: Anyone with one active membership can pull any pharmacy's staff into a custom group and harvest their names and emails.
- **C005-N1** P1: Any chat member can rewrite who is in a room through the plain room update, skipping the creator/admin check and the community-chat block.
- **C030-N2** P1: Renaming a group on mobile silently removes its other members.
- **C047-N1** P1: Reopening a cached conversation hides messages received while it was closed
- **F13-N1** P1: A Hub with more than 50 posts repeatedly clears and reloads its mobile feed.
- **C047-N2** P2: Deleted messages remain readable in conversation previews
- **C048-N1** P2: Correcting a poll question silently deletes every existing vote.
- **C073-N1** P2: The publishing workspace leaves private content visible after logout

## 7 Onboarding and verification (2: 1 P1, 1 P2)

- **C077-N1** P1: Referee decline links do not match the web page or its request
- **C051-N1** P2: Referee decline link routes to a 404 and invokes an obsolete two-parameter backend path instead of token verification

## 8 Talent, marketplace, public pages (16: 13 P1, 3 P2)

- **B12** P1: Rating can be submitted before completed work
- **B24** P1: Exchange action accepts confirm-completion while still in ENQUIRY / TERMS_PROPOSED, and arbitrary propose-terms/cancel/decline after accepted or completed; buyer can invoke decline. This bypasses accepted terms and reservation lifecycle.
- **B25** P1: ListingAudience saves current circle and bumps listing.version before validating every requested schedule item. Invalid later schedule returns 400 after persistent state mutation.
- **B31** P1: Ethical listing request verifies PUBLISHED status before transaction but never locks/rechecks listing inside it; two concurrent requests can create two active transfers for one single-reservation listing if they reserve different available lots.
- **B34** P1: ExplorerPostViewSet feed and public-feed filter is_talent_board_visible (moderator hidden and expired), but generic retrieve, list and by-profile/raw view/like handlers inherit an unrestricted queryset; a hidden post can remain readable/reactable by ID and via list.
- **C010-N1** P1: Editing an ethical draft can reassign it to another owner's pharmacy and another product without destination authorization.
- **C023-N3** P1: Deleting an account leaves the person's talent post live on the public and logged-in boards.
- **C047-N3** P1: Explorers cannot renew their availability after their published dates expire
- **C077-N2** P1: Expired availability prevents Explorers from publishing again
- **F10-N2** P1: Public search can identify pharmacies behind anonymous vacancies.
- **F10-N4** P1: Bulk ethical reads bypass the viewer's approved medicine schedules.
- [201] **F10-N5** P1: Valid premises applications fail after saving because the response uses an undefined variable.
- **F10-N6** P1: Ethical offers disclose full stock-lot records to viewers without inventory access.
- **B26** P2: EthicalListing draft is persisted before checking lot selection, lot ownership and available quantities; invalid listing create can leave orphan or partially allocated regulated-stock drafts.
- **C009-N3** P2: Ethical stock imports can still be committed after the inventory write feature is switched off.
- **C011-N1** P2: Concurrent identical marketplace enquiries can persist duplicate negotiations before the idempotency receipt fails.

## 9 Parity and UX (13: 1 P0, 5 P1, 7 P2)

- [201] **B06** P0: Org feed may expose another pharmacy's work notes
- **B18** P1: Claim PUT path bypasses owner approval workflow
- **C018-N1** P1: The editorial seed command has no production guard and changes admin access, live articles and comments under real users' names.
- **C031-N1** P1: Collection helpers silently discard records after the first page
- **C036-N1** P1: Worker leave request submission always fails due to reading nonexistent membership id from session user
- **C063-N1** P1: Mobile chat people search never finds anyone, so New Chat, New Group and Add members do not work in the Expo app.
- **B39** P2: SOURCE-FINDING
- **C038-N1** P2: Post-verification and dashboard return links navigate to an unrouted root path, landing users on a 404 page
- **F14-U1** P2: The public shift board offers Apply Now on shifts for a role the worker cannot take, then shows only a vague failure toast.
- **F14-U2** P2: The marketplace listing gate lists 'Verify your mobile number' with no way to do it, and the 8-step bar is cut off at desktop width.
- **F14-U3** P2: Several phone tap targets are below 44px (public job board map/report buttons, talent board nav links, landing role pills, dashboard top-bar icons).
- **F14-U4** P2: Ethical marketplace sub-pages keep the generic landing page title, so browser tabs and history cannot be told apart.
- **F14-U7** P2: If the API cannot be reached at start-up, the web app shows an unstyled error with run-together buttons; Reconnect reloads into the same state and Retry logout has no way out.
