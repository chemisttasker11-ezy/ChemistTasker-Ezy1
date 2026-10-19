# Watchdog for the always-on verifier desktop: starts Chrome (minimised) with the verifier profile
# when it is not running. Never stops or kills anything, so it is safe to run every minute.
param(
    [string]$ChromePath = "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    [string]$ProfileDirectory = "Default",
    [string]$Url = "https://www.ahpra.gov.au/Registration/Registers-of-Practitioners.aspx"
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
    # Browser (main) processes only: renderers and helpers carry --type=.
    $browsers = @(Get-CimInstance Win32_Process -Filter "Name = 'chrome.exe'" |
        Where-Object { $_.CommandLine -and $_.CommandLine -notmatch '--type=' })
    $profileArg = '--profile-directory="?' + [regex]::Escape($ProfileDirectory) + '"?(\s|$)'
    # Chrome started without --profile-directory opens the last used profile; count it as Default.
    $running = $browsers | Where-Object {
        $_.CommandLine -match $profileArg -or
        ($ProfileDirectory -eq 'Default' -and $_.CommandLine -notmatch '--profile-directory')
    }
    if ($running) { exit 0 }

    if (-not (Test-Path $ChromePath)) { Write-Log "Chrome not found at $ChromePath"; exit 1 }
    Start-Process -FilePath $ChromePath -WindowStyle Minimized `
        -ArgumentList "--profile-directory=`"$ProfileDirectory`"", $Url
    Write-Log "Started Chrome (profile '$ProfileDirectory')"
} catch {
    Write-Log "Error: $($_.Exception.Message)"
    exit 1
}
