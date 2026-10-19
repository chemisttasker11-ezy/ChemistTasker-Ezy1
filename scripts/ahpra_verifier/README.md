# AHPRA Verifier Desktop Bridge

Staging server deployment: see [docs/AHPRA_STAGING_DEPLOY.md](../../docs/AHPRA_STAGING_DEPLOY.md).

The AHPRA Verifier Desktop Bridge is a lightweight Python service designed to run 24/7 on a Windows desktop. Connect it alongside the Chrome extension: the server sends checks to the extension first, and this bridge is the fallback and repairer. It receives practitioner verification requests from the server via a secure WebSocket connection, performs automated lookups on the official AHPRA Register of Practitioners using a headless Claude Code session driving Google Chrome (via the Claude in Chrome extension), and returns structured verification results.

---

## Architecture & Protocol Contract

The bridge adheres to a fixed bidirectional WebSocket protocol:

1. **Authentication & Handshake:**
   - Connects to `AHPRA_VERIFIER_URL` with the HTTP header `Authorization: Bearer <AHPRA_VERIFIER_TOKEN>`.
   - On opening the connection, sends an identification greeting:
     ```json
     {"type": "hello", "token": "<AHPRA_VERIFIER_TOKEN>", "agent": "<AHPRA_VERIFIER_AGENT or hostname>", "kind": "bridge"}
     ```
   - The production server acknowledges and dispatches all pending checks for this agent.

2. **Heartbeat:**
   - Server -> Bridge: `{"type": "ping"}`
   - Bridge -> Server: `{"type": "pong"}` (answered immediately)

3. **Check Request:**
   - Server -> Bridge:
     ```json
     {"type": "check", "check_id": 123, "registration_number": "PHA0001234567"}
     ```
   - *Note:* The bridge never receives or transmits applicant names; matching and compliance rules are enforced server-side.

4. **Lookup Result:**
   - Bridge -> Server:
     ```json
     {
       "type": "result",
       "check_id": 123,
       "outcome": "found" | "not_found" | "blocked" | "error",
       "checked_at": "<ISO-8601 UTC timestamp>",
       "register": {
         "name": "Jane Doe",
         "profession": "Pharmacist",
         "registration_status": "Registered",
         "registration_type": "General",
         "expiry_date": "2026-11-30",
         "conditions": false,
         "undertakings": false,
         "reprimands": false
       },
       "error": ""
     }
     ```
   - If `outcome` is `"not_found"`, `"blocked"`, or `"error"`, the `register` field is `null`.

5. **Operational Safeguards:**
   - **Single-flight execution:** Exactly one lookup is executed at a time.
   - **Rate limiting (Min Gap):** At least 30 seconds (configurable via `AHPRA_MIN_GAP_SECONDS`) must elapse between consecutive lookups.
   - **Bot detection handling:** If a CAPTCHA, Cloudflare screen, or bot challenge appears, the bridge returns outcome `"blocked"`, delivers the result to the server, and pauses all further lookups for 30 minutes (`AHPRA_BLOCKED_PAUSE_SECONDS`).
   - **Auto-reconnect:** If the WebSocket connection drops, the bridge reconnects using exponential backoff (starting at 5 seconds, doubling up to a maximum of 5 minutes: 5s, 10s, 20s, 40s, 80s, 160s, 300s).

---

## Optional Repairs

Optional repair requests run one Opus Claude CLI subprocess at a time, independently
of lookups; additional repair requests while busy are ignored. Set
`AHPRA_REPAIR_WORKTREE` to a separate, clean git worktree used only for repairs (e.g.
`git worktree add C:\dev\worktrees\chemisttasker-ahpra-repair`), never the worktree the
bridge runs from or one you edit (required for repairs; otherwise the bridge reports
"not configured"). `AHPRA_REPAIR_CLAUDE_CONFIG_DIR`
optionally sets that subprocess's `CLAUDE_CONFIG_DIR`.
`AHPRA_REPAIR_TIMEOUT_SECONDS` defaults to `1800` (30 minutes).
The runner uses `AHPRA_CLAUDE_CMD` (default `claude.cmd`) and `repair_prompt.md`.
It returns `repair_report` with the check ID, a summary capped at 4000 characters,
and the current worktree branch. Reports wait for reconnect if disconnected.
Repairs may commit only on a new `ahpra-repair/<yyyymmdd-hhmm>` branch; an admin
must review it. They never push, merge, deploy, or solve CAPTCHAs.

## Directory Structure

```
scripts/ahpra_verifier/
├── bridge.py            # Main bridge service (Python 3.12, stdlib + websockets)
├── lookup_prompt.md     # Instructions and schema passed to Claude for each lookup
├── test_bridge.py       # Unit tests (unittest, zero network, fake runner)
├── requirements.txt     # Pinned Python dependencies (websockets==13.1)
├── README.md            # Setup, configuration, and Task Scheduler instructions
└── logs/                # Created automatically at runtime
    └── bridge.log       # Rotating log file (1 MB, 3 backups)
```

---

## Prerequisites

1. **Operating System:** Windows 10/11 or Windows Server with a desktop GUI session.
2. **Python:** Python 3.12 (64-bit) installed and added to `PATH`.
3. **Google Chrome:** Installed with the official **Claude in Chrome** extension active.
4. **Claude Code CLI:** Installed globally via npm:
   ```powershell
   npm install -g @anthropic-ai/claude-code
   ```
   Ensure `claude.cmd` is on `PATH` and authenticated (`claude login`).

---

## Setup

1. Install Python dependencies:
   ```powershell
   python -m pip install -r scripts/ahpra_verifier/requirements.txt
   ```

2. Verify that `claude.cmd` and `python` are available:
   ```powershell
   claude --version
   python --version
   ```

---

## Environment Variables

All settings are configured exclusively through environment variables. The service fails fast on startup if required variables are missing.

| Variable | Required | Default | Description |
| :--- | :---: | :---: | :--- |
| `AHPRA_VERIFIER_URL` | **Yes** | — | Server WebSocket endpoint (staging: `wss://staging.chemisttasker.com.au/ws/ahpra-verifier/`; production uses its own domain). |
| `AHPRA_VERIFIER_TOKEN` | **Yes** | — | Bearer authentication token. **Never logged.** |
| `AHPRA_VERIFIER_AGENT` | No | Hostname | Unique name identifying this desktop bridge agent. Defaults to `socket.gethostname()`. |
| `AHPRA_MIN_GAP_SECONDS` | No | `30` | Minimum cooldown in seconds between consecutive AHPRA lookups. |
| `AHPRA_BLOCKED_PAUSE_SECONDS` | No | `1800` | Cooldown period in seconds (30 minutes) when bot detection / CAPTCHA is encountered. |
| `AHPRA_LOOKUP_TIMEOUT` | No | `180` | Subprocess execution timeout in seconds per check. |
| `AHPRA_CLAUDE_CMD` | No | `claude.cmd` | Command or path to the Claude CLI executable. |
| `AHPRA_REPAIR_WORKTREE` | No | — | Separate clean git worktree used only for repairs (see Optional Repairs). |

---

## Running Manually

### PowerShell

```powershell
$env:AHPRA_VERIFIER_URL = "wss://staging.chemisttasker.com.au/ws/ahpra-verifier/"
$env:AHPRA_VERIFIER_TOKEN = "your-verifier-token"
$env:AHPRA_VERIFIER_AGENT = "chemisttasker-desktop-01"

python scripts/ahpra_verifier/bridge.py
```

### Command Prompt (`cmd.exe`)

```cmd
set AHPRA_VERIFIER_URL=wss://staging.chemisttasker.com.au/ws/ahpra-verifier/
set AHPRA_VERIFIER_TOKEN=your-verifier-token
set AHPRA_VERIFIER_AGENT=chemisttasker-desktop-01

python scripts\ahpra_verifier\bridge.py
```

---

## Running Unit Tests

The test suite runs entirely offline without network access or Claude CLI dependencies, using mock runners and fake WebSocket connections:

```powershell
python -m unittest scripts/ahpra_verifier/test_bridge.py
```

Expected output:
```
Ran 20 tests in ~0.5s

OK
```

---

## Auto-Starting with Windows Task Scheduler

To ensure the bridge runs 24/7 and restarts automatically if the desktop reboots or logs in, configure a task using Windows Task Scheduler.

> [!IMPORTANT]
> The task must run under an interactive user account with "Run only when user is logged on" selected. This is required because Claude in Chrome needs access to the active user's desktop session and Chrome browser instance.

### Option A: Using Windows Task Scheduler GUI (`taskschd.msc`)

1. Press `Win + R`, type `taskschd.msc`, and press Enter.
2. In the right panel, click **Create Task...** (do not choose *Create Basic Task*).
3. **General Tab:**
   - Name: `ChemistTasker AHPRA Verifier Bridge`
   - Description: `24/7 desktop worker for AHPRA practitioner verification.`
   - Security options: Select **Run only when user is logged on**.
   - Configure for: **Windows 10 / Windows 11**.
4. **Triggers Tab:**
   - Click **New...**.
   - Begin the task: **At log on**.
   - Settings: **Specific user** (your Windows user account).
   - Advanced settings: Check **Enabled**. Click **OK**.
5. **Actions Tab:**
   - Click **New...**.
   - Action: **Start a program**.
   - Program/script: Path to `python.exe` (e.g. `C:\Users\<User>\AppData\Local\Programs\Python\Python312\python.exe`).
   - Add arguments: `scripts\ahpra_verifier\bridge.py`
   - Start in: Absolute path to repo root (e.g. `C:\dev\worktrees\chemisttasker-g3`).
   - Click **OK**.
   - *(Alternative)* You can point **Program/script** to a wrapper `.bat` file (see below) that sets the environment variables first.
6. **Conditions Tab:**
   - Uncheck **Start the task only if the computer is on AC power** (allows running on laptops/UPS).
   - Uncheck **Stop if the computer switches to battery power**.
   - Check **Wake the computer to run this task** (optional, if desktop uses sleep).
7. **Settings Tab:**
   - Check **Allow task to be run on demand**.
   - Check **If the task fails, restart every:** set to **1 minute**, attempt up to **999 times**.
   - Uncheck **Stop the task if it runs longer than:** (the bridge runs indefinitely).
   - If the task is already running: **Do not start a new instance**.
8. Click **OK** to save the task.

---

### Option B: Recommended Startup Wrapper Script

Creating a small startup script makes managing environment variables and paths straightforward.

Create `scripts/ahpra_verifier/start_bridge.bat` (not tracked in Git):

```bat
@echo off
cd /d "C:\dev\worktrees\chemisttasker-g3"

:: Set environment variables
set "AHPRA_VERIFIER_URL=wss://staging.chemisttasker.com.au/ws/ahpra-verifier/"
set "AHPRA_VERIFIER_TOKEN=your-verifier-token"
set "AHPRA_VERIFIER_AGENT=chemisttasker-desktop-01"
set "AHPRA_MIN_GAP_SECONDS=30"
set "AHPRA_BLOCKED_PAUSE_SECONDS=1800"

:: Start bridge
python scripts\ahpra_verifier\bridge.py
```

Then in Task Scheduler:
- Program/script: `C:\dev\worktrees\chemisttasker-g3\scripts\ahpra_verifier\start_bridge.bat`
- Start in: `C:\dev\worktrees\chemisttasker-g3`

---

### Option C: PowerShell Registration Command (Reference Only)

To register the task from an Administrator PowerShell prompt:

```powershell
$Action = New-ScheduledTaskAction `
    -Execute "cmd.exe" `
    -Argument "/c C:\dev\worktrees\chemisttasker-g3\scripts\ahpra_verifier\start_bridge.bat" `
    -WorkingDirectory "C:\dev\worktrees\chemisttasker-g3"

$Trigger = New-ScheduledTaskTrigger -AtLogOn

$Settings = New-ScheduledTaskSettingsSet `
    -RestartCount 999 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -ExecutionTimeLimit ([TimeSpan]::Zero) `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries

Register-ScheduledTask `
    -TaskName "ChemistTasker AHPRA Verifier Bridge" `
    -Action $Action `
    -Trigger $Trigger `
    -Settings $Settings `
    -Description "ChemistTasker AHPRA Verifier Desktop Bridge"
```

---

## Always-on desktop

1. Copy `start_bridge.example.bat` to `start_bridge.bat` (git-ignored), fill in the
   token, paths and agent name. Run it from a stable checkout, never the repair worktree.
2. Scheduled tasks (both "Run only when user is logged on", at logon of the verifier user):
   - **Bridge:** runs `start_bridge.bat` at logon, restarts on failure every 1 minute
     (Option C above). That restart is only a crash safety net, not polling: checks are
     pushed instantly over the open websocket.
   - **Chrome watchdog:** runs `keep_chrome_open.ps1` every 1 minute. It starts Chrome
     minimised on the AHPRA register with the verifier profile when none is running, and
     never stops anything. Log: `logs/keep_chrome_open.log`.
     ```powershell
     $Action = New-ScheduledTaskAction -Execute "powershell.exe" `
         -Argument '-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "C:\path\to\checkout\scripts\ahpra_verifier\keep_chrome_open.ps1" -ProfileDirectory "Default"'
     $Trigger = New-ScheduledTaskTrigger -AtLogOn
     $Trigger.Repetition = (New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 1)).Repetition
     Register-ScheduledTask -TaskName "ChemistTasker AHPRA Chrome Watchdog" -Action $Action -Trigger $Trigger `
         -Settings (New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries)
     ```
3. Never sleep or hibernate on AC power (Administrator prompt):
   ```powershell
   powercfg /change standby-timeout-ac 0
   powercfg /change hibernate-timeout-ac 0
   powercfg /hibernate off
   ```
4. Keep Windows signed in: the tasks and Chrome need the interactive session. Lock the
   screen if needed, but never sign out; after a reboot, sign back in (or set up automatic
   sign-in) so the logon tasks start.

**Overdue email:** when a check stays pending or sent for 15 minutes, admins get one
"AHPRA check overdue" email with an admin review link. It means the desktop is not
answering (asleep, signed out, bridge or Chrome down, or the register is blocking).
Fix the desktop, or review the check by hand from the link. A check flagged for
attention with no repair report after 45 minutes sends the same email.

---

## Logging & Rotation

- Logs are written automatically to `scripts/ahpra_verifier/logs/bridge.log`.
- Log rotation uses Python's standard `RotatingFileHandler`:
  - Maximum file size: **1 MB** (`1,000,000` bytes)
  - Backup files kept: **3** (`bridge.log.1`, `bridge.log.2`, `bridge.log.3`)
- **Security:** `AHPRA_VERIFIER_TOKEN` is strictly excluded from all log messages. Connection logs only record the target URL and agent hostname.

## End-to-end test (local)

Use three PowerShell terminals. The settings below replace the dev database with a
disposable SQLite file and use Redis database 9 for Channels. No Celery worker is
needed. Start a local Redis server on `127.0.0.1:6379` first (for example,
`docker run --rm --name ahpra-e2e-redis -p 127.0.0.1:6379:6379 redis:7-alpine`
in a separate terminal if that port is free). Never point `AHPRA_E2E_DB` at an
existing application database; its default is `$env:TEMP\ahpra_e2e.sqlite3`.

In **each** terminal, run this setup (use the same randomly generated token in all
three; generate it once with `[guid]::NewGuid().ToString('N')`):

```powershell
Set-Location C:\dev\worktrees\chemisttasker-a2
$python = 'C:\ChemistTasker_Ezy\chemisttasker-ezy\.venv\Scripts\python.exe'
$env:DJANGO_SETTINGS_MODULE = 'core.ahpra_e2e_settings'
$env:DJANGO_ENV_FILE = 'C:\ChemistTasker_Ezy\chemisttasker-ezy\env\backend.dev.env'
$env:AHPRA_E2E_TOKEN = '<random token generated once; same in all terminals>'
$env:AHPRA_E2E_REDIS = 'redis://127.0.0.1:6379/9'
```

Terminal 1: migrate the isolated database, then serve the real ASGI backend:

```powershell
Set-Location backend
& $python manage.py migrate
& $python -m daphne -b 127.0.0.1 -p 8765 core.asgi:application
```

Terminal 2: use the bridge prerequisites above (authenticated Claude CLI and
Chrome extension). Install bridge dependencies if needed, then connect locally:

```powershell
& $python -m pip install -r scripts/ahpra_verifier/requirements.txt
$env:AHPRA_VERIFIER_URL = 'ws://127.0.0.1:8765/ws/ahpra-verifier/'
$env:AHPRA_VERIFIER_TOKEN = $env:AHPRA_E2E_TOKEN
& $python scripts/ahpra_verifier/bridge.py
```

Terminal 3: keep the private cases JSON outside the repository. It must be a list
of objects with string keys `first_name`, `last_name`, `role` (`pharmacist` or
`intern`), and `registration_number`. Names and numbers are read only from that
file; duplicate ownership is reported as skipped. Seed through the real task,
wait about a minute per case (longer if the register challenges the browser),
then report:

```powershell
& $python backend/manage.py ahpra_e2e seed --cases C:\private\ahpra-cases.json
# Wait about a minute per case before reporting; repeat report as needed.
& $python backend/manage.py ahpra_e2e report
```

After testing, stop the bridge and Daphne with Ctrl+C before clearing the fixtures:

```powershell
& $python backend/manage.py ahpra_e2e reset
```

Reset removes users with `@example.invalid` emails, their profiles and matching
checks, only under the e2e settings with SQLite. A future verifier extension can
use the same local WebSocket endpoint and token without changing this harness.
