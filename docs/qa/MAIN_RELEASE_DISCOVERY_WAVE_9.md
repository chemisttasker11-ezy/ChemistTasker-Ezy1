# PR #200 — Deep senior source tracing, discovery wave 9 (B51)

**Frozen main:** `b77e9fd296bc2710350ef6f3cd402ce2529ffc06`. Existing B01–B50 not re-reviewed. **No app changes, tests run or production deployment**.

## B51 — P1 / potentially P0-impact candidate: Revoked pharmacy chat participant can send new messages through direct message endpoint after leaving the pharmacy

**User-impact path:** A former pharmacy employee who retains an authenticated personal account and was previously a participant of the pharmacy community conversation can POST into that pharmacy room after the pharmacy membership is marked inactive or changed to LEFT. This can produce messages as an ex-employee despite the UI/socket rules denying active community membership. It is distinct from B05 (existing connected WebSocket remaining after membership revocation) and B50 (list preview exposure).

### Complete code and permission trace

1. [backend/chat/urls.py#L1-L35](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/backend/chat/urls.py#L1-L35): `/api/v1/messages/` is a public-to-authenticated DRF ViewSet mutation route.
2. [backend/chat/views.py#L657-L708](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/backend/chat/views.py#L657-L708): `MessageViewSet.create` uses only `permissions.IsAuthenticated`; looks up `Conversation.objects.get(pk=conversation_id)`; validates `Participant.objects.filter(conversation=conversation, membership__user=user)` but **does not check `membership.is_active`, `membership.status=ACCEPTED`, pharmacy employment type or target conversation pharmacy ownership**; then `Message.objects.create(...sender=participant.membership...)` and emits room event.
3. [backend/chat/models.py#L64-L102](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/backend/chat/models.py#L64-L102): `Participant` retains a Membership reference for history and does not automatically disappear if Membership is deactivated by a generic status update.
4. [backend/memberships/views.py#L79-L116](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/backend/memberships/views.py#L79-L116): `MembershipViewSet.perform_update` changes Membership status/is_active under a row lock, but does not clean up Chat Participant rows. `destroy` is a separate path that *does* explicitly delete participants.
5. [backend/chat/realtime.py#L65-L117](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/backend/chat/realtime.py#L65-L117): the real-time delivery policy `participant_can_receive_chat_updates` **does** require active, accepted, same pharmacy and staff employment type for GROUP pharmacy rooms; [backend/chat/consumers.py#L169-L189](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/backend/chat/consumers.py#L169-L189) checks that policy during handshake. [backend/chat/views.py#L596-L615](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/backend/chat/views.py#L596-L615) room-specific messages action checks access through `get_object()` and participant. The **direct `MessageViewSet.create` route bypasses current membership eligibility**.
6. [backend/chat/test_api.py#L122-L174](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/backend/chat/test_api.py#L122-L174) tests participation and ownership, but not deactivated/LEFT community participant POST to the direct messages endpoint.

### Negative/positive regression

Create pharmacy A with user M as ACCEPTED FULL_TIME and a community Conversation with Participant(M), create an existing message, then mark M `is_active=False,status=LEFT` via the same management path used in production. As M call `POST /api/v1/messages/` with `{conversation: room.id, body: "after departure"}`. Expected **403 or 404 and no new Message or WebSocket broadcast**, while a still ACTIVE+ACCEPTED coworker can POST as before. Repeat for active=TRUE but status REJECTED, and for a custom DM to decide explicitly whether private conversations survive separation.

**Confidence:** SOURCE-CONFIRMED missing eligibility check on HTTP direct-create path; actual request response and specific membership transition need an isolated API fixture. **No exploit reproduced. No fix implemented.**

## Progress classification

One new independently traced endpoint/data security source finding **B51**; cumulative **51 source-level candidates**. It is not a reclassification of Hub, shift, or existing socket findings. Selected 538-file structural inspection remains separate from this deep functional trace, and production readiness remains unverified.
