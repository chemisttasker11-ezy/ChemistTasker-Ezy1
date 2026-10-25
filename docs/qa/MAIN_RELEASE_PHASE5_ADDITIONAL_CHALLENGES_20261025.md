# Phase 5 source challenge: consent, device logout, overnight penalty and invite fixtures

Frozen main `b77e9fd296bc2710350ef6f3cd402ce2529ffc06`; no product code changes.

- `C012-N1` prior negative returned HTTP 400 but was **inconclusive** because legitimate and expired applicants were assigned the *same mobile+DOB*; serializer has a separate duplicate identity guard. The audit test now generates unique valid mobile digits per applicant. A red result on rerun can be attributed to expired-link accept; a green denial only proves blocked if the response specifically cites expiry.
- `C071-N2` a registered Android push token remains active after logout despite the supplied valid JWT refresh token. This isolates server revoke semantics, not Expo device delivery.
- `B66` overnight 22:00–06:00 cancellation penalty expects nonzero checkout amount and a same-day positive control. This checks current money calculation, not the complete future policy schedule. Synthetic Stripe; no real charges.
- Status pending execution. Never promote a fixture error, malformed token or unauthorised payer to confirmed defect. See executed run for exact status.
