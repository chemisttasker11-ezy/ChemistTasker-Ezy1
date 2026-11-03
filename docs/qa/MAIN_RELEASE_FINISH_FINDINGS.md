# PR200 canonical candidate register — phase 5 decision snapshot

This register preserves **all 226 original IDs (71 B + 155 C/F)**. Raw findings and source chunks remain immutable. Status derives from committed source challenge, deduplication, VERIFIED and executed negative tests, not from a static count. **No 99% independent semantic certification**. Source baseline `b77e9fd296bc2710350ef6f3cd402ce2529ffc06`.

**Runtime:** 23 distinct IDs in 26 isolated red tests (37 executed, 11 controls passed). **One source refutation:** C016-N2 for ordinary PATCH. **Independent second reviewer:** not certified.

## C/F finding details (155)

### F03-N1 — P0 — A staff member whose admin role was removed can give it back to themselves by accepting it as a pending admin invitation.

Mia is a Manager admin at Tom's pharmacy. Tom takes away her admin role but keeps her on as an assistant. The system switches the admin role off but keeps it on file, and that leftover record looks exactly like a fresh admin invitation to an existing staff member. Mia sees it under her admin invitations, taps Accept, and is a Manager again, able to manage staff, rosters and admins, without Tom knowing.

- Status: **REPRODUCED_RUNTIME_DJANGO_SQLITE** | Decision: **FIX** | Grade: S3_ISOLATED_DJANGO_SQLITE
- Evidence: `backend/organizations/views.py:586`, `backend/organizations/views.py:590`, `backend/organizations/views.py:313`, `backend/organizations/views.py:318`, `backend/organizations/views.py:336`, `backend/organizations/views.py:341`, `backend/organizations/views.py:359`, `shared-core/src/domains/organizations/api.ts:134`
- Test: Owner removes the admin role of an accepted staff member; that member's GET my-pending-invitations must be empty and POST accept-invitation on the old record must return 404 and leave the role switched off.
- Runtime: RED_TEST_FAILED_AS_EXPECTED (test_f03_revoked_admin_cannot_accept_old_role) https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/actions/runs/40174286021; RED_TEST_FAILED_AS_EXPECTED (test_f03_revoked_admin_not_listed_as_pending_invitation) https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/actions/runs/40174286021
- Business question: Tom took Mia's Manager role away but kept her on staff. If Mia later opens her admin invitations, what should she see?

### F04-N1 — P0 — Any worker who can see a shift can download the staff list of that pharmacy, or of its whole organisation, through the shift's member-status page.

Sara, an external locum, opens one of Tom's public shifts. Using that shift's member-status address with a different team filter, she gets back every pharmacist on Tom's own staff (Omar included): names, user numbers, employment type and how each answered. Anyone with a pending offer also has their email and offered rate exposed. If the shift belongs to one of Lina's organisation pharmacies, the organisation filter returns every pharmacist across Lina's whole organisation. Only the manager's version of this page checks that the caller manages the pharmacy. The general shift page lets anyone in who can merely see the shift, and the team filter is taken from the request without checking it.

- Status: **REPRODUCED_RUNTIME_DJANGO_SQLITE** | Decision: **FIX** | Grade: S3_ISOLATED_DJANGO_SQLITE
- Evidence: `backend/shifts/lifecycle.py:287`, `backend/shifts/lifecycle.py:393`, `backend/shifts/base.py:124`, `backend/shifts/base.py:169`, `backend/shifts/candidates.py:212`, `backend/shifts/candidates.py:245`, `backend/shifts/candidates.py:273`, `backend/shifts/candidates.py:448`, `backend/shifts/candidates.py:417`, `backend/shifts/base.py:316`
- Test: Sara (pharmacist, no membership at Tom's pharmacy) calls GET /api/v1/shifts/<Tom's PLATFORM shift>/member_status/?visibility=FULL_PART_TIME (and ?visibility=ORG_CHAIN on an org pharmacy shift) and must get 403/404, not Omar's row.
- Runtime: RED_TEST_FAILED_AS_EXPECTED (test_f04_member_status_hidden_from_external_platform_shift_worker) https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/actions/runs/40174286021
- Business question: Sara can see Tom's public shift. Should she ever see which of Tom's staff, or Lina's organisation staff, were offered it and how they answered?

### F04-N2 — P0 — Editing a shift can move it into another owner's pharmacy and overwrite that pharmacy's saved pay rates.

Tom edits one of his own pharmacist shifts and changes the pharmacy number in the request to a pharmacy in another organisation. The edit check only looks at the pharmacy the shift was in before, so the save goes through. The shift now appears in the other owner's shift lists. If Tom also ticks 'apply these rates to the pharmacy', the other pharmacy's default rates are overwritten with his numbers, or wiped. The same edit also accepts a payment status from the request, so a manager can mark a shift paid or not needing payment.

- Status: **REPRODUCED_RUNTIME_DJANGO_SQLITE** | Decision: **FIX** | Grade: S3_ISOLATED_DJANGO_SQLITE
- Evidence: `backend/shifts/base.py:128`, `backend/shifts/base.py:132`, `backend/shifts/serialization/shifts.py:49`, `backend/shifts/serialization/shifts.py:102`, `backend/shifts/serialization/shifts.py:105`, `backend/shifts/serialization/shifts.py:338`, `backend/shifts/posting.py:182`, `backend/shifts/posting.py:193`, `backend/shifts/posting.py:262`
- Test: Tom sends PATCH /api/v1/shifts/<his shift>/ with {"pharmacy": <another org's pharmacy>, "apply_rates_to_pharmacy": true, "role_needed": "PHARMACIST"} and must get 400/403, and the shift's pharmacy and the other pharmacy's rates must be unchanged.
- Runtime: RED_TEST_FAILED_AS_EXPECTED (test_f04_shift_patch_denies_cross_tenant_and_paid_override) https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/actions/runs/40169055953
- Business question: Tom wants a shift to be at a different pharmacy. What should happen?

### C002-N1 — P1 — A repeated kiosk PIN submit flips the worker's clock state instead of being treated as a retry.

Omar types his PIN at Tom's kiosk and presses Clock, but the screen lags (or the kiosk resends after a slow network), so the same request arrives twice. The first request clocks him in. The second one sees an open session and clocks him straight back out, leaving a session of almost zero minutes while Omar thinks he is on the clock. The same thing happens at clock-out: a repeated request starts a new session that stays open overnight, so Tom's timesheet shows hours Omar never worked.

- Status: **UNVERIFIED_CANDIDATE** | Decision: **VERIFY** | Grade: S1_REPORTED
- Evidence: `backend/attendance/kiosk_api.py:454-474`, `backend/attendance/transitions.py:63-72`, `backend/attendance/transitions.py:256-271`
- Test: Send POST kiosk/pin-clock/ twice within 5 seconds with the same PIN and check that exactly one CLOCK_IN exists and the session is still open.
- Business question: Omar presses Clock twice within a few seconds at Tom's kiosk. What should happen?

### C004-N1 — P1 — Anyone with one active membership can pull any pharmacy's staff into a custom group and harvest their names and emails.

Sara has one active membership somewhere. She creates a custom group chat and lists membership numbers from many pharmacies, including Nadia at Tom's other pharmacy. Each person is added with no check that Sara shares a pharmacy with them. Sara then opens her chat participants list and sees each person's name, email, photo and job type, and can message all of them.

- Status: **RUNTIME_REPRODUCED_POLICY_CONDITIONAL** | Decision: **GRILL_POLICY** | Grade: S3_ISOLATED_DJANGO_SQLITE
- Evidence: `backend/chat/serializers.py:264`, `backend/chat/serializers.py:288`, `backend/chat/serializers.py:331`, `backend/chat/views.py:472`, `backend/chat/views.py:863`, `backend/users/presentation.py:60`
- Test: Sara creates a group with Nadia's membership id from an unrelated pharmacy; expect 400/403 and no Participant row for Nadia.
- Runtime: RED_TEST_FAILED_AS_EXPECTED (test_c004_n1_cross_pharmacy_group_invite_requires_consent_or_authority) https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/actions/runs/40176725005
- Business question: When Sara builds a custom group chat, whom should she be allowed to add?

### C004-N2 — P1 — A shift checkout without selected offers charges one fee but confirms every worker waiting for payment.

Tom's shift has three slots, each with a worker waiting on payment. If checkout is started without naming offers or slots, Stripe charges a single fee. When it is paid, all three workers are confirmed. With slots named, two workers waiting on the same slot are also both confirmed for one fee. ChemistTasker is underpaid for each extra worker.

- Status: **REPRODUCED_RUNTIME_DJANGO_SQLITE** | Decision: **FIX** | Grade: S3_ISOLATED_DJANGO_SQLITE
- Evidence: `backend/billing/views.py:665`, `backend/billing/views.py:334`, `backend/billing/views.py:346`, `backend/billing/views.py:583`, `backend/billing/views.py:864`
- Test: Shift with 3 awaiting offers on 3 slots: POST charge-fulfillment with {} and expect a 400 or quantity 3, not quantity 1 that finalizes 3.
- Runtime: RED_TEST_FAILED_AS_EXPECTED (test_c004_n2_unspecified_offer_checkout_must_not_charge_one_and_book_two) https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/actions/runs/40178675029
- Business question: Tom pays the fee once while three workers are waiting on his shift. What should happen?

### C004-N3 — P1 — An organisation's free trial depends on which org admin clicks pay, so a newly joined admin makes every shift free.

Lina's organisation has been on ChemistTasker for a year. A newly created org admin account, under 30 days old, pays a shift fee for Tom's pharmacy, and the shift is confirmed free as a 'free trial'. This can be repeated with each new admin account. The same shift costs money if a chief admin or Lina pays instead.

- Status: **UNVERIFIED_CANDIDATE** | Decision: **VERIFY** | Grade: S1_REPORTED
- Evidence: `backend/billing/utils.py:121`, `backend/billing/utils.py:129`, `backend/billing/utils.py:166`, `backend/billing/views.py:562`, `backend/billing/views.py:594`
- Test: Org created long ago, new ORG_ADMIN joined today pays fulfilment; expect PAYMENT_REQUIRED, not FREE_TRIAL.
- Business question: Lina's year-old organisation adds a new admin, who pays a shift fee. Should it be free?

### C005-N1 — P1 — Any chat member can rewrite who is in a room through the plain room update, skipping the creator/admin check and the community-chat block.

Mia, an ordinary assistant at Tom's pharmacy, edits the pharmacy's community chat through the standard room-edit call. She removes every member except the creator and adds Sara, an outside locum, by picking any active membership on the platform. Sara can now read the whole community chat history through the message list, even though she has no role at Tom's pharmacy. The same call also lets a non-admin member of a custom group rename it or remove the other members. The dedicated group-edit path would have refused both.

- Status: **REPRODUCED_RUNTIME_DJANGO_SQLITE** | Decision: **FIX** | Grade: S3_ISOLATED_DJANGO_SQLITE
- Evidence: `backend/chat/views.py:50`, `backend/chat/views.py:92`, `backend/chat/views.py:104`, `backend/chat/views.py:453`, `backend/chat/views.py:457`, `backend/chat/serializers.py:265`, `backend/chat/serializers.py:308`, `backend/chat/serializers.py:349`, `backend/chat/views.py:667`
- Test: As a non-admin, non-creator staff member, PATCH /rooms/<community_chat_id>/ with participants=[outsider_membership_id]. Expect 403, no new Participant row for the outsider, and no change to existing participants.
- Runtime: RED_TEST_FAILED_AS_EXPECTED (test_c005_n1_ordinary_member_cannot_change_room_membership) https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/actions/runs/40176725005
- Business question: Mia is a regular staff member, not a chat admin. She tries to change the members of Tom's pharmacy community chat, or of a custom group Omar created. What should happen?

### C009-N3 — P1 — Ethical stock imports can still be committed after the inventory write feature is switched off.

Tom stages an ethical stock CSV while the inventory feature is available. An administrator disables ethical inventory writes to stop unsafe stock changes. Tom can still invoke the import-commit endpoint, which changes stock quantities and creates stock-movement records without checking the disabled feature flag.

- Status: **SOURCE_SUPPORTED** | Decision: **VERIFY** | Grade: S2_SAME_ASSISTANT_SOURCE_CHALLENGE
- Evidence: `backend/ethical_marketplace/owner_views.py:47`, `backend/ethical_marketplace/owner_views.py:55`, `backend/ethical_marketplace/owner_views.py:65`, `backend/ethical_marketplace/views.py:193`, `backend/ethical_marketplace/views.py:195`, `backend/ethical_marketplace/views.py:234`, `backend/core/settings.py:242`
- Test: Stage a valid import as a verified entitled owner with ETHICAL_INVENTORY_ENABLED=True; disable it before POST /api/v1/ethical/inventory/imports/{pk}/commit/; expect 503 and no EthicalStockLot/Movement changes. Positive flag-true commit still succeeds.
- Business question: When ethical inventory writes are disabled, should a previously staged import still update stock?

### C010-N1 — P1 — Editing an ethical draft can reassign it to another owner's pharmacy and another product without destination authorization.

Tom delegates preparation of his ethical listing to Omar. Omar edits that DRAFT with Nadia's unrelated pharmacy identifier and another approved product. The update saves the reassignment without proving Omar can manage Nadia's pharmacy or that he is approved for the replacement product. Nadia's stock workflow can then contain Tom's unauthorized listing.

- Status: **SOURCE_SUPPORTED** | Decision: **VERIFY** | Grade: S2_SAME_ASSISTANT_SOURCE_CHALLENGE
- Evidence: `backend/ethical_marketplace/views.py:317`, `backend/ethical_marketplace/views.py:318`, `backend/ethical_marketplace/views.py:319`, `backend/ethical_marketplace/views.py:322`, `backend/ethical_marketplace/views.py:324`, `backend/ethical_marketplace/serializers.py:60`, `backend/ethical_marketplace/serializers.py:63`, `backend/ethical_marketplace/signals.py:18`
- Test: Create a draft owned by pharmacy A. As authorized A preparer, PATCH its pharmacy to unrelated B and product to unapproved S8; assert 403/400 and no owner/product/lot/audience changes. Valid description-only update remains allowed.
- Business question: May Omar move a draft ethical medicine listing from Tom's premises to Nadia's unrelated premises without the destination owner authorising it?

### C011-N1 — P1 — Concurrent identical marketplace enquiries can persist duplicate negotiations before the idempotency receipt fails.

Sara sends an enquiry to Tom's listing twice at the same instant. Both requests see no prior idempotency receipt and create separate exchanges, after which the second hits a unique receipt constraint and returns an error. Tom can receive two negotiations for one enquiry.

- Status: **SOURCE_SUPPORTED** | Decision: **VERIFY** | Grade: S2_SAME_ASSISTANT_SOURCE_CHALLENGE
- Evidence: `backend/marketplace/views.py:283`, `backend/marketplace/views.py:297`, `backend/marketplace/views.py:300`, `backend/marketplace/views.py:309`, `backend/marketplace/models.py:321`, `backend/marketplace/models.py:329`
- Test: Concurrently submit identical enquiry UUIDs using PostgreSQL and verify exactly one exchange and one receipt, with repeat-safe response.
- Business question: What should happen if Sara accidentally submits her marketplace enquiry to Tom twice simultaneously?

### C011-N2 — P1 — Revoked invitation sender continues receiving membership response notifications containing staff identities.

Lina invites Sara to Tom's pharmacy but subsequently loses her organisation membership and staff-management authority. When Sara responds or leaves, Lina remains a notification recipient through the original inviter link and receives Sara's name and email.

- Status: **SOURCE_SUPPORTED** | Decision: **VERIFY** | Grade: S2_SAME_ASSISTANT_SOURCE_CHALLENGE
- Evidence: `backend/memberships/notifications.py:66`, `backend/memberships/notifications.py:73`, `backend/memberships/notifications.py:81`, `backend/memberships/notifications.py:116`, `backend/memberships/notifications.py:142`, `backend/memberships/notifications.py:161`
- Test: After revoking Lina's organisation/pharmacy authority, make Sara accept/leave. Lina receives no email or in-app notification; valid managers still receive it.
- Business question: Should former manager Lina continue receiving Sara's membership notifications after her access is revoked?

### C012-N1 — P1 — Authenticated workers can create applications against expired or unauthorised invitation links by calling the generic applications endpoint.

Sara has no valid invitation to Tom's pharmacy. She obtains or guesses a numeric invite-link identifier and sends her details to the membership-applications API directly. The create endpoint only requires authentication and its serializer accepts the link ID without checking active status or expiry, bypassing the secure magic-link application route.

- Status: **INCONCLUSIVE_NEGATIVE_TEST** | Decision: **RETEST** | Grade: S1_REPORTED
- Evidence: `backend/memberships/views.py:310`, `backend/memberships/views.py:316`, `backend/memberships/serializers.py:382`, `backend/memberships/serializers.py:383`, `backend/memberships/serializers.py:423`, `backend/memberships/serializers.py:526`, `backend/memberships/views.py:249`, `backend/memberships/views.py:262`
- Test: As unrelated authenticated Sara, POST /api/v1/membership-applications/ with a valid old or disabled invite_link integer, matching her email/DOB/role. Expect refusal and zero application creation; valid UUID magic-link flow must succeed.
- Business question: May Sara apply to Tom's pharmacy using the internal numeric ID of an expired or revoked invitation?

### C012-N2 — P1 — A pharmacy administrator can permanently delete pending and decided membership application review records through generic DELETE.

Lina is authorised to review applications for Tom's pharmacy. After deciding an application, she calls DELETE on the application detail endpoint. The default ModelViewSet destroys the application and its submitted snapshot and reviewer decision, removing the employment decision audit trail instead of recording an archival state.

- Status: **REPRODUCED_RUNTIME_DJANGO_SQLITE** | Decision: **FIX** | Grade: S3_ISOLATED_DJANGO_SQLITE
- Evidence: `backend/memberships/views.py:310`, `backend/memberships/views.py:318`, `backend/memberships/views.py:324`, `backend/memberships/models.py:233`, `backend/memberships/models.py:283`, `backend/memberships/urls.py:22`
- Test: As scoped manager attempt DELETE on approved, rejected and pending applications; require 405/403 or audited soft-archive, preserving submitted/decision history. Verify positive review/approve/reject remains functional.
- Runtime: RED_TEST_FAILED_AS_EXPECTED (test_c012_n2_decided_application_history_cannot_be_deleted) https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/actions/runs/40176725005
- Business question: Should Lina be allowed to permanently delete historic membership applications and decisions?

### C015-N1 — P1 — AHPRA suspension notices expose an employee's regulatory status to region administrators outside their assigned pharmacies.

Sara works at Tom's pharmacy and her AHPRA registration is suspended. Grace is a region administrator in the same organisation but assigned only to Nadia's different pharmacy. The suspension notifier delivers Sara's name, pharmacy affiliation and registration status to Grace despite her lacking permission to manage Tom's pharmacy.

- Status: **SOURCE_SUPPORTED** | Decision: **VERIFY** | Grade: S2_SAME_ASSISTANT_SOURCE_CHALLENGE
- Evidence: `backend/onboarding/verification/state.py:335`, `backend/onboarding/verification/state.py:340`, `backend/onboarding/verification/state.py:343`, `backend/onboarding/verification/state.py:346`, `backend/onboarding/verification/state.py:352`, `backend/users/org_roles.py:1`
- Test: Create two pharmacies in one organisation; Sara is at A, Grace REGION_ADMIN assigned only B. Trigger Sara AHPRA suspension and assert Grace receives no in-app/email status, while authorized A managers do.
- Business question: Should region administrator Grace receive Sara's AHPRA suspension details when Sara works at a pharmacy Grace cannot manage?

### C016-N1 — P1 — Ordinary pharmacy workers can list private hub groups and obtain their full membership rosters without joining them.

Mia works at Tom's pharmacy but is not a member of its restricted managers' group. Mia requests all pharmacy groups with include_members=true. The group list is authorized only against Mia's general pharmacy membership and exposes the managers' group name, description and member details, despite group-specific access forbidding her.

- Status: **SOURCE_SUPPORTED** | Decision: **VERIFY** | Grade: S2_SAME_ASSISTANT_SOURCE_CHALLENGE
- Evidence: `backend/pharmacy_hub/groups.py:29`, `backend/pharmacy_hub/groups.py:35`, `backend/pharmacy_hub/groups.py:47`, `backend/pharmacy_hub/groups.py:108`, `backend/pharmacy_hub/groups.py:114`, `backend/pharmacy_hub/serialization/groups.py:29`, `backend/pharmacy_hub/serialization/groups.py:140`, `backend/pharmacy_hub/access.py:225`, `backend/pharmacy_hub/access.py:271`
- Test: Create private manager group G at pharmacy A and ordinary nonmember Mia at A; GET /api/v1/hub/community-groups/?pharmacy_id=A&include_members=true must not return G or its members. Authorized group member and managers still see permitted details.
- Business question: Should Mia see the names, descriptions and member rosters of private groups at Tom's pharmacy when she is not a group member?

### C016-N2 — P1 — Hub group PATCH can reassign an existing group to an unrelated pharmacy without checking destination tenant authority.

Tom administers a community group at his own pharmacy. He edits it and includes Nadia's unrelated pharmacy identifier. The group update authorizes only the original group and accepts the serializer's writable pharmacy field, moving the group and its existing memberships into a different pharmacy context without Nadia's consent.

- Status: **REFUTED_SOURCE** | Decision: **DROP_DEFECT_PRESERVE_HISTORY** | Grade: S2_SAME_ASSISTANT_SOURCE_CHALLENGE
- Evidence: `backend/pharmacy_hub/groups.py:138`, `backend/pharmacy_hub/groups.py:139`, `backend/pharmacy_hub/groups.py:144`, `backend/pharmacy_hub/serialization/groups.py:30`, `backend/pharmacy_hub/serialization/groups.py:42`, `backend/pharmacy_hub/serialization/groups.py:127`, `backend/pharmacy_hub/serialization/groups.py:137`
- Test: As Tom, manage group G in pharmacy A; PATCH G with pharmacy=B owned by unrelated Nadia. Assert mutation rejected and group pharmacy, member links and posts remain in A. Valid same-pharmacy description change succeeds.
- Business question: May Tom move an existing group and its posts into Nadia's unrelated pharmacy using an ordinary group edit?

### C018-N1 — P1 — The editorial seed command has no production guard and changes admin access, live articles and comments under real users' names.

An operator runs the seed command on the live server, maybe after copying it from a setup note. If the hard-coded author emails do not exist, the very first account in the database (for example Tom) silently becomes a full content administrator, with publishing, invitation and moderation powers. Live launch guides are overwritten with localhost cover images, and made-up 'news' plus sample comments and reactions are posted under real members' accounts. Readers see fake regulatory news and comments that real pharmacists never wrote.

- Status: **UNVERIFIED_CANDIDATE** | Decision: **VERIFY** | Grade: S1_REPORTED
- Evidence: `backend/public_hub/management/commands/seed_editorial_content.py:52`, `backend/public_hub/management/commands/seed_editorial_content.py:65`, `backend/public_hub/management/commands/seed_editorial_content.py:78`, `backend/public_hub/management/commands/seed_editorial_content.py:432`, `backend/public_hub/management/commands/seed_editorial_content.py:464`, `backend/public_hub/management/commands/seed_editorial_content.py:501`, `backend/public_hub/management/commands/seed_hub_preview.py:14`
- Test: Run seed_editorial_content with production settings (DEBUG off, not public_hub.test_settings) and assert that it raises CommandError and makes no ContentAdministrator, Article or Comment changes.
- Business question: If someone runs the editorial seed command on the live site, what should happen to Tom's account, the published guides and the comments shown to readers?

### C019-N1 — P1 — Concurrent referral claims can award the same referral twice

Tom shares his friend referral with Sara. Sara has a verified account and submits the same claim twice at the same time. Both claims can succeed, giving Tom two 100-Pill rewards for referring Sara once; the extra credit can pay for shifts.

- Status: **ROOT_ALIAS** | Decision: **DEDUP** | Grade: S1_REPORTED
- Evidence: `backend/rewards/views.py:139`, `backend/rewards/services.py:297`, `backend/rewards/services.py:333`, `backend/rewards/services.py:188`, `backend/rewards/models.py:119`
- Test: Submit two concurrent first claims by verified Sara for Tom's same referral code, synchronizing their initial lookups; assert one claimed referral and one 100-Pill credit.
- Root group: F10-N3 (ALIAS_ROOT)
- Business question: When Sara submits Tom's same referral claim twice simultaneously, what should Tom receive?

### C020-N1 — P1 — Manual rostering allows staff to fill a pharmacist vacancy without pharmacist eligibility

Tom submits a manual roster assignment putting Ali into a pharmacist vacancy. Ali's accepted technician membership satisfies the checks, so the assignment succeeds without checking that Ali can perform pharmacist work.

- Status: **UNVERIFIED_CANDIDATE** | Decision: **VERIFY** | Grade: S1_REPORTED
- Evidence: `backend/shifts/base.py:412`, `backend/shifts/assignment.py:143`, `backend/shifts/assignment.py:169`, `backend/shifts/engagement.py:46`, `backend/shifts/access.py:43`
- Test: Manually assign accepted technician Ali to a pharmacist vacancy and assert rejection with no assignment created.
- Business question: When Tom manually puts Ali into a pharmacist vacancy, what should happen?

### C020-N2 — P1 — One claimed slot prevents claims on every remaining free slot

Tom posts two independently claimable pharmacist dates. Omar claims the first date, then tries to claim the second. The second claim is refused because the shift already has an assignment, although that date remains free.

- Status: **UNVERIFIED_CANDIDATE** | Decision: **VERIFY** | Grade: S1_REPORTED
- Evidence: `backend/shifts/browse.py:343`, `backend/shifts/browse.py:351`, `backend/shifts/browse.py:366`
- Test: Claim one slot in a non-single-user shift, then claim another free slot and assert success.
- Business question: After Omar claims the first of Tom's independently claimable dates, what should happen to the second?

### C020-N3 — P1 — Recurring vacancies disappear from worker boards after their starting date

Tom posts an unfilled weekly pharmacist vacancy running for several weeks. Once its starting date passes, Sara cannot find the remaining dates on the public board. Omar likewise loses an equivalent recurring vacancy from the community board.

- Status: **UNVERIFIED_CANDIDATE** | Decision: **VERIFY** | Grade: S1_REPORTED
- Evidence: `backend/shifts/browse.py:75`, `backend/shifts/browse.py:440`, `backend/shifts/browse.py:565`, `backend/shifts/posting.py:48`, `backend/shifts/pricing.py:444`
- Test: Create an unassigned recurring slot starting yesterday with a future occurrence and assert it remains discoverable on worker boards.
- Business question: When Tom's recurring vacancy has future unfilled dates but its starting date has passed, what should Sara see?

### C020-N5 — P1 — Accepting a valid counter offer for a vacancy without dated slots crashes

Tom posts a full-time vacancy without dated shifts. Sara submits a counter offer containing the requested working times but no date, which the app accepts. When Tom accepts it, the request fails instead of sending Sara an offer.

- Status: **UNVERIFIED_CANDIDATE** | Decision: **VERIFY** | Grade: S1_REPORTED
- Evidence: `backend/shifts/serialization/offers.py:100`, `backend/shifts/serialization/offers.py:163`, `backend/shifts/counter_offers.py:137`, `backend/shifts/counter_offers.py:139`
- Test: Submit a valid slotless counter offer without slot_date, then accept it and assert a controlled successful response instead of an exception.
- Business question: When Sara counters Tom's full-time vacancy without dated shifts, what should accepting it do?

### C020-N6 — P1 — Confirming one recurring date books dates outside the accepted terms

Sara counters for just one date in Tom's recurring vacancy, and Tom accepts that date. Sara reviews terms describing that date and confirms. When the booking is finalized, the app assigns Sara to every unfilled date in the recurring series, including dates she did not accept.

- Status: **UNVERIFIED_CANDIDATE** | Decision: **VERIFY** | Grade: S1_REPORTED
- Evidence: `backend/shifts/counter_offers.py:163`, `backend/shifts/counter_offers.py:188`, `backend/shifts/engagement.py:268`, `backend/shifts/offers.py:360`, `backend/shifts/finalize.py:39`, `backend/shifts/finalize.py:79`
- Test: Confirm an offer targeting one recurring occurrence and assert no assignments exist for any other occurrence.
- Business question: When Sara accepts terms for one date in Tom's recurring vacancy, which dates should she be booked for?

### C021-N1 — P1 — Public shift responses expose other workers' names and email addresses.

Tom posts a public shift with several vacancies, and Ben confirms one while payment is pending. Sara browses that shift without joining Tom's pharmacy. The response reveals Ben's name and email; it also exposes contact details for workers already assigned.

- Status: **ROOT_ALIAS** | Decision: **DEDUP** | Grade: S1_REPORTED
- Evidence: `backend/shifts/lifecycle.py:393`, `backend/shifts/serialization/shifts.py:440`, `backend/shifts/serialization/shifts.py:451`, `backend/shifts/serialization/shifts.py:480`
- Test: Retrieve a public shift as unrelated Sara and assert Ben's pending-payment and assignment contact details are absent.
- Root group: F01-N1 (ALIAS_ROOT)
- Business question: When Sara browses Tom's public vacancy, whose contact details should she see?

### C021-N2 — P1 — Confirmed counteroffers are invoiced using the original shift hours.

Tom advertises a flexible shift from 09:00 to 17:00. Sara proposes 10:00 to 14:00, Tom accepts, and Sara confirms. Her booking retains the original hours, and its invoice preview charges Tom for eight hours instead of the agreed four.

- Status: **UNVERIFIED_CANDIDATE** | Decision: **VERIFY** | Grade: S1_REPORTED
- Evidence: `backend/shifts/serialization/offers.py:123`, `backend/shifts/counter_offers.py:163`, `backend/shifts/engagement.py:272`, `backend/shifts/finalize.py:79`, `backend/invoicing/services.py:96`
- Test: Confirm a 10:00–14:00 counteroffer against a 09:00–17:00 slot and assert the booking and invoice use four hours.
- Business question: After Tom and Sara agree to shorten the shift, which hours should her booking and invoice use?

### C021-N3 — P1 — Confirming one recurring occurrence books the worker for the entire series.

Tom posts a recurring Monday vacancy. Sara proposes working only the second Monday, and Tom accepts that date. When Sara confirms, she is assigned every Monday in the series, including dates she never accepted.

- Status: **ROOT_ALIAS** | Decision: **DEDUP** | Grade: S1_REPORTED
- Evidence: `backend/shifts/serialization/offers.py:17`, `backend/shifts/counter_offers.py:188`, `backend/shifts/engagement.py:271`, `backend/shifts/finalize.py:39`, `backend/shifts/finalize.py:82`
- Test: Confirm an offer for the second of three recurring Mondays and assert no assignments exist for the other Mondays.
- Root group: C020-N6 (ALIAS_ROOT)
- Business question: When Sara accepts only the second Monday of Tom's recurring vacancy, what should be booked?

### C021-N5 — P1 — Shift lifecycle filters compare pharmacy clock times with UTC.

Sara finishes Tom's Sydney shift at 17:00. At 20:00 Sydney time, the filters compare its finish against the UTC morning clock and still classify it as upcoming. Tom and Sara continue seeing an ended booking as confirmed, and ended vacancies can remain active.

- Status: **UNVERIFIED_CANDIDATE** | Decision: **VERIFY** | Grade: S1_REPORTED
- Evidence: `backend/core/settings.py:445`, `backend/core/settings.py:449`, `backend/shifts/lifecycle.py:148`, `backend/shifts/selectors.py:20`, `backend/shifts/my_shifts.py:20`, `backend/shifts/serialization/shifts.py:403`
- Test: Freeze time at 20:00 Sydney time for a same-day 17:00 finish and assert the shift is excluded from upcoming and active results.
- Business question: When Tom's pharmacy clock passes the shift's finish time, when should Sara's booking leave Upcoming?

### C021-N6 — P1 — Named public shifts disclose internal pharmacy document links.

Tom uploads pharmacy procedures and controlled-drug protocols, then posts a named public vacancy. Sara opens the vacancy while merely browsing. Its response includes links to those internal documents before Tom has selected or booked her.

- Status: **UNVERIFIED_CANDIDATE** | Decision: **VERIFY** | Grade: S1_REPORTED
- Evidence: `backend/shifts/lifecycle.py:393`, `backend/shifts/serialization/shifts.py:54`, `backend/shifts/serialization/shifts.py:193`, `backend/organizations/serializers.py:139`, `backend/shifts/serialization/projections.py:110`
- Test: Retrieve a named public shift as unrelated Sara and assert pharmacy procedure, protocol, and induction document links are absent.
- Business question: When should Sara gain access to Tom's internal pharmacy documents?

### C022-N1 — P1 — Region admins cannot see other managers' shifts or cover requests at their assigned pharmacies.

Lina assigns Grace to manage Tom's pharmacy as a region admin with roster privileges, without adding a separate pharmacy-admin appointment. When Tom posts shifts, Grace's active, confirmed and history lists omit them, although the individual pharmacy permission check recognizes her authority. Omar's cover requests are also unavailable to Grace, preventing her from handling staffing work within her assigned region.

- Status: **UNVERIFIED_CANDIDATE** | Decision: **VERIFY** | Grade: S1_REPORTED
- Evidence: `backend/shifts/test_access_escalation_contract.py:77`, `backend/organizations/access.py:194`, `backend/organizations/access.py:205`, `backend/shifts/selectors.py:13`, `backend/shifts/lifecycle.py:97`, `backend/shifts/lifecycle.py:153`, `backend/shifts/lifecycle.py:176`, `backend/shifts/worker_requests.py:49`, `backend/shifts/worker_requests.py:57`, `backend/shifts/worker_requests.py:384`
- Test: Assign Grace roster-capable region membership without a PharmacyAdmin record; verify Tom's shifts and Omar's cover request are accessible only within her assigned pharmacies.
- Business question: When Lina gives Grace region-admin roster privileges for Tom's pharmacy, should Grace see Tom's shifts and decide Omar's cover requests?

### C023-N2 — P1 — Work notes and calendar events can be moved into, or attached to, a pharmacy or organisation the person has no rights over.

Omar is an ordinary staff member at Tom's pharmacy. He edits one of his own work notes, changes its pharmacy to Nadia's pharmacy and assigns Nadia. The permission check only looks at the note's old pharmacy. The assignee check uses the new pharmacy, so it passes, and Nadia is notified with Omar's text. Separately, Tom can create an event naming his own pharmacy plus Lina's organisation. Only the pharmacy is checked, so the event appears in Lina's organisation calendar.

- Status: **UNVERIFIED_CANDIDATE** | Decision: **VERIFY** | Grade: S1_REPORTED
- Evidence: `backend/team_calendar/views.py:377-383`, `backend/team_calendar/serializers.py:61-66`, `backend/team_calendar/serializers.py:78-91`, `backend/team_calendar/views.py:241-264`, `backend/team_calendar/views.py:217-227`, `backend/team_calendar/tasks.py:303-319`
- Test: A staff member PATCHes a work note with another pharmacy's id (expect 403 or no change); an owner POSTs an event with own pharmacy plus a foreign organisation (expect 403)
- Business question: Omar wants to move a work note from Tom's pharmacy to Nadia's pharmacy, and Tom tags an event with Lina's organisation. What should happen?

### C023-N3 — P1 — Deleting an account leaves the person's talent post live on the public and logged-in boards.

Sara deletes her ChemistTasker account. Her name, email and ID documents are removed, but her talent post is never touched: headline, free-text body, suburb, postcode and reference code stay. Logged-out visitors and owners like Tom keep seeing it, and a full-time post never expires. Tom may try to book or contact someone who has left the platform, and Sara's own words stay public after she asked to be removed.

- Status: **UNVERIFIED_CANDIDATE** | Decision: **VERIFY** | Grade: S1_REPORTED
- Evidence: `backend/users/api_account.py:76-82`, `backend/users/account_deletion.py:92-119`, `backend/talent/models.py:119-127`, `backend/talent/views/explorer.py:172-199`
- Test: Delete an account that has an ExplorerPost, then public-feed/ and feed/ must not return that post
- Business question: Sara deletes her account while her availability post is on the talent board. What should happen to the post?

### C024-N1 — P1 — Password-reset links are copied into the user's in-app notifications, so anyone holding a signed-in session can take over the account without email access.

Mia stays signed in on the shared dispensary computer. A coworker goes to the public 'forgot password' page and enters Mia's email. The reset email also creates a 'Reset your password' notification in Mia's bell, and that notification holds the live reset link. The coworker opens it from Mia's session, sets a new password and locks Mia out, without ever touching her mailbox.

- Status: **REPRODUCED_RUNTIME_DJANGO_SQLITE** | Decision: **FIX** | Grade: S3_ISOLATED_DJANGO_SQLITE
- Evidence: `backend/users/api_passwords.py:70-84`, `backend/users/tasks.py:65-102`, `backend/users/tasks.py:80`, `backend/core/task_queue.py:63-100`, `backend/notifications/services.py:80-88`
- Test: POST password-reset/ for a known user, then assert that no Notification for that user has an action_url (or payload) containing the uid/token reset path.
- Runtime: RED_TEST_FAILED_AS_EXPECTED (test_c024_n1_password_reset_token_not_in_signed_in_bell) https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/actions/runs/40176725005
- Business question: When someone asks for a password reset for Mia, what should Mia see inside the app?

### C025-N1 — P1 — Migration replaces historical invoice billing details with a customer matched only by name.

Sara has historical invoices for Tom's two pharmacies with the same bill-to name but different billing emails and addresses. During the upgrade, both invoices reuse one saved customer, and one invoice receives the other pharmacy's billing details. Resending that invoice can send it to the wrong pharmacy contact, including Nadia.

- Status: **UNVERIFIED_CANDIDATE** | Decision: **VERIFY** | Grade: S1_REPORTED
- Evidence: `backend/worker_finance/migrations/0005_consolidate_invoice_record.py:62`, `backend/worker_finance/migrations/0005_consolidate_invoice_record.py:118`, `backend/worker_finance/views.py:277`
- Test: Migrate two legacy invoices sharing a bill-to name but having different emails, addresses and ABNs; assert each migrated snapshot retains its original details.
- Business question: When Sara's historical invoices for Tom's pharmacies share a billing name, what should happen to their separate billing details during upgrade?

### C025-N2 — P1 — Editing an invoice leaves its separate super request at the old amount.

Sara creates an $800 service invoice and its separate $96 super request for Tom. She then corrects the service invoice to $400, making the super amount $48. The linked request remains $96, cannot be edited, and prevents creation of a corrected request, leaving Tom with an excessive contribution request.

- Status: **ROOT_ALIAS** | Decision: **DEDUP** | Grade: S1_REPORTED
- Evidence: `backend/worker_finance/services.py:690`, `backend/worker_finance/services.py:606`, `backend/worker_finance/services.py:894`, `frontend_web/src/pages/finance/FinanceWorkspace.tsx:356`
- Test: Create a separate super request, revise the parent's eligible amount downward, and assert the old contribution cannot remain the active request unchanged.
- Root group: F07-N6 (ALIAS_ROOT)
- Business question: When Sara corrects an invoice after creating Tom's super request, what should happen to that request?

### C025-N3 — P1 — Invoice corrections leave previously recorded payment GST allocations unchanged.

Tom pays Sara $55 toward a $110 invoice containing $10 GST, so the payment records $5 GST. Sara corrects the invoice to GST-free while keeping the $110 total, then records Tom's remaining $55 payment. Her cash GST worksheet still includes the original $5 even though the corrected invoice contains no GST.

- Status: **UNVERIFIED_CANDIDATE** | Decision: **VERIFY** | Grade: S1_REPORTED
- Evidence: `backend/worker_finance/services.py:690`, `backend/worker_finance/services.py:965`, `backend/worker_finance/services.py:968`, `backend/worker_finance/views.py:634`
- Test: Part-pay a GST invoice, revise it to GST-free at the same total, resend and settle it; assert cash GST is reconciled or the correction is rejected.
- Business question: When Sara corrects GST after Tom has partly paid, how should the recorded GST be handled?

### C026-N1 — P1 — Marking an invoice paid leaves its payment balance and cash reporting unchanged.

Tom pays Sara's full invoice, and Sara selects Mark as paid as instructed by the screen. The invoice shows Paid, but its recorded payment amount stays zero and its outstanding balance remains the full amount. Sara's cash-basis GST worksheet also omits the money unless she separately records a payment.

- Status: **ROOT_ALIAS** | Decision: **DEDUP** | Grade: S1_REPORTED
- Evidence: `backend/worker_finance/views.py:251`, `backend/worker_finance/views.py:506`, `backend/worker_finance/views.py:634`, `backend/worker_finance/services.py:835`, `frontend_web/src/pages/finance/FinanceWorkspace.tsx:354`, `frontend_web/src/pages/finance/FinanceWorkspace.tsx:355`
- Test: Mark an unpaid invoice paid through the normal action; assert zero balance and inclusion of the payment in the correct cash-reporting period.
- Root group: F07-N2 (ALIAS_ROOT)
- Business question: When Sara marks Tom's fully paid invoice as paid, what should happen to its balance and cash report?

### C026-N2 — P1 — Finishing an older invoice email exposes a newer unsent revision.

Sara starts emailing an invoice to Tom, then saves a revised amount in another tab while the email is being sent. When the earlier email finishes, the app marks the latest invoice as sent even though that email contained the earlier revision. Tom can then see and approve Sara's newer draft before she sends it.

- Status: **ROOT_ALIAS** | Decision: **DEDUP** | Grade: S1_REPORTED
- Evidence: `backend/worker_finance/views.py:279`, `backend/worker_finance/views.py:290`, `backend/worker_finance/views.py:315`, `backend/worker_finance/views.py:316`, `backend/worker_finance/services.py:693`, `backend/worker_finance/services.py:702`, `backend/worker_finance/services.py:772`
- Test: Pause sending revision 1, save revision 2, then finish sending; assert revision 2 remains draft and Tom can see only revision 1.
- Root group: F07-N4 (ALIAS_ROOT)
- Business question: If Sara saves a newer draft while an earlier invoice email is sending to Tom, which revision should Tom see?

### C026-N3 — P1 — Extending an active employment agreement bypasses its junior rate expiry.

Tom creates junior employment terms for Mia ending before her next birthday, as the app requires. Once those terms have started, Tom can extend or clear their end date without the birthday check running again. Mia's later timesheets then carry the old junior rates beyond the required review date.

- Status: **UNVERIFIED_CANDIDATE** | Decision: **VERIFY** | Grade: S1_REPORTED
- Evidence: `backend/workforce/employment_engagement_service.py:109`, `backend/workforce/models.py:165`, `backend/workforce/views.py:362`, `backend/workforce/views.py:391`, `backend/workforce/views.py:416`, `backend/workforce/timesheet_data.py:86`, `backend/workforce/timesheet_data.py:115`
- Test: Patch an already-started junior agreement to end on or after its birthday review date, including a null end date; assert rejection.
- Business question: When Tom extends Mia's junior employment terms across her next birthday, what should happen?

### C027-N1 — P1 — Replacement approval keeps the departing worker's payment terms

Omar requests a swap with Ben, Tom's favourite locum with an accepted pharmacy membership. Tom unpublishes the shift and approves the swap. Ben inherits Omar's employment and payment terms, and his rate is recalculated from Omar's agreement without recording Ben's own accepted terms.

- Status: **UNVERIFIED_CANDIDATE** | Decision: **VERIFY** | Grade: S1_REPORTED
- Evidence: `backend/workforce/roster/worker_actions.py:179`, `backend/workforce/roster/worker_actions.py:300`, `backend/workforce/roster/assignment_rates.py:11`, `backend/workforce/roster/assignment_rates.py:17`, `backend/shifts/engagement.py:47`
- Test: Attempt to replace Omar's payroll assignment with Ben's locum membership; verify approval cannot transfer Omar's employment snapshot to Ben.
- Business question: When Tom approves Ben replacing Omar, how should Ben's payment terms be established?

### C027-N2 — P1 — Coverage checks mark partly staffed intervals as fully covered

Tom requires one pharmacist from 09:00 to 17:00 and schedules Omar only from 09:00 to 10:00. The coverage panel reports the whole requirement as covered with no shortfall. Tom can therefore overlook seven hours with no pharmacist scheduled.

- Status: **UNVERIFIED_CANDIDATE** | Decision: **VERIFY** | Grade: S1_REPORTED
- Evidence: `backend/workforce/roster/revisions.py:85`, `backend/workforce/roster/revisions.py:99`, `frontend_web/src/features/workforce/RosterCoveragePanel.tsx:112`
- Test: Configure one pharmacist required from 09:00 to 17:00 with Omar assigned only 09:00 to 10:00; verify coverage reports a shortfall.
- Business question: Should Tom's 09:00–17:00 pharmacist requirement count as covered when Omar works only 09:00–10:00?

### C027-N4 — P1 — Coworker roster responses expose private leave notes

Omar submits a pending sick-leave request linked to a published shift and explains his medical circumstances in the note. Mia opens the pharmacy roster as an ordinary accepted staff member. The response includes Omar's leave type and full private note, although the leave endpoint restricts Mia to her own requests.

- Status: **ROOT_ALIAS** | Decision: **DEDUP** | Grade: S1_REPORTED
- Evidence: `backend/workforce/roster/views.py:552`, `backend/workforce/roster/serializers.py:138`, `backend/workforce/roster/serializers.py:154`, `backend/workforce/views.py:590`
- Test: As Mia, retrieve Omar's roster assignment containing a pending sick-leave note; verify the response excludes his private leave details.
- Root group: C045-N2 (ALIAS_ROOT)
- Business question: What should Mia see about Omar's leave when viewing their shared pharmacy roster?

### C028-N1 — P1 — Locked manifests omit every payroll assignment

Tom enables payroll and approves Omar's timesheet for shifts designated for payroll. Locking the period succeeds, but the returned manifest contains no payroll assignments or payroll work days. Invoice and timesheet-only routing lists are also empty because the saved timesheet lacks the roster details that locking reads.

- Status: **ROOT_ALIAS** | Decision: **DEDUP** | Grade: S1_REPORTED
- Evidence: `backend/workforce/timesheet_builder.py:183`, `backend/workforce/timesheet_builder.py:203`, `backend/workforce/timesheet_transitions.py:147`, `backend/workforce/timesheet_transitions.py:182`, `backend/workforce/views.py:744`
- Test: Build and approve a payroll-enabled period containing Omar's PAYROLL assignment, then lock it and assert that its assignment and worked day are present in payroll_export.
- Root group: F06-N1 (ALIAS_ROOT)
- Business question: When Tom locks a payroll-enabled period containing Omar's approved payroll shifts, what should the locked record contain?

### C028-N4 — P1 — Overnight attendance corrections leave the next period approved with stale minutes

Omar works from Sunday night into Monday morning, with the two parts recorded in consecutive timesheet periods. After both are approved, Tom corrects Monday's finish time from 06:00 to 07:00. Only the period containing Sunday's clock-in is marked for rebuilding; Monday's period keeps its old approved minutes and can be locked without the extra hour.

- Status: **UNVERIFIED_CANDIDATE** | Decision: **VERIFY** | Grade: S1_REPORTED
- Evidence: `backend/workforce/signals.py:21`, `backend/workforce/signals.py:41`, `backend/workforce/signals.py:61`, `backend/workforce/timesheet_data.py:206`, `backend/workforce/timesheet_data.py:256`, `backend/workforce/timesheet_transitions.py:137`
- Test: Approve both periods intersecting Omar's Sunday-to-Monday session, correct Monday's clock-out, and assert Monday's timesheet becomes stale and cannot lock before rebuilding and reapproval.
- Business question: When Tom corrects Omar's overnight attendance spanning two open timesheet periods, which periods should require recalculation?

### C028-N5 — P1 — Archiving a roster removes its scheduled work and approved leave from timesheets

Tom approves Omar's annual leave against a published roster, then archives that completed roster week before locking the timesheet period. Archiving triggers recalculation, but archived weeks are excluded from the timesheet's roster inputs. Omar's approved leave minutes fall to zero even though the leave remains approved and the archived roster remains visible as published history.

- Status: **UNVERIFIED_CANDIDATE** | Decision: **VERIFY** | Grade: S1_REPORTED
- Evidence: `backend/workforce/roster/publication.py:123`, `backend/workforce/roster/publication.py:177`, `backend/workforce/signals.py:199`, `backend/workforce/timesheet_data.py:150`, `backend/workforce/timesheet_builder.py:96`, `backend/workforce/timesheet_builder.py:124`
- Test: Build a timesheet with approved roster-linked annual leave, archive its published roster week, rebuild, and assert rostered and approved-leave minutes remain unchanged.
- Business question: When Tom archives a completed published roster, what should happen to Omar's scheduled hours and approved leave in its open timesheet period?

### C029-N1 — P1 — Extending an active junior agreement bypasses its birthday rate limit.

Tom creates Mia's junior pay agreement ending before her next birthday. After it starts, he removes the end date, and the save succeeds while preserving her lower rates. Work after her birthday can now use those rates without requiring updated terms.

- Status: **UNVERIFIED_CANDIDATE** | Decision: **VERIFY** | Grade: S1_REPORTED
- Evidence: `backend/workforce/views.py:377`, `backend/workforce/views.py:391`, `backend/workforce/views.py:416`, `backend/workforce/employment_engagement_service.py:109`, `backend/shifts/engagement.py:84`
- Test: For an active junior agreement ending before the next birthday, PATCH effective_to=null and assert rejection with the original end date preserved.
- Business question: When Tom extends Mia's junior agreement beyond her next birthday, what should happen?

### C029-N2 — P1 — Saving employment terms leaves existing timesheets using stale pay agreements.

Tom approves Omar's timesheet, then records a higher rate effective today while the pay period remains open. Omar's existing timesheet keeps the previous pay agreement and remains approved. Tom can lock the period without recalculating or reviewing the changed terms.

- Status: **UNVERIFIED_CANDIDATE** | Decision: **VERIFY** | Grade: S1_REPORTED
- Evidence: `backend/workforce/views.py:339`, `backend/workforce/views.py:417`, `backend/workforce/views.py:784`, `backend/workforce/timesheet_builder.py:191`, `backend/workforce/timesheet_transitions.py:137`
- Test: After approving Omar's timesheet containing today's work, create successor terms effective today and assert locking fails until recalculation and renewed approval.
- Business question: When Tom changes Omar's pay terms for dates in an approved but unlocked timesheet, what should happen?

### C030-N2 — P1 — Renaming a group on mobile silently removes its other members.

Tom renames a custom group containing Omar and Mia using the mobile app. Saving the name also removes Omar and Mia from the group because the omitted member selection becomes an empty replacement list. Tom remains as creator, while Omar and Mia lose access.

- Status: **UNVERIFIED_CANDIDATE** | Decision: **VERIFY** | Grade: S1_REPORTED
- Evidence: `frontend_mobile/roles/shared/chat/ChatPage.tsx:293`, `shared-core/src/domains/chat/api.ts:131`, `backend/chat/views.py:416`, `backend/chat/views.py:464`, `backend/chat/serializers.py:347`
- Test: Rename Tom's group without supplying participants and verify Omar and Mia remain participants.
- Business question: When Tom changes only a group's name, what should happen to Omar and Mia?

### C031-N1 — P1 — Collection helpers silently discard records after the first page

Tom schedules 60 assignments at his pharmacy for one week. The roster screens receive only the first 50, so Omar's assignment can disappear from his schedule even though it remains booked. The same pagination loss hides later membership records, pharmacies, shift history and Hub comments.

- Status: **UNVERIFIED_CANDIDATE** | Decision: **VERIFY** | Grade: S1_REPORTED
- Evidence: `backend/core/settings.py:360`, `shared-core/src/domains/roster/api.ts:90`, `frontend_mobile/app/my-roster.tsx:132`, `shared-core/src/domains/memberships/api.ts:90`, `shared-core/src/domains/organizations/api.ts:25`, `shared-core/src/domains/shifts/api.ts:302`, `shared-core/src/domains/pharmacyHub/api.ts:245`, `frontend_web/src/pages/dashboard/sidebar/hub/HubPostCard.tsx:139`
- Test: Return 50 roster assignments with a next page containing Omar's assignment; assert the complete roster includes his assignment.
- Business question: When Tom's weekly roster exceeds 50 assignments, how should Omar access all his scheduled work?

### C032-N1 — P1 — Editing a shift description breaks its pending offers.

Tom offers Sara one date, then edits only the shift description before Sara accepts. Saving replaces the existing dates and detaches Sara's offer from its date. Sara's offer remains pending, but attempting to accept it fails.

- Status: **UNVERIFIED_CANDIDATE** | Decision: **VERIFY** | Grade: S1_REPORTED
- Evidence: `shared-core/src/domains/shifts/postingDraft.ts:46`, `frontend_web/shared/postShift/PostShiftForm.tsx:457`, `backend/shifts/serialization/shifts.py:355`, `backend/shifts/posting.py:189`, `backend/shifts/models.py:680`, `backend/shifts/offers.py:351`
- Test: Create a pending offer for Sara with single_user_only=false, submit the description-edit payload, and assert its original slot remains linked and accept succeeds.
- Business question: When Tom edits only a shift description after offering a date to Sara, what should happen to Sara's offer?

### C036-N1 — P1 — Worker leave request submission always fails due to reading nonexistent membership id from session user

Omar logs into the web dashboard and opens My Leave to submit annual leave for his shifts at Tom's pharmacy. The pharmacy selector assigns an undefined membership value because pharmacy memberships in the session profile omit the membership record identifier. When Omar submits the form, the server receives a missing membership parameter and rejects the request with a permission error, completely blocking him from requesting leave.

- Status: **UNVERIFIED_CANDIDATE** | Decision: **VERIFY** | Grade: S1_REPORTED
- Evidence: `frontend_web/src/features/workforce/MyLeavePage.tsx:7`, `frontend_web/src/features/workforce/MyLeavePage.tsx:11`, `frontend_web/src/features/workforce/MyLeavePage.tsx:12`, `backend/users/sessions.py:90`, `backend/workforce/leave_service.py:237`
- Test: Submit a leave request from MyLeavePage using an authenticated worker whose profile memberships contain pharmacy details without an id attribute, asserting that a valid membership identifier is supplied to the API rather than null or NaN.
- Business question: When Omar requests leave on the web dashboard, how should the application identify his active pharmacy membership?

### C038-N1 — P1 — Post-verification and dashboard return links navigate to an unrouted root path, landing users on a 404 page

After Zoe (or Sara, Ali, or Mia) finishes verifying her mobile number on the web onboarding flow, the page promises to redirect her to her dashboard. Instead, it assigns the browser location to /dashboard, where React Router finds no matching route and displays the 404 Page Not Found screen. The same 404 occurs when Sara clicks 'My dashboard' after submitting a membership application or when clicking subscription buttons as a non-owner.

- Status: **UNVERIFIED_CANDIDATE** | Decision: **VERIFY** | Grade: S1_REPORTED
- Evidence: `frontend_web/src/main.tsx:589`, `frontend_web/src/pages/MobileOTPVerify.tsx:97`, `frontend_web/src/pages/MembershipApplyPage.tsx:386`, `frontend_web/src/pages/PricingPage.tsx:110`
- Test: Mount the router at '/dashboard' with an authenticated user and assert that it redirects to the user's role-specific dashboard instead of rendering NotFoundPage.
- Business question: When an authenticated user lands on or is redirected to '/dashboard', where should the app send them?

### C039-N1 — P1 — Attendance timeline correction modal uses UTC string in local datetime input shifting timestamps

Omar clocks out at 5:00 PM at Tom's pharmacy in Sydney. When Tom clicks to correct Omar's clock-out time on the review page, the date-time picker is populated with a universal time string showing 7:00 AM instead of 5:00 PM. When Tom submits the form, the browser parses the value in the local timezone, shifting the record 10 hours earlier so it precedes Omar's morning clock-in. The server rejects the submission for violating event order, blocking Tom from saving corrections, or silently distorts shift hours if editing clock-in.

- Status: **UNVERIFIED_CANDIDATE** | Decision: **VERIFY** | Grade: S1_REPORTED
- Evidence: `frontend_web/src/pages/attendance/ManagerAttendanceReviewPage.tsx:237`, `frontend_web/src/pages/attendance/ManagerAttendanceReviewPage.tsx:539`
- Test: In a browser running in Australia/Sydney (UTC+10), opening the correction modal for an event at 17:00 local time and submitting should send an effective timestamp of 17:00 AEST (07:00Z) rather than shifting 10 hours to 07:00 AEST (21:00Z previous day).
- Business question: When Tom corrects an attendance clock time on the review page, how should the date-time picker initialize and submit timestamps for Australian pharmacies?

### C039-N2 — P1 — Shared shift landing redirect produces non-existent dashboard routes for non-standard roles

Tom creates a shared shift link for an open shift at his pharmacy. When Lina, an organisation admin, clicks the link while logged in, the page calculates a non-existent role path. The application fails to match any valid screen and displays a missing page error, preventing Lina from reviewing the shift. The same breakdown locks out users with pharmacy manager roles.

- Status: **UNVERIFIED_CANDIDATE** | Decision: **VERIFY** | Grade: S1_REPORTED
- Evidence: `frontend_web/src/pages/SharedShiftLandingPage.tsx:246`, `frontend_web/src/pages/SharedShiftLandingPage.tsx:247`
- Test: Assert that an authenticated user with role ORG_STAFF or PHARMACY_MANAGER navigating to /shifts/link?token=... is not redirected to a non-existent route resulting in a 404 error.
- Business question: When Lina (organisation admin) or a pharmacy manager opens a shared shift link while logged in, where should the platform take them?

### C041-N1 — P1 — Accepting one date hides the remaining dates of a counter offer

Sara proposes different rates for two dates in Tom's shift. Tom accepts the first date, and the whole proposal disappears because it is marked accepted and removed from the list. Tom can no longer review or accept Sara's proposed terms for the second date through the normal screen.

- Status: **UNVERIFIED_CANDIDATE** | Decision: **VERIFY** | Grade: S1_REPORTED
- Evidence: `frontend_web/src/pages/dashboard/sidebar/ActiveShiftsPage/hooks/useCounterOffers.ts:56`, `frontend_web/src/pages/dashboard/sidebar/ActiveShiftsPage/hooks/useCounterOffers.ts:28`, `backend/shifts/counter_offers.py:131`, `backend/shifts/counter_offers.py:143`, `backend/shifts/counter_offers.py:29`
- Test: Submit one counter offer covering two independently filled dates, accept only the first, then verify the second remains reviewable and acceptable after reload.
- Business question: When Tom accepts the first of two dates proposed by Sara, what should happen to her second date?

### C041-N2 — P1 — Jobs without dated slots never load internal candidates

Tom posts a full-time job without individual dated slots, and Omar expresses interest in the whole job. Tom opens the internal candidates view, but it says nobody has responded. The page never requests the job's internal candidates because there are no dates to iterate over.

- Status: **UNVERIFIED_CANDIDATE** | Decision: **VERIFY** | Grade: S1_REPORTED
- Evidence: `frontend_web/src/pages/dashboard/sidebar/ActiveShiftsPage/hooks/useTabData.ts:45`, `frontend_web/src/pages/dashboard/sidebar/ActiveShiftsPage/hooks/useTabData.ts:65`, `frontend_web/src/pages/dashboard/sidebar/ActiveShiftsPage/ActiveShiftCard.tsx:196`, `backend/shifts/candidates.py:233`, `backend/shifts/test_shift_posting_contract.py:363`
- Test: Open a single-worker full-time job with no dated slots and an interested internal member; verify that member appears and can be reviewed.
- Business question: When Omar applies to Tom's full-time job without dated slots, what should Tom see?

### C041-N3 — P1 — Editing chain details removes its pharmacy links

Tom has both pharmacies in his chain and changes only the chain's contact email or logo. Saving replaces the chain's pharmacy selection with an empty list, so both pharmacies disappear from the chain. Nadia consequently loses the chain connection used to reach staff at Tom's other pharmacy.

- Status: **UNVERIFIED_CANDIDATE** | Decision: **VERIFY** | Grade: S1_REPORTED
- Evidence: `frontend_web/src/pages/dashboard/sidebar/ChainPage.tsx:159`, `frontend_web/src/pages/dashboard/sidebar/ChainPage.tsx:166`, `shared-core/src/domains/organizations/api.ts:150`, `backend/organizations/serializers.py:585`, `backend/shifts/candidates.py:263`
- Test: Create a chain with two pharmacies, submit the web form's multipart PUT changing only its email, and verify both pharmacy links remain.
- Business question: When Tom edits only his chain's email or logo, what should happen to its pharmacies?

### C042-N1 — P1 — Organisation and pharmacy admins are treated as invoice issuers instead of recipients on legacy invoice detail view

Sara completes a shift for Tom's pharmacy, which is managed by Lina at the organisation level and Grace as the pharmacy admin, and issues an invoice. When Lina or Grace opens the invoice in their manager dashboard, the page mistakes them for the invoice issuer because their user role is not pharmacy owner. Instead of seeing the recipient document with bank details and the ability to mark the invoice as paid or report an issue, Lina and Grace are shown an editable contractor draft with Sara's banking and line items, and their attempts to save or manage payment are rejected.

- Status: **UNVERIFIED_CANDIDATE** | Decision: **VERIFY** | Grade: S1_REPORTED
- Evidence: `frontend_web/src/pages/dashboard/sidebar/InvoiceDetailPage.tsx:42`, `frontend_web/src/pages/dashboard/sidebar/InvoiceDetailPage.tsx:484`, `frontend_web/src/pages/dashboard/sidebar/InvoiceDetailPage.tsx:570`, `frontend_web/src/pages/dashboard/sidebar/InvoiceDetailPage.tsx:647`
- Test: An Organisation Admin or delegated Pharmacy Admin viewing a received invoice in their dashboard is rendered the read-only recipient document with payment and issue reporting actions rather than the editable contractor form.
- Business question: When Lina (organisation admin) or Grace (pharmacy admin) reviews an invoice issued by Sara for work at their pharmacy, what view and actions should they have?

### C043-N1 — P1 — Pharmacy owner cannot view or respond to organization claim requests because the review section is hidden when no pharmacies are already claimed

Lina submits a claim request for Tom's independent pharmacy so her organisation can manage it. When Tom logs into the web dashboard to review his pharmacies, the claim requests section is hidden because Tom does not yet have any claimed or linked pharmacies. Tom cannot view Lina's request, read her message, or approve the claim, leaving the request permanently pending.

- Status: **UNVERIFIED_CANDIDATE** | Decision: **VERIFY** | Grade: S1_REPORTED
- Evidence: `frontend_web/src/pages/dashboard/sidebar/PharmacyClaimsPanels.tsx:245`, `frontend_web/src/pages/dashboard/sidebar/PharmacyPage.tsx:463`
- Test: Render the owner pharmacies page with an unclaimed pharmacy and a pending claim request, asserting the claim requests accordion and approve button are visible.
- Business question: When Lina submits a claim request to manage Tom's independent pharmacy, how should Tom see and act on the request in his dashboard?

### C044-N1 — P1 — A cancelled shift replacement can delete the original shift after an unrelated posting.

Tom starts converting Omar's assigned shift into an open shift, then dismisses the posting overlay. Tom later posts a separate new open shift from the same roster page. Completing that posting deletes Omar's original shift because the cancelled replacement remains pending.

- Status: **UNVERIFIED_CANDIDATE** | Decision: **VERIFY** | Grade: S1_REPORTED
- Evidence: `frontend_web/src/pages/dashboard/sidebar/RosterOwnerDialogs.tsx:852`, `frontend_web/src/pages/dashboard/sidebar/RosterOwnerDialogs.tsx:866`, `frontend_web/src/pages/dashboard/sidebar/RosterOwnerPage.tsx:467`, `frontend_web/src/pages/dashboard/sidebar/RosterOwnerPage.tsx:553`, `frontend_web/src/pages/dashboard/sidebar/RosterOwnerPage.tsx:577`, `frontend_web/src/pages/dashboard/sidebar/RosterOwnerPage.tsx:585`
- Test: Cancel conversion of Omar's shift, create a separate open shift without leaving the roster page, and assert Omar's original shift and assignment remain.
- Business question: After Tom cancels replacing Omar's shift and later posts a separate shift, what should happen to Omar's original shift?

### C045-N1 — P1 — Cancelling a convert-to-open-shift edit leaves the old shift marked for deletion, so a later, unrelated open-shift post deletes it.

Tom edits Omar's rostered Tuesday shift and ticks 'post as open shift'. The post-shift wizard opens, then Tom changes his mind and closes it, so Omar's shift stays. Later in the same session Tom adds a new open shift for Friday and finishes the wizard. The page then silently deletes Omar's Tuesday shift, and Omar loses a shift he was rostered on without anyone deciding that.

- Status: **UNVERIFIED_CANDIDATE** | Decision: **VERIFY** | Grade: S1_REPORTED
- Evidence: `frontend_web/src/pages/dashboard/sidebar/RosterOwnerPage.tsx:467`, `frontend_web/src/pages/dashboard/sidebar/RosterOwnerPage.tsx:577`, `frontend_web/src/pages/dashboard/sidebar/RosterOwnerPage.tsx:585`, `frontend_web/src/pages/dashboard/sidebar/RosterOwnerPage.tsx:553`, `frontend_web/src/pages/dashboard/sidebar/RosterOwnerDialogs.tsx:852`
- Test: Start convert-to-open on shift A, close the wizard, then complete a new open-shift post from Add shift; assert shift A is not deleted.
- Business question: Tom starts turning Omar's shift into an open shift, then closes the wizard without posting. What should happen to Omar's shift?

### C045-N2 — P1 — Staff on the worker roster can see coworkers' leave type and private leave notes.

Omar asks for sick leave on his Monday shift and writes a note about a medical appointment. Ali opens 'My roster' for the same pharmacy: Omar's shift shows 'Leave: PENDING', and when Ali clicks it the leave dialog opens with Omar's leave type and the full note. The server only hides the pay and timesheet details from coworkers, not the leave details.

- Status: **UNVERIFIED_CANDIDATE** | Decision: **VERIFY** | Grade: S1_REPORTED
- Evidence: `backend/workforce/roster/serializers.py:138`, `backend/workforce/roster/serializers.py:75`, `backend/workforce/roster/views.py:534`, `frontend_web/src/pages/dashboard/sidebar/RosterWorkerPage.tsx:410`, `frontend_web/src/pages/dashboard/sidebar/RosterWorkerPage.tsx:417`, `frontend_web/src/pages/dashboard/sidebar/RosterWorkerDialogs.tsx:233`
- Test: As Ali, GET the worker roster for Tom's pharmacy where Omar has a leave request; assert leave_request has no note or leave_type for Omar's assignment.
- Business question: Omar asks for sick leave with a private note. What should Ali, his coworker, see on the shared roster?

### C047-N1 — P1 — Reopening a cached conversation hides messages received while it was closed

Tom reads his conversation with Sara, then opens his conversation with Omar. Sara sends Tom another message while he is reading Omar's conversation. When Tom returns to Sara, her new message is missing, but the conversation is marked as read.

- Status: **UNVERIFIED_CANDIDATE** | Decision: **VERIFY** | Grade: S1_REPORTED
- Evidence: `frontend_web/src/pages/dashboard/sidebar/chat/ChatPage.tsx:297`, `frontend_web/src/pages/dashboard/sidebar/chat/ChatPage.tsx:305`, `frontend_web/src/pages/dashboard/sidebar/chat/ChatPage.tsx:347`, `frontend_web/src/pages/dashboard/sidebar/chat/ChatPage.tsx:515`, `backend/chat/signals.py:63`
- Test: Open Tom's conversation with Sara, switch to Omar, send a message from Sara, then reopen Sara and verify the missed message appears before it is marked read.
- Business question: When Tom returns to Sara's conversation after she sent a message while he was reading Omar's, what should happen?

### C047-N2 — P1 — Deleted messages remain readable in conversation previews

Sara sends Tom a message, then deletes it while Tom has the conversation open. The message bubble changes to a deletion notice, but its text remains visible in Tom's conversation preview and searchable in his sidebar. If Tom had pinned the message, its old text also remains in the pinned banner.

- Status: **UNVERIFIED_CANDIDATE** | Decision: **VERIFY** | Grade: S1_REPORTED
- Evidence: `frontend_web/src/pages/dashboard/sidebar/chat/ChatPage.tsx:428`, `frontend_web/src/pages/dashboard/sidebar/chat/ChatPage.tsx:441`, `frontend_web/src/pages/dashboard/sidebar/chat/ChatSidebar.tsx:578`, `frontend_web/src/pages/dashboard/sidebar/chat/ChatSidebar.tsx:932`, `frontend_web/src/pages/dashboard/sidebar/chat/ChatListItem.tsx:122`, `frontend_web/src/pages/dashboard/sidebar/chat/ConversationPanel.tsx:327`, `backend/chat/views.py:771`
- Test: Delete Sara's latest message while Tom views it with a personal pin; verify its text disappears from the bubble, sidebar preview, search results and pinned banner.
- Business question: When Sara deletes a message Tom has already opened or pinned, what should Tom continue seeing?

### C047-N3 — P1 — Explorers cannot renew their availability after their published dates expire

Zoe publishes her availability, then all the published dates pass. When she returns to publish new dates, her old post is absent from the board and the editor treats her as having no post. Saving attempts to create another post, which is rejected because her expired post still exists; the editor also offers no way to delete that old post.

- Status: **UNVERIFIED_CANDIDATE** | Decision: **VERIFY** | Grade: S1_REPORTED
- Evidence: `frontend_web/src/pages/dashboard/sidebar/TalentBoard/index.tsx:486`, `frontend_web/src/pages/dashboard/sidebar/TalentBoard/index.tsx:560`, `frontend_web/src/pages/dashboard/sidebar/TalentBoard/index.tsx:703`, `frontend_web/src/pages/dashboard/sidebar/TalentBoard/index.tsx:971`, `frontend_web/src/pages/dashboard/sidebar/TalentBoard/hooks/useTalentFeed.ts:46`, `backend/talent/views/explorer.py:126`, `backend/talent/views/explorer.py:182`, `backend/talent/models.py:127`
- Test: Give Zoe one expired availability post, open the publish dialog and save future dates; verify the existing post is updated successfully.
- Business question: When Zoe's published availability expires and she adds new dates, what should happen?

### C051-N1 — P1 — Referee decline link routes to a 404 and invokes an obsolete two-parameter backend path instead of token verification

Zoe registers as an Explorer and provides a referee for verification. The referee receives an email request and clicks the decline link, but lands on a not-found page because the web router expects two parameters instead of the single email token. Even if reached directly, the decline page attempts to submit separate ID parameters to a non-existent API route rather than the server's signed token endpoint. The referee cannot decline, reminder emails continue to be sent to them, and Zoe is never alerted to nominate a replacement referee.

- Status: **UNVERIFIED_CANDIDATE** | Decision: **VERIFY** | Grade: S1_REPORTED
- Evidence: `frontend_web/src/pages/onboarding/RefereeRejectPage.tsx:11`, `frontend_web/src/pages/onboarding/RefereeRejectPage.tsx:22`, `backend/onboarding/emails.py:79`, `backend/onboarding/urls.py:41`
- Test: Navigating to /onboarding/referee-reject/<token> with a valid signed token renders the decline page and sends a POST with the token to /api/v1/onboarding/referee-reject/<token>/, returning 200 rather than 404.
- Business question: When Zoe's nominated referee clicks the decline link in their email request, what should happen?

### C063-N1 — P1 — Mobile chat people search never finds anyone, so New Chat, New Group and Add members do not work in the Expo app.

Tom opens New Chat on his phone and types 'Omar'. The list always says 'No users found', even though Omar is his own pharmacist. Tom also cannot start a group with Ali and Mia or add Ben to an existing group. On web the same actions work. If a row ever did match, the app would send Omar's membership id as a user id and could open a chat with the wrong person.

- Status: **UNVERIFIED_CANDIDATE** | Decision: **VERIFY** | Grade: S1_REPORTED
- Evidence: `frontend_mobile/roles/shared/chat/hooks.ts:64-73`, `shared-core/src/domains/chat/mappers.ts:53-67`, `shared-core/src/domains/chat/api.ts:147-155`, `frontend_mobile/roles/shared/chat/NewChatModal.tsx:59-61`, `frontend_mobile/roles/shared/chat/GroupManageModal.tsx:199`
- Test: Return a participant row {id:7,user_details:{first_name:'Omar'}} from fetchChatParticipants; searchParticipants('omar') must return it, and starting a chat must send membershipId 7, not userId 7.
- Business question: When Tom searches 'Omar' in mobile New Chat, what should happen?

### C064-N1 — P1 — Legacy Expo invoice generator defaults superannuation to 10% despite Australia's current 12% SG rate.

An eligible contractor or worker opens the legacy Expo invoice generator without an existing onboarding super-rate snapshot. The form starts at 10%. The app sends that percentage in the invoice payload; the legacy invoicing service trusts and persists it and calculates the generated superannuation line using that 10%. The actual 2026 standard SG rate is 12%, so a user who relies on the default may generate a short super request. This is a conditional calculation issue, not proof every contractor is SG-eligible or that every custom invoice must charge statutory SG.

- Status: **SOURCE_SUPPORTED_CONDITIONAL** | Decision: **VERIFY** | Grade: S2_SAME_ASSISTANT_SOURCE_CHALLENGE
- Evidence: `frontend_mobile/roles/shared/invoices/InvoiceGenerate.tsx:115`, `frontend_mobile/roles/shared/invoices/InvoiceGenerate.tsx:152`, `frontend_mobile/roles/shared/invoices/InvoiceGenerate.tsx:392`, `backend/invoicing/services.py:175`, `backend/invoicing/services.py:332`, `frontend_mobile/roles/shared/invoices/InvoiceList.tsx:52`
- Test: New user with no onboarding super_rate_snapshot uses legacy InvoiceGenerate for an eligible 2026 invoice; assert suggested rate is current rate 12% (or explicitly configured award/agreement rate), correctly calculates amount, and backend does not silently accept stale default. Confirm historical invoice dates, contractor eligibility, intentionally different agreed rates and legacy vs new FinanceWorkspace paths.
- Business question: Should the legacy Expo invoice generator continue pre-populating a 10% superannuation rate for 2026 invoices?

### C071-N1 — P1 — Concurrent mobile logout and in-flight refresh/profile hydration can resurrect old tokens or overwrite the newly signed-in account.

Sara opens Expo and an expired access token triggers refresh or /users/me. Sara signs out or switches to Tom before the request finishes. The older success callback unconditionally calls writeStoredSession/setUser, or a late refresh writes Sara's tokens after clearStoredSession. The old identity becomes active on the device even though the user intentionally left it.

- Status: **SOURCE_SUPPORTED** | Decision: **VERIFY** | Grade: S2_SAME_ASSISTANT_SOURCE_CHALLENGE
- Evidence: `frontend_mobile/context/AuthContext.tsx:115`, `frontend_mobile/context/AuthContext.tsx:120`, `frontend_mobile/context/AuthContext.tsx:160`, `frontend_mobile/context/AuthContext.tsx:163`, `frontend_mobile/context/AuthContext.tsx:169`, `frontend_mobile/context/AuthContext.tsx:170`, `frontend_mobile/context/AuthContext.tsx:191`, `frontend_mobile/context/AuthContext.tsx:523`, `frontend_mobile/utils/authSession.ts:198`, `frontend_mobile/utils/authSession.ts:217`, `frontend_mobile/utils/authSession.ts:227`, `frontend_mobile/utils/authSession.ts:268`
- Test: Defer initial /me success and refresh response; logout or log in as another user before resolving each. Assert no old /me user or refresh token persisted, no old API Authorization and role home remains intended. Repeat native and Expo-web cases, including refresh failures and storage/network exceptions.
- Business question: When Sara logs out while an earlier refresh/profile request is pending, may the app silently restore Sara's saved account or overwrite Tom's subsequent login?

### C071-N2 — P1 — Signing out of Expo leaves its push token registered to the prior account, so private alerts can keep arriving on a signed-out device.

Sara signs out from a shared iPhone. Native logout clears local secure tokens but never deletes/deactivates that device's push registration. The backend logout only blacklists the refresh token. Notifications notify_users still looks up every active DeviceToken for Sara and delivers future alert titles/bodies to the same phone.

- Status: **SOURCE_SUPPORTED_DUPLICATE_ROOT** | Decision: **VERIFY** | Grade: S2_SAME_ASSISTANT_SOURCE_CHALLENGE
- Evidence: `frontend_mobile/context/AuthContext.tsx:502`, `frontend_mobile/context/AuthContext.tsx:523`, `frontend_mobile/context/AuthContext.tsx:528`, `frontend_mobile/utils/pushNotifications.ts:62`, `frontend_mobile/utils/pushNotifications.ts:78`, `backend/users/api_auth.py:155`, `backend/users/api_auth.py:164`, `backend/users/api_auth.py:170`, `backend/notifications/views.py:44`, `backend/notifications/services.py:64`, `backend/notifications/services.py:87`, `backend/users/models.py:128`
- Test: Register an Expo push token while Sara is logged in. Sign out through native app. Trigger a new private message/notification for Sara; assert DeviceToken is inactive or removed and no push sent. Log in as Tom and confirm token belongs only to Tom. Server logout should revoke current device independently of client network reliability.
- Business question: Should Sara's private shift, employment and chat alerts continue displaying on a phone after she signs out?

### C079-N1 — P1 — Editing a shift replaces its saved per-date rates

Tom posts a pharmacist shift offering Sara $80 per hour for a particular date, above his $60 pharmacy guide. Later, Tom opens the shift to correct its description. The saved $80 rate is replaced by the calculated $60 guide, and saving the description also submits that lower rate.

- Status: **UNVERIFIED_CANDIDATE** | Decision: **VERIFY** | Grade: S1_REPORTED
- Evidence: `frontend_web/shared/postShift/useShiftPricing.ts:49`, `frontend_web/shared/postShift/useShiftPricing.ts:106`, `frontend_web/shared/postShift/PostShiftForm.tsx:239`, `frontend_web/shared/postShift/PostShiftForm.tsx:457`, `shared-core/src/domains/shifts/postingDraft.ts:46`
- Test: Load an existing shift with an $80 per-date override and a $60 calculated guide; change only its description and assert the submitted rate remains $80.
- Business question: When Tom edits only the description of Sara's advertised $80 shift, what should happen to its rate?

### F01-N1 — P1 — Workers browsing shifts can see the names and emails of other workers who are booked on the shift or waiting for payment.

Tom posts a public multi-day shift. Ben is confirmed for Monday and Omar has accepted Tuesday and is waiting for Tom to pay. When Sara opens the public shift list or the shift detail on web or mobile, the data sent to her phone includes Ben's and Omar's full names, emails and user numbers. This happens even when Tom posted anonymously. The anonymous public job board deliberately strips exactly these fields, but signed-in worker views do not, and neither does each worker's own offer list, which embeds the same shift data.

- Status: **UNVERIFIED_CANDIDATE** | Decision: **VERIFY** | Grade: S1_REPORTED
- Evidence: `backend/shifts/base.py:113`, `backend/shifts/browse.py:428`, `backend/shifts/lifecycle.py:393`, `backend/shifts/serialization/shifts.py:91`, `backend/shifts/serialization/shifts.py:434`, `backend/shifts/serialization/shifts.py:464`, `backend/shifts/serialization/offers.py:215`, `backend/shifts/serialization/projections.py:87`
- Test: As Sara (unrelated locum), GET /public-shifts/ and /shifts/{id}/ for a shift where Ben is assigned and Omar is awaiting payment; assert no slot_assignments or payment_options entries and no worker email appear.
- Business question: When Sara looks at Tom's shift, should she see who else is already booked or waiting for payment on it?

### F01-N2 — P1 — Editing a shift after a worker has accepted but before payment either locks the worker into new dates they never agreed to, or takes the payment without booking anyone.

Sara accepts Tom's two-day shift and is waiting for Tom to pay. Tom then edits the dates or times, and the shift's days are replaced. Sara gets a 'please review' alert, but she can no longer decline because her acceptance is past the 'pending' stage. On a whole-shift booking, Tom pays and Sara is booked onto the new days with no new confirmation. On a per-day shift, Sara's acceptance loses its day but still shows as payable: Tom pays by card, booking fails on every retry so Sara is never assigned and the charge is never recorded; if Tom pays with Pills, the Pills are spent before booking fails.

- Status: **UNVERIFIED_CANDIDATE** | Decision: **VERIFY** | Grade: S1_REPORTED
- Evidence: `backend/shifts/posting.py:157`, `backend/shifts/posting.py:188`, `backend/shifts/models.py:678`, `backend/shifts/offers.py:615`, `backend/shifts/serialization/shifts.py:464`, `backend/shifts/finalize.py:30`, `backend/billing/views.py:860`, `backend/billing/views.py:890`, `backend/rewards/views.py:217`
- Test: Create an offer in ACCEPTED_AWAITING_PAYMENT on a multi-slot shift, PATCH the shift with a new slots payload, then run the fulfilment webhook for that offer id; assert the edit is refused (or the offer is reset for re-confirmation) rather than the webhook failing or the worker being assigned.
- Business question: Tom changes the dates of a shift after Sara has accepted but before he has paid. What should happen to Sara's acceptance?

### F01-N3 — P1 — A worker or manager can silently delete a shift offer, including one that is accepted and waiting for payment, so payment can be taken with nobody booked.

The shift-offers endpoint still allows a plain delete, and neither web nor mobile uses it. Sara can delete her own accepted offer while Tom is paying at Stripe checkout. Tom's card is charged and the payment is recorded, but there is no offer left to confirm, so nobody is booked and Tom is not told. In the same way, Tom or Grace can delete Sara's accepted offer, and she is never told she lost the booking. Unlike the proper decline action, a delete sends no notice and works on accepted offers too.

- Status: **REPRODUCED_RUNTIME_DJANGO_SQLITE** | Decision: **FIX** | Grade: S3_ISOLATED_DJANGO_SQLITE
- Evidence: `backend/shifts/offers.py:156`, `backend/shifts/offers.py:162`, `backend/shifts/offers.py:610`, `backend/billing/views.py:848`, `backend/billing/views.py:864`, `shared-core/src/domains/shifts/api.ts:87`
- Test: As Sara, DELETE /shift-offers/{id}/ on her ACCEPTED_AWAITING_PAYMENT offer; assert 405/403 and that the offer still exists.
- Runtime: RED_TEST_FAILED_AS_EXPECTED (test_f01_n3_worker_cannot_delete_payment_waiting_offer) https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/actions/runs/40178675029
- Business question: Sara has accepted Tom's shift and Tom is paying. Should anyone be able to make that offer disappear without a trace?

### F02-N1 — P1 — Deleting a partly filled posting from Active Shifts silently removes the workers already booked on its other dates, with no notice, no cancellation charge and no history check.

Tom posts a Monday-to-Friday locum shift. Sara is confirmed (and paid for) on Monday and Tuesday, but Wednesday to Friday are still open, so the posting stays in Active Shifts. Tom clicks Delete. The warning only says candidates can no longer apply, but Sara's confirmed days are erased too. Nobody tells Sara, so she may still turn up or turn down other work. Tom's paid fee stays as a payment linked to no shift, and the cancellation-penalty endpoint is never called by any screen. Any leave Sara requested against those days is deleted along with them, and attendance already recorded loses its link to the booking. All of this skips the check that the AHPRA cancellation and roster-release paths run first.

- Status: **UNVERIFIED_CANDIDATE** | Decision: **VERIFY** | Grade: S1_REPORTED
- Evidence: `frontend_web/src/pages/dashboard/sidebar/ActiveShiftsPage/ActiveShiftsDialogs.tsx:29`, `frontend_web/src/pages/dashboard/sidebar/ActiveShiftsPage/hooks/useShiftActions.ts:44`, `frontend_mobile/roles/shared/shifts/ActiveShiftsPage/hooks/useShiftActions.ts:44`, `shared-core/src/domains/shifts/api.ts:121`, `backend/shifts/lifecycle.py:53`, `backend/shifts/lifecycle.py:111`, `backend/shifts/base.py:111`, `backend/shifts/models.py:465`, `backend/shifts/models.py:805`, `backend/billing/models.py:85`, `backend/billing/views.py:699`, `shared-core/src/domains/billing/api.ts:58`, `backend/shifts/history.py:7`, `backend/shifts/cancellation.py:48`
- Test: Create a two-date shift where date 1 has a paid, confirmed assignment for Sara and date 2 is open. DELETE /shifts/active/<id>/ as Tom. Assert the request is refused, or that Sara's assignment survives (or she is notified and the penalty/refund rule runs). Today the delete returns 204 and the assignment is gone.
- Business question: Tom deletes a posting where Sara is already confirmed (and paid for) on two of its five days. What should happen to Sara's days?

### F02-N2 — P1 — Cover requests from the web and mobile worker screens are never linked to the worker's assignment, so approving one never releases the worker.

Ali can't work his rostered Saturday and taps 'Request cover' on web or mobile. Both screens send only pharmacy, date, times and role, never the assignment itself. On web, Tom approves: the server sees an unlinked request and publishes a brand-new locum shift, while Ali stays rostered. Ali is emailed that his cover was approved, so Tom may end up paying a locum like Sara plus a booking fee while the roster still expects Ali (or marks him absent). On the mobile manager screen, 'Approve' with a replacement always fails with 'assignment no longer exists'. 'Release worker' marks the request approved and reports the worker as released, but changes nothing and publishes no vacancy. Neither Ali nor a replacement like Mia is notified on the mobile path.

- Status: **UNVERIFIED_CANDIDATE** | Decision: **VERIFY** | Grade: S1_REPORTED
- Evidence: `frontend_web/src/pages/dashboard/sidebar/RosterWorkerPage.tsx:532`, `frontend_mobile/app/my-roster.tsx:208`, `backend/shifts/worker_requests.py:97`, `backend/shifts/worker_requests.py:239`, `backend/shifts/worker_requests.py:254`, `backend/shifts/worker_requests.py:284`, `frontend_web/src/pages/dashboard/sidebar/RosterOwnerPage.tsx:602`, `frontend_mobile/features/parity/roster.tsx:638`, `backend/workforce/roster/worker_actions.py:275`, `backend/workforce/roster/worker_actions.py:353`, `backend/workforce/roster/v2_views.py:747`
- Test: Ali has an assignment. POST /worker-shift-requests/ with the exact web payload (no 'shift'), then approve it as Tom. Assert Ali's assignment is released and no second shift is created. Today Ali stays assigned and a new LOCUM_CASUAL shift appears.
- Business question: Ali asks for cover on a Saturday he's rostered for, and Tom approves. What should happen?

### F02-N3 — P1 — Removing or escalating an assignment from the owner roster page unbooks the worker silently, including paid marketplace bookings, and skips the attendance/leave history check.

The owner roster page lists every assignment in Tom's pharmacy, including Sara's paid marketplace booking. If Tom removes it or clicks Escalate on it, the server deletes the assignment (escalate clears every assignment on that shift) without notifying Sara and without the check the release path runs, which refuses to remove bookings with attendance or leave history. Leave Sara filed against that day is deleted along with it, and Sara only finds out when the shift disappears from her list.

- Status: **UNVERIFIED_CANDIDATE** | Decision: **VERIFY** | Grade: S1_REPORTED
- Evidence: `backend/workforce/roster/views.py:51`, `backend/workforce/roster/views.py:96`, `backend/workforce/roster/views.py:418`, `backend/workforce/roster/worker_actions.py:364`, `backend/shifts/history.py:7`, `backend/shifts/models.py:805`, `frontend_web/src/pages/dashboard/sidebar/RosterOwnerPage.tsx:401`, `frontend_web/src/pages/dashboard/sidebar/RosterOwnerPage.tsx:509`
- Test: Give Sara an assignment with a linked LeaveRequest or AttendanceSession. Call POST /roster-shifts/<shift>/escalate/ (or DELETE /roster-owner/<assignment>/) as Tom. Assert it is refused, or that Sara is notified and the history is kept. Today the assignment and its leave are deleted silently.
- Business question: Tom escalates or removes Sara's already-confirmed Saturday from the roster page. What should Sara experience?

### F03-N2 — P1 — When the owner removes a staff member who is also a pharmacy admin, their admin rights stay on, but when they quit themselves the rights are switched off.

Mia is an assistant and a Manager admin at Tom's pharmacy. Tom removes her from the staff list. Her staff membership is deleted (or switched off), but her Manager admin record stays on, now with no membership linked to it. Every admin check looks only at that record, so Mia can still manage staff, rosters and admins at the pharmacy she was removed from. If Mia had quit herself, the system would have switched her admin role off.

- Status: **UNVERIFIED_CANDIDATE** | Decision: **VERIFY** | Grade: S1_REPORTED
- Evidence: `backend/memberships/views.py:112`, `backend/memberships/views.py:129`, `backend/memberships/views.py:131`, `backend/memberships/views.py:494`, `backend/organizations/models.py:400`, `backend/organizations/access.py:33`, `backend/organizations/access.py:57`, `shared-core/src/domains/memberships/api.ts:30`
- Test: Owner sends DELETE on an admin's staff membership; afterwards that user must fail the manage-staff and manage-roster checks for the pharmacy and must be missing from the active admin list.
- Business question: Tom removes Mia, who is also a Manager admin, from his staff list. What should happen to her admin access?

### F03-N3 — P1 — Re-inviting someone who left as an admin brings back their old admin role the moment they accept a plain staff invitation.

Mia was a Manager admin and quit Tom's pharmacy, which switched her admin role off. Months later Tom re-invites her only as an assistant. The re-invite reuses her old membership, and when Mia accepts it, every admin role tied to that membership is switched back on. Mia is a Manager again even though Tom only invited her as an assistant.

- Status: **UNVERIFIED_CANDIDATE** | Decision: **VERIFY** | Grade: S1_REPORTED
- Evidence: `backend/memberships/views.py:494`, `backend/memberships/invites.py:123`, `backend/memberships/invites.py:163`, `backend/memberships/views.py:443`, `backend/memberships/views.py:447`
- Test: An admin quits; the owner re-invites them as ASSISTANT; they accept; their old admin record must stay switched off.
- Business question: Mia left as a Manager admin. Tom re-invites her as an assistant and she accepts. What access should she get?

### F03-N4 — P1 — Removing a staff member leaves all their future rostered shifts in place, so the roster looks covered and they can still clock in as rostered.

Tom removes Ali on Monday. Ali stays on next week's published roster: Tom's roster view still counts those slots as filled, so no gap or cover request shows up. Ali's own roster still lists the shifts, and if he turns up at the kiosk he is clocked in as normally rostered, not flagged for review, so the hours flow into his timesheet. New roster edits would refuse Ali because he has no active membership, but shifts already on the roster are never checked again.

- Status: **UNVERIFIED_CANDIDATE** | Decision: **VERIFY** | Grade: S1_REPORTED
- Evidence: `backend/memberships/views.py:112`, `backend/memberships/views.py:494`, `backend/workforce/roster/periods.py:129`, `backend/workforce/roster/periods.py:135`, `backend/workforce/roster/views.py:552`, `backend/attendance/eligibility.py:141`, `backend/attendance/eligibility.py:241`, `backend/workforce/roster/validation.py:31`
- Test: Owner removes a staff member who has a published future roster assignment; afterwards that slot must show as vacant (or flagged) in the owner's roster, and a clock-in by the removed worker at shift time must not come back as a confirmed assignment.
- Business question: Tom removes Ali, who is rostered for three shifts next week. What should happen to those shifts?

### F04-N3 — P1 — A pharmacy manager can silently make any registered person an active staff member, with no invitation, email or consent.

Tom invites Sara by email with the hidden 'activate immediately' flag (meant for approving her own application). Sara becomes an accepted, active member of Tom's pharmacy straight away and gets no email or notice. She is now on Tom's team for rosters, chat and hub, and it uses one of her three pharmacy places, so a genuine pharmacy may be unable to add her. Tom can do the same by editing a pending invite's status to accepted. This is the pharmacy-staff version of B47, through a different endpoint and with no notice at all.

- Status: **UNVERIFIED_CANDIDATE** | Decision: **VERIFY** | Grade: S1_REPORTED
- Evidence: `backend/memberships/views.py:142`, `backend/memberships/invites.py:149`, `backend/memberships/invites.py:240`, `backend/memberships/applications.py:121`, `backend/memberships/serializers.py:67`, `backend/memberships/views.py:84`, `backend/memberships/test_membership_workflows_contract.py:116`
- Test: Tom POSTs /api/v1/memberships/ with Sara's email and activate_immediately=true (and separately PATCHes Sara's pending invite to status ACCEPTED); Sara's membership must stay PENDING until she accepts it from My Memberships.
- Business question: Tom adds Sara, who already has an account, to his pharmacy. Should she join straight away?

### F05-N1 — P1 — A New to pharmacy account can apply for public shifts without ever being verified, though the same profile is blocked from posting on the talent hub.

Zoe signs up as New to pharmacy from overseas and skips the mobile check. Her photo ID has not been checked, and she could be as young as 15. She opens Public Shifts and expresses interest in Tom's public New to pharmacy shift, and it goes through. The verification rules say being Verified is the gate for applying to public shifts, but the apply check only looks at pharmacists and pharmacy team accounts and skips New to pharmacy completely. The talent hub does block Zoe until she is verified, so the two parts of the app disagree, and Tom gets interest from an unverified and possibly under-age person.

- Status: **UNVERIFIED_CANDIDATE** | Decision: **VERIFY** | Grade: S1_REPORTED
- Evidence: `backend/shifts/interest.py:40-72`, `backend/shifts/interest.py:82-84`, `backend/onboarding/verification/state.py:153-178`, `backend/onboarding/verification/policy.py:3-5`, `backend/onboarding/verification/policy.py:44-57`, `backend/talent/views/explorer.py:147-151`, `backend/shifts/access.py:86-87`, `frontend_web/src/navigation.tsx:522-530`
- Test: An EXPLORER user with an unverified ExplorerOnboarding (verified=False, mobile_check_skipped=True, gov_id_verified=False) posts express_interest on a PLATFORM shift with role_needed=EXPLORER and gets 403, not 201.
- Business question: Zoe is New to pharmacy, skipped the mobile check from overseas and has no checked photo ID. She tries to apply for Tom's public New to pharmacy shift. What should happen?

### F05-N2 — P1 — A New to pharmacy person who is offered a shift can never confirm it, because the confirm step looks for a pharmacy team profile they cannot have.

Tom sees Zoe's interest in his public New to pharmacy shift, or books her from the Talent Board, and sends her an offer. Zoe gets the offer email and notification and presses Confirm. Every time she is told to 'complete worker onboarding'. The payment and engagement check only reads a pharmacist or pharmacy team profile, and the New to pharmacy profile has no payment settings at all. Her offer sits until it expires after 48 hours, so Tom's slot stays unfilled and he never learns why.

- Status: **UNVERIFIED_CANDIDATE** | Decision: **VERIFY** | Grade: S1_REPORTED
- Evidence: `backend/shifts/engagement.py:25-28`, `backend/shifts/engagement.py:245-251`, `backend/shifts/engagement.py:580`, `backend/shifts/offers.py:354-363`, `backend/shifts/assignment.py:95-126`, `backend/onboarding/models.py:541-624`, `shared-core/src/domains/talent/presentation.test.ts:10`
- Test: Tom accept_users Zoe (EXPLORER, verified ExplorerOnboarding, no OtherStaffOnboarding) on an EXPLORER-role shift; Zoe POSTs the offer accept and must not get the 400 'Complete worker onboarding' error (or Tom must be stopped from sending the offer in the first place).
- Business question: Tom wants to book Zoe, who is New to pharmacy, for a New to pharmacy shift. What should happen when he sends her the offer?

### F05-N3 — P1 — Nothing checks that the person confirming an offer holds the role the shift needs, so a technician or intern can be booked into a pharmacist shift.

Tom sends an offer for his public pharmacist shift to Ali (technician) or Jack (intern), for example by picking the wrong person or calling the app directly. Ali confirms, and the check only asks whether Ali's own technician profile is verified. Ali has no AHPRA number, so the AHPRA check reads as 'pending' and lets him through. Ali is now rostered and paid as the pharmacist on duty. The role match exists for browsing, applying and instant claims, but not for sending an offer, confirming it or finalising it.

- Status: **UNVERIFIED_CANDIDATE** | Decision: **VERIFY** | Grade: S1_REPORTED
- Evidence: `backend/shifts/base.py:232-259`, `backend/shifts/assignment.py:25-131`, `backend/shifts/offers.py:329-405`, `backend/onboarding/verification/state.py:153-167`, `backend/onboarding/verification/state.py:58-61`, `backend/shifts/finalize.py:23-73`, `backend/shifts/engagement.py:528-537`, `backend/shifts/browse.py:329-334`
- Test: Tom accept_users Ali (OTHER_STAFF, role_type TECHNICIAN, verified, no AHPRA) on a PLATFORM shift with role_needed=PHARMACIST; Ali's offer accept must be refused, and no ShiftSlotAssignment may be created.
- Business question: Tom sends an offer for a pharmacist shift to Ali, who is a technician, and Ali presses Confirm. What should happen?

### F06-N1 — P1 — Locking a period always produces an empty payroll handoff.

Tom enables payroll, publishes Omar's payroll shifts and approves Omar's recorded hours. Tom locks the period successfully from web or mobile, but the saved payroll handoff contains no workers or shifts. The approved hours remain visible in timesheets while the payroll handoff silently omits Omar.

- Status: **UNVERIFIED_CANDIDATE** | Decision: **VERIFY** | Grade: S1_REPORTED
- Evidence: `backend/shifts/engagement.py:125`, `backend/workforce/timesheet_data.py:172`, `backend/workforce/timesheet_builder.py:183`, `backend/workforce/timesheet_builder.py:207`, `backend/workforce/timesheet_transitions.py:147`, `backend/workforce/timesheet_transitions.py:182`, `backend/workforce/views.py:744`
- Test: With payroll enabled and Omar's completed published assignment routed to PAYROLL, build and approve his timesheet, then lock the period; assert that payroll_export contains Omar's assignment and worked day rather than an empty list.
- Business question: When Tom locks approved payroll hours for Omar, what should happen if the payroll handoff would omit Omar?

### F06-N2 — P1 — Rejecting provisional attendance permanently blocks the whole timesheet period.

Omar clocks in without a rostered shift, clocks out, and Tom rejects those hours with a reason. The rejected attendance disappears from Tom's pending reviews but continues to block Omar's timesheet. Tom cannot waive the blocker or approve the rejected attendance, so he cannot lock the period for any staff.

- Status: **UNVERIFIED_CANDIDATE** | Decision: **VERIFY** | Grade: S1_REPORTED
- Evidence: `backend/attendance/approvals.py:53`, `backend/attendance/approvals.py:157`, `backend/attendance/approvals.py:274`, `backend/workforce/timesheet_data.py:241`, `backend/workforce/timesheet_transitions.py:67`, `backend/workforce/timesheet_transitions.py:103`, `backend/workforce/timesheet_transitions.py:139`
- Test: Reject Omar's closed provisional attendance, rebuild his timesheet and attempt period locking after all payable hours are approved; assert that the rejected evidence does not leave an unresolvable approval blocker.
- Business question: After Tom rejects Omar's unrostered attendance, how should Tom finish that pay period?

### F06-N3 — P1 — Clock corrections across pay-period boundaries can drop worked minutes.

Omar's recorded clock-out is Sunday at 23:50, and Tom corrects it to Monday at 00:10 after confirming when Omar actually finished. Sunday's period counts only up to midnight, but Monday's period still treats Omar's session as having ended on Sunday. Even recalculating both periods loses the ten minutes Omar worked on Monday.

- Status: **UNVERIFIED_CANDIDATE** | Decision: **VERIFY** | Grade: S1_REPORTED
- Evidence: `backend/attendance/approvals.py:383`, `backend/workforce/timesheet_data.py:206`, `backend/workforce/timesheet_data.py:211`, `backend/workforce/timesheet_data.py:223`, `backend/workforce/timesheet_data.py:258`, `backend/workforce/signals.py:61`, `backend/workforce/timesheet_core.py:21`
- Test: Correct Omar's Sunday 23:50 clock-out to Monday 00:10 across adjacent periods, rebuild both periods and assert that their combined worked minutes retain the full corrected duration, including Monday's ten minutes.
- Root group: C028-N4 (RELATED_ROOT)
- Business question: When Tom corrects Omar's finish across midnight into another pay period, where should those extra ten minutes go?

### F07-N1 — P1 — Both invoice editors block saving an invoice prefilled from an accepted shift.

Sara chooses her accepted shift at Tom's pharmacy and the invoice fills in Tom's pharmacy details. Pressing Save tells her to select a customer, but the customer selector is disabled. This happens on both web and mobile, preventing Sara from creating the internal invoice through the intended flow.

- Status: **SOURCE_SUPPORTED** | Decision: **VERIFY** | Grade: S2_SAME_ASSISTANT_SOURCE_CHALLENGE
- Evidence: `backend/worker_finance/services.py:362`, `frontend_web/src/pages/finance/InvoiceComposer.tsx:103`, `frontend_web/src/pages/finance/InvoiceComposer.tsx:130`, `frontend_web/src/pages/finance/InvoiceComposer.tsx:187`, `frontend_mobile/roles/shared/invoices/FinanceInvoiceEditor.tsx:199`, `frontend_mobile/roles/shared/invoices/FinanceInvoiceEditor.tsx:229`
- Test: Choose an eligible accepted shift in each editor and save without manually selecting a customer; assert that an internal invoice is created for the shift's pharmacy.
- Business question: When Sara starts an invoice from her accepted shift at Tom's pharmacy, should she be able to save with the pharmacy already selected?

### F07-N2 — P1 — Marking an invoice paid leaves its balance and cash worksheet unchanged.

Tom pays Sara's $1,100 invoice, and Sara uses Mark as paid as instructed once the full amount arrives. The invoice says Paid, but still shows $1,100 outstanding and zero received; her cash worksheet also includes none of that payment or its GST. Tom's own Mark paid action creates the same discrepancy for Sara.

- Status: **UNVERIFIED_CANDIDATE** | Decision: **VERIFY** | Grade: S1_REPORTED
- Evidence: `frontend_web/src/pages/finance/FinanceWorkspace.tsx:354`, `backend/worker_finance/views.py:243`, `backend/worker_finance/views.py:498`, `backend/worker_finance/services.py:835`, `backend/worker_finance/views.py:634`, `frontend_web/src/pages/dashboard/sidebar/Invoices/invoiceStats.ts:101`
- Test: Mark an unpaid $1,100 GST invoice paid through each persona's action and assert that the balance becomes zero and the confirmed receipt appears in the appropriate cash worksheet period.
- Business question: When Sara confirms Tom's full payment using Mark as paid, how should her balance and cash worksheet change?

### F07-N3 — P1 — Saving an invoice revision removes its recorded receipts from the cash worksheet.

Sara sends Tom an invoice and records a partial payment that appears correctly in her cash worksheet. She then corrects only the invoice notes and saves without sending the replacement yet. The payment and its GST disappear from the same worksheet period even though Sara still has the money and the payment history remains.

- Status: **UNVERIFIED_CANDIDATE** | Decision: **VERIFY** | Grade: S1_REPORTED
- Evidence: `backend/worker_finance/services.py:693`, `backend/worker_finance/services.py:702`, `backend/worker_finance/services.py:982`, `backend/worker_finance/views.py:626`, `backend/worker_finance/views.py:634`
- Test: Record a partial payment against a sent invoice, save a notes-only revision without resending, and assert that the cash worksheet's sales and GST totals remain unchanged.
- Business question: Should Sara's receipt from Tom remain in her cash worksheet while she prepares an unsent invoice correction?

### F07-N4 — P1 — Finishing an older invoice email can publish a newer unsent revision.

Sara sends an invoice to Tom and, while the email is still being processed, saves a correction from another device. When the first email finishes, the corrected invoice is marked Sent even though the email contained the older version. Tom can then see and approve the unsent correction while holding a different invoice in his email.

- Status: **UNVERIFIED_CANDIDATE** | Decision: **VERIFY** | Grade: S1_REPORTED
- Evidence: `backend/worker_finance/views.py:272`, `backend/worker_finance/views.py:294`, `backend/worker_finance/views.py:315`, `backend/worker_finance/services.py:693`, `backend/worker_finance/services.py:770`
- Test: Pause email sending for version 1, save version 2, then finish the email; assert that version 2 remains draft and Tom can access only delivered version 1.
- Business question: If Sara saves a correction while an older invoice email to Tom is sending, which version should Tom be allowed to review?

### F07-N6 — P1 — A separate super request cannot be corrected when its service invoice changes.

Sara creates a separate $120 super request for an invoice to Tom. She later corrects the work amount, making the invoice's super contribution $180, but the separate request remains $120. Sara cannot revise that request or create a replacement through the available actions, leaving Tom with conflicting contribution amounts.

- Status: **UNVERIFIED_CANDIDATE** | Decision: **VERIFY** | Grade: S1_REPORTED
- Evidence: `backend/worker_finance/services.py:606`, `backend/worker_finance/services.py:691`, `backend/worker_finance/services.py:894`, `backend/worker_finance/services.py:902`, `frontend_web/src/pages/finance/FinanceWorkspace.tsx:356`, `frontend_mobile/roles/shared/invoices/FinanceWorkspace.tsx:159`
- Test: Create a separate super request, revise the parent invoice's eligible amount, and assert that an explicit supported correction produces a matching contribution request rather than permanently returning the old amount.
- Business question: When Sara corrects an invoice to Tom after creating its separate super request, what should happen to that request?

### F08-N1 — P1 — Repeating subscription setup can create multiple recurring charges for the same plan.

Tom chooses invoice payment for his subscription, then repeats setup while the first invoice is unpaid. Each attempt creates another recurring Stripe subscription, while the app replaces the previous subscription reference and still presents one plan. Tom can receive multiple recurring bills for the same service.

- Status: **UNVERIFIED_CANDIDATE** | Decision: **VERIFY** | Grade: S1_REPORTED
- Evidence: `frontend_web/src/pages/dashboard/sidebar/owner/OwnerBillingPage.tsx:150`, `backend/billing/views.py:388`, `backend/billing/views.py:416`, `backend/billing/views.py:429`, `backend/billing/views.py:431`, `backend/billing/models.py:36`
- Test: Submit invoice subscription setup twice before paying the first invoice and assert that the second request cannot create another recurring Stripe subscription.
- Root group: B70 (RELATED_ROOT)
- Business question: When Tom repeats subscription setup before paying his first invoice, what should happen?

### F08-N2 — P1 — Subscriptions remain active after Stripe marks them unpaid.

Tom's subscription renewal fails and Stripe eventually marks the subscription unpaid. The app ignores both the failed-payment notice and the subscription status change, so web and mobile continue showing Tom an active subscription without a payment problem. The local subscription remains active unless a separate cancellation event arrives.

- Status: **REPRODUCED_RUNTIME_DJANGO_SQLITE** | Decision: **FIX** | Grade: S3_ISOLATED_DJANGO_SQLITE
- Evidence: `backend/billing/views.py:897`, `backend/billing/views.py:926`, `backend/billing/views.py:944`, `backend/billing/views.py:249`, `frontend_web/src/pages/dashboard/sidebar/owner/OwnerBillingPage.tsx:107`, `frontend_mobile/roles/owner/subscription-seats.tsx:44`
- Test: After an active subscription's paid period expires, deliver invoice.payment_failed followed by customer.subscription.updated with status unpaid and assert that the subscription response no longer reports active.
- Runtime: RED_TEST_FAILED_AS_EXPECTED (test_f08_n2_unpaid_stripe_status_must_deactivate_entitlement) https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/actions/runs/40178675029
- Root group: B68 (RELATED_ROOT)
- Business question: After Tom exhausts any payment grace period and Stripe marks his subscription unpaid, what should the app show?

### F08-N3 — P1 — An open checkout can charge Tom after its shift has been deleted.

Tom opens checkout to confirm Sara, then deletes the still-unpaid shift from his phone before completing payment in the browser. The open checkout remains payable, so Stripe can take Tom's money after the shift and Sara's offer have disappeared. The payment callback cannot save a payment linked to the deleted shift, leaving Tom charged without a recorded payment or confirmed booking.

- Status: **SOURCE_SUPPORTED** | Decision: **VERIFY** | Grade: S2_SAME_ASSISTANT_SOURCE_CHALLENGE
- Evidence: `frontend_mobile/roles/shared/shifts/ActiveShiftsPage/hooks/useShiftActions.ts:44`, `shared-core/src/domains/shifts/api.ts:121`, `backend/shifts/base.py:111`, `backend/shifts/lifecycle.py:50`, `backend/billing/views.py:689`, `backend/billing/views.py:848`, `backend/billing/models.py:85`, `backend/billing/views.py:1011`
- Test: Create checkout for Sara's pending offer, delete the shift, then deliver the paid checkout event and assert that the charge is reconciled or refunded rather than failing permanently against the missing shift.
- Root group: F02-N1 (RELATED_ROOT)
- Business question: If Tom deletes Sara's shift while its checkout is open, what should happen to a payment completed afterward?

### F08-N4 — P1 — Staff can join beyond the purchased seat count without an additional charge.

Tom has used all five included internal staff seats at one pharmacy and invites Nadia from his other pharmacy to join it too. Nadia can accept and become active without Tom purchasing another seat or receiving an additional seat charge. The membership checks limit how many pharmacies Nadia joins, but never compare Tom's staff total with his purchased seats.

- Status: **UNVERIFIED_CANDIDATE** | Decision: **VERIFY** | Grade: S1_REPORTED
- Evidence: `frontend_web/src/pages/PricingPage.tsx:259`, `frontend_mobile/roles/shared/pharmacies/StaffManager.tsx:440`, `shared-core/src/domains/memberships/api.ts:24`, `backend/memberships/invites.py:117`, `backend/memberships/invites.py:168`, `backend/memberships/serializers.py:133`, `backend/memberships/views.py:437`, `backend/memberships/views.py:443`, `backend/billing/views.py:826`
- Test: Give Tom five purchased seats and five active internal staff at one pharmacy, then accept Nadia's sixth internal membership and assert that activation requires another paid seat or creates the corresponding charge.
- Business question: When Nadia would become Tom's sixth internal staff member at a pharmacy with five paid seats, what should happen?

### F08-N5 — P1 — Deleting Tom's account leaves his recurring Stripe charges running.

Tom has an active subscription and extra seats, then deletes his account through the app. The app confirms deletion, disables his login and signs him out, but neither recurring Stripe subscription is cancelled or scheduled to stop. Tom can continue being billed after losing access to the account and its billing screen.

- Status: **REPRODUCED_RUNTIME_DJANGO_SQLITE** | Decision: **FIX** | Grade: S3_ISOLATED_DJANGO_SQLITE
- Evidence: `frontend_mobile/roles/owner/profile.tsx:393`, `shared-core/src/domains/auth/api.ts:53`, `backend/core/api_v1_urls.py:30`, `backend/users/api_account.py:76`, `backend/users/account_deletion.py:92`, `backend/billing/views.py:440`, `backend/billing/views.py:522`, `backend/templates/emails/account_deleted.txt:6`
- Test: Delete Tom's account with active base and seat subscriptions and assert that both recurring charges are stopped or that deletion is refused until billing is resolved.
- Runtime: RED_TEST_FAILED_AS_EXPECTED (test_f08_n5_owner_delete_does_not_leave_active_recurring_billing) https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/actions/runs/40178675029
- Business question: When Tom deletes his account while paying for a subscription and extra seats, what should happen to future charges?

### F09-N1 — P1 — Deleting a restricted Hub group exposes its posts to the whole pharmacy.

Tom and Omar share confidential posts and attachments in a restricted Hub group that Mia cannot access. When Tom deletes the group, its posts remain and appear in the pharmacy-wide feed. Mia can now read those posts, their comments and their attachments.

- Status: **REPRODUCED_RUNTIME_DJANGO_SQLITE** | Decision: **FIX** | Grade: S3_ISOLATED_DJANGO_SQLITE
- Evidence: `frontend_web/src/pages/dashboard/sidebar/hub/HubPage.tsx:421`, `backend/pharmacy_hub/groups.py:147`, `backend/pharmacy_hub/models.py:143`, `backend/pharmacy_hub/scoping.py:156`, `backend/pharmacy_hub/serialization/posts.py:366`
- Test: Delete Tom's restricted group containing a post, comment and attachment, then fetch the pharmacy feed as Mia, who was never a group member; verify none of that content becomes accessible.
- Runtime: RED_TEST_FAILED_AS_EXPECTED (test_f09_group_delete_must_not_promote_restricted_post_to_pharmacy_feed) https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/actions/runs/40174286021
- Business question: After Tom deletes a restricted Hub group, what should happen to Omar's confidential posts and attachments?

### F09-N2 — P1 — Removed Hub group members still receive new private comment text.

Omar writes a post in a restricted Hub group, then Tom removes Omar from that group while keeping him employed. Mia subsequently adds a confidential comment to Omar's old post. Omar still receives up to 280 characters of the new comment through notifications and push, even though he can no longer open the group.

- Status: **UNVERIFIED_CANDIDATE** | Decision: **VERIFY** | Grade: S1_REPORTED
- Evidence: `backend/pharmacy_hub/serialization/groups.py:189`, `backend/pharmacy_hub/access.py:271`, `backend/pharmacy_hub/posts.py:440`, `backend/pharmacy_hub/notifications.py:50`, `backend/notifications/services.py:88`
- Test: Remove Omar from a restricted group, confirm his post access is denied, then add Mia's comment to his old post and verify no notification or push containing that comment is delivered to Omar.
- Business question: After Tom removes Omar from a restricted Hub group, should Omar receive new comments on posts he previously wrote there?

### F09-N3 — P1 — Mobile sign-out leaves private message previews enabled on the signed-out device.

Sara signs out of ChemistTasker on a borrowed phone and returns it to Mia. Tom later sends Sara a private chat message. The phone remains registered for Sara's push notifications, so Mia can see Tom's name and the message preview without signing into Sara's account.

- Status: **ROOT_ALIAS** | Decision: **DEDUP** | Grade: S1_REPORTED
- Evidence: `frontend_mobile/context/AuthContext.tsx:216`, `frontend_mobile/context/AuthContext.tsx:502`, `backend/users/api_auth.py:155`, `backend/notifications/services.py:90`, `backend/chat/signals.py:110`
- Test: Register Sara's phone for push, complete a successful mobile logout and close all sockets, then send Sara a new chat message from Tom; verify the signed-out device receives no push.
- Root group: C071-N2 (ALIAS_ROOT)
- Business question: After Sara signs out of the borrowed phone, what should Mia be able to receive on that phone?

### F09-N4 — P1 — Users without pharmacy memberships can overwrite or delete each other's Hub polls.

Sara creates a public Hub poll while she has no pharmacy membership, and Zoe also has no pharmacy membership. Zoe can replace Sara's question and choices or delete the poll despite having no management rights. Replacing the choices also erases the votes already cast.

- Status: **REPRODUCED_RUNTIME_DJANGO_SQLITE** | Decision: **FIX** | Grade: S3_ISOLATED_DJANGO_SQLITE
- Evidence: `backend/pharmacy_hub/access.py:338`, `backend/pharmacy_hub/serialization/polls.py:119`, `backend/pharmacy_hub/polls.py:137`, `backend/pharmacy_hub/polls.py:157`, `backend/pharmacy_hub/serialization/polls.py:149`, `backend/pharmacy_hub/serialization/polls.py:257`
- Test: Create Sara's public Hub poll with no author membership and existing votes, then PATCH its choices as Zoe without a membership; expect 403 and unchanged choices and votes.
- Runtime: RED_TEST_FAILED_AS_EXPECTED (test_f09_n4_unrelated_verified_user_cannot_patch_other_public_poll) https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/actions/runs/40176725005; RED_TEST_FAILED_AS_EXPECTED (test_f09_n4_unrelated_user_cannot_delete_other_public_poll) https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/actions/runs/40176725005
- Business question: Should Zoe be allowed to change or delete Sara's public Hub poll when neither belongs to a pharmacy?

### F10-N1 — P1 — Any signed-in account can identify authors of anonymous talent posts.

Sara publishes anonymous availability, and the public board hides her identity. Zoe signs in and can obtain Sara's full name and account identifiers from the signed-in talent feed without any hiring relationship, verification or permission to reveal Sara. The same post number connects Sara's identity to her anonymous public availability.

- Status: **UNVERIFIED_CANDIDATE** | Decision: **VERIFY** | Grade: S1_REPORTED
- Evidence: `frontend_web/src/pages/dashboard/sidebar/TalentBoard/index.tsx:722`, `frontend_mobile/roles/shared/talent-board/hooks/useTalentFeed.ts:45`, `shared-core/src/domains/talent/api.ts:43`, `backend/talent/views/explorer.py:97`, `backend/talent/views/explorer.py:184`, `backend/talent/serializers/explorer.py:79`, `backend/talent/serializers/explorer.py:83`, `backend/talent/serializers/explorer.py:190`
- Test: As unrelated, unverified Zoe, request the authenticated feed containing Sara's anonymous post and assert that Sara's name and identity links remain withheld.
- Business question: When Sara publishes anonymously, when should Zoe or Tom be allowed to learn her identity?

### F10-N2 — P1 — Public search can identify pharmacies behind anonymous vacancies.

Tom publishes a vacancy anonymously. Zoe searches the public job board using a distinctive part of Tom's pharmacy name or exact street address, and Tom's anonymous vacancy matches that hidden information. By comparing the vacancy across searches, Zoe can identify the pharmacy without signing in.

- Status: **UNVERIFIED_CANDIDATE** | Decision: **VERIFY** | Grade: S1_REPORTED
- Evidence: `frontend_web/landing_next/migrated/pages/PublicJobBoardPage.tsx:193`, `frontend_web/landing_next/migrated/pages/PublicJobBoardPage.tsx:214`, `shared-core/src/domains/shifts/api.ts:218`, `backend/shifts/browse.py:537`, `backend/shifts/browse.py:589`, `backend/shifts/serialization/shifts.py:193`, `backend/organizations/serializers.py:56`
- Test: Create Tom's anonymous vacancy with a unique pharmacy name and street address; assert that unauthenticated searches matching only those hidden fields do not return it.
- Business question: Should Zoe be able to discover Tom's anonymous vacancy by searching for its hidden pharmacy name or street address?

### F10-N3 — P1 — Concurrent claims can award multiple rewards for the same referral.

Verified Sara sends her first claim for Tom's friend-referral code twice at the same time. Both claims can create a separate referral and award Tom 100 Pills, giving him 200 Pills for referring one person. Tom can spend the duplicated credit on a shift payment.

- Status: **UNVERIFIED_CANDIDATE** | Decision: **VERIFY** | Grade: S1_REPORTED
- Evidence: `shared-core/src/domains/rewards/api.ts:36`, `backend/rewards/views.py:139`, `backend/rewards/services.py:297`, `backend/rewards/services.py:333`, `backend/rewards/services.py:188`, `backend/rewards/models.py:119`, `backend/rewards/services.py:356`
- Test: Submit two concurrent first claims by eligible Sara for Tom's same friend-referral code and assert exactly one referral event and one 100-Pill award.
- Business question: If Sara's first claim reaches the service twice simultaneously, how many referral rewards should Tom receive?

### F10-N4 — P1 — Bulk ethical reads bypass the viewer's approved medicine schedules.

Tom delegates inventory and listing access to Omar, whose reviewed professional access covers S4 medicines only. Omar opens the inventory or owned-listings screen and receives S8 stock or listing details too, including quantities and prices where present. Individual product checks would reject that S8 access, but these bulk screens omit them.

- Status: **UNVERIFIED_CANDIDATE** | Decision: **VERIFY** | Grade: S1_REPORTED
- Evidence: `frontend_mobile/features/parity/ethicalMarketplace.tsx:26`, `frontend_web/landing_next/features/marketplace/ethical-workspace-v2.tsx:50`, `shared-core/src/platformApi.ts:150`, `backend/ethical_marketplace/views.py:163`, `backend/ethical_marketplace/views.py:228`, `backend/ethical_marketplace/owner_views.py:36`, `backend/ethical_marketplace/policy.py:50`, `backend/ethical_marketplace/serializers.py:38`
- Test: Give Omar valid pharmacy grants but professional approval for S4 only, seed S4 and S8 stock and listings, and assert that bulk inventory and owned-listing responses exclude S8 records.
- Business question: When Omar is approved for S4 medicines only, what should he see of Tom's S8 stock?

### F10-N5 — P1 — Valid premises applications fail after saving because the response uses an undefined variable.

Tom submits a valid premises application from the website or mobile app. The application is saved for review, but the app receives a server error instead of confirmation. Every valid submission reaches this failure, so Tom cannot tell whether his application succeeded and is encouraged to retry.

- Status: **REPRODUCED_RUNTIME_DJANGO_SQLITE** | Decision: **FIX** | Grade: S3_ISOLATED_DJANGO_SQLITE
- Evidence: `frontend_web/landing_next/features/marketplace/ethical-workspace-v2.tsx:143`, `frontend_mobile/features/parity/ethicalMarketplace.tsx:54`, `shared-core/src/platformApi.ts:141`, `backend/ethical_marketplace/views.py:100`, `backend/ethical_marketplace/views.py:102`, `backend/ethical_marketplace/views.py:113`, `backend/ethical_marketplace/views.py:121`
- Test: Submit Tom's first valid premises application and assert a successful creation response containing the saved pending-review application instead of a server error.
- Runtime: RED_TEST_FAILED_AS_EXPECTED (test_f10_approval_valid_post_returns_201) https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/actions/runs/40169055953
- Business question: What should Tom see after his valid premises application has been saved?

### F10-N6 — P1 — Ethical offers disclose full stock-lot records to viewers without inventory access.

Tom publishes an offer for two packs from the pharmacy where Nadia works to his pharmacy chain. Omar has permission to browse chain offers through Tom's first pharmacy but cannot open Nadia's pharmacy inventory. Viewing the offer nevertheless reveals the lot's entire on-hand and reserved quantities, storage checks and source reference, beyond the two packs offered.

- Status: **UNVERIFIED_CANDIDATE** | Decision: **VERIFY** | Grade: S1_REPORTED
- Evidence: `backend/ethical_marketplace/policy.py:94`, `backend/ethical_marketplace/policy.py:100`, `backend/ethical_marketplace/views.py:229`, `backend/ethical_marketplace/views.py:286`, `backend/ethical_marketplace/views.py:288`, `backend/ethical_marketplace/serializers.py:38`, `backend/ethical_marketplace/serializers.py:47`, `backend/ethical_marketplace/serializers.py:56`
- Test: As browse-only Omar, confirm that Nadia's pharmacy inventory request is denied, then retrieve its visible two-pack offer and assert that full lot balances, storage checks and source references are absent.
- Business question: When Omar may browse Tom's chain offer but cannot access Nadia's pharmacy inventory, how much stock information should he receive?

### F11-N1 — P1 — Changing a pending phone number leaves the previous number's verification code usable.

Zoe requests a verification code on her own phone, then saves Tom's number in her profile before entering that code. The app accepts Zoe's code and marks Tom's number as verified on Zoe's account, although Tom never received or approved a verification request.

- Status: **UNVERIFIED_CANDIDATE** | Decision: **VERIFY** | Grade: S1_REPORTED
- Evidence: `backend/onboarding/views.py:293`, `backend/onboarding/serializers.py:825`, `backend/onboarding/services/basic.py:159`, `backend/core/serializer_lifecycle.py:129`, `backend/users/api_otp.py:463`, `backend/onboarding/verification/policy.py:57`
- Test: Issue a phone code for Zoe's number, change her phone through the onboarding update to Tom's number, then submit the original code and assert that Tom's number remains unverified.
- Business question: When Zoe changes her phone number while a verification code is pending, what should happen to the old code?

### F11-N2 — P1 — Signing out of Expo leaves private push notifications active on that device.

Sara signs out of the mobile app and hands the phone to Omar. When Tom subsequently sends Sara a private chat message, that phone still receives Sara's notification with Tom's name and a preview of the message. This continues after the app closes because signing out leaves the phone registered for Sara's notifications.

- Status: **ROOT_ALIAS** | Decision: **DEDUP** | Grade: S1_REPORTED
- Evidence: `frontend_mobile/context/AuthContext.tsx:220`, `frontend_mobile/context/AuthContext.tsx:502`, `backend/users/api_auth.py:159`, `backend/notifications/services.py:91`, `backend/chat/signals.py:110`
- Test: Register a push token for Sara, successfully log her out, send her a private message from Tom, and assert that the logged-out device token receives no push.
- Root group: C071-N2 (ALIAS_ROOT)
- Business question: After Sara signs out of a phone, should that phone still display previews of her private messages from Tom?

### F11-N3 — P1 — Phone verification replaces a browser-only session with a persistent 90-day session.

Sara signs in on Tom's shared computer with 'Keep me signed in' unchecked, then completes her first phone verification. Verification silently changes her login into one that persists after the browser closes. Tom can subsequently reopen the browser into Sara's account without her password.

- Status: **UNVERIFIED_CANDIDATE** | Decision: **VERIFY** | Grade: S1_REPORTED
- Evidence: `frontend_web/src/pages/login.tsx:59`, `frontend_web/src/pages/MobileOTPVerify.tsx:79`, `backend/users/serializers.py:365`, `backend/users/api_otp.py:477`, `backend/users/api_otp.py:489`, `backend/users/sessions.py:43`, `backend/core/settings.py:495`
- Test: Log Sara in with remember_me=false, complete phone verification, and assert that the replacement auth cookies remain session cookies rather than gaining a persistent expiry.
- Business question: When Sara completes phone verification after declining 'Keep me signed in', how should her login behave on Tom's computer?

### C001-N1 — P2 — Manager break corrections are wrongly refused when a session has more than one break.

Omar takes a tea break from 10:00 to 10:10 and a lunch break from 13:00 to 13:30. Tom tries to correct the lunch start to 13:05, but the system refuses because 13:05 is after the end of the tea break. Correcting the tea break's end to 10:12 is also refused because it is before the lunch start. Tom cannot fix break times, so Omar's paid minutes stay wrong.

- Status: **UNVERIFIED_CANDIDATE** | Decision: **VERIFY** | Grade: S1_REPORTED
- Evidence: `backend/attendance/approvals.py:358`, `backend/attendance/approvals.py:363`, `backend/attendance/approvals.py:370`, `backend/attendance/approvals.py:371`, `backend/attendance/views.py:228`
- Test: A session with two break pairs: correcting the second BREAK_START to a time inside the second break succeeds.
- Business question: Omar took a tea break and a lunch break. Tom needs to move the lunch start by five minutes. What should happen?

### C001-N2 — P2 — Anyone at the counter kiosk can start or end a break for a locum or cross-site worker without any PIN.

Sara, a locum with a confirmed shift, clocks in by phone QR and has no membership PIN at Tom's pharmacy. The kiosk staff list shows her worker ID, and anyone at the counter (for example Mia) can tap break start for Sara with no PIN asked. Sara's unpaid break time begins without her knowing. Nadia, covering from Tom's other pharmacy, has the same problem because only a local membership PIN is checked.

- Status: **UNVERIFIED_CANDIDATE** | Decision: **VERIFY** | Grade: S1_REPORTED
- Evidence: `backend/attendance/kiosk_api.py:765`, `backend/attendance/kiosk_api.py:772`, `backend/attendance/kiosk_api.py:774`, `backend/attendance/kiosk_api.py:691`
- Test: A break START from the kiosk for a clocked-in worker with no local membership PIN is refused unless that worker proves who they are.
- Business question: Sara is clocked in at Tom's pharmacy and has no kiosk PIN there. Mia taps 'start break' for Sara on the counter kiosk. What should happen?

### C003-N1 — P2 — The kiosk staff lookup reveals staff names and masked emails by guessable number, and sends setup emails without a dedicated rate limit.

Anyone standing at the paired counter tablet in Tom's pharmacy can type 1, 2, 3 and so on into the Staff ID box. For Omar, Ali, Mia, and also Nadia at Tom's other pharmacy, the kiosk shows the full name, account number and a partly hidden email. Unknown numbers get a different 'not found' answer, so every staff member in the group can be listed. Anyone who has no PIN yet (for example a new starter like Jack) gets a setup-code email on every probe. The PIN clock screen deliberately gives one generic error so this cannot happen, but the lookup screen undoes that.

- Status: **UNVERIFIED_CANDIDATE** | Decision: **VERIFY** | Grade: S1_REPORTED
- Evidence: `backend/attendance/kiosk_api.py:507`, `backend/attendance/kiosk_api.py:519`, `backend/attendance/kiosk_api.py:531`, `backend/attendance/credentials.py:632`, `backend/attendance/credentials.py:657`, `backend/attendance_tests/test_worker_pin_setup.py:235`, `backend/attendance_tests/test_worker_pin_setup.py:260`
- Test: Using one device token, look up a known staff ID and an unknown one and assert both answers look the same with no name or email; then assert repeated lookups are rate-limited like the PIN screen.
- Business question: Someone at Tom's counter tablet types Staff ID numbers one after another. What should the kiosk show them?

### C003-N2 — P2 — The kiosk login check also accepts the stored token text as-is, so the scrambled copy saved in the database works as a kiosk token.

Kiosk tokens are saved only in scrambled (hashed) form so that a leaked database or backup can't be used to sign in a kiosk. But the login check also accepts a token that matches the saved text exactly. So anyone who sees the saved value for Tom's front-counter kiosk (in a backup, an admin screen or a support export) can send it as the token and act as that kiosk: show sign-in QR codes, look up staff and clock people in. Nothing hashes old plain-text tokens, so this extra check is permanent.

- Status: **UNVERIFIED_CANDIDATE** | Decision: **VERIFY** | Grade: S1_REPORTED
- Evidence: `backend/attendance/credentials.py:245`, `backend/attendance/credentials.py:256`, `backend/attendance/credentials.py:258`, `backend/attendance_tests/test_kiosk_qr_pin_security.py:209`
- Test: Activate a kiosk, read its saved hash from the database, call authenticate_kiosk_device with that hash and assert it returns None.
- Business question: If someone gets a copy of Tom's database backup, should the kiosk token values in it be enough to run Tom's counter kiosk?

### C004-N4 — P2 — Organisation billing falls back to the pharmacy owner's personal subscription for viewing, seat purchases and subscriber status.

Tom has his own active subscription, and his pharmacy belongs to Lina's organisation, which has none. Lina's org billing page shows Tom's subscription and its payment-provider ids as the organisation's. When Lina buys extra seats, the checkout runs on Tom's payment customer, and the seats may land on the organisation's record without any base plan.

- Status: **UNVERIFIED_CANDIDATE** | Decision: **VERIFY** | Grade: S1_REPORTED
- Evidence: `backend/billing/views.py:154`, `backend/billing/views.py:157`, `backend/billing/views.py:471`, `backend/billing/views.py:495`, `backend/billing/views.py:522`, `backend/billing/views.py:214`
- Test: Org without subscription, owner with active one: ORG_ADMIN GET subscription returns inactive/none, and seat purchase is refused.
- Business question: Tom pays for his own plan and his pharmacy is in Lina's organisation. What should Lina's org billing show?

### C004-N5 — P2 — Deleting the owner's user account deletes all their shift payment records.

Tom paid fulfilment fees and penalties, including fees paid for organisation pharmacies, which are recorded under the pharmacy owner. If Tom's account is deleted, every payment record tied to him is deleted too. ChemistTasker loses the financial history it needs for refunds, disputes and tax records.

- Status: **UNVERIFIED_CANDIDATE** | Decision: **VERIFY** | Grade: S1_REPORTED
- Evidence: `backend/billing/models.py:84`, `backend/billing/views.py:846`
- Test: Delete a user with ShiftPayment rows; expect the payments to remain (protected or owner set null).
- Business question: Tom deletes his account after paying shift fees. What should happen to those payment records?

### C009-N1 — P2 — Worker dashboard exposes community shift IDs and dates to staff outside the vacancy's audience.

Ben is Tom's favourite locum and should only be offered favourite-locum shifts, not Tom's internal staff vacancies. The pharmacist dashboard counts and returns a FULL_PART_TIME vacancy to Ben as a community opportunity, including its identifier and date. The normal worker shift listing correctly excludes it.

- Status: **SOURCE_SUPPORTED** | Decision: **VERIFY** | Grade: S2_SAME_ASSISTANT_SOURCE_CHALLENGE
- Evidence: `backend/dashboards/views.py:816`, `backend/dashboards/views.py:873`, `backend/dashboards/views.py:884`, `backend/dashboards/views.py:132`, `backend/shifts/escalation.py:25`
- Test: Ben is an accepted LOCUM member only. Tom creates a FULL_PART_TIME internal pharmacist shift; GET /api/v1/dashboard/pharmacist/?workspace=internal&pharmacy_id=... must exclude its ID and count; Omar (accepted FULL_TIME) must see it.
- Business question: Should favourite locum Ben see counts, dates or IDs of Tom's internal FULL_PART_TIME staff vacancies?

### C009-N2 — P2 — Mobile dashboards label all-time drafted invoice value as this month's income.

Sara issued an invoice in January, then another in October. The October pharmacist dashboard labels the sum of both invoices 'Total Income This Month', and even counts unsent draft invoices. The backend returns all-time billed amounts without a date or paid-status filter; the other-staff mobile dashboard uses the same label.

- Status: **SOURCE_SUPPORTED** | Decision: **VERIFY** | Grade: S2_SAME_ASSISTANT_SOURCE_CHALLENGE
- Evidence: `backend/dashboards/views.py:480`, `backend/dashboards/views.py:894`, `backend/dashboards/views.py:1008`, `frontend_mobile/roles/pharmacist/dashboard.tsx:154`, `frontend_mobile/roles/otherstaff/dashboard.tsx:150`
- Test: Sara has an old invoice, this-month sent invoice and an unsent draft; load pharmacist dashboard and assert a clearly defined monthly income metric excludes last month and drafts, while all-time billed metric remains separately labelled.
- Business question: What should Sara's 'Income This Month' tile count?

### C017-N1 — P2 — Editing a poll, even just to fix a typo in the question, deletes every vote already cast.

Tom posts a poll in his pharmacy hub and Omar, Ali and Mia vote. Tom opens Edit to fix a spelling mistake in the question and saves. Web and mobile always resend the option list, so the server deletes all votes and rebuilds the options. The poll goes back to zero votes and nobody is warned.

- Status: **UNVERIFIED_CANDIDATE** | Decision: **VERIFY** | Grade: S1_REPORTED
- Evidence: `backend/pharmacy_hub/serialization/polls.py:149-160`, `frontend_web/src/pages/dashboard/sidebar/hub/HubFeed.tsx:315-318`, `frontend_mobile/roles/shared/hub/PollComposer.tsx:87-92`, `shared-core/src/domains/pharmacyHub/api.ts:214-215`
- Test: PATCH a poll that has votes, sending the same option labels and a new question; assert the votes and vote counts are kept.
- Business question: Tom edits a poll that Omar, Ali and Mia have already voted on. What should happen to their votes?

### C017-N2 — P2 — Tagging teammates fails when editing a post, and when a new post has a file and exactly one tag.

Tom edits his pharmacy hub post on mobile to tag Omar and gets 'Unable to determine post scope for tagging', so the edit is refused. Separately, Tom writes a new post on web with a photo and tags only Omar. The upload turns the single tag into plain text instead of a list, so the post is rejected. It works only with no attachment or with two or more tags.

- Status: **UNVERIFIED_CANDIDATE** | Decision: **VERIFY** | Grade: S1_REPORTED
- Evidence: `backend/pharmacy_hub/posts.py:262-269`, `backend/pharmacy_hub/serialization/posts.py:231-236`, `backend/pharmacy_hub/serialization/posts.py:310-311`, `backend/pharmacy_hub/scoping.py:103-107`, `shared-core/src/domains/pharmacyHub/mappers.ts:239`, `frontend_mobile/roles/shared/hub/PostComposer.tsx:239-247`
- Test: PATCH an existing pharmacy post with tagged_member_ids=[staff id], and multipart-POST a post with one attachment and one tagged_member_ids value; both should return 200/201.
- Business question: Tom edits a post to tag Omar, or posts a photo tagging only Omar. What should happen?

### C017-N3 — P2 — Comment alerts with the comment text still go to a post's author after they lose access to that private hub.

Nadia wrote a post in her pharmacy's private hub and later left that pharmacy. Mia comments on the old post. Nadia's account is still active, so she gets an alert with the first 280 characters of Mia's internal comment and a link to a hub she can no longer open. The only check is whether the author's account is active, not whether they can still see the hub.

- Status: **UNVERIFIED_CANDIDATE** | Decision: **VERIFY** | Grade: S1_REPORTED
- Evidence: `backend/pharmacy_hub/notifications.py:51-56`, `backend/pharmacy_hub/posts.py:440-446`, `backend/pharmacy_hub/posts.py:517-523`
- Test: Make the post author's membership inactive, comment as another member, and assert the former author gets no notification.
- Business question: Nadia left the pharmacy, but her old hub post gets a new comment from Mia. Should Nadia hear about it?

### C018-N2 — P2 — After a board report is resolved, the same user can never report that talent post or job shift again, yet is told the report was received.

Sara reports a job board shift Tom posted, and a moderator resolves it without hiding it. Tom later edits the shift description into something abusive. When Sara reports it again she sees 'Report received', but the system only finds her old resolved report, so nothing new reaches the moderators.

- Status: **UNVERIFIED_CANDIDATE** | Decision: **VERIFY** | Grade: S1_REPORTED
- Evidence: `backend/public_hub/community.py:217`, `backend/public_hub/migrations/0005_board_reports.py:28`, `backend/public_hub/content_views.py:307`
- Test: Create a BoardReport by Sara, mark it resolved, have Sara POST the report again, and assert that an unresolved report now appears in the moderation queue.
- Business question: Sara's report on a job shift was dismissed, and the shift then changed. When she reports it again, what should happen?

### C020-N4 — P2 — Public boards compare local shift times against the UTC clock

Tom posts a Sydney shift ending at 5 pm. At 6 pm Sydney time, Sara can still find and express interest in it because the board compares its ending time with the much earlier UTC clock.

- Status: **UNVERIFIED_CANDIDATE** | Decision: **VERIFY** | Grade: S1_REPORTED
- Evidence: `backend/shifts/browse.py:431`, `backend/shifts/browse.py:445`, `backend/shifts/browse.py:557`, `backend/shifts/browse.py:568`
- Test: Freeze time at 6 pm Sydney time and assert a same-day shift ending at 5 pm is absent from both public lists.
- Business question: At 6 pm in Tom's pharmacy, should Sara still see a shift that ended there at 5 pm?

### C021-N4 — P2 — Upcoming bookings appear in completed-work history.

Tom books Sara for next week. Before Sara works the shift, both Tom's history and Sara's history already include it. Their completed-work lists therefore contain future commitments alongside past work.

- Status: **UNVERIFIED_CANDIDATE** | Decision: **VERIFY** | Grade: S1_REPORTED
- Evidence: `backend/shifts/selectors.py:68`, `backend/shifts/lifecycle.py:178`, `backend/shifts/my_shifts.py:61`, `backend/shifts/test_shift_listing_contract.py:73`, `backend/shifts/test_shift_listing_contract.py:103`
- Test: Create only a future assigned shift and assert both manager and worker history endpoints exclude it.
- Business question: Should Tom and Sara see next week's confirmed booking in History?

### C023-N1 — P2 — Anonymous talent posts reveal the author's full name and user id to any signed-in account.

Sara posts her availability as anonymous, which is the default, because she is quietly looking for other work. Tom, or Zoe with a free account she just made, opens the logged-in talent feed or a single post. The server's answer carries Sara's full name and account id. Only the public feed hides them, so anonymity holds only for logged-out visitors.

- Status: **UNVERIFIED_CANDIDATE** | Decision: **VERIFY** | Grade: S1_REPORTED
- Evidence: `backend/talent/serializers/explorer.py:73-83`, `backend/talent/serializers/explorer.py:187-196`, `backend/talent/views/explorer.py:184`, `backend/talent/views/explorer.py:81`
- Test: A signed-in owner fetches feed/ and retrieve for an is_anonymous post and must not receive explorer_name, author_user_id or explorer_user_id
- Business question: Sara posts anonymously. When Tom is logged in and looks at the talent board, what should he learn about who she is?

### C023-N4 — P2 — Fortnightly (and longer) weekly-repeat calendar items land on the wrong weeks in some months.

Tom sets a fortnightly 'controlled drug register check' work note starting Monday 2 March. When Omar opens a month whose first week is an odd number of weeks after 2 March, the note shows in the off weeks. Omar does the check in the wrong week and his ticks are saved against dates that are not real occurrences. Which weeks appear changes with the month being viewed.

- Status: **UNVERIFIED_CANDIDATE** | Decision: **VERIFY** | Grade: S1_REPORTED
- Evidence: `backend/team_calendar/recurrence.py:71-92`, `backend/team_calendar/views.py:598`, `backend/team_calendar/views.py:616`
- Test: Weekly interval=2 from 2026-03-02, expanded for 2026-06-01..2026-06-30, must return 8 and 22 June, not 1, 15 and 29 June
- Business question: Tom sets a task to repeat every two weeks from 2 March. Which weeks should Omar see it in?

### C023-N5 — P2 — A staff member born on 29 February stops birthday events for the rest of their pharmacy in non-leap years.

Ali was born on 29 February. In a non-leap year, the daily birthday job crashes when it reaches Ali, and the error is caught for the whole pharmacy. Every colleague processed after Ali, like Mia, gets no birthday entry on Tom's calendar all year.

- Status: **UNVERIFIED_CANDIDATE** | Decision: **VERIFY** | Grade: S1_REPORTED
- Evidence: `backend/team_calendar/tasks.py:55`, `backend/team_calendar/tasks.py:117-122`
- Test: generate_birthday_events_for_pharmacy with a 29 February DOB and a 2027 target date must not raise, and must still create other staff members' events
- Business question: Ali's birthday is 29 February. In a non-leap year, what should Tom's calendar show?

### C024-N2 — P2 — Asking for a mobile code again clears the verified-mobile flag, which unlocks the 'locked' mobile number and legal name while the profile keeps its Verified badge.

Sara has verified her mobile, and her profile is Verified with her AHPRA-matched name. She calls 'resend mobile code', which marks her mobile as unverified straight away. Now the lock checks no longer apply, so she requests a code for a new number under a different first and last name, and her name changes. Verified profiles are never automatically demoted, so Tom sees a Verified locum whose name and phone are not the ones that were checked.

- Status: **UNVERIFIED_CANDIDATE** | Decision: **VERIFY** | Grade: S1_REPORTED
- Evidence: `backend/users/api_otp.py:519-533`, `backend/users/api_otp.py:344-349`, `backend/users/otp.py:119-134`, `backend/onboarding/verification/policy.py:82-89`
- Test: For a user with is_mobile_verified=True, POST mobile/resend-otp/ and then mobile/request-otp/ with a new number and new names; assert 400 and that the names and number are unchanged.
- Business question: Sara is already verified and asks for a new mobile code. What should happen to her verified mobile and name?

### C024-N3 — P2 — The invite endpoint can change an existing Org Admin's role, which skips the rule that every organisation keeps at least one Org Admin.

Lina is the only Org Admin of her chain. She, or the invite form, sends an organisation invite to her own email with the role Chief Admin. The invite finds her existing membership and overwrites its role without the 'must retain one Org Admin' check that normal edits run. The chain now has no Org Admin, and no Chief or Region Admin is allowed to create one.

- Status: **UNVERIFIED_CANDIDATE** | Decision: **VERIFY** | Grade: S1_REPORTED
- Evidence: `backend/users/api_organizations.py:36-37`, `backend/users/api_organizations.py:110-125`, `backend/users/api_organizations.py:498-504`
- Test: As the only ORG_ADMIN, POST the org invite with your own email and role CHIEF_ADMIN; assert 403 and that the membership role is still ORG_ADMIN.
- Business question: Lina sends an invite to someone who is already an admin of her organisation, possibly herself. What should the invite do?

### C026-N4 — P2 — The invoice issue action fails on PostgreSQL because it locks outside a transaction.

Sara confirms a saved invoice using the supported issue action before sending it. The confirmation attempts a database lock without opening a transaction, so PostgreSQL rejects the request and Sara receives a server error. The isolated SQLite tests do not expose this failure.

- Status: **UNVERIFIED_CANDIDATE** | Decision: **VERIFY** | Grade: S1_REPORTED
- Evidence: `backend/worker_finance/views.py:155`, `backend/worker_finance/views.py:234`, `backend/core/settings.py:401`, `backend/core/settings.py:409`, `backend/worker_finance/tests/settings.py:9`, `shared-core/src/domains/finance/api.ts:80`
- Test: Call the issue action on PostgreSQL from a TransactionTestCase without an enclosing transaction; assert successful confirmation rather than TransactionManagementError.
- Business question: When Sara confirms a saved invoice through the existing issue action, what should happen?

### C027-N3 — P2 — Old acknowledgements prevent workers acknowledging a republished roster

Omar acknowledges Tom's published roster. Tom unpublishes the week, changes it and publishes it again. Tom sees Omar as awaiting acknowledgement, but Omar still sees the roster as acknowledged and has no acknowledgement button.

- Status: **UNVERIFIED_CANDIDATE** | Decision: **VERIFY** | Grade: S1_REPORTED
- Evidence: `backend/workforce/roster/v2_views.py:275`, `backend/workforce/roster/v2_views.py:295`, `backend/workforce/roster/acknowledgements.py:56`, `backend/workforce/roster/publication.py:69`, `frontend_web/src/components/roster/RosterWorkerAcknowledgements.tsx:73`
- Test: After Omar acknowledges a week, unpublish and republish it; verify his worker response reports acknowledgement pending and the acknowledgement action remains available.
- Business question: After Tom changes and republishes an acknowledged week, what should Omar see?

### C028-N2 — P2 — Changing contracted hours leaves rebuilt timesheets showing the previous hours

Tom changes Omar's contracted week from 38 hours to 30 hours after a timesheet has been built. The change schedules a rebuild, but ordinary rebuilding treats the inputs as unchanged and keeps the old 38-hour total. The timesheet is then marked current and can retain its previous approval.

- Status: **UNVERIFIED_CANDIDATE** | Decision: **VERIFY** | Grade: S1_REPORTED
- Evidence: `backend/workforce/signals.py:186`, `backend/workforce/timesheet_data.py:36`, `backend/workforce/timesheet_builder.py:142`, `backend/workforce/timesheet_builder.py:144`, `backend/workforce/timesheet_builder.py:171`
- Test: Build Omar's weekly timesheet with 2280 contracted minutes, change only the setting to 1800, rebuild without force, and assert the current total and revision reflect 1800.
- Business question: When Tom changes Omar's contracted hours for an open timesheet period, what should recalculation do?

### C028-N3 — P2 — Timesheets treat individually withdrawn roster shifts as published work

Tom withdraws Omar's shift from a published week and edits its hours before republishing it. Omar's roster correctly hides the shift, but recalculating his timesheet still includes the withdrawn shift and its draft hours. It can also raise a missing-attendance blocker for work Omar was no longer shown as scheduled.

- Status: **UNVERIFIED_CANDIDATE** | Decision: **VERIFY** | Grade: S1_REPORTED
- Evidence: `backend/workforce/timesheet_data.py:132`, `backend/workforce/timesheet_data.py:150`, `backend/workforce/timesheet_checks.py:94`, `backend/workforce/roster/publication.py:175`, `backend/workforce/roster/publication.py:233`
- Test: Withdraw Omar's individual shift while its week stays published, edit it, rebuild his timesheet, and assert the withdrawn assignment contributes no roster minutes or missing-attendance blocker.
- Business question: While Tom edits a withdrawn shift that Omar cannot see in his roster, what should Omar's timesheet use?

### C030-N1 — P2 — Referee decline links cannot complete the browser flow.

Omar asks Tom to provide a reference. Tom clicks the decline link in the email, but its signed-token address does not match the browser page. The browser operation also calls an obsolete address, so Tom cannot record his refusal.

- Status: **UNVERIFIED_CANDIDATE** | Decision: **VERIFY** | Grade: S1_REPORTED
- Evidence: `backend/onboarding/emails.py:79`, `frontend_web/src/main.tsx:158`, `shared-core/src/constants/endpoints.ts:47`, `shared-core/src/domains/auth/browserOperations.ts:71`, `shared-core/src/domains/auth/browserOperations.test.ts:53`, `backend/onboarding/urls.py:41`
- Test: Follow Omar's actual emailed decline link as Tom and verify it records rejection through the signed-token endpoint.
- Business question: When Tom clicks the decline link for Omar's reference request, what should happen?

### C030-N3 — P2 — Mobile group member search cannot find returned participants.

Tom opens mobile group creation and searches for Omar, who is available in his chat contacts. Omar's name is returned inside his identity details, but the search checks a different location and shows no match. Tom cannot select Omar to create the group or add him to an existing group.

- Status: **UNVERIFIED_CANDIDATE** | Decision: **VERIFY** | Grade: S1_REPORTED
- Evidence: `shared-core/src/domains/chat/mappers.ts:62`, `shared-core/src/domains/chat/api.ts:154`, `frontend_mobile/roles/shared/chat/hooks.ts:69`, `frontend_mobile/roles/shared/chat/NewGroupModal.tsx:33`, `frontend_mobile/roles/shared/chat/NewGroupModal.tsx:73`, `frontend_mobile/roles/shared/chat/GroupManageModal.tsx:77`
- Test: Return Omar with a nested user identity, search his name in mobile group creation, and verify he is selectable.
- Business question: When Tom searches for Omar among available mobile group contacts, what should happen?

### C031-N2 — P2 — Booked pharmacist cards can show a different rate from the agreed pay

Tom posts a shift with a $65 weekday rate and an $80 Saturday rate. Sara accepts the Saturday work at $80 per hour. Her confirmed and history cards on web and mobile can still say $65 per hour fixed because they use the shift's general rate rather than her agreed pay.

- Status: **UNVERIFIED_CANDIDATE** | Decision: **VERIFY** | Grade: S1_REPORTED
- Evidence: `shared-core/src/domains/shifts/bookedRate.ts:15`, `backend/shifts/posting.py:84`, `backend/shifts/assignment.py:75`, `backend/shifts/finalize.py:63`, `backend/shifts/serialization/projections.py:21`, `frontend_web/src/pages/dashboard/shiftCenter/WorkerBookedShifts.tsx:82`, `frontend_mobile/roles/shared/shifts/WorkerBookedShifts.tsx:56`
- Test: Give Sara an accepted Saturday assignment at $80 with the shift's fixed rate at $65; assert her booked pay label does not show $65.
- Business question: What should Sara's booked-shift card show when her accepted Saturday rate differs from Tom's general advertised rate?

### C032-N2 — P2 — Automatic escalation can expose shifts earlier than the selected interval.

Tom in Perth selects automatic escalation from his pharmacy's locum audience to the public board after 24 hours in October. The submitted time has no timezone, so the server interprets it as Sydney time. Sara can see the vacancy three hours earlier than Tom selected.

- Status: **UNVERIFIED_CANDIDATE** | Decision: **VERIFY** | Grade: S1_REPORTED
- Evidence: `shared-core/src/domains/shifts/visibility.ts:20`, `shared-core/src/domains/shifts/context.ts:98`, `shared-core/src/domains/shifts/postingDraft.ts:49`, `shared-core/src/domains/shifts/visibility.test.ts:19`, `frontend_web/shared/postShift/PostShiftForm.tsx:398`, `backend/shifts/models.py:119`, `backend/core/settings.py:445`
- Test: With the client in Australia/Perth and Django in Australia/Sydney during October, assert a 24-hour automatic escalation persists exactly 24 hours after the starting instant.
- Business question: When Tom in Perth chooses public visibility after 24 hours, when should Sara gain access?

### C033-N1 — P2 — The finance warning not to resend an invoice email is replaced by a generic error, and the test that should catch this never runs.

Sara emails an invoice to Tom's pharmacy and the mail provider times out. The server marks the email as uncertain and replies 'Email acceptance is uncertain. Do not resend until checked with your mail provider.' Sara sees only 'Request failed with status 503', so she doesn't know her email may already have gone out, and she may keep pressing Send or think nothing was sent. The test file that checks this message is kept is not run by any script and depends on a setup function that now does nothing, so the problem goes unnoticed.

- Status: **UNVERIFIED_CANDIDATE** | Decision: **VERIFY** | Grade: S1_REPORTED
- Evidence: `shared-core/src/transport/errors.ts:38`, `shared-core/src/transport/client.ts:121`, `backend/worker_finance/views.py:313`, `shared-core/tests/finance.transport.cjs:42`, `shared-core/src/finance.ts:92`
- Test: A finance send call that gets a 503 with the uncertain-delivery detail must reject with that detail text, not the generic status message.
- Business question: When Sara sends Tom an invoice email and the server can't confirm it was delivered, what should Sara see?

### C036-N2 — P2 — Timesheet detail drawer renders manager check resolution and punch actions in worker mode

Omar opens My Hours to review his worked hours at Tom's pharmacy and inspects a timesheet with an attendance warning. Because the details drawer fails to pass worker mode into check cards, Omar is shown active Resolve and Waive buttons as well as an Add missing clock time button. When Omar attempts to resolve the check or add a missing clock time, the request is rejected with a 403 error because only pharmacy managers like Tom may approve or waive attendance checks.

- Status: **UNVERIFIED_CANDIDATE** | Decision: **VERIFY** | Grade: S1_REPORTED
- Evidence: `frontend_web/src/features/workforce/TimesheetDetailDrawer.tsx:63`, `frontend_web/src/features/workforce/TimesheetDetailDrawer.tsx:95`, `frontend_web/src/features/workforce/TimesheetDetailDrawer.tsx:115`, `frontend_web/src/features/workforce/TimesheetDetailDrawer.tsx:288`, `backend/workforce/timesheet_transitions.py:101`
- Test: Render TimesheetDetailDrawer with managerMode set to false and verify that CheckCard renders in read-only mode without Resolve, Waive, Reopen, or Add missing clock time buttons.
- Business question: When Omar reviews his own hours in the timesheet details drawer, how should checks and attendance issues be displayed?

### C041-N4 — P2 — Notification refreshes leave counter offers stale

Tom opens a shift before Sara submits a counter offer, leaving an empty offer list cached. Sara then submits her proposal, and Tom opens its notification while staying in the Active screen. The shift and interests reload, but the counter-offer list stays empty, so Sara's proposed terms remain unavailable until Tom reloads or leaves and reopens the screen.

- Status: **UNVERIFIED_CANDIDATE** | Decision: **VERIFY** | Grade: S1_REPORTED
- Evidence: `frontend_web/src/pages/dashboard/sidebar/ActiveShiftsPage/index.tsx:104`, `frontend_web/src/pages/dashboard/sidebar/ActiveShiftsPage/index.tsx:218`, `frontend_web/src/pages/dashboard/sidebar/ActiveShiftsPage/hooks/useTabData.ts:83`, `frontend_web/src/pages/dashboard/sidebar/ActiveShiftsPage/hooks/useCounterOffers.ts:31`
- Test: Cache an empty counter-offer list, create a counter offer, then navigate to a notification for the same shift without remounting; verify the proposal appears.
- Business question: When Tom opens Sara's new counter-offer notification from an already open shift, what should happen?

### C044-N2 — P2 — Interested shifts disappear when they are outside the current browse page.

Sara applies for a shift on the second page of public shifts, then returns to the first browse page. Opening Interested filters only those first-page shifts, so her application is absent. That list hides pagination, preventing Sara from reaching the applied shift there.

- Status: **UNVERIFIED_CANDIDATE** | Decision: **VERIFY** | Grade: S1_REPORTED
- Evidence: `frontend_web/src/pages/dashboard/sidebar/PublicShiftsPage.tsx:201`, `frontend_web/src/pages/dashboard/sidebar/PublicShiftsPage.tsx:217`, `frontend_web/src/pages/dashboard/sidebar/PublicShiftsPage.tsx:660`, `frontend_web/src/pages/dashboard/sidebar/PublicShiftsPage.tsx:687`, `frontend_web/src/pages/dashboard/sidebar/ShiftsBoard/index.tsx:287`, `frontend_web/src/pages/dashboard/sidebar/ShiftsBoard/index.tsx:701`
- Test: Place Sara's applied shift on public page two, open Interested from page one, and assert the applied shift is accessible.
- Business question: When Sara opens Interested from the first browse page, which applications should she be able to see?

### C044-N3 — P2 — Clearing an optional pharmacy rate does not remove the saved rate.

Tom clears his pharmacy's late-night rate and saves the pharmacy. The page reports success, but the old rate remains saved because the empty field is omitted from the update. When Tom starts another shift posting, the old late-night rate is filled in again.

- Status: **UNVERIFIED_CANDIDATE** | Decision: **VERIFY** | Grade: S1_REPORTED
- Evidence: `frontend_web/src/pages/dashboard/sidebar/PharmacyPage.tsx:1161`, `frontend_web/src/pages/dashboard/sidebar/PharmacyPage.tsx:1948`, `frontend_web/src/pages/dashboard/sidebar/PharmacyPage.tsx:1949`, `frontend_web/src/pages/dashboard/sidebar/PharmacyPage.tsx:1993`, `shared-core/src/domains/organizations/api.ts:83`, `backend/organizations/serializers.py:458`, `frontend_web/shared/postShift/useShiftPricing.ts:43`
- Test: Save a pharmacy with a late-night rate, clear that field through the pharmacy form, save again, and assert the persisted rate is null.
- Business question: When Tom clears an optional late-night rate and saves, what should happen?

### C045-N3 — P2 — The 'notify me about matching shifts' checkbox is never saved on its own, so unchecking it does not stop notifications.

Sara added availability slots with notifications on. She later unticks 'Notify me when new public shifts match my availability' and leaves the page, expecting the alerts to stop. Nothing is saved, her existing slots still have notifications on, and the checkbox shows ticked again when she comes back. The setting only applies to slots she adds after changing it.

- Status: **UNVERIFIED_CANDIDATE** | Decision: **VERIFY** | Grade: S1_REPORTED
- Evidence: `frontend_web/src/pages/dashboard/sidebar/SetAvailabilityPage.tsx:237`, `frontend_web/src/pages/dashboard/sidebar/SetAvailabilityPage.tsx:371`, `frontend_web/src/pages/dashboard/sidebar/SetAvailabilityPage.tsx:428`
- Test: With saved slots that have notifications on, untick the checkbox and reload; assert the slots have notifications off.
- Business question: Sara unticks 'notify me about matching shifts' on her availability page. What should happen?

### C049-N1 — P2 — The pharmacy applications panel reads only the newest 50 pending applications across every pharmacy the admin manages, so older ones for a given pharmacy vanish.

Lina manages a large organisation, and more than 50 people have applied through invite links across its pharmacies. When she opens Tom's pharmacy, the panel picks out Tom's applicants from only the newest 50. Sara applied to Tom's pharmacy two weeks ago, so she is not shown, the tab badge says nothing needs review, and Sara waits forever with no approve or decline.

- Status: **UNVERIFIED_CANDIDATE** | Decision: **VERIFY** | Grade: S1_REPORTED
- Evidence: `frontend_web/src/pages/dashboard/sidebar/owner/MembershipApplicationsPanel.tsx:164`, `frontend_web/src/pages/dashboard/sidebar/owner/MembershipApplicationsPanel.tsx:165`, `shared-core/src/domains/memberships/api.ts:99`, `backend/memberships/selectors.py:197`, `backend/core/settings.py:360`
- Test: Create 51 pending applications across two pharmacies the admin manages, with the oldest at pharmacy A, and check that pharmacy A's panel still lists it and counts 1.
- Business question: When Lina opens Tom's pharmacy and Sara's application is older than 50 newer applications at other pharmacies, what should Lina see?

### C050-N1 — P2 — When some bulk staff invitations fail, the error is shown on the wrong person if the form has a blank row in the middle.

Tom fills in Omar in row 1, leaves row 2 empty, and puts Ali in row 3, then presses Send. Omar's invite works, but Ali's fails (for example, he already has a pending application). The server reports the failure as line 2 of the rows it received. The screen puts that error on the empty row 2 instead, and Ali's row shows nothing. Tom sees 'Some invitations were sent' and thinks Ali was invited. If Tom presses Send again, Omar's row is sent again and fails with 'already invited'.

- Status: **UNVERIFIED_CANDIDATE** | Decision: **VERIFY** | Grade: S1_REPORTED
- Evidence: `frontend_web/src/pages/dashboard/sidebar/owner/StaffManager.tsx:427`, `frontend_web/src/pages/dashboard/sidebar/owner/StaffManager.tsx:452`, `frontend_web/src/pages/dashboard/sidebar/owner/StaffManager.tsx:467`, `backend/memberships/invites.py:333`
- Test: Rows [valid, blank, failing]: the error must show on row 3, not row 2, and the row that worked must be cleared or marked as sent.
- Business question: When Tom invites Omar and Ali together and only Ali's invite fails, what should Tom see?

### C062-N1 — P2 — Unticking 'notify me about matching shifts' on mobile does not turn notifications off for slots already saved.

Sara saves several availability slots with 'notify me' ticked. Later she unticks the box, thinking she has opted out, but only slots she adds from now on get the new setting, so her old slots keep sending shift alerts. When she reopens the screen the box shows ticked again, because it is ticked whenever any saved slot has alerts on.

- Status: **UNVERIFIED_CANDIDATE** | Decision: **VERIFY** | Grade: S1_REPORTED
- Evidence: `frontend_mobile/roles/shared/availability/SetAvailabilityScreen.tsx:360`, `frontend_mobile/roles/shared/availability/SetAvailabilityScreen.tsx:469`, `frontend_mobile/roles/shared/availability/SetAvailabilityScreen.tsx:545`
- Test: Save a slot with alerts on, untick the box, reload: no saved slot should still have alerts on.
- Business question: Sara unticks 'notify me' after saving slots with alerts on. What should happen to her existing slots?

### C062-N2 — P2 — Adding several availability dates at once can half-save, show 'Failed', and create duplicates when retried.

Omar picks five dates and taps Add Time Slot. Three save and two fail, so he sees 'Failed to save slot' while the three saved dates are missing from his list. He taps Add again and the three dates are saved a second time, so pharmacies see duplicate availability for him.

- Status: **UNVERIFIED_CANDIDATE** | Decision: **VERIFY** | Grade: S1_REPORTED
- Evidence: `frontend_mobile/roles/shared/availability/SetAvailabilityScreen.tsx:473`, `frontend_mobile/roles/shared/availability/SetAvailabilityScreen.tsx:479`
- Test: Make the second of three create calls fail: the screen should list the saved ones and a retry should not duplicate them.
- Business question: Omar's five-date save half-fails. What should he see?

### C070-N1 — P2 — Shared AsyncStorage keys can expose previous account's applied/rejected shift markers after account switching.

Sara uses a shared phone and marks shift IDs applied or rejected; after logout Tom signs in on the same device. The shift board persistence hook hydrates applied/rejected marker IDs from device-global AsyncStorage keys without an account prefix. Tom can briefly see Sara's state as his own until backend data refresh and shift pruning.

- Status: **UNVERIFIED_CANDIDATE** | Decision: **VERIFY** | Grade: S1_REPORTED
- Evidence: `frontend_mobile/roles/shared/shifts/ShiftsBoard/constants.ts:6`, `frontend_mobile/roles/shared/shifts/ShiftsBoard/constants.ts:7`, `frontend_mobile/roles/shared/shifts/ShiftsBoard/constants.ts:9`, `frontend_mobile/roles/shared/shifts/ShiftsBoard/hooks/useShiftPersistence.ts:60`, `frontend_mobile/roles/shared/shifts/ShiftsBoard/hooks/useShiftPersistence.ts:77`, `frontend_mobile/roles/shared/shifts/ShiftsBoard/hooks/useShiftPersistence.ts:89`, `frontend_mobile/roles/shared/shifts/CommunityShiftsView.tsx:552`
- Test: Native shared device: Sara applies/rejects shifts, signs out; Tom signs in and opens community board with slow server results. Assert applied/rejected markers never display Sara's state, and subsequent writes are isolated. Check default disableLocalPersistence behavior and whether backend props override early hydration.
- Business question: Should shift-board saved/applied/rejected status ever be carried between accounts on a shared device?

### C079-N2 — P2 — Manual shift times revert to pharmacy opening hours

Tom selects a date manually for his first shift entry at a pharmacy whose hours are 09:00–17:00. He changes the start to 10:00 because Sara is needed for a shorter shift. The form immediately restores 09:00, preventing him from keeping his chosen time through this entry flow.

- Status: **UNVERIFIED_CANDIDATE** | Decision: **VERIFY** | Grade: S1_REPORTED
- Evidence: `frontend_web/shared/postShift/useShiftTimetable.ts:76`, `frontend_web/shared/postShift/useShiftTimetable.ts:86`, `frontend_web/shared/postShift/helpers.ts:294`, `frontend_web/shared/postShift/PostShiftTimetableStep.tsx:248`
- Test: With pharmacy hours 09:00–17:00 and no added or calendar-selected dates, select a manual date, enter 10:00–16:00, and assert those times survive effects and are added unchanged.
- Business question: When Tom chooses a shorter shift for Sara than the pharmacy's opening hours, what should the manual time fields do?

### F01-N4 — P2 — When a worker accepts or declines, the 'payment needed' or 'declined' notice goes to the pharmacy owner, not the admin who posted the shift.

Grace posts a shift for Tom's pharmacy in Lina's organisation and sends Sara an offer. When Sara accepts, the in-app alert and the 'Action Required: payment' email go to Tom as pharmacy owner; Grace gets nothing. If Sara declines, only Tom is told. Interest and counter-offer emails do go to Grace as the poster. So Grace keeps waiting, the shift sits unpaid, and Sara is never locked in.

- Status: **UNVERIFIED_CANDIDATE** | Decision: **VERIFY** | Grade: S1_REPORTED
- Evidence: `backend/shifts/offers.py:183`, `backend/shifts/offers.py:474`, `backend/shifts/offers.py:626`, `backend/shifts/interest.py:160`, `backend/shifts/counter_offers.py:64`
- Test: Region admin creates the shift, worker accepts an offer under PAYMENT_REQUIRED; assert the region admin who created the shift receives the shift_worker_confirmed notification.
- Root group: B71 (RELATED_ROOT)
- Business question: Grace posted the shift and Sara accepted it. Who should be told that payment is needed, or that Sara declined?

### F01-N5 — P2 — A 'Casual employee' shift is charged the $80 part/full-time job fee instead of the $30 per-shift locum fee.

Tom posts a one-day shift with the employment type 'Casual employee' and books Mia. At checkout Tom is charged $80, the published price for a part-time or full-time job, because only shifts marked 'Locum' get the $30 per-shift price. The pricing pages only list locum shifts and part/full-time jobs, so Tom is charged a price he was never shown for this kind of shift.

- Status: **UNVERIFIED_CANDIDATE** | Decision: **VERIFY** | Grade: S1_REPORTED
- Evidence: `backend/billing/views.py:646`, `backend/shifts/models.py:24`, `frontend_web/src/pages/dashboard/sidebar/owner/OwnerBillingPage.tsx:268`, `shared-core/src/utils/pricing.ts:36`
- Test: Call charge_shift_fulfillment under PAYMENT_REQUIRED for a CASUAL shift and assert the agreed (per-shift) Stripe price id is used.
- Business question: Tom books Mia for a single casual-employee shift. What fee should Tom pay?

### F03-N5 — P2 — Deleting a staff membership also deletes that person's past work-note completions and their contracted-hours settings.

Tom removes Mia, who ticked off daily pharmacy tasks such as fridge checks for a year. Her membership is fully deleted unless an employment record blocks it, and her task-completion history and contracted-hours settings are deleted with it. Tom's task history no longer shows who did those checks, and timesheet comparisons for her past weeks lose her contracted hours. This is the same pattern as B03 (chat messages), but for task and work records.

- Status: **UNVERIFIED_CANDIDATE** | Decision: **VERIFY** | Grade: S1_REPORTED
- Evidence: `backend/memberships/views.py:129`, `backend/team_calendar/models.py:180`, `backend/team_calendar/models.py:148`, `backend/workforce/models.py:55`
- Test: Owner removes a staff member who has work-note completion records; those completion records must still exist afterwards.
- Business question: When Tom removes Mia, what should happen to her record of completed pharmacy tasks?

### F06-N4 — P2 — Requests made through My Leave bypass request and decision notifications.

Omar requests sick leave through My Leave on web or mobile, and Tom receives no email, push or in-app notification. When Tom later opens the leave list and approves it, Omar receives no decision notification either. Notifications are sent only when leave was requested against a particular roster shift, although both routes use the same approval workflow.

- Status: **UNVERIFIED_CANDIDATE** | Decision: **VERIFY** | Grade: S1_REPORTED
- Evidence: `frontend_web/src/features/workforce/MyLeavePage.tsx:12`, `frontend_mobile/app/my-leave.tsx:92`, `backend/workforce/leave_service.py:85`, `backend/workforce/leave_service.py:128`, `backend/workforce/leave_service.py:251`, `backend/workforce/leave_service.py:263`, `backend/workforce/leave_service.py:343`, `backend/workforce/signals.py:159`
- Test: Create Omar's membership-based leave without a roster assignment and have Tom approve it; assert that Tom receives a request notification and Omar receives a decision notification.
- Business question: When Omar requests leave through My Leave rather than a roster shift, how should Tom and Omar be notified?

### F07-N5 — P2 — Current finance invoice PDFs are labelled draft even after delivery.

Sara emails her saved invoice to Tom, and the attachment says DRAFT - NOT ISSUED. Downloading the current invoice after successful delivery or payment produces the same label. Tom receives contradictory information about whether Sara has actually issued the bill.

- Status: **UNVERIFIED_CANDIDATE** | Decision: **VERIFY** | Grade: S1_REPORTED
- Evidence: `backend/worker_finance/services.py:827`, `backend/worker_finance/templates/worker_finance/invoice.html:16`, `backend/worker_finance/documents.py:16`, `backend/worker_finance/views.py:294`, `backend/worker_finance/views.py:268`
- Test: Send a finance invoice and inspect both its email attachment and subsequent current PDF; assert that neither labels the issued invoice DRAFT - NOT ISSUED.
- Business question: What should Tom see on the invoice PDF that Sara successfully sends?

### F12-N1 — P2 — Native direct-message send failure is logged but not shown to the user, unlike Vite's retry warning.

Sara taps send on a direct chat while offline. Mobile sendMessage catches the network error and only console.error() logs it; the draft remains but the screen gives no visible send failure, while Vite MessageComposer displays an explicit 'Message not sent' error. Sara may believe the message was delivered.

- Status: **SOURCE_SUPPORTED_UI_SCOPE** | Decision: **VERIFY** | Grade: S2_SAME_ASSISTANT_SOURCE_CHALLENGE
- Evidence: `frontend_mobile/roles/shared/messages/[id].tsx:403`, `frontend_mobile/roles/shared/messages/[id].tsx:435`, `frontend_web/src/pages/dashboard/sidebar/chat/MessageComposer.tsx:179`
- Test: Disconnect native device network, send a direct text chat; assert clear error and draft retained. Vite shows explicit send failure; retry after reconnect sends once. Ensure global notifications are not already surfacing equivalent errors.

## Historical B01–B71 status index

| ID | Original severity | Source finding | Status | Action |
|---|---|---|---|---|
| B01 | P0 | Subscriber discount omitted from shift checkout | SOURCE_SUPPORTED | VERIFY |
| B02 | P1 | Purchased extra seats cannot subsequently be adjusted | UNVERIFIED_CANDIDATE | VERIFY |
| B03 | P0 | Removing staff cascades historical chat messages | REPRODUCED_RUNTIME_DJANGO_SQLITE | FIX |
| B04 | P0 | Empty and duplicate shift checkout sessions possible | UNVERIFIED_CANDIDATE | VERIFY |
| B05 | P1 | Already-connected sockets may outlive access revocation | UNVERIFIED_CANDIDATE | VERIFY |
| B06 | P0 | Org feed may expose another pharmacy's work notes | REPRODUCED_RUNTIME_DJANGO_SQLITE | FIX |
| B07 | P0 | Scoped admins can manage out-of-scope calendar items | REPRODUCED_RUNTIME_DJANGO_SQLITE | FIX |
| B08 | P1 | Region Admin notified about unrelated pharmacy shifts | UNVERIFIED_CANDIDATE | VERIFY |
| B09 | P1 | Shift escalation depends on reads and omits audience notification | UNVERIFIED_CANDIDATE | VERIFY |
| B10 | P0 | Multi-offer Pills spend uses one shift-wide ledger key; concurrency risk | UNVERIFIED_CANDIDATE | VERIFY |
| B11 | P1 | Abandoned payments can indefinitely reserve slots | UNVERIFIED_CANDIDATE | VERIFY |
| B12 | P1 | Rating can be submitted before completed work | UNVERIFIED_CANDIDATE | VERIFY |
| B13 | P1 | Account deletion leaves future booked shifts without handover | UNVERIFIED_CANDIDATE | VERIFY |
| B14 | P0 | Legacy casual award figures and incomplete future holiday data | UNVERIFIED_CANDIDATE | VERIFY |
| B15 | P0 | Penalty payment webhook can finalise unrelated offers | REPRODUCED_RUNTIME_DJANGO_SQLITE | FIX |
| B16 | P0 | Pharmacy Admin update bypasses management privilege | UNVERIFIED_CANDIDATE | VERIFY |
| B17 | P0 | Chain update can attach foreign pharmacy and affect membership deletion | UNVERIFIED_CANDIDATE | VERIFY |
| B18 | P0 | Claim PUT path bypasses owner approval workflow | UNVERIFIED_CANDIDATE | VERIFY |
| B19 | P0 | Invite links can be retargeted; removal may cascade applications | UNVERIFIED_CANDIDATE | VERIFY |
| B20 | P1 | Interest/rejection mutation can target a different shift | UNVERIFIED_CANDIDATE | VERIFY |
| B21 | P0 | Cover request scope differs from assignment scope | UNVERIFIED_CANDIDATE | VERIFY |
| B22 | P0 | Org poll aggregation includes private pharmacy polls | UNVERIFIED_CANDIDATE | VERIFY |
| B23 | P0 | Chief Admin may mutate/delete organization record | UNVERIFIED_CANDIDATE | VERIFY |
| B24 | P0 | Exchange action accepts confirm-completion while still in ENQUIRY / TERMS_PROPOSED, and arbitrary propose-terms/cancel/decline aft | UNVERIFIED_CANDIDATE | VERIFY |
| B25 | P1 | ListingAudience saves current circle and bumps listing.version before validating every requested schedule item. Invalid later sche | UNVERIFIED_CANDIDATE | VERIFY |
| B26 | P1 | EthicalListing draft is persisted before checking lot selection, lot ownership and available quantities; invalid listing create ca | UNVERIFIED_CANDIDATE | VERIFY |
| B27 | P1 | TimesheetPeriod creation rejects inverted/overlong date ranges but allows overlapping ranges for same pharmacy, while payroll mani | UNVERIFIED_CANDIDATE | VERIFY |
| B28 | P1 | Timesheet check decision path allows new resolved/waived decision on a check belonging to an already LOCKED period without correct | UNVERIFIED_CANDIDATE | VERIFY |
| B29 | P0 | Signed offline event integrity flags for clock-anchor drift, backward time, monotonic rollback and seven-day server drift mark evi | SOURCE_SUPPORTED | VERIFY |
| B30 | P1 | Established notification WebSocket stays subscribed to user group after logout, user deactivation or credential revocation; consum | UNVERIFIED_CANDIDATE | VERIFY |
| B31 | P1 | Ethical listing request verifies PUBLISHED status before transaction but never locks/rechecks listing inside it; two concurrent re | UNVERIFIED_CANDIDATE | VERIFY |
| B32 | P1 | The signed kiosk event field is named shift_id but is forwarded as assignment_id; an explicitly supplied ID shortcut accepts an as | UNVERIFIED_CANDIDATE | VERIFY |
| B33 | P0 candidate | InvoiceListView.perform_create stamps the caller but accepts arbitrary pharmacy, status, issuer and recipient snapshots via writab | REPRODUCED_RUNTIME_DJANGO_SQLITE | FIX |
| B34 | P1 candidate | ExplorerPostViewSet feed and public-feed filter is_talent_board_visible (moderator hidden and expired), but generic retrieve, list | UNVERIFIED_CANDIDATE | VERIFY |
| B35 | P0 candidate | SOURCE-FINDING | UNVERIFIED_CANDIDATE | VERIFY |
| B36 | P0 candidate | SOURCE-FINDING | REPRODUCED_RUNTIME_DJANGO_SQLITE | FIX |
| B37 | P1 candidate | SOURCE-FINDING | UNVERIFIED_CANDIDATE | VERIFY |
| B38 | P1 candidate | SOURCE-FINDING | UNVERIFIED_CANDIDATE | VERIFY |
| B39 | P1 candidate | SOURCE-FINDING | UNVERIFIED_CANDIDATE | VERIFY |
| B40 | P1 candidate | SOURCE-FINDING | UNVERIFIED_CANDIDATE | VERIFY |
| B52 | P1 | P1 candidate — Expo startup trusts cached identity and role after server rejects or cannot verify account, unlike web | UNVERIFIED_CANDIDATE | VERIFY |
| B53 | P1 | P1 candidate — Out-of-order Stripe subscription events may reactivate cancelled base billing or reset purchased seat entitlement | UNVERIFIED_CANDIDATE | VERIFY |
| B54 | P0 | P0-impact / P1 candidate — Two worker confirmations can reserve and pay for the same slot; a paid losing offer can appear ACCEPTED | UNVERIFIED_CANDIDATE | VERIFY |
| B55 | P1 | P1 candidate — Concurrent approval of *unlinked* cover request publishes multiple paid vacancies | UNVERIFIED_CANDIDATE | VERIFY |
| B56 | P1 | P1 candidate — Concurrent manager attendance corrections can violate final clock-in/out order and distort timesheet work minutes | UNVERIFIED_CANDIDATE | VERIFY |
| B57 | P1 | P1 conditional — Refund provider events are acknowledged without reversing/reconciling local paid financial state | UNVERIFIED_CANDIDATE | VERIFY |
| B58 | P1 | P1 conditional — Internal draft becomes pharmacy-visible when worker sets paid status without delivery | UNVERIFIED_CANDIDATE | VERIFY |
| B59 | P1 | P1 conditional — Revisions can reduce payable below recorded payments, producing negative balance | UNVERIFIED_CANDIDATE | VERIFY |
| B60 | P1 | P1 concurrency candidate — Two overlapping distinct PENDING leave requests can both be approved | UNVERIFIED_CANDIDATE | VERIFY |
| B61 | P1 | P1 user-facing accuracy candidate — Expo payroll CSV exports blanks for fields absent from the timesheet API | UNVERIFIED_CANDIDATE | VERIFY |
| B62 | P1 | P1 candidate — A Region Admin with communication-only privileges can manage shift operations despite missing roster capability | UNVERIFIED_CANDIDATE | VERIFY |
| B63 | P1 | P1 conditional — Native-kiosk pairing authorization can be redeemed as web-online by declaring a non-native platform | UNVERIFIED_CANDIDATE | VERIFY |
| B64 | P1 | P1 information-handling candidate — Kiosk one-time secrets are persisted to durable notifications and broadcast to app/WebSocket/d | UNVERIFIED_CANDIDATE | VERIFY |
| B65 | P1 | P1 scoped-information candidate — Authenticated pricing-preview endpoint lets unrelated users derive private pharmacy guide rates | UNVERIFIED_CANDIDATE | VERIFY |
| B41 | P1 | P1 candidate — Pending/rejected membership can be treated as private shift audience | UNVERIFIED_CANDIDATE | VERIFY |
| B42 | P1 | P1 candidate — Marketplace draft PATCH returns error after partial persistence | UNVERIFIED_CANDIDATE | VERIFY |
| B43 | P0 | P0 candidate — Password reset does not invalidate previously issued JWT refresh tokens | UNVERIFIED_CANDIDATE | VERIFY |
| B44 | P1 | P1 candidate — Invalid identity tab submission may erase or detach existing verified ID evidence | UNVERIFIED_CANDIDATE | VERIFY |
| B45 | P1 | P1 candidate — Incomplete referee questionnaire can be counted as a verified reference | UNVERIFIED_CANDIDATE | VERIFY |
| B46 | P0 | P0/P1 candidate: Pending/left pharmacy memberships can access or author private pharmacy, group and organisation Hub content | UNVERIFIED_CANDIDATE | VERIFY |
| B47 | P1 | P1 candidate / owner role-policy decision: Organization email invitations immediately activate full administrative membership for  | UNVERIFIED_CANDIDATE | VERIFY |
| B48 | P1 | P1 candidate: Pharmacy Hub mention validation can deliver confidential private post text to ineligible locum or non-accepted membe | UNVERIFIED_CANDIDATE | VERIFY |
| B49 | P1 | P1 candidate — Attachment/document upload type validation trusts client-declared MIME after failed magic-byte detection | UNVERIFIED_CANDIDATE | VERIFY |
| B50 | P1 | P1 candidate — Active but non-accepted pharmacy membership can read community-chat last-message previews | UNVERIFIED_CANDIDATE | VERIFY |
| B51 | P1 | P1 / potentially P0-impact candidate: Revoked pharmacy chat participant can send new messages through direct message endpoint afte | UNVERIFIED_CANDIDATE | VERIFY |
| B66 | P1 | P1 money-calculation candidate: overnight assignment produces negative cancellation wage and falsely skips penalty | UNVERIFIED_CANDIDATE | VERIFY |
| B67 | P1 | P1 booking/financial-evidence candidate: generic shift-offer DELETE bypasses state-machine transitions | UNVERIFIED_CANDIDATE | VERIFY |
| B68 | P1 | P1 conditional accounting/entitlement candidate: unrelated Stripe subscription invoice can activate local customer entitlement | REPRODUCED_RUNTIME_DJANGO_SQLITE | FIX |
| B69 | P1 | P1 conditional duplicate-charge candidate: cancellation penalty has no durable cancellation obligation or paid-once guard | REPRODUCED_RUNTIME_DJANGO_SQLITE | FIX |
| B70 | P1 | P1/P0-impact candidate: repeated base or extra-seat checkout can create two independent recurring Stripe subscriptions | REPRODUCED_RUNTIME_DJANGO_SQLITE | FIX |
| B71 | P1 | P1 user-flow reliability candidate: shift offer acceptance commits before notification errors can surface to the caller | UNVERIFIED_CANDIDATE | VERIFY |

## Release boundary

The 37 Django tests are intentionally red against frozen main; they do **not** certify all 226 reports and do **not** certify release. A source-supported candidate may be useful for remediation scoping but remains unproven at runtime. F12 provides 14 static cross-platform comparisons with no full native/browser parity; semantic independent coverage cannot truthfully be stated as 99%. Keep PR #200 draft and PR #201 independent.
