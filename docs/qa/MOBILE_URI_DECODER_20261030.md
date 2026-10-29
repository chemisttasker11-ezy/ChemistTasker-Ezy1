# Mobile URI decoder dependency correction

30 October 2026. Fixed parent: draft #227,
`0061ce270ab0ebdc867b6b56406fde8c23d3a181`.

The parent mobile job `123710656671` passed all 71 component/contract tests but
failed dependency audit on GHSA-qr28-fpjm-wq7f. The upstream advisory identifies
`decode-uri-component <=0.5.0` as affected and 0.5.1 as patched:
https://github.com/advisories/GHSA-qr28-fpjm-wq7f .
Upstream release: https://github.com/SamVerschueren/decode-uri-component/releases/tag/v0.5.1 .

Pin the override and single lockfile leaf to 0.5.1 using its published npm integrity.
Do not relax the audit gate or add an advisory exemption. Installed and locked versions
are checked explicitly. The other dependency pins and existing patch fingerprints stay.

The isolated compatibility probe also reproduced an existing integration problem: the
legacy CommonJS query-string 7.1.3 calls its decoder import as a function, while the
already-overridden 0.5.x decoder exports an ES-module default. With the actual package
pair, ordinary parsed query strings raise `TypeError: decodeComponent is not a function`.
The nested Expo Router query-string patch accepts the default export and the historical
function shape. Its installed source is fingerprinted by the existing verifier. This is
a consumer compatibility correction, not a decoder reimplementation.

Two new executable controls exercise 32,000 distinct encoded runs with a bounded child
process and the actual Expo Router query-string dependency with valid Unicode, plus
spaces, malformed percent input and repeated keys. On an isolated 0.5.0 installation,
the payload exceeded the three-second bound and the unpatched query parser failed.
The corrected installed pair passes both controls (about 0.4 seconds for the payload
test including process startup). No network target is involved in that reproduction.

Local verification: clean locked dependencies installed with lifecycle scripts initially
disabled, then the real postinstall applied all five patches and its installed verifier.
All **37 dependency/security tests** passed. The live npm audit gate passed with no new
accepted advisory; its 16 raw dependency entries resolve to the two existing fingerprinted
upstream advisories. Mobile lint and TypeScript checking passed; all **15 invoice component
tests** passed. These are Node/component checks, not native-device invoice acceptance.
Patch whitespace is checked separately before publication.

Parent #227's PostgreSQL job `123710318151` passed **485/485**, including the three new
activation/freeze races. Its mobile audit failure remains historical evidence; this
new source needs a new install/audit job. No merging, deployment, invoice sending or
payment-provider operation was performed.
