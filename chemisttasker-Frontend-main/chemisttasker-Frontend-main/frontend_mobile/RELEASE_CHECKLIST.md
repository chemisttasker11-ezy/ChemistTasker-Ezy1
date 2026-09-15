## Mobile Release Checklist (Expo)

## Preflight
- [ ] `EXPO_PUBLIC_API_URL` points to production API.
- [ ] `EXPO_PUBLIC_SSL_PINNED_PUBLIC_KEY_HASHES` is set to the production API public key hash list for release builds.
- [ ] `EXPO_PUBLIC_WS_URL` points to production WS.
- [ ] `EXPO_PUBLIC_WEB_URL` points to production web.
- [ ] `EXPO_PUBLIC_ANDROID_PLACES` uses the restricted production key.
- [ ] `EXPO_PUBLIC_IOS_PLACES` uses the restricted production key.
- [ ] `google-services.json` and `GoogleService-Info.plist` are correct for prod.

## API Key Restrictions (Google Places)
- [ ] Android key restricted by package name + SHA-1.
- [ ] iOS key restricted by bundle identifier.
- [ ] Separate dev and prod keys (do not reuse dev keys in production).
- [ ] Billing enabled and usage limits set.

## Build & QA
- [ ] `npm run lint` passes.
- [ ] Dev client build works (EAS).
- [ ] Release build installs and opens.
- [ ] Login persists across app restarts.
- [ ] Push notifications deliver in background.
- [ ] Crashlytics receives a test error.

## Store Metadata
- [ ] Version / build number bumped.
- [ ] Icons / splash verified.
- [ ] Permissions strings verified (iOS).
