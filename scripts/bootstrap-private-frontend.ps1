# Alternative owner-run one-time bootstrap for the EXISTING PRIVATE destination repo.
# No code or secrets are sent to ChatGPT. Requires Git, Node 22, authenticated GitHub CLI.
param(
    [Parameter(Mandatory=$true)][string]$SourceRepo,
    [string]$DestinationRepo = 'chemisttasker11-ezy/ChemistTasker_Front',
    [string]$WorkDirectory = ''
)
$ErrorActionPreference = 'Stop'
$source = (Resolve-Path $SourceRepo).Path
if (-not $WorkDirectory) { $WorkDirectory = Join-Path ([IO.Path]::GetTempPath()) ('chemisttasker-frontend-bootstrap-' + [guid]::NewGuid().ToString('N')) }
$WorkDirectory = [IO.Path]::GetFullPath($WorkDirectory)
if (Test-Path $WorkDirectory) { throw "Work directory must not exist: $WorkDirectory" }
foreach ($tool in @('node','git','gh')) {
    if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) { throw "Missing command: $tool" }
}
gh auth status | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Sign into GitHub with gh auth login as the repository owner.' }
foreach ($repo in @('chemisttasker11-ezy/ChemistTasker-Ezy1', $DestinationRepo)) {
    $visibility = (gh repo view $repo --json visibility --jq '.visibility').Trim()
    if ($LASTEXITCODE -ne 0 -or $visibility -ne 'PRIVATE') { throw "STOP: repository must be PRIVATE: $repo" }
}
$helper = Join-Path $PSScriptRoot 'frontend-contractor-bridge.mjs'
$export = Join-Path $WorkDirectory 'snapshot'
$destination = Join-Path $WorkDirectory 'destination'
New-Item -ItemType Directory -Path $WorkDirectory | Out-Null
node $helper export --source $source --dest $export
if ($LASTEXITCODE -ne 0) { throw 'Frontend export failed; upload stopped.' }
gh auth setup-git | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Could not configure GitHub authentication.' }
gh repo clone $DestinationRepo $destination -- --depth 1
if ($LASTEXITCODE -ne 0) { throw 'Destination clone failed.' }
$existing = @(git -C $destination ls-files | Where-Object { $_ -notin @('README.md','.gitignore') })
if ($existing.Count -ne 0) { throw "STOP: destination contains non-bootstrap files: $($existing -join ', ')" }
$oldHistory = @(git -C $destination log --all --name-only --pretty=format: | Where-Object { $_ -and $_ -notin @('README.md','.gitignore') })
if ($oldHistory.Count -ne 0) { throw 'STOP: destination Git history contains unexpected files.' }
Get-ChildItem -Path $export -Force | ForEach-Object { Copy-Item -Path $_.FullName -Destination $destination -Recurse -Force }
git -C $destination add --all
if ($LASTEXITCODE -ne 0) { throw 'git add failed.' }
git -C $destination commit -m 'Initial frontend-only ChemistTasker source snapshot'
if ($LASTEXITCODE -ne 0) { throw 'git commit failed. Configure user.name and user.email.' }
node (Join-Path $destination 'scripts/check-frontend-boundary.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Security boundary check failed. No source was pushed.' }
git -C $destination push origin HEAD:main
if ($LASTEXITCODE -ne 0) { throw 'Destination push failed. Check branch permissions.' }
Write-Host "Success: https://github.com/$DestinationRepo"
Write-Host "You may remove temporary work directory: $WorkDirectory"
