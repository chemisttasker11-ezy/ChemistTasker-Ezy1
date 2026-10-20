@echo off
:: Copy to start_bridge.bat (git-ignored), fill in the placeholders, and point the scheduled task at it.
:: Run it from a stable checkout that nobody edits, never from the repair worktree.
setlocal
cd /d "C:\path\to\stable\chemisttasker-checkout"

set "AHPRA_VERIFIER_URL=wss://staging.chemisttasker.com.au/ws/ahpra-verifier/"
set "AHPRA_VERIFIER_TOKEN=<paste-verifier-token-here>"
set "AHPRA_VERIFIER_AGENT=chemisttasker-desktop-01"

:: Claude account used for lookups and for repairs (change both to use another account folder).
set "CLAUDE_CONFIG_DIR=%USERPROFILE%\.claude"
set "AHPRA_REPAIR_CLAUDE_CONFIG_DIR=%USERPROFILE%\.claude"
:: Separate clean worktree used only for repairs (git worktree add <path>).
set "AHPRA_REPAIR_WORKTREE=C:\path\to\chemisttasker-ahpra-repair"

"C:\path\to\python.exe" scripts\ahpra_verifier\bridge.py
exit /b %ERRORLEVEL%
