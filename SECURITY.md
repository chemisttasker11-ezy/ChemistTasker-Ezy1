# Security Policy

## Reporting a vulnerability

Please do **not** open a public issue for vulnerabilities, credentials, tokens, private customer data, or suspected account compromise.

Report security issues privately to the ChemistTasker maintainers through GitHub's private vulnerability reporting feature when enabled, or by contacting the repository owner through the project's established private support channel.

Include:

- affected component and version/commit;
- reproduction steps;
- expected and observed behaviour;
- security impact;
- any proof-of-concept material with sensitive values redacted.

## Repository security rules

This repository must never contain:

- production `.env` files;
- database dumps or production exports;
- Firebase service-account JSON files;
- Apple signing certificates, provisioning profiles, APNs keys, Android keystores;
- cloud, SMTP, SMS, OCR, payment, GitHub, OpenAI, or other provider credentials;
- private SSH keys;
- access or refresh tokens;
- real patient/customer/user data;
- production logs containing personal or authentication data.

Only `.env.example`, `.env.sample`, or `.env.template` files containing non-secret placeholders may be committed.

## Public configuration

Values intentionally shipped to clients (for example Expo project IDs, bundle identifiers, public site URLs, or browser/mobile API identifiers) must still be restricted at the provider level wherever supported. A value being client-visible does not make an unrestricted provider key safe.

## Before a public release

1. Run the public-repository security workflow.
2. Confirm no secret-bearing files exist in the current tree.
3. Confirm Git history and every public branch/tag have been scrubbed or contain only rotated/revoked historical credentials.
4. Rotate any credential that was ever committed, even if later deleted.
5. Enable GitHub secret scanning, push protection, Dependabot alerts, and code scanning where available.
