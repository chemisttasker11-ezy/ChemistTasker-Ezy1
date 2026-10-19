# AHPRA Verifier Desktop Bridge

The AHPRA Verifier Desktop Bridge is a lightweight Python service designed to run 24/7 on a Windows desktop. It receives practitioner verification requests from production via a secure WebSocket connection, performs automated lookups on the official AHPRA Register of Practitioners using a headless Claude Code session driving Google Chrome (via the Claude in Chrome extension), and returns structured verification results.

---

## Architecture & Protocol Contract

The bridge adheres to a fixed bidirectional WebSocket protocol:

1. **Authentication & Handshake:**
   - Connects to `AHPRA_VERIFIER_URL` with the HTTP header `Authorization: Bearer <AHPRA_VERIFIER_TOKEN>`.
   - On opening the connection, sends an identification greeting:
     ```json
     {"type": "hello", "agent": "<AHPRA_VERIFIER_AGENT or hostname>"}
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
| `AHPRA_VERIFIER_URL` | **Yes** | — | Production WebSocket endpoint (e.g. `wss://api.chemisttasker.com/ws/ahpra-verifier/`). |
| `AHPRA_VERIFIER_TOKEN` | **Yes** | — | Bearer authentication token. **Never logged.** |
| `AHPRA_VERIFIER_AGENT` | No | Hostname | Unique name identifying this desktop bridge agent. Defaults to `socket.gethostname()`. |
| `AHPRA_MIN_GAP_SECONDS` | No | `30` | Minimum cooldown in seconds between consecutive AHPRA lookups. |
| `AHPRA_BLOCKED_PAUSE_SECONDS` | No | `1800` | Cooldown period in seconds (30 minutes) when bot detection / CAPTCHA is encountered. |
| `AHPRA_LOOKUP_TIMEOUT` | No | `180` | Subprocess execution timeout in seconds per check. |
| `AHPRA_CLAUDE_CMD` | No | `claude.cmd` | Command or path to the Claude CLI executable. |

---

## Running Manually

### PowerShell

```powershell
$env:AHPRA_VERIFIER_URL = "wss://api.example.com/ws/ahpra-verifier/"
$env:AHPRA_VERIFIER_TOKEN = "your-secure-production-token"
$env:AHPRA_VERIFIER_AGENT = "chemisttasker-desktop-01"

python scripts/ahpra_verifier/bridge.py
```

### Command Prompt (`cmd.exe`)

```cmd
set AHPRA_VERIFIER_URL=wss://api.example.com/ws/ahpra-verifier/
set AHPRA_VERIFIER_TOKEN=your-secure-production-token
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
set "AHPRA_VERIFIER_URL=wss://api.example.com/ws/ahpra-verifier/"
set "AHPRA_VERIFIER_TOKEN=your-production-token"
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

## Logging & Rotation

- Logs are written automatically to `scripts/ahpra_verifier/logs/bridge.log`.
- Log rotation uses Python's standard `RotatingFileHandler`:
  - Maximum file size: **1 MB** (`1,000,000` bytes)
  - Backup files kept: **3** (`bridge.log.1`, `bridge.log.2`, `bridge.log.3`)
- **Security:** `AHPRA_VERIFIER_TOKEN` is strictly excluded from all log messages. Connection logs only record the target URL and agent hostname.
