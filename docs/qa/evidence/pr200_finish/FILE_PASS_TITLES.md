# Found by the file pass (do not re-report)
C001-N1 | Attendance | Manager break corrections are wrongly refused when a session has more than one break.
C001-N2 | Kiosk | Anyone at the counter kiosk can start or end a break for a locum or cross-site worker without any PIN.
C002-N1 | Kiosk | A repeated kiosk PIN submit flips the worker's clock state instead of being treated as a retry.
C003-N1 | Kiosk | The kiosk staff lookup reveals staff names and masked emails by guessable number, and sends setup emails without a dedicated rate limit.
C003-N2 | Kiosk | The kiosk login check also accepts the stored token text as-is, so the scrambled copy saved in the database works as a kiosk token.
C004-N1 | Chat | Anyone with one active membership can pull any pharmacy's staff into a custom group and harvest their names and emails.
C004-N2 | Billing | A shift checkout without selected offers charges one fee but confirms every worker waiting for payment.
C004-N3 | Billing | An organisation's free trial depends on which org admin clicks pay, so a newly joined admin makes every shift free.
C004-N4 | Billing | Organisation billing falls back to the pharmacy owner's personal subscription for viewing, seat purchases and subscriber status.
C004-N5 | Billing | Deleting the owner's user account deletes all their shift payment records.
C005-N1 | Chat | Any chat member can rewrite who is in a room through the plain room update, skipping the creator/admin check and the community-chat block.
C017-N1 | Hub | Editing a poll, even just to fix a typo in the question, deletes every vote already cast.
C017-N2 | Hub | Tagging teammates fails when editing a post, and when a new post has a file and exactly one tag.
C017-N3 | Notifications | Comment alerts with the comment text still go to a post's author after they lose access to that private hub.
C018-N1 | Tooling | The editorial seed command has no production guard and changes admin access, live articles and comments under real users' names.
C018-N2 | Talent | After a board report is resolved, the same user can never report that talent post or job shift again, yet is told the report was received.
C019-N1 | Billing | Concurrent referral claims can award the same referral twice
C020-N1 | Roster | Manual rostering allows staff to fill a pharmacist vacancy without pharmacist eligibility
C020-N2 | Shifts | One claimed slot prevents claims on every remaining free slot
C020-N3 | Shifts | Recurring vacancies disappear from worker boards after their starting date
C020-N4 | Shifts | Public boards compare local shift times against the UTC clock
C020-N5 | Shifts | Accepting a valid counter offer for a vacancy without dated slots crashes
C020-N6 | Shifts | Confirming one recurring date books dates outside the accepted terms
C021-N1 | Shifts | Public shift responses expose other workers' names and email addresses.
C021-N2 | Invoicing | Confirmed counteroffers are invoiced using the original shift hours.
C021-N3 | Shifts | Confirming one recurring occurrence books the worker for the entire series.
C021-N4 | Shifts | Upcoming bookings appear in completed-work history.
C021-N5 | Shifts | Shift lifecycle filters compare pharmacy clock times with UTC.
C021-N6 | Shifts | Named public shifts disclose internal pharmacy document links.
C022-N1 | Shifts | Region admins cannot see other managers' shifts or cover requests at their assigned pharmacies.
C023-N1 | Talent | Anonymous talent posts reveal the author's full name and user id to any signed-in account.
C023-N2 | Organisations | Work notes and calendar events can be moved into, or attached to, a pharmacy or organisation the person has no rights over.
C023-N3 | Talent | Deleting an account leaves the person's talent post live on the public and logged-in boards.
C023-N4 | Roster | Fortnightly (and longer) weekly-repeat calendar items land on the wrong weeks in some months.
C023-N5 | Notifications | A staff member born on 29 February stops birthday events for the rest of their pharmacy in non-leap years.
C024-N1 | Auth | Password-reset links are copied into the user's in-app notifications, so anyone holding a signed-in session can take over the account without email access.
C024-N2 | Onboarding | Asking for a mobile code again clears the verified-mobile flag, which unlocks the 'locked' mobile number and legal name while the profile keeps its Verified badge.
C024-N3 | Organisations | The invite endpoint can change an existing Org Admin's role, which skips the rule that every organisation keeps at least one Org Admin.
C025-N1 | Invoicing | Migration replaces historical invoice billing details with a customer matched only by name.
C025-N2 | Invoicing | Editing an invoice leaves its separate super request at the old amount.
C025-N3 | Invoicing | Invoice corrections leave previously recorded payment GST allocations unchanged.
C026-N1 | Invoicing | Marking an invoice paid leaves its payment balance and cash reporting unchanged.
C026-N2 | Invoicing | Finishing an older invoice email exposes a newer unsent revision.
C026-N3 | Timesheets | Extending an active employment agreement bypasses its junior rate expiry.
C026-N4 | Invoicing | The invoice issue action fails on PostgreSQL because it locks outside a transaction.
C027-N1 | Roster | Replacement approval keeps the departing worker's payment terms
C027-N2 | Roster | Coverage checks mark partly staffed intervals as fully covered
C027-N3 | Roster | Old acknowledgements prevent workers acknowledging a republished roster
C027-N4 | Roster | Coworker roster responses expose private leave notes
C028-N1 | Timesheets | Locked manifests omit every payroll assignment
C028-N2 | Timesheets | Changing contracted hours leaves rebuilt timesheets showing the previous hours
C028-N3 | Timesheets | Timesheets treat individually withdrawn roster shifts as published work
C028-N4 | Timesheets | Overnight attendance corrections leave the next period approved with stale minutes
C028-N5 | Timesheets | Archiving a roster removes its scheduled work and approved leave from timesheets
C029-N1 | Timesheets | Extending an active junior agreement bypasses its birthday rate limit.
C029-N2 | Timesheets | Saving employment terms leaves existing timesheets using stale pay agreements.
C030-N1 | Onboarding | Referee decline links cannot complete the browser flow.
C030-N2 | Chat | Renaming a group on mobile silently removes its other members.
C030-N3 | Chat | Mobile group member search cannot find returned participants.
C031-N1 | Shared-core | Collection helpers silently discard records after the first page
C031-N2 | Shifts | Booked pharmacist cards can show a different rate from the agreed pay
C032-N1 | Shifts | Editing a shift description breaks its pending offers.
C032-N2 | Shifts | Automatic escalation can expose shifts earlier than the selected interval.
C033-N1 | Invoicing | The finance warning not to resend an invoice email is replaced by a generic error, and the test that should catch this never runs.
C036-N1 | Web | Worker leave request submission always fails due to reading nonexistent membership id from session user
C036-N2 | Timesheets | Timesheet detail drawer renders manager check resolution and punch actions in worker mode
C038-N1 | Web | Post-verification and dashboard return links navigate to an unrouted root path, landing users on a 404 page
C039-N1 | Attendance | Attendance timeline correction modal uses UTC string in local datetime input shifting timestamps
C039-N2 | Shifts | Shared shift landing redirect produces non-existent dashboard routes for non-standard roles
C041-N1 | Shifts | Accepting one date hides the remaining dates of a counter offer
C041-N2 | Shifts | Jobs without dated slots never load internal candidates
C041-N3 | Organisations | Editing chain details removes its pharmacy links
C041-N4 | Shifts | Notification refreshes leave counter offers stale
C042-N1 | Invoicing | Organisation and pharmacy admins are treated as invoice issuers instead of recipients on legacy invoice detail view
C043-N1 | Organisations | Pharmacy owner cannot view or respond to organization claim requests because the review section is hidden when no pharmacies are already claimed
C044-N1 | Roster | A cancelled shift replacement can delete the original shift after an unrelated posting.
C044-N2 | Shifts | Interested shifts disappear when they are outside the current browse page.
C044-N3 | Shifts | Clearing an optional pharmacy rate does not remove the saved rate.
C045-N1 | Roster | Cancelling a convert-to-open-shift edit leaves the old shift marked for deletion, so a later, unrelated open-shift post deletes it.
C045-N2 | Roster | Staff on the worker roster can see coworkers' leave type and private leave notes.
C045-N3 | Notifications | The 'notify me about matching shifts' checkbox is never saved on its own, so unchecking it does not stop notifications.
C047-N1 | Chat | Reopening a cached conversation hides messages received while it was closed
C047-N2 | Chat | Deleted messages remain readable in conversation previews
C047-N3 | Talent | Explorers cannot renew their availability after their published dates expire
C049-N1 | Memberships | The pharmacy applications panel reads only the newest 50 pending applications across every pharmacy the admin manages, so older ones for a given pharmacy vanish.
C050-N1 | Memberships | When some bulk staff invitations fail, the error is shown on the wrong person if the form has a blank row in the middle.
C051-N1 | Onboarding | Referee decline link routes to a 404 and invokes an obsolete two-parameter backend path instead of token verification
C062-N1 | Notifications | Unticking 'notify me about matching shifts' on mobile does not turn notifications off for slots already saved.
C062-N2 | Mobile | Adding several availability dates at once can half-save, show 'Failed', and create duplicates when retried.
C063-N1 | Mobile | Mobile chat people search never finds anyone, so New Chat, New Group and Add members do not work in the Expo app.
C079-N1 | Shifts | Editing a shift replaces its saved per-date rates
C079-N2 | Shifts | Manual shift times revert to pharmacy opening hours
F01-N1 | Shifts/Privacy | Workers browsing shifts can see the names and emails of other workers who are booked on the shift or waiting for payment.
F01-N2 | Shifts/Billing | Editing a shift after a worker has accepted but before payment either locks the worker into new dates they never agreed to, or takes the payment without booking anyone.
F01-N3 | Shifts/Billing | A worker or manager can silently delete a shift offer, including one that is accepted and waiting for payment, so payment can be taken with nobody booked.
F01-N4 | Shifts/Notifications | When a worker accepts or declines, the 'payment needed' or 'declined' notice goes to the pharmacy owner, not the admin who posted the shift.
F01-N5 | Billing | A 'Casual employee' shift is charged the $80 part/full-time job fee instead of the $30 per-shift locum fee.
F02-N1 | Shifts/Billing | Deleting a partly filled posting from Active Shifts silently removes the workers already booked on its other dates, with no notice, no cancellation charge and no history check.
F02-N2 | Workforce/Shifts | Cover requests from the web and mobile worker screens are never linked to the worker's assignment, so approving one never releases the worker.
F02-N3 | Roster | Removing or escalating an assignment from the owner roster page unbooks the worker silently, including paid marketplace bookings, and skips the attendance/leave history check.
F03-N1 | Pharmacy admins | A staff member whose admin role was removed can give it back to themselves by accepting it as a pending admin invitation.
F03-N2 | Memberships / Pharmacy admins | When the owner removes a staff member who is also a pharmacy admin, their admin rights stay on, but when they quit themselves the rights are switched off.
F03-N3 | Re-invite | Re-inviting someone who left as an admin brings back their old admin role the moment they accept a plain staff invitation.
F03-N4 | Roster / Attendance | Removing a staff member leaves all their future rostered shifts in place, so the roster looks covered and they can still clock in as rostered.
F03-N5 | Memberships / Records | Deleting a staff membership also deletes that person's past work-note completions and their contracted-hours settings.
F04-N1 | Shifts/Privacy | Any worker who can see a shift can download the staff list of that pharmacy, or of its whole organisation, through the shift's member-status page.
F04-N2 | Shifts/Organizations | Editing a shift can move it into another owner's pharmacy and overwrite that pharmacy's saved pay rates.
F04-N3 | Memberships | A pharmacy manager can silently make any registered person an active staff member, with no invitation, email or consent.
F05-N1 | Onboarding / Public shifts | A New to pharmacy account can apply for public shifts without ever being verified, though the same profile is blocked from posting on the talent hub.
F05-N2 | Onboarding / Shift confirmation | A New to pharmacy person who is offered a shift can never confirm it, because the confirm step looks for a pharmacy team profile they cannot have.
F05-N3 | Shift confirmation / Role gate | Nothing checks that the person confirming an offer holds the role the shift needs, so a technician or intern can be booked into a pharmacist shift.
F06-N1 | Payroll | Locking a period always produces an empty payroll handoff.
F06-N2 | Attendance and timesheets | Rejecting provisional attendance permanently blocks the whole timesheet period.
F06-N3 | Attendance corrections | Clock corrections across pay-period boundaries can drop worked minutes.
F06-N4 | Leave notifications | Requests made through My Leave bypass request and decision notifications.
F07-N1 | Invoicing | Both invoice editors block saving an invoice prefilled from an accepted shift.
F07-N2 | Payments | Marking an invoice paid leaves its balance and cash worksheet unchanged.
F07-N3 | Finance summaries | Saving an invoice revision removes its recorded receipts from the cash worksheet.
F07-N4 | Invoice delivery | Finishing an older invoice email can publish a newer unsent revision.
F07-N5 | Invoice documents | Current finance invoice PDFs are labelled draft even after delivery.
F07-N6 | Superannuation | A separate super request cannot be corrected when its service invoice changes.
F08-N1 | Billing | Repeating subscription setup can create multiple recurring charges for the same plan.
F08-N2 | Billing | Subscriptions remain active after Stripe marks them unpaid.
F08-N3 | Billing | An open checkout can charge Tom after its shift has been deleted.
F08-N4 | Billing | Staff can join beyond the purchased seat count without an additional charge.
F08-N5 | Billing | Deleting Tom's account leaves his recurring Stripe charges running.
F09-N1 | Hub privacy | Deleting a restricted Hub group exposes its posts to the whole pharmacy.
F09-N2 | Notification privacy | Removed Hub group members still receive new private comment text.
F09-N3 | Push notification privacy | Mobile sign-out leaves private message previews enabled on the signed-out device.
F09-N4 | Hub permissions | Users without pharmacy memberships can overwrite or delete each other's Hub polls.
F10-N1 | Talent | Any signed-in account can identify authors of anonymous talent posts.
F10-N2 | Public job board | Public search can identify pharmacies behind anonymous vacancies.
F10-N3 | Rewards | Concurrent claims can award multiple rewards for the same referral.
F10-N4 | Ethical marketplace | Bulk ethical reads bypass the viewer's approved medicine schedules.
F10-N5 | Ethical marketplace | Valid premises applications fail after saving because the response uses an undefined variable.
F10-N6 | Ethical marketplace | Ethical offers disclose full stock-lot records to viewers without inventory access.
F11-N1 | Auth | Changing a pending phone number leaves the previous number's verification code usable.
F11-N2 | Auth | Signing out of Expo leaves private push notifications active on that device.
F11-N3 | Auth | Phone verification replaces a browser-only session with a persistent 90-day session.
