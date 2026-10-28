# PR #200 — Deep senior source tracing, discovery wave 8 (B49–B50)

**Frozen application baseline:** `b77e9fd296bc2710350ef6f3cd402ce2529ffc06`. **Scope:** audit-only; no application code, migrations or deployments touched. Existing 48 source findings were **not revisited**. These are **new security and privacy risk hypotheses with direct code execution paths**, *not* a recorded exploit reproduction.

## B49 — P1 candidate — Attachment/document upload type validation trusts client-declared MIME after failed magic-byte detection

**Impact:** A user can label arbitrary bytes as an allowed PDF or DOCX and pass source-level type validation without providing a genuine PDF/Office document. The content can be persisted and distributed through chat/Hub attachments; actual browser XSS is *not* demonstrated and may be limited by downstream Content-Disposition/CSP and storage settings. This is a file-content-integrity and potential malware/phishing exposure, not a proven remote-code execution.

**Source chain:**
1. [backend/core/file_validation.py#L10-L47](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/backend/core/file_validation.py#L10-L47) defines document/attachment policies allowing PDFs, Office, images up to 10–15 MB.
2. [backend/core/file_validation.py#L56-L91](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/backend/core/file_validation.py#L56-L91) `_sniff_kind` detects specific file headers and returns `None` for arbitrary bytes/non-DOCX ZIP.
3. [backend/core/file_validation.py#L93-L114](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/backend/core/file_validation.py#L93-L114) computes `effective_type = sniffed_type or content_type`. Both `uploaded_file.name` extension and `uploaded_file.content_type` are client supplied, so no trusted file format evidence is required when sniff fails.
4. [backend/pharmacy_hub/scoping.py#L22-L40](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/backend/pharmacy_hub/scoping.py#L22-L40) applies this to Hub attachments and [backend/chat/views.py#L598-L643](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/backend/chat/views.py#L598-L643) to chat attachments; both then store uploads.

**Missing negative/positive tests:** Use a `SimpleUploadedFile('not-a-document.pdf', b'NOT A PDF DOCUMENT', content_type='application/pdf')`; `validate_uploaded_file(..., ATTACHMENT_UPLOAD_POLICY)` should reject (currently source predicts acceptance). Repeat with fake DOCX ZIP, HTML/script bytes under an allowed extension, valid PDF magic, genuine PNG/JPEG/GIF and oversized files. Verify the file never persists or becomes downloadable after invalid Hub/chat POST. Check downstream media response CSP/content-type rather than assuming exploitability.

**Confidence:** direct source-level fallback, severity requires real upload + delivery test. Not fixed.

## B50 — P1 candidate — Active but non-accepted pharmacy membership can read community-chat last-message previews

**Impact:** The room-list endpoint includes pharmacy GROUP conversations for any `is_active=True` staff-type Membership without requiring `status=ACCEPTED`. Even if the user is not an explicit `Participant` (which protects the dedicated messages endpoint), the room-list serializer includes the latest chat message's **first 200 characters**. An active-left/rejected/pending membership can therefore potentially read private chat excerpts.

**Source chain:**
1. [backend/memberships/models.py#L43-L111](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/backend/memberships/models.py#L43-L111) has PENDING, REJECTED, LEFT and ACCEPTED status distinct from `is_active`.
2. [backend/chat/views.py#L43-L93](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/backend/chat/views.py#L43-L93): `ConversationViewSet` `IsAuthenticated`; `get_queryset` unions participant rooms with `community_chats` based on `Membership.is_active=True` and staff-type only, no accepted-status check.
3. [backend/chat/serializers.py#L118-L235](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/backend/chat/serializers.py#L118-L235): `ConversationListSerializer.get_last_message` returns `msg.body[:200]` plus sender/time from the latest message even for a requester without a participant row.
4. [backend/chat/views.py#L596-L618](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/backend/chat/views.py#L596-L618): `ConversationViewSet.messages` does demand an actual Participant; the room-list preview is a **separate** information path that bypasses this stricter check.
5. [backend/chat/models.py#L30-L61](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/backend/chat/models.py#L30-L61): only one pharmacy community conversation per pharmacy; this finding is about eligibility to join *that* room, not a claim that every accepted staff member is barred from community chat. Current B46 concerns Hub posts, B41 concerns shift vacancies; B50 concerns **chat previews** specifically.

**Missing negative/positive tests:** Create pharmacy A and B, a populated community chat with sensitive last message, plus an active PENDING/REJECTED/LEFT staff-type Membership for user A (and no Participant). GET `/api/v1/rooms/` as that user; assert no community room, last_message, sender or participant IDs for the withdrawn pharmacy. Accepted staff should continue seeing their permitted community room. Confirm POST/get-room with active-unaccepted status denies. Check client websocket access separately and avoid double-counting B05 revocation issue.

**Reachability caveat:** The normal invitation creation flow tends to create PENDING as inactive; this issue requires inconsistent/stale active-status rows or a status transition that leaves active true. It is nevertheless a missing server-side privacy constraint if those rows exist. No live exploit reproduction is claimed.

## Roll-up

**50 total source-level findings B01–B50.** B49–B50 are new, supported by function-to-storage/response traces and unexecuted negative tests. No code fixes. Release readiness remains unverified; first 538-file structural tranche unchanged.
