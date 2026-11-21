# PR200 — Discovery wave 3: invoice and talent board gaps

Baseline `b77e9fd296bc2710350ef6f3cd402ce2529ffc06`. Continuation only: B01–B32 were **not re-reviewed**. Scope: read-only gap identification; no app fixes.

## B33 — P0 candidate — Legacy invoicing tenant authority

**New source finding:** InvoiceListView.perform_create stamps the caller but accepts arbitrary pharmacy, status, issuer and recipient snapshots via writable InvoiceSerializer. This lets an authenticated unrelated user create a self-authored SENT/PAID invoice referencing a foreign pharmacy, then it is eligible for that pharmacy manager's received-invoice queryset.

**Owning source paths:** [backend/invoicing/views.py#L35-L66](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/backend/invoicing/views.py#L35-L66); [backend/invoicing/serializers.py#L38-L96](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/backend/invoicing/serializers.py#L38-L96); [backend/invoicing/models.py#L15-L29](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/backend/invoicing/models.py#L15-L29).

**Required negative regression:** Create legacy invoice with authenticated stranger and foreign pharmacy_id, status=sent; ensure 403/no row and ensure foreign owner's invoice list excludes it.

**Confidence:** Direct user-controlled FK and state; requires authenticated API and manager-visibility reproduction. **SOURCE-FINDING, NOT RUNTIME REPRODUCED.**

## B34 — P1 candidate — Talent board visibility

**New source finding:** ExplorerPostViewSet feed and public-feed filter is_talent_board_visible (moderator hidden and expired), but generic retrieve, list and by-profile/raw view/like handlers inherit an unrestricted queryset; a hidden post can remain readable/reactable by ID and via list.

**Owning source paths:** [backend/talent/views/explorer.py#L40-L76](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/backend/talent/views/explorer.py#L40-L76); [backend/talent/views/explorer.py#L147-L217](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/backend/talent/views/explorer.py#L147-L217); [backend/talent/models.py#L85-L117](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/backend/talent/models.py#L85-L117).

**Required negative regression:** Create hidden/expired talent post; authenticated GET list, GET detail, POST like and view must not reveal or interact; verify public feed hides and owner's management route remains accessible.

**Confidence:** Direct queryset mismatch; object-visibility effect requires endpoint test. **SOURCE-FINDING, NOT RUNTIME REPRODUCED.**

## Assurance note

The existing generic serializer and queryset definitions were inspected against consuming API paths; tests in `backend/invoicing/test_integrity.py` and Talent board source do not establish these negative cases. This identifies new review cases, not a proven exploit. Continue unrelated domain discovery in future audit waves without reprioritising historical B01–B23. Source only, no code changes.
