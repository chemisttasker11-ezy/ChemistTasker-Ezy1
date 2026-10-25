# Phase 6 chat and notification revocation integrity

At PR201 base 8968b378, RoomConsumer joined `room.N` once and stored a
Membership object indefinitely. Subsequent websocket messages and outgoing
room events did **not** revalidate membership, allowing removed/disabled
participants to send or receive from their old room until disconnect. REST
ConversationViewSet and MessageViewSet also included historic Participant
rows without requiring currently eligible membership.

Correction: one `chat.realtime` eligibility rule is used for room events,
message creation and REST querysets. Per-message DB authorization is
re-evaluated inside a transaction and membership row lock. All websocket
outbound events check membership before delivery. Legitimate DM-only
CONTACT records remain eligible; revoked ordinary staff do not.
User deactivation closes notification sockets before an event is delivered.

Tests simulate post-connect QuerySet.update() revocation to prove security
without signals, and check outgoing event, incoming message and
notification deactivation. Additional role-matrix and REST tests still
required before claiming end-to-end revocation acceptance.

No migrations, no deploy. PR200 remains audit-only. NO-GO.
