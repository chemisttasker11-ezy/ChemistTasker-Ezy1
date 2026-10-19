# ChemistTasker AHPRA verifier

A Manifest V3 extension with plain JavaScript, no build step and no dependencies. Requires Chrome 116 or later.

1. Open `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, and select this `scripts/ahpra_extension` folder.
2. Open the extension's **Details → Extension options** (or click its toolbar icon).
3. Enter the backend websocket URL, for example `wss://staging.chemisttasker.com.au/ws/ahpra-verifier/` (production uses its own domain), and token. Use `wss://` for a remote backend; `ws://` is available for local development. The token is stored in `chrome.storage.local`, not synced, and sent in the protocol's hello message. Local storage is not encrypted.
4. Set the minimum interval between lookup starts (default 30 seconds), then click **Connect**. The status line shows the authenticated connection, queued/in-progress checks, and last result time. Click **Disconnect** to stop receiving/starting work; a running lookup finishes and its result is retained until the next connection.

Connect both verifiers: the server sends checks to this extension first; the Python Claude bridge is the fallback and repairer. Keep Chrome running on the always-on desktop. The extension reconnects after network failures with backoff from 5 seconds to 5 minutes. A one-minute alarm restores a sleeping worker; timers can run late when Chrome or the computer is suspended.

Each check runs in its own inactive tab with a 60-second deadline. The extension closes only the tab it created. A CAPTCHA/Cloudflare challenge is never solved or bypassed: the extension reports `blocked`, leaves that tab open, displays a notification and pauses the queue. Open the register tab and complete the human check, then click **Resume** in options or the notification's Resume button. Clicking the notification body opens options. The blocked check is never automatically retried; Resume starts the next queued check. The human tab stays open for you to close.

Pending checks and unacknowledged results survive service worker restarts. Results are replayed until the backend acknowledges them; the backend must deduplicate by check_id. If the worker restarts during an active lookup, it reports an error instead of repeating that lookup. Registration record data is retained locally only until acknowledgement; blocked result IDs are retained to prevent automatic retries even if the server redelivers an acknowledged check; no applicant names are received from the backend. Do not share extension storage or the configured token.

Run parser checks from the repository root:

```
node scripts/ahpra_extension/tests/parser.test.js
```

All fixtures are synthetic. The parser tolerates missing sections, but live lookups reject records without name, profession or registration status. AHPRA markup changes may require updating content.js selectors. No live AHPRA/backend integration is included in the offline parser tests.

