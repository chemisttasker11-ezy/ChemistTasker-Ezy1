## Mobile dependency remediation — 25 October 2026

- Advisory: GHSA-w74x-v6f9-j3xg; patched 3.x version **3.1.9**; fix is `fast-uri` via Expo's `ajv` dependency; no unrelated dependency updates.
- Locked tarball integrity was cross-checked against a third-party publicly committed npm-generated package-lock in Yasmine-Works/avito-mcp at blob `2c8da0ef24130aafc5b1e25dfc04f4152e33b8cc`, **not fabricated**.
- Added explicit npm `overrides.fast-uri=3.1.9`; updated lock version, resolved tarball and SRI; hardened installed dependency gate with exact version; added encoded-scheme regression.
- [GitHub advisory](https://github.com/advisories/GHSA-w74x-v6f9-j3xg), [patch release](https://github.com/fastify/fast-uri/releases/tag/v3.1.9).
- Verify by `npm ci`, `npm run test:security` and `npm run security:dependencies` on CI. **These tests have not executed on this commit at authoring time.** No claim of user-exploitable app XSS; no live data touched.
