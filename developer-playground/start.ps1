param([switch]$Seed)
$ErrorActionPreference = 'Stop'
$playgroundRoot = $PSScriptRoot
$checkoutRoot = Split-Path $playgroundRoot -Parent
$workspaceRoot = Split-Path $checkoutRoot -Parent
$backendRoot = Join-Path $checkoutRoot 'backend'
if (-not (Test-Path -LiteralPath (Join-Path $backendRoot 'manage.py'))) { throw 'Backend checkout not found.' }
$pythonPath = Join-Path $workspaceRoot 'tmp/ezy-backend-venv/Scripts/python.exe'
$logRoot = Join-Path $workspaceRoot 'tmp/ezy-preview-logs'
New-Item -ItemType Directory -Force -Path $logRoot | Out-Null
$env:PYTHONPATH = "$playgroundRoot;$backendRoot"
$env:DJANGO_SETTINGS_MODULE = 'local_settings'
$env:EMAIL_BACKEND = 'django.core.mail.backends.locmem.EmailBackend'
$env:STRIPE_SECRET_KEY = ''
$env:MOBILEMESSAGE_USERNAME = ''
$env:MOBILEMESSAGE_PASSWORD = ''
if (Get-Command docker.exe -ErrorAction SilentlyContinue) {
    & docker compose -f (Join-Path $checkoutRoot 'docker-compose.dev.yml') -f (Join-Path $playgroundRoot 'expo-web.compose.yml') up -d --build
    if ($LASTEXITCODE -ne 0) { throw 'The local main Docker stack did not start.' }
    if ($Seed) {
        & $pythonPath (Join-Path $playgroundRoot 'prepare_assets.py')
        if ($LASTEXITCODE -ne 0) { throw 'Preparing playground assets failed.' }
        & $pythonPath (Join-Path $playgroundRoot 'seed.py') --backend $backendRoot
        if ($LASTEXITCODE -ne 0) { throw 'Seeding failed.' }
    }
    if (-not (netstat -ano -p tcp | Select-String '^\s*TCP\s+127\.0\.0\.1:8090\s+\S+\s+LISTENING')) {
        $directoryProcess = Start-Process -FilePath $pythonPath -WindowStyle Hidden -PassThru -WorkingDirectory $playgroundRoot -ArgumentList @('-m','http.server','8090','--bind','127.0.0.1') -RedirectStandardOutput (Join-Path $logRoot 'playground-main.out.log') -RedirectStandardError (Join-Path $logRoot 'playground-main.err.log')
        $directoryProcess.Id | Set-Content (Join-Path $logRoot 'playground-main.pid')
    }
    Write-Host 'Directory: http://127.0.0.1:8090'
    Write-Host 'Public web: http://localhost:3000'
    Write-Host 'Expo web: http://localhost:8082'
    return
}
Push-Location $backendRoot
try {
    & $pythonPath manage.py migrate --noinput
    if ($LASTEXITCODE -ne 0) { throw 'Local database migrations failed.' }
} finally { Pop-Location }
if ($Seed) {
    & $pythonPath (Join-Path $playgroundRoot 'prepare_assets.py')
    if ($LASTEXITCODE -ne 0) { throw 'Preparing playground assets failed.' }
    & $pythonPath (Join-Path $playgroundRoot 'seed.py') --backend $backendRoot
    if ($LASTEXITCODE -ne 0) { throw 'Seeding failed.' }
}
$listener = netstat -ano -p tcp | Select-String '^\s*TCP\s+127\.0\.0\.1:8000\s+\S+\s+LISTENING\s+(\d+)'
if ($listener) {
    $pidFile = Join-Path $logRoot 'backend.pid'
    $savedProcessId = if (Test-Path $pidFile) { [int](Get-Content $pidFile -Raw) } else { 0 }
    $listenerProcessId = [int]$listener[0].Matches[0].Groups[1].Value
    try {
        $running = Get-CimInstance Win32_Process -Filter "ProcessId=$listenerProcessId" -ErrorAction Stop
        if (($running.ProcessId -ne $savedProcessId -and $running.ParentProcessId -ne $savedProcessId) -or $running.CommandLine -notmatch 'manage.py.*runserver') { throw 'Port 8000 belongs to an unrecognised process; it was left running.' }
    } catch {
        $savedProcess = Get-Process -Id $savedProcessId -ErrorAction Stop
        $listenerProcess = Get-Process -Id $listenerProcessId -ErrorAction Stop
        $sameStart = [Math]::Abs(($savedProcess.StartTime - $listenerProcess.StartTime).TotalSeconds) -lt 10
        if ($savedProcess.Path -ne $pythonPath -or $listenerProcess.ProcessName -ne 'python' -or -not $sameStart) { throw 'Port 8000 belongs to an unrecognised process; it was left running.' }
    }
    Stop-Process -Id $savedProcessId
    if ($listenerProcessId -ne $savedProcessId) { Stop-Process -Id $listenerProcessId -ErrorAction SilentlyContinue }
}
$process = Start-Process -FilePath $pythonPath -WindowStyle Hidden -PassThru -WorkingDirectory $backendRoot -ArgumentList @('manage.py','runserver','127.0.0.1:8000','--noreload','--settings=local_settings') -RedirectStandardOutput (Join-Path $logRoot 'backend.out.log') -RedirectStandardError (Join-Path $logRoot 'backend.err.log')
$process.Id | Set-Content (Join-Path $logRoot 'backend.pid')
if (-not (netstat -ano -p tcp | Select-String '^\s*TCP\s+127\.0\.0\.1:8090\s+\S+\s+LISTENING')) {
    $directoryProcess = Start-Process -FilePath $pythonPath -WindowStyle Hidden -PassThru -WorkingDirectory $playgroundRoot -ArgumentList @('-m','http.server','8090','--bind','127.0.0.1') -RedirectStandardOutput (Join-Path $logRoot 'playground.out.log') -RedirectStandardError (Join-Path $logRoot 'playground.err.log')
    $directoryProcess.Id | Set-Content (Join-Path $logRoot 'playground.pid')
}
$frontendRoot = Join-Path $checkoutRoot 'frontend_web'
$frontendListening = netstat -ano -p tcp | Select-String '^\s*TCP\s+\S+:(3000|5173)\s+\S+\s+LISTENING'
if (-not $frontendListening) {
    $nodePath = (Get-Command node.exe).Source
    $env:VITE_DEV_HMR_PORT = '5173'
    $frontendProcess = Start-Process -FilePath $nodePath -WindowStyle Hidden -PassThru -WorkingDirectory $frontendRoot `
        -ArgumentList @('scripts/dev-all.mjs', '--port', '3000', '--dashboard-port', '5173', '--api', 'http://127.0.0.1:8000/api') `
        -RedirectStandardOutput (Join-Path $logRoot 'main.out.log') -RedirectStandardError (Join-Path $logRoot 'main.err.log')
    $frontendProcess.Id | Set-Content (Join-Path $logRoot 'main.pid')
}
Write-Host 'Directory: http://127.0.0.1:8090'
Write-Host 'Backend: http://127.0.0.1:8000 (local-only integrations)'
