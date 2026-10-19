# Watchdog for the always-on verifier desktop: when no chrome.exe runs at all, starts Chrome (minimised)
# with the verifier profile and no URL. Never stops, kills or opens tabs, so it is safe to run every minute.
param(
    [string]$ChromePath = "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    [string]$ProfileDirectory = "Default"
)

$logDir = Join-Path $PSScriptRoot "logs"
$log = Join-Path $logDir "keep_chrome_open.log"

function Write-Log([string]$Message) {
    New-Item -ItemType Directory -Force -Path $logDir | Out-Null
    # Roll at 256 KB, keeping one old file.
    if ((Test-Path $log) -and (Get-Item $log).Length -gt 256KB) { Move-Item -Force $log "$log.1" }
    Add-Content -Path $log -Value "$(Get-Date -Format s) $Message" -Encoding utf8
}

try {
    # shortcut: any running Chrome counts as "open", since a profile opened from Chrome's UI has no
    # --profile-directory in its command line; closing only the verifier window is caught by the server's overdue email.
    if (Get-Process -Name chrome -ErrorAction SilentlyContinue) { exit 0 }

    if (-not (Test-Path $ChromePath)) { Write-Log "Chrome not found at $ChromePath"; exit 1 }
    Start-Process -FilePath $ChromePath -WindowStyle Minimized -ArgumentList "--profile-directory=`"$ProfileDirectory`""
    Write-Log "Started Chrome (profile '$ProfileDirectory')"
} catch {
    Write-Log "Error: $($_.Exception.Message)"
    exit 1
}
