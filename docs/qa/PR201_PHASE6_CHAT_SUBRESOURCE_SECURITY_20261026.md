# Phase 6 chat API subresource permission consistency

After fixing the WebSocket and Conversation/Message visibility boundaries,
two additional legacy REST endpoints still queried Participant rows directly:
`POST /api/v1/.../messages/<id>/react/` and
`GET /api/v1/.../chat-participants/`. A deleted/revoked membership may
leave historical Participant records or stale accesses in legacy data.

Both now use `chat.realtime.accessible_conversations_queryset` as the
same authoritative permission boundary as conversation list and message
retrieval. Historical names of other inactive room members remain visible
to legitimately authorized participants (UI continuity), but a revoked
requester cannot enumerate those profiles or react to messages.

Targeted negative tests are required for active/revoked and unrelated
pharmacy access. No schema/migration changes, no deployment.
