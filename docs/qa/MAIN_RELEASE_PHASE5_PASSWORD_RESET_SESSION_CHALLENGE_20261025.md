# Phase 5 B43 reset-authentication challenge

Frozen main `b77e9fd296bc2710350ef6f3cd402ce2529ffc06`. Adds one isolated Django test to confirm that an existing JWT refresh token is not usable after password reset. Positive control asserts password really changed, negative asserts old refresh denied. The base password-reset view only updates password and clears login lockouts; not independently proven until executed. No application changes or real user accounts.
