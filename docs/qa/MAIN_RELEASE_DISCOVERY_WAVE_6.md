# PR #200 — Deep senior source tracing, discovery wave 6 (B43–B45)

**Immutable reviewed application source:** `b77e9fd296bc2710350ef6f3cd402ce2529ffc06`; **Date:** 25 October 2026 (Australia/Brisbane). **No application fixes**. This wave does not reopen or reclassify B01–B42. Findings are hypotheses justified by complete request→model→session and storage paths, **not reproduced exploits**.

## B43 — P0 candidate — Password reset does not invalidate previously issued JWT refresh tokens

**Business failure:** An account holder resets their password following an account compromise. A device or actor holding an older valid refresh token may continue refreshing until the token expires rather than being logged out across devices.

**Proof chain:**
1. [PasswordResetConfirmAPIView](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/backend/users/api_passwords.py#L15-L52) verifies Django reset token, changes password and clears login lockout, but does not revoke outstanding SimpleJWT tokens or Django sessions.
2. [CustomTokenRefreshSerializer.validate](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/backend/users/serializers.py#L523-L562) verifies JWT and `user.is_active`, without a stored password epoch/hash comparison or account-wide post-reset revocation.
3. [SIMPLE_JWT settings](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/backend/core/settings.py#L490-L502) configure 90-day refresh, rotation and blacklist-after-rotation, not `CHECK_REVOKE_TOKEN`; the latter does not default to true.
4. [Account deletion](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/backend/users/api_account.py#L55-L83) *does* explicitly call [token/session revocation helpers](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/backend/users/account_deletion.py#L64-L93), showing the available mechanism is not used by the password-reset path.
5. [Existing reset test](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/backend/users/tests.py#L104-L132) checks password and Axes reset, but not validity of pre-reset access and refresh credentials.

**Negative/positive regression:** Issue real refresh A and access token; complete password reset using valid uid/token; then POST A to `/api/v1/users/token/refresh/`, and GET `/api/v1/users/me/` with prior access. Confirm policy requires all old refresh tokens and sessions invalid and new-password login succeeds; record whether access lifetime is bounded or instantly revoked. Include web HttpOnly and Expo bearer clients.

**Status:** SOURCE-CONFIRMED missing account-wide reset revocation; impact depends on stolen-token possession and intended password-reset policy. **No runtime proof yet.**

## B44 — P1 candidate — Invalid identity tab submission may erase or detach existing verified ID evidence

**Business failure:** Editing a previously uploaded government ID and submitting an invalid identity form can return HTTP 400 after changing the database and deleting the old physical object. The user cannot recover the old ID with a simple retry; verification evidence may be lost.

**Proof chain:**
1. [Role onboarding endpoints](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/backend/onboarding/views.py#L220-L263) inherit `RetrieveUpdateAPIView` without an atomic edit wrapper.
2. [Serializers](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/backend/onboarding/serializers.py#L445-L481) route the `tab=identity` update directly to `apply_identity_tab`.
3. [Identity handler](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/backend/onboarding/services/identity.py#L32-L105) calls `_delete_file_if_unreferenced(old_file, current_instance=instance)` **before** storing replacement or validating required details; it also changes type, documents and metadata.
4. [Save then validation](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/backend/onboarding/services/identity.py#L116-L180) persists `update_fields` before checking mandatory ID, secondary document, visa fields and expiry. A DRF `ValidationError` raised later does not revert the earlier write without a surrounding atomic transaction; storage deletion is not transaction-aware regardless.
5. [Storage helper](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/backend/core/serializer_lifecycle.py#L44-L73) deletes the actual storage object. Compare [regulatory handler](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/backend/onboarding/services/regulatory.py#L115-L140), which explicitly delays old-file cleanup until after validation and a successful DB write.

**Negative/positive regression:** Seed a profile with real in-memory-storage ID and verified flag. PATCH identity with `submitted_for_verification=true`, change ID type/clear old file and omit a required detail. Expect 400 but **identical DB document names, verification flags and storage objects**. Repeat with a replacement file, with paired secondary documents, for each of the four onboarding account types. Confirm successful valid submission only removes unreferenced old objects after a committed replacement.

**Status:** SOURCE-CONFIRMED ordering/transaction gap. Exact observed loss requires HTTP/in-memory-storage reproduction. No fix.

## B45 — P1 candidate — Incomplete referee questionnaire can be counted as a verified reference

**Business failure:** A referee with a valid signed invitation link can submit a questionnaire without answering the important would-rehire question; the applicant's `referee1_confirmed` or `referee2_confirmed` flag becomes true as if an affirmative verification occurred.

**Proof chain:**
1. [RefereeResponseSerializer](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/backend/onboarding/serializers.py#L115-L145) is a ModelSerializer using the optional `would_rehire` field.
2. [RefereeResponse model](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/backend/onboarding/models.py#L664-L714) declares `would_rehire = CharField(max_length=20, blank=True)`.
3. [RefereeSubmitResponseView](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/backend/onboarding/views.py#L45-L111) branches only on `would == 'no'`; **all other values including blank** enter the affirmative branch and set `referee{N}_confirmed=True`.
4. [Verification policy](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/backend/onboarding/verification/policy.py#L36-L48) treats both `referee{N}_confirmed` values as a verified referee badge, and may use referees as a required extra check.

**Negative/positive regression:** With one legitimate signed referee token, POST empty serializer payload and assert 400 / no response row / no verified referee flags. Explicitly test `Yes`, `No`, and `With Reservations` using expected product policy; prevent blank/unrecognised strings from counting. Check this does not undermine email link nonreplay requirements.

**Status:** SOURCE-CONFIRMED optional-input/flag mismatch; whether a blank submission is permitted operationally still needs endpoint execution. No fix.

## Delivery and scope

Three **new** source-level risks, B43–B45, across account security, identity evidence storage and professional verification. The original 42 findings are not repeated. All priorities are proposed impact only; no actual exploit, API regression, or production deployment is claimed. PR #200 remains **draft, audit-only**.
